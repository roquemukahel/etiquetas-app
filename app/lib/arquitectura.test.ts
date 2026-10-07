// Guardas de arquitectura: leen el código fuente y fallan si alguien (o yo, en
// una sesión de apuro) vuelve a escribir un patrón que ya nos costó bugs reales
// en producción. Es la red de contención de "arreglamos algo y aparece otro
// error": cada regla de acá abajo viene de un incidente concreto.
//
// Dos tipos de regla:
//  - ESTRICTAS (i18n): el conteo permitido es cero.
//  - DE TRINQUETE (el resto): hay deuda histórica anotada en
//    arquitectura.baseline.json. El conteo por archivo puede BAJAR pero no subir:
//    el código nuevo nace limpio, y cada vez que se limpia un archivo viejo el
//    baseline se achica (ACTUALIZAR_BASELINE=1 npx vitest run app/lib/arquitectura.test.ts).
import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EN } from './i18n/en';
import { PT } from './i18n/pt';

const RAIZ = process.cwd();
const BASELINE_PATH = path.join(RAIZ, 'app', 'lib', 'arquitectura.baseline.json');

function listarArchivos(dir: string, salida: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listarArchivos(p, salida);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) salida.push(p);
  }
  return salida;
}

type Hallazgo = { archivo: string; linea: number; detalle: string };

type Fuente = { archivo: string; sf: ts.SourceFile };
const fuentes: Fuente[] = listarArchivos(path.join(RAIZ, 'app')).map((f) => {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return { archivo: path.relative(RAIZ, f).replace(/\\/g, '/'), sf };
});

const linea = (sf: ts.SourceFile, n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;

// Recorre una cadena `supabase.from('t').select(...).eq(...)` y devuelve los
// métodos llamados, en orden, más la tabla / función rpc.
function cadena(nodo: ts.Node) {
  const metodos: { nombre: string; args: readonly ts.Expression[] }[] = [];
  let actual: ts.Node | undefined = nodo;
  let tabla: string | null = null;
  let usaFrom = false;
  let usaRpc = false;
  while (actual) {
    if (ts.isAwaitExpression(actual) || ts.isParenthesizedExpression(actual)) {
      actual = actual.expression;
      continue;
    }
    if (ts.isCallExpression(actual) && ts.isPropertyAccessExpression(actual.expression)) {
      const nombre = actual.expression.name.text;
      metodos.push({ nombre, args: actual.arguments });
      if (nombre === 'from') {
        usaFrom = true;
        tabla = actual.arguments[0]?.getText().replace(/['"`]/g, '') ?? null;
      }
      if (nombre === 'rpc') {
        usaRpc = true;
        tabla = actual.arguments[0]?.getText().replace(/['"`]/g, '') ?? null;
      }
      actual = actual.expression.expression;
      continue;
    }
    break;
  }
  return { metodos: metodos.reverse(), tabla, usaFrom, usaRpc };
}

const ESCRITURAS = ['insert', 'update', 'delete', 'upsert', 'rpc'];

// ----- Reglas de trinquete ------------------------------------------------

// Una escritura/RPC cuyo resultado se descarta: si falla (permiso, restricción
// de la base, red) la pantalla igual dice "listo". Usar `falla(...)` de
// app/lib/escritura.ts o leer `{ error }`.
function escrituraDescartada(): Hallazgo[] {
  const r: Hallazgo[] = [];
  for (const { archivo, sf } of fuentes) {
    const visitar = (n: ts.Node) => {
      if (ts.isExpressionStatement(n) && ts.isAwaitExpression(n.expression)) {
        const c = cadena(n.expression);
        if ((c.usaFrom || c.usaRpc) && c.metodos.some((m) => ESCRITURAS.includes(m.nombre))) {
          r.push({ archivo, linea: linea(sf, n), detalle: `${c.tabla} ${c.metodos.filter((m) => ESCRITURAS.includes(m.nombre)).map((m) => m.nombre).join(',')}` });
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }
  return r;
}

// `const { data } = await supabase...` sin leer `error`: ante un fallo la
// pantalla trata "no pude leer" como "no hay nada" (así se duplicaron
// proveedores/carpetas sin fin con .maybeSingle()).
function lecturaSinError(): Hallazgo[] {
  const r: Hallazgo[] = [];
  for (const { archivo, sf } of fuentes) {
    const visitar = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && n.initializer && ts.isAwaitExpression(n.initializer) && ts.isObjectBindingPattern(n.name)) {
        const c = cadena(n.initializer);
        if (c.usaFrom || c.usaRpc) {
          const nombres = n.name.elements.map((e) => (e.propertyName ? e.propertyName.getText() : e.name.getText()));
          if (!nombres.includes('error')) r.push({ archivo, linea: linea(sf, n), detalle: `${c.tabla} [${nombres.join(',')}]` });
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }
  return r;
}

// `.in('col', lista)` con una lista que puede crecer: cada id viaja en la URL y
// con cientos la consulta falla entera. Usar `porLotes`/`enLotes` (app/lib/db.ts).
function inSinLote(): Hallazgo[] {
  const r: Hallazgo[] = [];
  for (const { archivo, sf } of fuentes) {
    const visitar = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const esInterna = ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n;
        if (!esInterna) {
          const c = cadena(n);
          if (c.usaFrom) {
            for (const m of c.metodos.filter((m) => m.nombre === 'in')) {
              const arg = m.args[1]?.getText() ?? '';
              const seguro = /^\[/.test(arg) || /^(lote|tanda|ids?Lote|loteIds)$/.test(arg) || /^ESTADOS_[A-Z_]+$/.test(arg) || /^[A-Z_]+\./.test(arg);
              if (!seguro) r.push({ archivo, linea: linea(sf, n), detalle: `${c.tabla} .in(${m.args[0]?.getText()}, ${arg.slice(0, 40)})` });
            }
          }
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }
  return r;
}

// Tablas que crecen sin techo: un select sin .limit/.range ni filtro por padre
// se corta en silencio en 1000 filas (PostgREST). Usar obtenerTodasLasFilas.
const TABLAS_GRANDES = new Set([
  'ordenes', 'clientes', 'dispositivos', 'productos', 'pagos', 'cta_cte_movimientos', 'reparaciones', 'repuestos', 'compras',
  'egresos', 'canjes', 'auditoria', 'financiacion_cuotas', 'plan_ahorro_movimientos', 'producto_movimientos',
  'comision_movimientos', 'orden_items', 'compras_proveedor', 'proveedor_movimientos', 'repuestos_precios', 'planes_ahorro',
]);
function selectSinLimite(): Hallazgo[] {
  const r: Hallazgo[] = [];
  for (const { archivo, sf } of fuentes) {
    const visitar = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const esInterna = ts.isPropertyAccessExpression(n.parent) && n.parent.expression === n;
        if (!esInterna) {
          const c = cadena(n);
          const nombres = c.metodos.map((m) => m.nombre);
          if (c.usaFrom && c.tabla && TABLAS_GRANDES.has(c.tabla) && nombres.includes('select') && !nombres.some((x) => ESCRITURAS.includes(x))) {
            const select = c.metodos.find((m) => m.nombre === 'select')!;
            const conConteo = select.args.length > 1;
            const acotado = nombres.some((x) => ['limit', 'range', 'single', 'maybeSingle'].includes(x));
            const porPadre = c.metodos.some((m) => m.nombre === 'eq' && /['"`](id|[a-z_]+_id)['"`]/.test(m.args[0]?.getText() ?? ''));
            // .in('id', lote): una lista ya acotada por porLotes/enLotes (≤100 ids) no puede pasar de 1000 filas.
            const porLote = c.metodos.some((m) => m.nombre === 'in' && /^(lote|tanda|ids?Lote|loteIds)$/.test(m.args[1]?.getText() ?? ''));
            if (!conConteo && !acotado && !porPadre && !porLote) r.push({ archivo, linea: linea(sf, n), detalle: `${c.tabla}` });
          }
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }
  return r;
}

// Fecha de calendario sacada con toISOString().slice(0,10): es UTC, así que en
// Argentina da el día siguiente desde las 21 h. Usar aFechaISO / fechaISONegocio.
function fechaUtc(): Hallazgo[] {
  const r: Hallazgo[] = [];
  for (const { archivo, sf } of fuentes) {
    const visitar = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['slice', 'split', 'substring'].includes(n.expression.name.text)) {
        const t = n.expression.expression.getText();
        if (/toISOString\(\)$/.test(t)) r.push({ archivo, linea: linea(sf, n), detalle: n.getText().slice(0, 60) });
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }
  return r;
}

// `catch {}` vacío: se traga el error sin dejar rastro.
function catchVacio(): Hallazgo[] {
  const r: Hallazgo[] = [];
  for (const { archivo, sf } of fuentes) {
    const visitar = (n: ts.Node) => {
      if (ts.isCatchClause(n) && n.block.statements.length === 0) {
        // Un comentario explicando por qué se ignora el error cuenta como justificación.
        const textoBloque = n.block.getFullText();
        if (!/\/\/|\/\*/.test(textoBloque)) r.push({ archivo, linea: linea(sf, n), detalle: 'catch vacío' });
      }
      ts.forEachChild(n, visitar);
    };
    visitar(sf);
  }
  return r;
}

const REGLAS: Record<string, { descripcion: string; buscar: () => Hallazgo[] }> = {
  'escritura-descartada': {
    descripcion: 'Escritura/RPC de Supabase cuyo resultado (error) se descarta. Usá `falla(...)` de app/lib/escritura.ts o leé { error }.',
    buscar: escrituraDescartada,
  },
  'lectura-sin-error': {
    descripcion: 'Lectura de Supabase que ignora `error` (un fallo se confunde con "no hay datos"). Leé { data, error } y tratá el error.',
    buscar: lecturaSinError,
  },
  'in-sin-lote': {
    descripcion: '`.in(col, lista)` con lista que puede crecer: supera el largo de la URL. Usá porLotes/enLotes de app/lib/db.ts.',
    buscar: inSinLote,
  },
  'select-sin-limite': {
    descripcion: 'Select sobre una tabla que crece sin .limit/.range ni filtro por padre: se corta en 1000 filas. Usá obtenerTodasLasFilas.',
    buscar: selectSinLimite,
  },
  'fecha-utc': {
    descripcion: 'toISOString().slice(...) para una fecha de calendario: es UTC y se corre un día. Usá aFechaISO / fechaISONegocio.',
    buscar: fechaUtc,
  },
  'catch-vacio': {
    descripcion: 'catch {} vacío sin comentario: se traga el error. Registralo (registrarFallo) o explicá por qué se ignora con un comentario.',
    buscar: catchVacio,
  },
};

function contarPorArchivo(h: Hallazgo[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const x of h) c[x.archivo] = (c[x.archivo] ?? 0) + 1;
  return c;
}

const baseline: Record<string, Record<string, number>> = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) : {};
const actualizar = process.env.ACTUALIZAR_BASELINE === '1';
const nuevoBaseline: Record<string, Record<string, number>> = {};

describe('guardas de arquitectura (trinquete: la deuda puede bajar, no subir)', () => {
  for (const [id, regla] of Object.entries(REGLAS)) {
    it(id, () => {
      const hallazgos = regla.buscar();
      const porArchivo = contarPorArchivo(hallazgos);
      nuevoBaseline[id] = Object.fromEntries(Object.entries(porArchivo).sort(([a], [b]) => a.localeCompare(b)));
      if (actualizar) return;
      const permitido = baseline[id] ?? {};
      const excesos = Object.entries(porArchivo).filter(([archivo, n]) => n > (permitido[archivo] ?? 0));
      const detalle = excesos
        .map(([archivo, n]) => {
          const lineas = hallazgos.filter((h) => h.archivo === archivo).map((h) => `    ${archivo}:${h.linea}  ${h.detalle}`);
          return `  ${archivo}: ${n} (permitidos ${permitido[archivo] ?? 0})\n${lineas.join('\n')}`;
        })
        .join('\n');
      expect(excesos, `${regla.descripcion}\n${detalle}\n`).toEqual([]);
    });
  }

  it('guardar baseline (solo con ACTUALIZAR_BASELINE=1)', () => {
    if (!actualizar) return;
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(nuevoBaseline, null, 2) + '\n');
  });
});

// ----- Reglas estrictas ---------------------------------------------------

describe('traducciones', () => {
  it('EN y PT tienen exactamente las mismas claves', () => {
    const en = new Set(Object.keys(EN));
    const pt = new Set(Object.keys(PT));
    const soloEn = [...en].filter((k) => !pt.has(k));
    const soloPt = [...pt].filter((k) => !en.has(k));
    expect({ soloEn, soloPt }).toEqual({ soloEn: [], soloPt: [] });
  });

  it('todo t("texto literal") tiene traducción al inglés y al portugués', () => {
    const faltan: string[] = [];
    const vistos = new Set<string>();
    for (const { archivo, sf } of fuentes) {
      if (archivo.includes('/i18n/')) continue;
      const visitar = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't' && n.arguments.length >= 1) {
          const a = n.arguments[0];
          if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && /[A-Za-zÁÉÍÓÚáéíóúñÑ]{2}/.test(a.text) && !vistos.has(a.text)) {
            if (!(a.text in EN) || !(a.text in PT)) {
              vistos.add(a.text);
              faltan.push(`${archivo}:${linea(sf, n)}  ${JSON.stringify(a.text).slice(0, 110)}`);
            }
          }
        }
        ts.forEachChild(n, visitar);
      };
      visitar(sf);
    }
    expect(faltan, 'Texto nuevo sin traducir: agregalo a app/lib/i18n/en.ts y pt.ts\n' + faltan.join('\n')).toEqual([]);
  });
});
