'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { leerArchivoDatos, valorDe, descargarDatos, insertarEnTandas } from '../lib/csv';
import { obtenerTodasLasFilas } from '../lib/db';
import { registrarAuditoria } from '../lib/auditoria';
import { eliminarEnBloque } from '../lib/eliminarEnBloque';
import { getActor, useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { simboloMoneda } from '../lib/monedas';
import { ICONOS } from '../Iconos';
import { QoviState } from '../QoviState';
import { useT } from '../lib/idioma';

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  domicilio: string | null;
  email: string | null;
  telefono: string | null;
  dni: string | null;
  cta_cte_habilitada?: boolean | null;
};

type CategoriaCtaReal = 'con_saldo' | 'vencido' | 'a_favor' | 'al_dia';
type FiltroCuentaCorriente = 'todos' | 'con_cta' | CategoriaCtaReal;

export default function Clientes() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState<{ hechas: number; total: number } | null>(null);
  const [resultadoImport, setResultadoImport] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const inputImportRef = useRef<HTMLInputElement>(null);

  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [eliminandoSeleccion, setEliminandoSeleccion] = useState(false);

  const [saldos, setSaldos] = useState<Map<string, { saldo: number; vencido: number }>>(new Map());
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  const moneda = useMemo(() => simboloMoneda(monedaCodigo), [monedaCodigo]);
  // Filtro por estado de cuenta corriente — para encontrar rápido, en una
  // lista larga, a quién le falta cobrar o quién tiene saldo a favor, sin
  // tener que abrir cliente por cliente.
  const [filtroCta, setFiltroCta] = useState<FiltroCuentaCorriente>('todos');

  // Columnas explícitas (no "*"): con miles de clientes, traer columnas que
  // esta pantalla no usa (sobre todo la foto en base64 de quién lo cargó)
  // multiplica el peso de la respuesta sin necesidad.
  const cargar = async () => {
    const data = await obtenerTodasLasFilas<Cliente>(
      supabase,
      'clientes',
      'id, nombre, apellido, domicilio, email, telefono, dni, cta_cte_habilitada',
      [{ columna: 'nombre' }]
    );
    setClientes(data);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  // Saldos de cuenta corriente de todos los clientes en un solo llamado. Si
  // el SQL todavía no se corrió, la función no existe y esto falla en
  // silencio: el mapa queda vacío y simplemente no se muestran saldos.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('saldos_cuenta_corriente');
      const m = new Map<string, { saldo: number; vencido: number }>();
      for (const r of (data as { cliente_id: string; saldo: number; vencido: number }[]) ?? []) {
        m.set(r.cliente_id, { saldo: Number(r.saldo) || 0, vencido: Number(r.vencido) || 0 });
      }
      setSaldos(m);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single();
        const cod = (perfil as any)?.negocios?.moneda;
        if (cod) setMonedaCodigo(cod);
      }
    })();
  }, []);

  const exportar = async (formato: 'csv' | 'xlsx') => {
    setExportando(true);
    setResultadoImport(null);
    try {
      await descargarDatos(
        'clientes-qovento',
        ['nombre', 'apellido', 'email', 'telefono', 'dni', 'domicilio'],
        clientes,
        formato
      );
    } catch (err: any) {
      // Antes esto no tenía try/catch ni esperaba la promesa: si algo
      // fallaba al armar el archivo, quedaba como un error sin capturar en
      // la consola — nadie que no fuera programador se enteraba de que la
      // exportación había fallado, ni por qué.
      setResultadoImport(t('No pudimos exportar:') + ' ' + (err?.message ?? t('error desconocido')));
    }
    setExportando(false);
  };

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setImportando(true);
    setResultadoImport(null);
    setProgresoImport(null);

    try {
      const filas = await leerArchivoDatos(archivo);
      const dnisExistentes = new Set(clientes.map((c) => c.dni).filter(Boolean));
      const actor = getActor();

      const nuevos = filas
        .map((fila) => {
          const nombre = valorDe(fila, 'nombre', 'fullname', 'name');
          if (!nombre) return null;
          return {
            nombre,
            apellido: valorDe(fila, 'apellido', 'lastname') || null,
            email: valorDe(fila, 'email') || null,
            telefono: valorDe(fila, 'telefono', 'phone') || null,
            dni: valorDe(fila, 'dni') || null,
            domicilio: valorDe(fila, 'domicilio', 'direccion', 'address', 'contactdescription') || null,
            agregado_por_nombre: actor?.nombre ?? null,
            agregado_por_foto_url: actor?.fotoUrl ?? null,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .filter((c) => !c.dni || !dnisExistentes.has(c.dni));

      const { guardadas, error } = await insertarEnTandas(
        (tanda) => supabase.from('clientes').insert(tanda),
        nuevos,
        500,
        (hechas, total) => setProgresoImport({ hechas, total })
      );

      const omitidos = filas.length - nuevos.length;
      setResultadoImport(
        error
          ? `${t('Se guardaron')} ${guardadas} ${t('de')} ${nuevos.length} ${t('antes de un error:')} ${error}`
          : `${t('Listo: se importaron')} ${guardadas} ${t('clientes.')}${omitidos > 0 ? ` ${t('Se omitieron')} ${omitidos} ${t('filas sin nombre o con un DNI ya cargado.')}` : ''}`
      );
      cargar();
    } catch (err: any) {
      setResultadoImport(`${t('No pudimos leer el archivo:')} ` + (err?.message ?? t('error desconocido')));
    }

    setImportando(false);
    setProgresoImport(null);
    if (inputImportRef.current) inputImportRef.current.value = '';
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const salirDeSeleccion = () => {
    setModoSeleccion(false);
    setSeleccionados(new Set());
  };

  const eliminarSeleccionados = async () => {
    if (!puedeEliminar) return;
    const ids = Array.from(seleccionados);
    if (ids.length === 0) return;
    if (
      !confirm(`${t('¿Eliminar')} ${ids.length} ${ids.length === 1 ? t('cliente') : t('clientes')}? ${t('No se puede deshacer.')}`)
    )
      return;

    setEliminandoSeleccion(true);
    const aEliminar = clientes.filter((c) => seleccionados.has(c.id));

    const { eliminados, bloqueados } = await eliminarEnBloque(supabase, 'clientes', ids);
    const eliminadosSet = new Set(eliminados);
    for (const c of aEliminar) {
      if (!eliminadosSet.has(c.id)) continue;
      await registrarAuditoria(supabase, {
        accion: `eliminó al cliente ${c.nombre} ${c.apellido || ''}`.trim().replace(/\s+/g, ' '),
        entidad: 'cliente',
        entidadId: c.id,
      });
    }

    setEliminandoSeleccion(false);
    salirDeSeleccion();
    cargar();
    if (bloqueados.length > 0) {
      alert(
        `${t('Se eliminaron')} ${eliminados.length} ${t('de')} ${ids.length}. ${bloqueados.length} ${t('no se pudieron eliminar porque tienen ventas u otro historial vinculado.')}`
      );
    }
  };

  // Categoría de cuenta corriente de un cliente, misma lógica en el filtro y
  // en el conteo de los chips — para que nunca puedan mostrar números
  // distintos entre sí.
  //
  // El "vencido" que devuelve saldos_cuenta_corriente() es la suma de TODO
  // cargo cuyo vencimiento ya pasó, sin descontar lo que el cliente ya pagó
  // después — un cargo vencido y completamente saldado sigue sumando ahí.
  // El resto de la app ya lo sabe y lo acota (ver la ficha del cliente,
  // app/clientes/[id]/page.tsx: `vencido = Math.min(Math.max(saldo, 0),
  // sumaVencida)`) y estadoCuenta() en app/lib/cuentaCorriente.ts chequea
  // saldo<=0 ANTES que vencido — acá se replica el mismo criterio, si no,
  // un cliente que ya pagó todo podía aparecer en el chip "En mora".
  const categoriaCta = (c: Cliente): CategoriaCtaReal | null => {
    if (!c.cta_cte_habilitada) return null;
    const s = saldos.get(c.id);
    const saldo = s?.saldo ?? 0;
    const vencido = Math.min(Math.max(saldo, 0), s?.vencido ?? 0);
    if (saldo < -0.009) return 'a_favor';
    if (saldo <= 0.009) return 'al_dia';
    if (vencido > 0.009) return 'vencido';
    return 'con_saldo';
  };

  const conteosCta = useMemo(() => {
    const c = { con_cta: 0, con_saldo: 0, vencido: 0, a_favor: 0, al_dia: 0 };
    for (const cliente of clientes) {
      const cat = categoriaCta(cliente);
      if (!cat) continue;
      c.con_cta++;
      c[cat]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, saldos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let base = clientes;
    if (q) {
      base = base.filter((c) =>
        [c.nombre, c.apellido, c.email, c.telefono, c.dni]
          .filter(Boolean)
          .some((campo) => campo!.toLowerCase().includes(q))
      );
    }
    if (filtroCta === 'todos') return base;
    if (filtroCta === 'con_cta') return base.filter((c) => !!c.cta_cte_habilitada);
    return base.filter((c) => categoriaCta(c) === filtroCta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, busqueda, filtroCta, saldos]);

  // Con miles de clientes, pintar TODAS las tarjetas de una es lo que hace
  // sentir lenta la pantalla (no la consulta en sí) — de a poco entonces,
  // como una paginación manual. La búsqueda sigue funcionando sobre TODOS
  // los clientes cargados (filtrados no cambia), solo lo que se renderiza
  // arranca corto.
  const PASO_VISIBLES = 150;
  const [visibles, setVisibles] = useState(PASO_VISIBLES);
  useEffect(() => {
    setVisibles(PASO_VISIBLES);
  }, [busqueda, filtroCta]);
  const paraRenderizar = useMemo(() => filtrados.slice(0, visibles), [filtrados, visibles]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Clientes')}</span>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={t('Buscar por nombre, email, teléfono, DNI...')}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      {conteosCta.con_cta > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['todos', `${t('Todos')} (${clientes.length})`],
              ['con_cta', `${t('Con cuenta corriente')} (${conteosCta.con_cta})`],
              ['vencido', `${t('En mora')} (${conteosCta.vencido})`],
              ['con_saldo', `${t('Con saldo')} (${conteosCta.con_saldo})`],
              ['a_favor', `${t('Saldo a favor')} (${conteosCta.a_favor})`],
              ['al_dia', `${t('Al día')} (${conteosCta.al_dia})`],
            ] as [FiltroCuentaCorriente, string][]
          )
            .filter(([clave]) => clave === 'todos' || (conteosCta as Record<string, number>)[clave] > 0)
            .map(([clave, etiqueta]) => (
              <button
                key={clave}
                onClick={() => setFiltroCta(clave)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  filtroCta === clave ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-canvas dark:bg-dark-bg text-muted dark:text-dark-text-secondary'
                }`}
              >
                {etiqueta}
              </button>
            ))}
        </div>
      )}

      <Link
        href="/clientes/nuevo"
        className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        + {t('Cargar cliente')}
      </Link>

      <div className="flex flex-col gap-2">
        <label className="rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium cursor-pointer">
          {importando
            ? progresoImport
              ? `${t('Importando...')} ${progresoImport.hechas}/${progresoImport.total}`
              : t('Leyendo archivo...')
            : `⬆ ${t('Importar CSV o Excel')}`}
          <input
            ref={inputImportRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            disabled={importando}
            onChange={importar}
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => exportar('csv')}
            disabled={clientes.length === 0 || exportando}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium disabled:opacity-40"
          >
            ⬇ {exportando ? t('Exportando...') : t('Exportar CSV')}
          </button>
          <button
            onClick={() => exportar('xlsx')}
            disabled={clientes.length === 0 || exportando}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium disabled:opacity-40"
          >
            ⬇ {exportando ? t('Exportando...') : t('Exportar Excel')}
          </button>
        </div>
      </div>

      {resultadoImport && (
        <p className="text-xs bg-canvas dark:bg-dark-bg rounded-lg px-3 py-2 text-muted dark:text-dark-text-secondary">
          {resultadoImport}
        </p>
      )}

      {modoSeleccion ? (
        <div className="sticky top-0 z-10 rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft dark:bg-dark-accent-soft px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {seleccionados.size} {seleccionados.size === 1 ? t('seleccionado') : t('seleccionados')}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={salirDeSeleccion} className="text-xs text-muted dark:text-dark-text-secondary underline">
              {t('Cancelar')}
            </button>
            <button
              onClick={eliminarSeleccionados}
              disabled={seleccionados.size === 0 || eliminandoSeleccion}
              className="rounded-lg bg-bad text-white text-xs font-medium px-3 py-1.5 disabled:opacity-40"
            >
              {eliminandoSeleccion ? t('Eliminando...') : t('Eliminar')}
            </button>
          </div>
        </div>
      ) : (
        puedeEliminar && (
          <button onClick={() => setModoSeleccion(true)} className="self-start text-xs text-accent dark:text-dark-accent underline">
            {t('Seleccionar varios')}
          </button>
        )
      )}

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}

      {!loading && filtrados.length === 0 && busqueda && (
        <QoviState
          escena="sinResultados"
          tamano="sm"
          titulo={t('No encontramos resultados')}
          descripcion={`${t('Nada coincide con')} "${busqueda}".`}
          accionSecundaria={{ label: t('Limpiar búsqueda'), onClick: () => setBusqueda('') }}
        />
      )}
      {!loading && filtrados.length === 0 && !busqueda && filtroCta !== 'todos' && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          {t('Ningún cliente entra en este filtro.')}{' '}
          <button onClick={() => setFiltroCta('todos')} className="text-accent dark:text-dark-accent underline">
            {t('Ver todos')}
          </button>
        </p>
      )}
      {!loading && filtrados.length === 0 && !busqueda && filtroCta === 'todos' && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Todavía no tenés clientes cargados.')}</p>
      )}

      {!loading && filtrados.length > 0 && (
        <p className="text-xs text-muted dark:text-dark-text-secondary">
          {t('Mostrando')} {paraRenderizar.length} {t('de')} {filtrados.length}
        </p>
      )}

      {/* Lista compacta (no una tarjeta grande por cliente): un solo
          contenedor con filas separadas por línea, más denso y más rápido
          de escanear cuando hay miles de clientes. */}
      <div className="rounded-2xl border border-border dark:border-dark-border overflow-hidden divide-y divide-border dark:divide-dark-border">
        {paraRenderizar.map((c) => {
          const seleccionado = seleccionados.has(c.id);
          const s = saldos.get(c.id);
          const saldoChip =
            s && Math.abs(s.saldo) > 0.009 ? (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  s.saldo > 0 ? (s.vencido > 0 ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn') : 'bg-good/10 text-good'
                }`}
                title={s.saldo > 0 ? t('Te debe') : t('Saldo a favor')}
              >
                {s.saldo < 0 ? '+' : ''}
                {moneda}
                {Math.round(Math.abs(s.saldo)).toLocaleString('es-AR')}
              </span>
            ) : null;
          const clases = `flex items-center gap-3 w-full text-left px-4 py-2.5 transition-colors ${
            seleccionado ? 'bg-accent-soft dark:bg-dark-accent-soft' : 'bg-white dark:bg-dark-surface hover:bg-canvas dark:hover:bg-dark-bg'
          }`;
          const contenido = (
            <>
              {modoSeleccion && (
                <span
                  className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    seleccionado
                      ? 'bg-accent dark:bg-dark-accent border-accent dark:border-dark-accent'
                      : 'border-border dark:border-dark-border'
                  }`}
                >
                  {seleccionado && (
                    <span aria-hidden="true" className="text-white [&_svg]:h-3 [&_svg]:w-3">
                      {ICONOS.check}
                    </span>
                  )}
                </span>
              )}
              <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.nombre} {c.apellido || ''}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">{c.telefono || c.email || t('sin contacto')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {saldoChip}
                  {c.dni && <p className="text-xs text-muted dark:text-dark-text-secondary font-mono">{c.dni}</p>}
                </div>
              </div>
            </>
          );

          return modoSeleccion ? (
            <button key={c.id} onClick={() => toggleSeleccion(c.id)} className={clases}>
              {contenido}
            </button>
          ) : (
            <Link key={c.id} href={`/clientes/${c.id}`} className={clases}>
              {contenido}
            </Link>
          );
        })}
      </div>

      {visibles < filtrados.length && (
        <button
          onClick={() => setVisibles((v) => v + PASO_VISIBLES)}
          className="w-full rounded-xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
        >
          {t('Mostrar')} {Math.min(PASO_VISIBLES, filtrados.length - visibles)} {t('más')}
        </button>
      )}
    </main>
  );
}
