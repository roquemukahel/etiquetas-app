'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { sanitizarDecimal } from '../../lib/numeros';
import SelectorColorAuto from '../../SelectorColorAuto';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';
import { useSucursalActual } from '../../lib/sucursal';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Plan = {
  id: string;
  cliente_id: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  monto_objetivo: number;
  detalles: string | null;
  estado: string;
  dispositivo_id: string | null;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

type Movimiento = {
  id: string;
  monto: number;
  medio: string | null;
  observacion: string | null;
  fecha: string;
};

export default function DetallePlanAhorro() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const puedeVer = tienePermiso(actor, 'ver_plan_ahorro');
  const puedeEliminar = tienePermiso(actor, 'eliminar');

  const [plan, setPlan] = useState<Plan | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movimientosError, setMovimientosError] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const [registrandoPago, setRegistrandoPago] = useState(false);
  const [montoPago, setMontoPago] = useState('');
  const [medioPago, setMedioPago] = useState('efectivo');
  const [obsPago, setObsPago] = useState('');
  const [guardandoPago, setGuardandoPago] = useState(false);

  const [editando, setEditando] = useState(false);
  const [editModelo, setEditModelo] = useState('');
  const [editCapacidad, setEditCapacidad] = useState<number | null>(null);
  const [editColor, setEditColor] = useState('');
  const [editMontoObjetivo, setEditMontoObjetivo] = useState('');
  const [editDetalles, setEditDetalles] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const nombreCliente = (p: Plan) => (p.clientes ? `${p.clientes.nombre} ${p.clientes.apellido || ''}`.trim() : t('sin cliente'));

  const cargar = async () => {
    const { data: planData } = await supabase
      .from('planes_ahorro')
      .select('*, clientes ( nombre, apellido, telefono )')
      .eq('id', id)
      .maybeSingle();
    setPlan((planData as Plan) ?? null);

    const { data: movData, error: movError } = await supabase
      .from('plan_ahorro_movimientos')
      .select('id, monto, medio, observacion, fecha')
      .eq('plan_id', id)
      .eq('anulado', false)
      .order('fecha', { ascending: false });
    setMovimientosError(!!movError);
    setMovimientos(movError ? [] : ((movData as Movimiento[]) ?? []));
    setLoading(false);
  };

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, puedeVer]);

  // Pagado = suma de abonos (nunca se guarda, se calcula siempre).
  const pagado = useMemo(() => movimientos.reduce((acc, m) => acc + m.monto, 0), [movimientos]);
  const falta = plan ? Math.max(0, plan.monto_objetivo - pagado) : 0;
  const pct = plan && plan.monto_objetivo > 0 ? Math.min(100, Math.round((pagado / plan.monto_objetivo) * 100)) : 0;
  const completo = plan ? pagado >= plan.monto_objetivo : false;

  const registrarPago = async () => {
    if (!plan) return;
    const monto = Number(montoPago);
    if (!monto || monto <= 0) {
      setError(t('Poné un monto válido'));
      return;
    }
    setGuardandoPago(true);
    setError(null);
    const { data: nuevoMov, error: dbError } = await supabase
      .from('plan_ahorro_movimientos')
      .insert({
        plan_id: plan.id,
        monto,
        medio: medioPago,
        observacion: obsPago.trim() || null,
        registrado_por_nombre: actor?.nombre ?? null,
        registrado_por_foto_url: actor?.fotoUrl ?? null,
      })
      .select('id')
      .single();
    if (dbError) {
      setError(t('No pudimos guardar el pago:') + ' ' + dbError.message);
      setGuardandoPago(false);
      return;
    }
    setGuardandoPago(false);
    setRegistrandoPago(false);
    setMontoPago('');
    setObsPago('');
    setMedioPago('efectivo');
    if (nuevoMov?.id) {
      router.push(`/plan-ahorro/${plan.id}/comprobante/${nuevoMov.id}`);
      return;
    }
    cargar();
  };

  const anularMovimiento = async (movId: string) => {
    if (!confirm(t('¿Anular este pago? Deja de contar para el total juntado (queda registrado como anulado, no se borra).'))) return;
    await supabase.from('plan_ahorro_movimientos').update({ anulado: true }).eq('id', movId);
    cargar();
  };

  const cambiarEstado = async (nuevoEstado: string) => {
    if (!plan || procesando) return;
    const mensajes: Record<string, string> = {
      completado: t('¿Marcar este plan como completado y entregar el equipo?'),
      cancelado: t('¿Cancelar este plan de ahorro?'),
      activo: t('¿Reactivar este plan?'),
    };
    if (nuevoEstado === 'completado' && !completo) {
      if (!confirm(`${t('Todavía le faltan')} $${Math.round(falta).toLocaleString('es-AR')} ${t('para completar el objetivo.')} ${mensajes.completado}`)) return;
    } else if (!confirm(mensajes[nuevoEstado])) {
      return;
    }
    setProcesando(true);
    await supabase.from('planes_ahorro').update({ estado: nuevoEstado }).eq('id', plan.id);
    await registrarAuditoria(supabase, {
      accion: `cambió el estado del plan de ahorro de ${nombreCliente(plan)} de "${plan.estado}" a "${nuevoEstado}"`,
      entidad: 'plan_ahorro',
      entidadId: plan.id,
      valorAnterior: { estado: plan.estado },
      valorNuevo: { estado: nuevoEstado },
    });
    setProcesando(false);
    cargar();
  };

  // Para una seña (plan con un dispositivo puntual reservado): "entregar"
  // no es solo cambiar el estado del plan, es una venta de verdad — genera
  // la orden de cobro (misma tabla que usa el resto de Órdenes) y saca el
  // equipo de Stock, todo junto.
  const confirmarEntregaSena = async () => {
    if (!plan || !plan.dispositivo_id || procesando) return;
    const aviso = completo
      ? t('¿Confirmar la entrega y generar la venta de este equipo?')
      : `${t('Todavía le faltan')} $${Math.round(falta).toLocaleString('es-AR')} ${t('para completar el objetivo.')} ${t('¿Generar la venta igual?')}`;
    if (!confirm(aviso)) return;

    setProcesando(true);
    setError(null);

    const { data: disp, error: dispError } = await supabase
      .from('dispositivos')
      .select('modelo, capacidad_gb, color, imei, en_stock')
      .eq('id', plan.dispositivo_id)
      .single();
    if (dispError || !disp) {
      setError(t('No pudimos encontrar el dispositivo reservado.'));
      setProcesando(false);
      return;
    }
    if (!disp.en_stock) {
      setError(t('Este equipo ya no figura en Stock (puede que ya se haya vendido o dado de baja).'));
      setProcesando(false);
      return;
    }

    const descripcion = `${disp.modelo || t('Equipo')}${disp.capacidad_gb ? ` ${disp.capacidad_gb}GB` : ''}${disp.color ? ` ${disp.color}` : ''}${disp.imei ? ` · IMEI ${disp.imei}` : ''}`;

    const { data: orden, error: ordenError } = await supabase
      .from('ordenes')
      .insert({
        cliente_id: plan.cliente_id,
        dispositivo_id: plan.dispositivo_id,
        total: plan.monto_objetivo,
        estado: 'pagado',
        forma_pago: 'Plan de ahorro / seña',
        ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
      })
      .select()
      .single();
    if (ordenError || !orden) {
      setError(t('No pudimos generar la venta:') + ' ' + (ordenError?.message || ''));
      setProcesando(false);
      return;
    }
    await supabase.from('orden_items').insert({
      orden_id: orden.id,
      dispositivo_id: plan.dispositivo_id,
      descripcion,
      cantidad: 1,
      precio_unitario: plan.monto_objetivo,
      tipo: 'dispositivo',
    });
    await supabase.from('dispositivos').update({ en_stock: false }).eq('id', plan.dispositivo_id);
    await supabase.from('planes_ahorro').update({ estado: 'completado' }).eq('id', plan.id);

    await registrarAuditoria(supabase, {
      accion: `entregó el equipo señado a ${nombreCliente(plan)} y generó la venta (${descripcion})`,
      entidad: 'plan_ahorro',
      entidadId: plan.id,
      valorNuevo: { orden_id: orden.id },
    });

    setProcesando(false);
    router.push(`/ordenes/${orden.id}`);
  };

  const abrirEdicion = () => {
    if (!plan) return;
    setEditModelo(plan.modelo || '');
    setEditCapacidad(plan.capacidad_gb);
    setEditColor(plan.color || '');
    setEditMontoObjetivo(String(plan.monto_objetivo));
    setEditDetalles(plan.detalles || '');
    setEditando(true);
  };

  const guardarEdicion = async () => {
    if (!plan || !editMontoObjetivo || Number(editMontoObjetivo) <= 0) {
      setError(t('Poné un monto objetivo válido'));
      return;
    }
    setGuardandoEdicion(true);
    const nuevoMontoObjetivo = Number(editMontoObjetivo);
    await supabase
      .from('planes_ahorro')
      .update({
        modelo: editModelo.trim() || null,
        capacidad_gb: editCapacidad,
        color: editColor.trim() || null,
        monto_objetivo: nuevoMontoObjetivo,
        detalles: editDetalles.trim() || null,
      })
      .eq('id', plan.id);
    // El objetivo define cuándo el plan se considera completo (y se entrega
    // el equipo) — a diferencia del resto de los campos, un cambio acá
    // queda registrado para poder auditarlo después.
    if (plan.monto_objetivo !== nuevoMontoObjetivo) {
      await registrarAuditoria(supabase, {
        accion: `cambió el monto objetivo del plan de ahorro de ${nombreCliente(plan)} de $${plan.monto_objetivo} a $${nuevoMontoObjetivo}`,
        entidad: 'plan_ahorro',
        entidadId: plan.id,
        valorAnterior: { monto_objetivo: plan.monto_objetivo },
        valorNuevo: { monto_objetivo: nuevoMontoObjetivo },
      });
    }
    setPlan({
      ...plan,
      modelo: editModelo.trim() || null,
      capacidad_gb: editCapacidad,
      color: editColor.trim() || null,
      monto_objetivo: nuevoMontoObjetivo,
      detalles: editDetalles.trim() || null,
    });
    setGuardandoEdicion(false);
    setEditando(false);
  };

  const eliminarPlan = async () => {
    if (!plan || !puedeEliminar) return;
    if (!confirm(`${t('¿Eliminar este plan de ahorro de')} ${nombreCliente(plan)}? ${t('Se pierde el historial de pagos. No se puede deshacer.')}`)) return;
    await supabase.from('planes_ahorro').delete().eq('id', plan.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó un plan de ahorro (${nombreCliente(plan)}${plan.modelo ? `, ${plan.modelo}` : ''})`,
      entidad: 'plan_ahorro',
      entidadId: plan.id,
      valorAnterior: { modelo: plan.modelo, monto_objetivo: plan.monto_objetivo },
    });
    router.push('/plan-ahorro');
  };

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Plan de ahorro.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No encontramos ese plan.')}</p>
        <Link href="/plan-ahorro" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver a Plan de ahorro')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/plan-ahorro" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">{nombreCliente(plan)}</span>
        <button onClick={() => (editando ? setEditando(false) : abrirEdicion())} className="text-xs text-accent dark:text-dark-accent underline">
          {editando ? t('Cerrar') : t('Editar')}
        </button>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {movimientosError && (
        <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">
          {t('No pudimos cargar los pagos — el total de abajo puede no ser real. Recargá la página.')}
        </p>
      )}

      {plan.estado !== 'activo' && (
        <span
          className={`self-start text-xs font-semibold px-2.5 py-1 rounded-full ${
            plan.estado === 'completado' ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'
          }`}
        >
          {plan.estado === 'completado' ? t('Completado y entregado') : t('Cancelado')}
        </span>
      )}

      {editando ? (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Modelo deseado')}</label>
            <input
              value={editModelo}
              onChange={(e) => setEditModelo(e.target.value)}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Almacenamiento')}</label>
            <div className="flex gap-2">
              {STORAGE_OPTIONS.map((gb) => (
                <button
                  key={gb}
                  onClick={() => setEditCapacidad(editCapacidad === gb ? null : gb)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                    editCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                  }`}
                >
                  {gb}GB
                </button>
              ))}
            </div>
          </div>
          <SelectorColorAuto label={t('Color')} modelo={editModelo} value={editColor} onChange={setEditColor} />
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Monto objetivo')}</label>
            <input
              value={editMontoObjetivo}
              onChange={(e) => setEditMontoObjetivo(sanitizarDecimal(e.target.value))}
              inputMode="decimal"
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={editDetalles}
            onChange={(e) => setEditDetalles(e.target.value)}
            placeholder={t('Detalles (opcional)')}
            rows={2}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <button
            disabled={guardandoEdicion}
            onClick={guardarEdicion}
            className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {t('Guardar')}
          </button>
          {puedeEliminar && (
            <button onClick={eliminarPlan} className="rounded-lg border border-bad/30 py-2 text-sm font-medium text-bad">
              {t('Eliminar plan')}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
          {plan.dispositivo_id && (
            <span className="self-start inline-flex items-center gap-1 text-[10px] font-semibold text-accent dark:text-dark-accent bg-accent-soft dark:bg-dark-accent-soft rounded-full px-2 py-0.5">
              <span aria-hidden="true" className="[&_svg]:h-3 [&_svg]:w-3 inline-flex shrink-0">{ICONOS.telefono}</span>
              {t('SEÑA — equipo reservado')}
            </span>
          )}
          <p className="font-medium">
            {plan.modelo || t('Sin modelo')}
            {plan.capacidad_gb ? ` · ${plan.capacidad_gb}GB` : ''}
            {plan.color ? ` · ${plan.color}` : ''}
          </p>
          {plan.clientes?.telefono && <p className="text-muted dark:text-dark-text-secondary">{plan.clientes.telefono}</p>}
          {plan.detalles && <p className="text-muted dark:text-dark-text-secondary">{plan.detalles}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
        <div>
          <div className="flex items-end justify-between gap-3 mb-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Juntado')}</p>
            <p className="text-[11px] text-muted dark:text-dark-text-secondary">
              ${Math.round(pagado).toLocaleString('es-AR')} / ${Math.round(plan.monto_objetivo).toLocaleString('es-AR')}
            </p>
          </div>
          <div className="h-2.5 w-full rounded-full bg-canvas dark:bg-dark-bg overflow-hidden">
            <div className={`h-full rounded-full ${completo ? 'bg-good' : 'bg-accent dark:bg-dark-accent'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`text-xs mt-1.5 ${completo ? 'text-good font-medium' : 'text-muted dark:text-dark-text-secondary'}`}>
            {completo ? t('¡Objetivo completado!') : `${t('Faltan')} $${Math.round(falta).toLocaleString('es-AR')}`}
          </p>
        </div>

        {plan.estado === 'activo' && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setRegistrandoPago((v) => !v);
                setMontoPago('');
                setObsPago('');
                setError(null);
              }}
              className="flex-1 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white"
            >
              {registrandoPago ? t('Cancelar') : `+ ${t('Registrar pago')}`}
            </button>
            <button
              onClick={() => (plan.dispositivo_id ? confirmarEntregaSena() : cambiarEstado('completado'))}
              disabled={procesando}
              className="flex-1 rounded-xl border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
            >
              {plan.dispositivo_id ? t('Entregar y generar venta') : t('Entregar equipo')}
            </button>
          </div>
        )}
        {plan.estado !== 'activo' && (
          <button
            onClick={() => cambiarEstado('activo')}
            disabled={procesando}
            className="rounded-xl border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
          >
            {t('Reactivar plan')}
          </button>
        )}

        {registrandoPago && (
          <div className="flex flex-col gap-2 border-t border-border dark:border-dark-border pt-3">
            <input
              value={montoPago}
              onChange={(e) => setMontoPago(sanitizarDecimal(e.target.value))}
              inputMode="decimal"
              autoFocus
              placeholder={t('Monto que paga hoy')}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value)}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="efectivo">{t('Efectivo')}</option>
              <option value="transferencia">{t('Transferencia')}</option>
              <option value="débito">{t('Débito')}</option>
              <option value="crédito">{t('Crédito')}</option>
              <option value="usdt">USDT</option>
            </select>
            <input
              value={obsPago}
              onChange={(e) => setObsPago(e.target.value)}
              placeholder={t('Observación (opcional)')}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              disabled={guardandoPago || !montoPago}
              onClick={registrarPago}
              className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardandoPago ? t('Guardando...') : t('Guardar y ver comprobante')}
            </button>
          </div>
        )}

        {movimientos.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border dark:border-dark-border pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Pagos')}</p>
            {movimientos.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {m.medio || t('Pago')}
                    {m.observacion ? ` · ${m.observacion}` : ''}
                  </p>
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">{new Date(m.fecha).toLocaleDateString('es-AR')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-medium text-good">+${Math.round(m.monto).toLocaleString('es-AR')}</p>
                  <Link href={`/plan-ahorro/${id}/comprobante/${m.id}`} className="text-[11px] text-accent dark:text-dark-accent underline">
                    {t('Comprobante')}
                  </Link>
                  <button onClick={() => anularMovimiento(m.id)} className="text-[11px] text-bad underline">
                    {t('Anular')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
