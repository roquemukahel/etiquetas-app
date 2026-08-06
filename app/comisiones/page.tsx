'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { simboloMoneda } from '../lib/monedas';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { LABEL_ESTADO_MOV, LABEL_TIPO_MOV, COLOR_ESTADO_MOV, LABEL_TIPO_VENTA, type EstadoMovimiento, type TipoMovimiento } from '../lib/comisiones/tipos';

type Movimiento = {
  id: string;
  vendedor_id: string;
  orden_id: string | null;
  tipo_venta: string | null;
  tipo_movimiento: TipoMovimiento;
  base: number;
  comision: number;
  estado: EstadoMovimiento;
  fecha_hecho: string | null;
  created_at: string;
  vendedores: { nombre: string } | null;
  ordenes: { clientes: { nombre: string; apellido: string | null } | null } | null;
};

export default function Comisiones() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeGestionar = tienePermiso(actor, 'gestionar_comisiones');
  const puedeVer = tienePermiso(actor, 'ver_comisiones');

  const [activas, setActivas] = useState<boolean | null>(null);
  const [moneda, setMoneda] = useState('$');
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( moneda, comisiones_activas )')
        .eq('id', user.id)
        .single();
      const neg = (perfil as any)?.negocios;
      if (neg?.moneda) setMoneda(simboloMoneda(neg.moneda));
      setActivas(!!neg?.comisiones_activas);

      // Un vendedor sin acceso completo ve SOLO sus movimientos.
      let q = supabase
        .from('comision_movimientos')
        .select('id, vendedor_id, orden_id, tipo_venta, tipo_movimiento, base, comision, estado, fecha_hecho, created_at, vendedores ( nombre ), ordenes ( clientes ( nombre, apellido ) )')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!puedeGestionar && actor?.id) q = q.eq('vendedor_id', actor.id);
      const { data } = await q;
      setMovs((data as any) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeGestionar, actor?.id]);

  const m = (n: number) => `${moneda}${Math.round(n).toLocaleString('es-AR')}`;

  // Totales por estado / tipo
  const tot = useMemo(() => {
    const t = { generada: 0, aprobada: 0, en_liquidacion: 0, pagada: 0, ajustesReversiones: 0, base: 0 };
    for (const mv of movs) {
      if (mv.tipo_movimiento === 'comision') {
        t.base += Number(mv.base) || 0;
        if (mv.estado === 'generada') t.generada += mv.comision;
        else if (mv.estado === 'aprobada') t.aprobada += mv.comision;
        else if (mv.estado === 'en_liquidacion') t.en_liquidacion += mv.comision;
        else if (mv.estado === 'pagada') t.pagada += mv.comision;
      } else {
        t.ajustesReversiones += mv.comision; // negativos/positivos
      }
    }
    return t;
  }, [movs]);

  // Resumen por vendedor
  const porVendedor = useMemo(() => {
    const mapa = new Map<string, { nombre: string; ventaMin: number; comMin: number; ventaMay: number; comMay: number; ajustes: number; pagado: number; total: number }>();
    for (const mv of movs) {
      const key = mv.vendedor_id;
      const row = mapa.get(key) ?? { nombre: mv.vendedores?.nombre ?? 'Vendedor', ventaMin: 0, comMin: 0, ventaMay: 0, comMay: 0, ajustes: 0, pagado: 0, total: 0 };
      if (mv.tipo_movimiento === 'comision') {
        if (mv.tipo_venta === 'mayorista') { row.ventaMay += Number(mv.base) || 0; row.comMay += mv.comision; }
        else { row.ventaMin += Number(mv.base) || 0; row.comMin += mv.comision; }
        if (mv.estado === 'pagada') row.pagado += mv.comision;
      } else {
        row.ajustes += mv.comision;
        if (mv.estado === 'pagada') row.pagado += mv.comision;
      }
      row.total = row.comMin + row.comMay + row.ajustes;
      mapa.set(key, row);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [movs]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando comisiones...</p>
      </main>
    );
  }

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para ver comisiones.</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">Volver al inicio</Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-5 max-w-4xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">&larr;</Link>
        <span className="text-lg font-medium mr-auto">Comisiones</span>
        {puedeGestionar && (
          <Link href="/configuracion/comisiones" className="text-xs text-accent dark:text-dark-accent underline">Configurar</Link>
        )}
      </header>

      {activas === false && (
        <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 text-center flex flex-col items-center gap-2">
          <p className="text-sm font-medium">Las comisiones están desactivadas</p>
          <p className="text-xs text-muted dark:text-dark-text-secondary max-w-sm">Activalas y poné el porcentaje de los vendedores para que las ventas empiecen a generar comisiones.</p>
          {puedeGestionar && (
            <Link href="/configuracion/comisiones" className="mt-1 rounded-xl bg-accent dark:bg-dark-accent text-white px-4 py-2 text-xs font-medium">Activar comisiones</Link>
          )}
        </div>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tarjeta valor={m(tot.generada)} etiqueta="Generadas (a revisar)" tono="text-accent dark:text-dark-accent" />
        <Tarjeta valor={m(tot.aprobada)} etiqueta="Aprobadas por liquidar" tono="text-good" />
        <Tarjeta valor={m(tot.pagada)} etiqueta="Pagadas" />
        <Tarjeta valor={m(tot.ajustesReversiones)} etiqueta="Ajustes y reversiones" tono={tot.ajustesReversiones < 0 ? 'text-bad' : undefined} />
      </div>

      {/* Tabla por vendedor */}
      <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border">
          <p className="text-sm font-semibold">Por vendedor</p>
        </div>
        {porVendedor.length === 0 ? (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-8">Todavía no hay comisiones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary text-right">
                  <th className="text-left font-medium px-4 py-2">Vendedor</th>
                  <th className="font-medium px-2 py-2">Com. minorista</th>
                  <th className="font-medium px-2 py-2">Com. mayorista</th>
                  <th className="font-medium px-2 py-2">Ajustes</th>
                  <th className="font-medium px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {porVendedor.map((v, i) => (
                  <tr key={i} className="border-t border-border dark:border-dark-border">
                    <td className="text-left px-4 py-2.5 font-medium">{v.nombre}</td>
                    <td className="text-right px-2 py-2.5 tabular-nums">{m(v.comMin)}</td>
                    <td className="text-right px-2 py-2.5 tabular-nums">{m(v.comMay)}</td>
                    <td className={`text-right px-2 py-2.5 tabular-nums ${v.ajustes < 0 ? 'text-bad' : ''}`}>{v.ajustes !== 0 ? m(v.ajustes) : '—'}</td>
                    <td className="text-right px-4 py-2.5 tabular-nums font-semibold">{m(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Movimientos recientes */}
      <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border">
          <p className="text-sm font-semibold">Movimientos</p>
        </div>
        {movs.length === 0 ? (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-8">Sin movimientos.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border dark:divide-dark-border">
            {movs.slice(0, 100).map((mv) => {
              const cliente = mv.ordenes?.clientes ? `${mv.ordenes.clientes.nombre} ${mv.ordenes.clientes.apellido || ''}`.trim() : null;
              return (
                <div key={mv.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {mv.vendedores?.nombre ?? 'Vendedor'}
                      {mv.tipo_venta && <span className="text-xs text-muted dark:text-dark-text-secondary"> · {LABEL_TIPO_VENTA[mv.tipo_venta as 'minorista' | 'mayorista'] ?? mv.tipo_venta}</span>}
                    </p>
                    <p className="text-[11px] text-muted dark:text-dark-text-secondary truncate">
                      {LABEL_TIPO_MOV[mv.tipo_movimiento]}{cliente ? ` · ${cliente}` : ''} · {new Date(mv.fecha_hecho || mv.created_at).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${COLOR_ESTADO_MOV[mv.estado]}`}>{LABEL_ESTADO_MOV[mv.estado]}</span>
                  <span className={`text-sm tabular-nums font-semibold shrink-0 w-24 text-right ${mv.comision < 0 ? 'text-bad' : ''}`}>{m(mv.comision)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted dark:text-dark-text-secondary text-center">
        Las comisiones las calcula el sistema al confirmar cada venta. Aprobación, liquidaciones y pagos: próxima etapa.
      </p>
    </main>
  );
}

function Tarjeta({ valor, etiqueta, tono }: { valor: string; etiqueta: string; tono?: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5 flex flex-col gap-0.5">
      <p className={`text-lg font-display font-semibold leading-none truncate ${tono ?? ''}`}>{valor}</p>
      <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight mt-1">{etiqueta}</p>
    </div>
  );
}
