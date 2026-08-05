'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { getActor, useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { simboloMoneda } from '../../lib/monedas';
import { MEDIOS_PAGO, calcularSaldo, estadoCuenta, ESTADO_INFO, diasDeMora } from '../../lib/cuentaCorriente';

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  domicilio: string | null;
  email: string | null;
  telefono: string | null;
  dni: string | null;
  cta_cte_habilitada: boolean | null;
  limite_credito: number | null;
  plazo_dias: number | null;
  suspendido: boolean | null;
  cta_cte_observaciones: string | null;
};

type Orden = {
  id: string;
  total: number | null;
  estado: string;
  created_at: string;
  orden_items: { descripcion: string; tipo: string }[];
};

type Movimiento = {
  id: string;
  tipo: string;
  concepto: string;
  monto: number;
  vencimiento: string | null;
  observacion: string | null;
  anulado: boolean;
  fecha: string;
};

export default function DetalleCliente() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeEliminar = tienePermiso(actor, 'eliminar');

  const [c, setC] = useState<Cliente | null>(null);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'cuenta' | 'compras' | 'servicio' | 'datos'>('cuenta');

  // Registrar pago
  const [registrandoPago, setRegistrandoPago] = useState(false);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMedio, setPagoMedio] = useState<string>('efectivo');
  const [pagoObs, setPagoObs] = useState('');
  const [guardandoPago, setGuardandoPago] = useState(false);

  // Configuración de crédito
  const [configAbierta, setConfigAbierta] = useState(false);
  const [credHabilitada, setCredHabilitada] = useState(false);
  const [credLimite, setCredLimite] = useState('');
  const [credPlazo, setCredPlazo] = useState('');
  const [credSuspendido, setCredSuspendido] = useState(false);
  const [credObs, setCredObs] = useState('');
  const [guardandoCredito, setGuardandoCredito] = useState(false);

  const moneda = useMemo(() => simboloMoneda(monedaCodigo), [monedaCodigo]);

  const cargarMovimientos = async () => {
    const { data } = await supabase
      .from('cta_cte_movimientos')
      .select('id, tipo, concepto, monto, vencimiento, observacion, anulado, fecha')
      .eq('cliente_id', id)
      .eq('anulado', false)
      .order('fecha', { ascending: true });
    setMovimientos((data as Movimiento[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      const [{ data: cli }, { data: user }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase.auth.getUser(),
      ]);
      const cliente = cli as Cliente;
      setC(cliente);
      if (cliente) {
        setCredHabilitada(!!cliente.cta_cte_habilitada);
        setCredLimite(cliente.limite_credito != null ? String(cliente.limite_credito) : '');
        setCredPlazo(cliente.plazo_dias != null ? String(cliente.plazo_dias) : '');
        setCredSuspendido(!!cliente.suspendido);
        setCredObs(cliente.cta_cte_observaciones ?? '');
      }
      if (user?.user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('negocios ( moneda )')
          .eq('id', user.user.id)
          .single();
        const codigo = (perfil as any)?.negocios?.moneda;
        if (codigo) setMonedaCodigo(codigo);
      }
      setLoading(false);
    })();
    (async () => {
      const { data } = await supabase
        .from('ordenes')
        .select('id, total, estado, created_at, orden_items ( descripcion, tipo )')
        .eq('cliente_id', id)
        .order('created_at', { ascending: false });
      setOrdenes((data as any) ?? []);
    })();
    cargarMovimientos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // --- Cálculos de cuenta corriente ---
  const saldo = useMemo(() => calcularSaldo(movimientos), [movimientos]);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const cargosVencidos = useMemo(
    () => movimientos.filter((m) => m.tipo === 'cargo' && m.vencimiento && m.vencimiento < hoyISO),
    [movimientos, hoyISO]
  );
  const sumaVencida = cargosVencidos.reduce((acc, m) => acc + (m.monto || 0), 0);
  const vencido = Math.min(Math.max(saldo, 0), sumaVencida);
  const vencMasAntiguo = cargosVencidos
    .map((m) => m.vencimiento!)
    .sort()
    .at(0);
  const diasMora = vencido > 0 ? diasDeMora(vencMasAntiguo) : null;
  const estado = estadoCuenta(saldo, vencido, !!c?.suspendido);
  const infoEstado = ESTADO_INFO[estado];
  const disponible = c?.limite_credito != null ? c.limite_credito - saldo : null;
  const usoLimite = c?.limite_credito && c.limite_credito > 0 ? Math.min(100, Math.round((saldo / c.limite_credito) * 100)) : 0;

  // Extracto con saldo acumulado línea por línea (más nuevo arriba).
  const extracto = useMemo(() => {
    let acum = 0;
    const conSaldo = movimientos.map((m) => {
      acum += m.tipo === 'cargo' ? m.monto || 0 : -(m.monto || 0);
      return { ...m, saldoAcum: acum };
    });
    return conSaldo.reverse();
  }, [movimientos]);

  const ordenesServicio = ordenes.filter((o) => o.orden_items.some((i) => i.tipo === 'trabajo'));
  const ordenesCompra = ordenes.filter((o) => !o.orden_items.some((i) => i.tipo === 'trabajo'));
  const totalComprado = ordenes.reduce((acc, o) => acc + (o.total || 0), 0);

  const campo = (k: keyof Cliente, valor: string) => setC((prev) => (prev ? { ...prev, [k]: valor } : prev));

  const abrirRegistrarPago = () => {
    setPagoMonto(saldo > 0 ? String(Math.round(saldo)) : '');
    setPagoMedio('efectivo');
    setPagoObs('');
    setError(null);
    setRegistrandoPago(true);
  };

  const registrarPago = async () => {
    const monto = Number(pagoMonto);
    if (!monto || monto <= 0) {
      setError('Poné un monto mayor a cero.');
      return;
    }
    setGuardandoPago(true);
    setError(null);
    const a = getActor();
    const { data: pago, error: pErr } = await supabase
      .from('pagos')
      .insert({
        cliente_id: id,
        orden_id: null,
        medio: pagoMedio,
        monto,
        moneda: monedaCodigo,
        observacion: pagoObs.trim() || null,
        registrado_por_nombre: a?.nombre ?? null,
        registrado_por_foto_url: a?.fotoUrl ?? null,
      })
      .select()
      .single();
    if (pErr || !pago) {
      setError('No pudimos registrar el pago: ' + (pErr?.message ?? ''));
      setGuardandoPago(false);
      return;
    }
    const { error: mErr } = await supabase.from('cta_cte_movimientos').insert({
      cliente_id: id,
      tipo: 'abono',
      concepto: 'pago',
      monto,
      moneda: monedaCodigo,
      pago_id: pago.id,
      observacion: pagoObs.trim() || null,
      registrado_por_nombre: a?.nombre ?? null,
      registrado_por_foto_url: a?.fotoUrl ?? null,
    });
    if (mErr) {
      setError('El pago se guardó pero no se pudo asentar en la cuenta: ' + mErr.message);
      setGuardandoPago(false);
      return;
    }
    setGuardandoPago(false);
    setRegistrandoPago(false);
    await cargarMovimientos();
  };

  const guardarCredito = async () => {
    setGuardandoCredito(true);
    setError(null);
    const { error: upErr } = await supabase
      .from('clientes')
      .update({
        cta_cte_habilitada: credHabilitada,
        limite_credito: credLimite ? Number(credLimite) : null,
        plazo_dias: credPlazo ? Number(credPlazo) : null,
        suspendido: credSuspendido,
        cta_cte_observaciones: credObs.trim() || null,
      })
      .eq('id', id);
    if (upErr) {
      setError('No pudimos guardar la configuración: ' + upErr.message);
      setGuardandoCredito(false);
      return;
    }
    setC((prev) =>
      prev
        ? {
            ...prev,
            cta_cte_habilitada: credHabilitada,
            limite_credito: credLimite ? Number(credLimite) : null,
            plazo_dias: credPlazo ? Number(credPlazo) : null,
            suspendido: credSuspendido,
            cta_cte_observaciones: credObs.trim() || null,
          }
        : prev
    );
    setGuardandoCredito(false);
    setConfigAbierta(false);
  };

  const handleGuardar = async () => {
    if (!c) return;
    setGuardando(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('clientes')
      .update({
        nombre: c.nombre.trim(),
        apellido: c.apellido?.trim() || null,
        domicilio: c.domicilio?.trim() || null,
        email: c.email?.trim() || null,
        telefono: c.telefono?.trim() || null,
        dni: c.dni?.trim() || null,
      })
      .eq('id', id);
    if (updateError) {
      setError('No pudimos guardar los cambios: ' + updateError.message);
      setGuardando(false);
      return;
    }
    router.push('/clientes');
    router.refresh();
  };

  const handleEliminar = async () => {
    if (!c || !puedeEliminar) return;
    if (!confirm('¿Eliminar este cliente? No se puede deshacer.')) return;
    setGuardando(true);
    const { error: deleteError } = await supabase.from('clientes').delete().eq('id', id);
    if (deleteError) {
      setError('No pudimos eliminar: ' + deleteError.message);
      setGuardando(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `eliminó al cliente ${c.nombre} ${c.apellido || ''}`.trim().replace(/\s+/g, ' '),
      entidad: 'cliente',
      entidadId: c.id,
    });
    router.push('/clientes');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!c) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos ese cliente.</p>
        <Link href="/clientes" className="text-sm text-accent dark:text-dark-accent underline">
          Volver a clientes
        </Link>
      </main>
    );
  }

  const fmt = (n: number) => `${moneda}${Math.round(n).toLocaleString('es-AR')}`;
  const colorSaldo = saldo > 0.009 ? (vencido > 0 ? 'text-bad' : 'text-warn') : saldo < -0.009 ? 'text-good' : '';

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/clientes" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">
          {c.nombre} {c.apellido || ''}
        </span>
        {(c.cta_cte_habilitada || Math.abs(saldo) > 0.009) && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${infoEstado.fondo}`}>{infoEstado.label}</span>
        )}
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-center gap-1.5 text-sm overflow-x-auto">
        {(['cuenta', 'compras', 'servicio', 'datos'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 whitespace-nowrap rounded-xl py-2 px-2 font-medium ${
              tab === t
                ? 'bg-accent dark:bg-dark-accent text-white'
                : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t === 'cuenta' ? 'Cuenta cte.' : t === 'compras' ? 'Compras' : t === 'servicio' ? 'Servicio Téc.' : 'Datos'}
          </button>
        ))}
      </div>

      {tab === 'cuenta' && (
        <div className="flex flex-col gap-4">
          {/* Resumen */}
          <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted dark:text-dark-text-secondary uppercase tracking-wide font-semibold">
                  {saldo < -0.009 ? 'Saldo a favor' : 'Saldo actual'}
                </p>
                <p className={`text-3xl font-display font-semibold leading-none mt-1 ${colorSaldo}`}>{fmt(Math.abs(saldo))}</p>
              </div>
              {diasMora != null && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-bad/10 text-bad">Vencido hace {diasMora} días</span>}
            </div>

            {c.cta_cte_habilitada && c.limite_credito != null && (
              <div>
                <div className="flex justify-between text-xs text-muted dark:text-dark-text-secondary mb-1">
                  <span>Crédito usado</span>
                  <span>
                    {fmt(Math.max(0, saldo))} / {fmt(c.limite_credito)}
                    {disponible != null && disponible > 0 ? ` · disponible ${fmt(disponible)}` : ''}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-canvas dark:bg-dark-bg overflow-hidden border border-border dark:border-dark-border">
                  <div
                    className={`h-full ${usoLimite >= 100 ? 'bg-bad' : usoLimite >= 80 ? 'bg-warn' : 'bg-accent dark:bg-dark-accent'}`}
                    style={{ width: `${usoLimite}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={abrirRegistrarPago}
                className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-4 py-2 text-sm font-medium text-white"
              >
                💸 Registrar pago
              </button>
              <Link
                href="/ordenes/nueva"
                className="rounded-xl border border-border dark:border-dark-border px-4 py-2 text-sm font-medium"
              >
                🧾 Nueva venta
              </Link>
              <button
                onClick={() => setConfigAbierta((v) => !v)}
                className="rounded-xl border border-border dark:border-dark-border px-4 py-2 text-sm font-medium"
              >
                🎚️ {c.cta_cte_habilitada ? 'Editar crédito' : 'Habilitar crédito'}
              </button>
            </div>
          </div>

          {/* Configuración de crédito */}
          {configAbierta && (
            <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold">Configuración de crédito</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={credHabilitada} onChange={(e) => setCredHabilitada(e.target.checked)} className="h-5 w-5 accent-ink" />
                <span className="text-sm">Habilitar cuenta corriente (permitir venderle fiado)</span>
              </label>
              {credHabilitada && (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Límite de crédito (vacío = sin límite)</label>
                      <input value={credLimite} onChange={(e) => setCredLimite(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="Sin límite" className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div className="w-32">
                      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Vencimiento (días)</label>
                      <input value={credPlazo} onChange={(e) => setCredPlazo(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="30" className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={credSuspendido} onChange={(e) => setCredSuspendido(e.target.checked)} className="h-5 w-5 accent-ink" />
                    <span className="text-sm">Suspendido (no permitir nuevas ventas a crédito)</span>
                  </label>
                  <textarea value={credObs} onChange={(e) => setCredObs(e.target.value)} rows={2} placeholder="Observaciones (opcional)" className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
                </>
              )}
              <button
                disabled={guardandoCredito}
                onClick={guardarCredito}
                className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {guardandoCredito ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          )}

          {/* Extracto */}
          <div>
            <p className="text-sm font-semibold mb-2">Movimientos</p>
            {extracto.length === 0 ? (
              <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-6">
                Todavía no hay movimientos en la cuenta de este cliente.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {extracto.map((m) => {
                  const esCargo = m.tipo === 'cargo';
                  return (
                    <div key={m.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize truncate">
                          {m.concepto === 'venta' ? 'Venta a cuenta corriente' : m.concepto === 'pago' ? 'Pago recibido' : m.concepto.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-muted dark:text-dark-text-secondary">
                          {new Date(m.fecha).toLocaleDateString('es-AR')}
                          {esCargo && m.vencimiento ? ` · vence ${new Date(m.vencimiento).toLocaleDateString('es-AR')}` : ''}
                        </p>
                        {m.observacion && <p className="text-xs text-muted dark:text-dark-text-secondary truncate">{m.observacion}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-semibold ${esCargo ? 'text-bad' : 'text-good'}`}>
                          {esCargo ? '+' : '−'}
                          {fmt(m.monto)}
                        </p>
                        <p className="text-[11px] text-muted dark:text-dark-text-secondary">saldo {fmt(m.saldoAcum)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'compras' && (
        <>
          {ordenesCompra.length > 0 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">Total comprado histórico: {fmt(totalComprado)}</p>
          )}
          <ListaOrdenes ordenes={ordenesCompra} filtrarTipo={(t) => t !== 'trabajo'} vacio="Todavía no le hiciste ninguna venta a este cliente." moneda={moneda} />
        </>
      )}

      {tab === 'servicio' && (
        <ListaOrdenes ordenes={ordenesServicio} filtrarTipo={(t) => t === 'trabajo'} vacio="Todavía no le hiciste ningún arreglo a este cliente." moneda={moneda} />
      )}

      {tab === 'datos' && (
        <>
          <div className="flex flex-col gap-3">
            <Campo label="Nombre" valor={c.nombre} onChange={(v) => campo('nombre', v)} />
            <Campo label="Apellido" valor={c.apellido ?? ''} onChange={(v) => campo('apellido', v)} />
            <Campo label="Domicilio" valor={c.domicilio ?? ''} onChange={(v) => campo('domicilio', v)} />
            <Campo label="Email" valor={c.email ?? ''} onChange={(v) => campo('email', v)} />
            <Campo label="Teléfono" valor={c.telefono ?? ''} onChange={(v) => campo('telefono', v)} />
            <Campo label="DNI" valor={c.dni ?? ''} onChange={(v) => campo('dni', v)} />
          </div>

          <button
            disabled={guardando}
            onClick={handleGuardar}
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
          >
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {puedeEliminar && (
            <button
              disabled={guardando}
              onClick={handleEliminar}
              className="w-full rounded-2xl border border-bad/30 py-3 text-center text-sm font-medium text-bad disabled:opacity-40"
            >
              Eliminar cliente
            </button>
          )}
        </>
      )}

      {/* Modal registrar pago */}
      {registrandoPago && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center px-6" onClick={() => setRegistrandoPago(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-dark-surface rounded-2xl shadow-elevated p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold">Registrar pago de {c.nombre}</p>
            {saldo > 0 && <p className="text-xs text-muted dark:text-dark-text-secondary">Debe {fmt(saldo)}.</p>}
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Monto</label>
              <input value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" autoFocus placeholder="0" className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2.5 text-lg" />
            </div>
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Medio de pago</label>
              <div className="flex flex-wrap gap-2">
                {MEDIOS_PAGO.map((m) => (
                  <button key={m.codigo} onClick={() => setPagoMedio(m.codigo)} className={`rounded-lg px-3 py-2 text-sm font-medium ${pagoMedio === m.codigo ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'}`}>
                    {m.icono} {m.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={pagoObs} onChange={(e) => setPagoObs(e.target.value)} rows={2} placeholder="Observación (opcional)" className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={() => setRegistrandoPago(false)} className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium">
                Cancelar
              </button>
              <button
                disabled={guardandoPago || !pagoMonto}
                onClick={registrarPago}
                className="flex-1 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {guardandoPago ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ListaOrdenes({
  ordenes,
  filtrarTipo,
  vacio,
  moneda,
}: {
  ordenes: Orden[];
  filtrarTipo: (tipo: string) => boolean;
  vacio: string;
  moneda: string;
}) {
  if (ordenes.length === 0) {
    return <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{vacio}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {ordenes.map((o) => {
        const items = o.orden_items.filter((i) => filtrarTipo(i.tipo));
        return (
          <Link
            key={o.id}
            href={`/ordenes/${o.id}`}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {items.length > 0 ? `${items[0].descripcion}${items.length > 1 ? ` +${items.length - 1}` : ''}` : 'Orden vacía'}
              </p>
              <p className="text-xs text-muted dark:text-dark-text-secondary">{new Date(o.created_at).toLocaleDateString('es-AR')}</p>
            </div>
            <div className="text-right">
              {o.total != null && <p className="text-sm font-medium">{moneda}{o.total.toLocaleString('es-AR')}</p>}
              <p className="text-xs text-muted dark:text-dark-text-secondary capitalize">{o.estado}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Campo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
