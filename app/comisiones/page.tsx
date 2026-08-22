'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import { simboloMoneda } from '../lib/monedas';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { registrarAuditoria } from '../lib/auditoria';
import { liquidarVendedor, crearAjuste } from '../lib/comisiones/operaciones';
import {
  LABEL_ESTADO_MOV,
  LABEL_TIPO_MOV,
  COLOR_ESTADO_MOV,
  LABEL_TIPO_VENTA,
  LABEL_ESTADO_LIQ,
  type EstadoMovimiento,
  type TipoMovimiento,
  type EstadoLiquidacion,
} from '../lib/comisiones/tipos';
import { useT } from '../lib/idioma';

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
type Liquidacion = { id: string; vendedor_id: string; estado: EstadoLiquidacion; total_neto: number; pagado: number; created_at: string; vendedores: { nombre: string } | null };

export default function Comisiones() {
  const supabase = crearClienteNavegador();
  const router = useRouter();
  const actor = useActor();
  const t = useT();
  const puedeGestionar = tienePermiso(actor, 'gestionar_comisiones');
  const puedeVer = tienePermiso(actor, 'ver_comisiones');

  const [activas, setActivas] = useState<boolean | null>(null);
  const [moneda, setMoneda] = useState('$');
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [vendedores, setVendedores] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ajuste manual
  const [ajusteAbierto, setAjusteAbierto] = useState(false);
  const [ajVendedor, setAjVendedor] = useState('');
  const [ajMonto, setAjMonto] = useState('');
  const [ajPositivo, setAjPositivo] = useState(true);
  const [ajMotivo, setAjMotivo] = useState('');

  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);
    const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda, comisiones_activas )').eq('id', user.id).single();
    const neg = (perfil as any)?.negocios;
    if (neg?.moneda) setMoneda(simboloMoneda(neg.moneda));
    setActivas(!!neg?.comisiones_activas);

    let q = supabase
      .from('comision_movimientos')
      .select('id, vendedor_id, orden_id, tipo_venta, tipo_movimiento, base, comision, estado, fecha_hecho, created_at, vendedores ( nombre ), ordenes ( clientes ( nombre, apellido ) )')
      .order('created_at', { ascending: false })
      .limit(500);
    if (!puedeGestionar && actor?.id) q = q.eq('vendedor_id', actor.id);
    const { data } = await q;
    setMovs((data as any) ?? []);

    let ql = supabase.from('comision_liquidaciones').select('id, vendedor_id, estado, total_neto, pagado, created_at, vendedores ( nombre )').order('created_at', { ascending: false }).limit(100);
    if (!puedeGestionar && actor?.id) ql = ql.eq('vendedor_id', actor.id);
    const { data: liq } = await ql;
    setLiquidaciones((liq as any) ?? []);

    // Todos los vendedores del negocio (para el ajuste manual, aunque todavía no
    // tengan comisiones generadas).
    if (puedeGestionar) {
      const { data: vend } = await supabase.from('vendedores').select('id, nombre').order('nombre');
      setVendedores((vend as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeGestionar, actor?.id]);

  const m = (n: number) => `${moneda}${Math.round(n).toLocaleString('es-AR')}`;

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
        t.ajustesReversiones += mv.comision;
      }
    }
    return t;
  }, [movs]);

  const porVendedor = useMemo(() => {
    const mapa = new Map<string, { vendedorId: string; nombre: string; comMin: number; comMay: number; ajustes: number; pendiente: number; total: number }>();
    for (const mv of movs) {
      const key = mv.vendedor_id;
      const row = mapa.get(key) ?? { vendedorId: key, nombre: mv.vendedores?.nombre ?? t('Vendedor'), comMin: 0, comMay: 0, ajustes: 0, pendiente: 0, total: 0 };
      if (mv.tipo_movimiento === 'comision') {
        if (mv.tipo_venta === 'mayorista') row.comMay += mv.comision;
        else row.comMin += mv.comision;
      } else row.ajustes += mv.comision;
      // Pendiente de liquidar = generada + aprobada (aún no en liquidación ni pagada)
      if (mv.estado === 'generada' || mv.estado === 'aprobada') row.pendiente += mv.comision;
      row.total = row.comMin + row.comMay + row.ajustes;
      mapa.set(key, row);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [movs, t]);

  const liquidar = async (vendedorId: string, nombre: string, pendiente: number) => {
    if (!puedeGestionar || trabajando) return;
    if (!confirm(`${t('¿Liquidar')} ${m(pendiente)} ${t('de')} ${nombre}? ${t('Se aprueban las comisiones pendientes y se arma la liquidación.')}`)) return;
    setTrabajando(vendedorId);
    setError(null);
    const { liquidacionId, error: e } = await liquidarVendedor(supabase, vendedorId, null, null);
    if (e || !liquidacionId) {
      setError(e || t('No se pudo liquidar.'));
      setTrabajando(null);
      return;
    }
    await registrarAuditoria(supabase, { accion: `creó una liquidación de comisiones de ${nombre} (${m(pendiente)})`, entidad: 'comision_liquidacion', entidadId: liquidacionId });
    router.push(`/comisiones/liquidaciones/${liquidacionId}`);
  };

  const guardarAjuste = async () => {
    if (!puedeGestionar || !ajVendedor || !ajMotivo.trim()) {
      setError(t('Elegí vendedor y escribí un motivo.'));
      return;
    }
    const monto = Number(ajMonto.replace(',', '.'));
    if (!monto || monto <= 0) {
      setError(t('Ingresá un monto válido.'));
      return;
    }
    setTrabajando('ajuste');
    setError(null);
    const { error: e } = await crearAjuste(supabase, { vendedorId: ajVendedor, monto, positivo: ajPositivo, motivo: ajMotivo.trim(), moneda: null, usuario: actor?.nombre ?? null });
    if (e) {
      setError(e);
      setTrabajando(null);
      return;
    }
    await registrarAuditoria(supabase, { accion: `cargó un ajuste de comisión ${ajPositivo ? '(+)' : '(−)'} de ${m(monto)}: ${ajMotivo.trim()}`, entidad: 'comision_movimiento' });
    setAjusteAbierto(false);
    setAjVendedor('');
    setAjMonto('');
    setAjMotivo('');
    setTrabajando(null);
    cargar();
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center"><p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando comisiones...')}</p></main>;

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver comisiones.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">{t('Volver al inicio')}</Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-5 max-w-4xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">&larr;</Link>
        <span className="text-lg font-medium mr-auto">{t('Comisiones')}</span>
        {puedeGestionar && <Link href="/configuracion/comisiones" className="text-xs text-accent dark:text-dark-accent underline">{t('Configurar')}</Link>}
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {activas === false && (
        <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 text-center flex flex-col items-center gap-2">
          <p className="text-sm font-medium">{t('Las comisiones están desactivadas')}</p>
          {puedeGestionar && <Link href="/configuracion/comisiones" className="mt-1 rounded-xl bg-accent dark:bg-dark-accent text-white px-4 py-2 text-xs font-medium">{t('Activar comisiones')}</Link>}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tarjeta valor={m(tot.generada)} etiqueta={t('Generadas (a revisar)')} tono="text-accent dark:text-dark-accent" />
        <Tarjeta valor={m(tot.aprobada)} etiqueta={t('Aprobadas por liquidar')} tono="text-good" />
        <Tarjeta valor={m(tot.pagada)} etiqueta={t('Pagadas')} />
        <Tarjeta valor={m(tot.ajustesReversiones)} etiqueta={t('Ajustes y reversiones')} tono={tot.ajustesReversiones < 0 ? 'text-bad' : undefined} />
      </div>

      <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border flex items-center justify-between">
          <p className="text-sm font-semibold">{t('Por vendedor')}</p>
          {puedeGestionar && <button onClick={() => setAjusteAbierto((v) => !v)} className="text-xs text-accent dark:text-dark-accent underline">{t('Ajuste manual')}</button>}
        </div>

        {ajusteAbierto && puedeGestionar && (
          <div className="px-4 py-3 border-b border-border dark:border-dark-border bg-canvas dark:bg-dark-bg flex flex-col gap-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select value={ajVendedor} onChange={(e) => setAjVendedor(e.target.value)} className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm">
                <option value="">{t('Vendedor…')}</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
              <select value={ajPositivo ? '1' : '0'} onChange={(e) => setAjPositivo(e.target.value === '1')} className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm">
                <option value="1">{t('Bonificación (+)')}</option>
                <option value="0">{t('Descuento (−)')}</option>
              </select>
              <input value={ajMonto} onChange={(e) => setAjMonto(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={t('Monto')} className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
              <input value={ajMotivo} onChange={(e) => setAjMotivo(e.target.value)} placeholder={t('Motivo (obligatorio)')} className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
            </div>
            <button disabled={trabajando === 'ajuste'} onClick={guardarAjuste} className="self-start rounded-lg bg-accent dark:bg-dark-accent text-white px-4 py-2 text-xs font-medium disabled:opacity-40">{t('Guardar ajuste')}</button>
          </div>
        )}

        {porVendedor.length === 0 ? (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-8">{t('Todavía no hay comisiones.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary text-right">
                  <th className="text-left font-medium px-4 py-2">{t('Vendedor')}</th>
                  <th className="font-medium px-2 py-2">{t('Minorista')}</th>
                  <th className="font-medium px-2 py-2">{t('Mayorista')}</th>
                  <th className="font-medium px-2 py-2">{t('Total')}</th>
                  {puedeGestionar && <th className="font-medium px-4 py-2">{t('Pendiente')}</th>}
                </tr>
              </thead>
              <tbody>
                {porVendedor.map((v) => (
                  <tr key={v.vendedorId} className="border-t border-border dark:border-dark-border">
                    <td className="text-left px-4 py-2.5 font-medium">{v.nombre}</td>
                    <td className="text-right px-2 py-2.5 tabular-nums">{m(v.comMin)}</td>
                    <td className="text-right px-2 py-2.5 tabular-nums">{m(v.comMay)}</td>
                    <td className="text-right px-2 py-2.5 tabular-nums font-semibold">{m(v.total)}</td>
                    {puedeGestionar && (
                      <td className="text-right px-4 py-2.5">
                        {v.pendiente > 0 ? (
                          <button disabled={trabajando === v.vendedorId} onClick={() => liquidar(v.vendedorId, v.nombre, v.pendiente)} className="rounded-lg bg-good text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40 whitespace-nowrap">
                            {trabajando === v.vendedorId ? '…' : `${t('Liquidar')} ${m(v.pendiente)}`}
                          </button>
                        ) : (
                          <span className="text-xs text-muted dark:text-dark-text-secondary">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {liquidaciones.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card">
          <div className="px-4 py-3 border-b border-border dark:border-dark-border"><p className="text-sm font-semibold">{t('Liquidaciones')}</p></div>
          <div className="flex flex-col divide-y divide-border dark:divide-dark-border">
            {liquidaciones.map((l) => (
              <Link key={l.id} href={`/comisiones/liquidaciones/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas dark:hover:bg-dark-bg transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{l.vendedores?.nombre ?? t('Vendedor')}</p>
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">{new Date(l.created_at).toLocaleDateString('es-AR')} · {t(LABEL_ESTADO_LIQ[l.estado])}</p>
                </div>
                <span className="text-sm tabular-nums font-semibold">{m(l.total_neto)}</span>
                <span className="text-muted dark:text-dark-text-secondary">&rarr;</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card">
        <div className="px-4 py-3 border-b border-border dark:border-dark-border"><p className="text-sm font-semibold">{t('Movimientos')}</p></div>
        {movs.length === 0 ? (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-8">{t('Sin movimientos.')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border dark:divide-dark-border">
            {movs.slice(0, 100).map((mv) => {
              const cliente = mv.ordenes?.clientes ? `${mv.ordenes.clientes.nombre} ${mv.ordenes.clientes.apellido || ''}`.trim() : null;
              return (
                <div key={mv.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {mv.vendedores?.nombre ?? t('Vendedor')}
                      {mv.tipo_venta && <span className="text-xs text-muted dark:text-dark-text-secondary"> · {t(LABEL_TIPO_VENTA[mv.tipo_venta as 'minorista' | 'mayorista'] ?? mv.tipo_venta)}</span>}
                    </p>
                    <p className="text-[11px] text-muted dark:text-dark-text-secondary truncate">{t(LABEL_TIPO_MOV[mv.tipo_movimiento])}{cliente ? ` · ${cliente}` : ''} · {new Date(mv.fecha_hecho || mv.created_at).toLocaleDateString('es-AR')}</p>
                  </div>
                  <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${COLOR_ESTADO_MOV[mv.estado]}`}>{t(LABEL_ESTADO_MOV[mv.estado])}</span>
                  <span className={`text-sm tabular-nums font-semibold shrink-0 w-24 text-right ${mv.comision < 0 ? 'text-bad' : ''}`}>{m(mv.comision)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
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
