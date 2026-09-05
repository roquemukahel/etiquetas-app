import { describe, it, expect } from 'vitest';
import { obtenerTodasLasFilas } from './db';

// Fake mínimo del builder encadenable de Supabase (.from().select().range().order()),
// que resuelve como una promesa (implementa .then()) igual que el real. Permite
// simular que UN rango puntual falla una cantidad de veces antes de responder bien,
// para reproducir el bug real: con catálogos grandes (miles de filas → varias
// páginas de 1000 pedidas en paralelo), una página podía fallar (timeout, límite de
// conexiones) y se descartaba en silencio, sin reintentar.
type Fila = { id: number };

function crearSupabaseFake(filas: Fila[], fallosPorRango: Map<string, number> = new Map()) {
  return {
    from(_tabla: string) {
      let rango: [number, number] = [0, filas.length - 1];
      let conConteo = false;
      const builder: any = {
        select(_sel: string, opts?: any) {
          conConteo = !!opts && opts.count === 'exact';
          return builder;
        },
        range(a: number, b: number) {
          rango = [a, b];
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        then(resolve: (v: any) => void) {
          const key = `${rango[0]}-${rango[1]}`;
          const restantes = fallosPorRango.get(key) ?? 0;
          if (restantes > 0) {
            fallosPorRango.set(key, restantes - 1);
            resolve({ data: null, error: new Error(`fallo simulado en rango ${key}`) });
            return;
          }
          const slice = filas.slice(rango[0], rango[1] + 1);
          resolve({ data: slice, error: null, count: conConteo ? filas.length : undefined });
        },
      };
      return builder;
    },
  } as any;
}

function filasDe(n: number): Fila[] {
  return Array.from({ length: n }, (_, i) => ({ id: i }));
}

describe('obtenerTodasLasFilas', () => {
  it('trae todo en una sola página cuando el total no supera el límite de PostgREST', async () => {
    const supabase = crearSupabaseFake(filasDe(300));
    const filas = await obtenerTodasLasFilas<Fila>(supabase, 'productos', 'id');
    expect(filas).toHaveLength(300);
  });

  it('pagina correctamente cuando hay más filas que el límite de una sola página (catálogo grande)', async () => {
    const total = 2500; // 3 páginas de 1000
    const supabase = crearSupabaseFake(filasDe(total));
    const filas = await obtenerTodasLasFilas<Fila>(supabase, 'productos', 'id');
    expect(filas).toHaveLength(total);
    // Sin filas salteadas ni repetidas: los ids deben ser exactamente 0..2499.
    expect(filas.map((f) => f.id)).toEqual(filasDe(total).map((f) => f.id));
  });

  it('reintenta una página que falla una vez en vez de descartarla en silencio (bug real reportado por un cliente)', async () => {
    const total = 2500;
    // La página del medio (rango 1000-1999) falla una vez y responde bien recién
    // en el reintento — antes de este fix, esa página se perdía para siempre y
    // el catálogo quedaba incompleto sin ningún aviso.
    const fallos = new Map([['1000-1999', 1]]);
    const supabase = crearSupabaseFake(filasDe(total), fallos);
    const filas = await obtenerTodasLasFilas<Fila>(supabase, 'productos', 'id');
    expect(filas).toHaveLength(total);
    expect(filas.map((f) => f.id)).toEqual(filasDe(total).map((f) => f.id));
  });

  it('si una página agota los reintentos, las demás páginas igual se traen completas', async () => {
    const total = 2500;
    // Falla siempre (más veces que reintentos disponibles) para esa página puntual.
    const fallos = new Map([['1000-1999', 99]]);
    const supabase = crearSupabaseFake(filasDe(total), fallos);
    const filas = await obtenerTodasLasFilas<Fila>(supabase, 'productos', 'id');
    // Faltan exactamente las 1000 filas de la página que no se pudo traer, pero
    // el resto (primera y tercera página) se recuperó igual, sin que todo el
    // resultado quede vacío ni la función explote.
    expect(filas).toHaveLength(total - 1000);
    const idsFaltantes = new Set(filas.map((f) => f.id));
    expect(idsFaltantes.has(1500)).toBe(false);
    expect(idsFaltantes.has(0)).toBe(true);
    expect(idsFaltantes.has(2499)).toBe(true);
  });
});
