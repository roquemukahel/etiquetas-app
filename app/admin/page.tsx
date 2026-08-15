'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

const ESTADOS_SUSCRIPCION = ['trialing', 'active', 'past_due', 'unpaid', 'cancelled', 'expired', 'paused'];
const PLANES = ['mensual', 'anual', 'pro'];

type Usuario = { id: string; email: string; creado: string };

type Negocio = {
  id: string;
  nombre: string;
  activo: boolean;
  creado: string;
  cantidad_usuarios: number;
  cantidad_dispositivos: number;
  cantidad_ordenes: number;
  ultima_actividad: string;
  estado_suscripcion: string;
  fecha_fin_prueba: string | null;
  plan: string | null;
  acceso_manual_hasta: string | null;
  ultimo_pago_at: string | null;
  ultimo_pago_monto: number | null;
  ultimo_pago_moneda: string | null;
  usuarios: Usuario[];
};

type Comprobante = {
  id: string;
  negocio_id: string;
  nombre_negocio: string;
  monto: number;
  moneda: string;
  comprobante_imagen: string | null;
  referencia: string | null;
  created_at: string;
};

function formatearFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR');
}

function diasInactivo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// Positivo = faltan N días. Negativo = ya venció hace N días.
function diasHasta(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// Un solo vencimiento por negocio para mostrar de un vistazo: mientras está
// en prueba, lo que importa es cuándo termina el trial; una vez pagando, lo
// que importa es hasta cuándo tiene acceso otorgado (acceso_manual_hasta —
// null ahí significa que nunca se le puso un plazo, ej. Lemon Squeezy
// gestiona la renovación sola, así que no hay nada que mostrar como
// "vence en X" para esos casos).
function vencimientoDe(n: Negocio): { fecha: string; dias: number } | null {
  if (n.estado_suscripcion === 'trialing' && n.fecha_fin_prueba) {
    return { fecha: n.fecha_fin_prueba, dias: diasHasta(n.fecha_fin_prueba) };
  }
  if (n.acceso_manual_hasta) {
    return { fecha: n.acceso_manual_hasta, dias: diasHasta(n.acceso_manual_hasta) };
  }
  return null;
}

function colorVencimiento(dias: number) {
  if (dias < 0) return 'text-bad font-semibold';
  if (dias <= 2) return 'text-bad font-medium';
  if (dias <= 7) return 'text-warn font-medium';
  return 'text-muted dark:text-dark-text-secondary';
}

export default function AdminPanel() {
  const supabase = crearClienteNavegador();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [soloPorVencer, setSoloPorVencer] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const [aprobandoId, setAprobandoId] = useState<string | null>(null);
  const [diasAprobar, setDiasAprobar] = useState('30');
  const [planAprobar, setPlanAprobar] = useState('mensual');
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null);

  const [editEstado, setEditEstado] = useState('active');
  const [editPlan, setEditPlan] = useState('');
  const [editDias, setEditDias] = useState('');
  const [editSinVencimiento, setEditSinVencimiento] = useState(false);

  const [negocioAEliminar, setNegocioAEliminar] = useState<Negocio | null>(null);
  const [confirmNombre, setConfirmNombre] = useState('');
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const cargar = async () => {
    const [{ data: negs }, { data: comps }] = await Promise.all([
      supabase.rpc('admin_listar_negocios'),
      supabase.rpc('admin_listar_comprobantes_pendientes'),
    ]);
    setNegocios(((negs as Negocio[]) ?? []).map((n) => ({ ...n, usuarios: n.usuarios ?? [] })));
    setComprobantes((comps as Comprobante[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const { data: esAdmin } = await supabase.rpc('es_admin');
      setAutorizado(!!esAdmin);
      if (esAdmin) cargar();
      else setLoading(false);
    })();
  }, []);

  const toggleActivo = async (n: Negocio) => {
    if (!confirm(`¿${n.activo ? 'Desactivar' : 'Reactivar'} el acceso de "${n.nombre}"?`)) return;
    setProcesando(n.id);
    await supabase.rpc('admin_set_negocio_activo', { negocio_id_param: n.id, nuevo_estado: !n.activo });
    setProcesando(null);
    cargar();
  };

  const toggleExpandir = (n: Negocio) => {
    if (expandido === n.id) {
      setExpandido(null);
      return;
    }
    setExpandido(n.id);
    setEditEstado(n.estado_suscripcion);
    setEditPlan(n.plan ?? '');
    setEditDias('');
    setEditSinVencimiento(false);
  };

  const eliminarUsuario = async (n: Negocio, u: Usuario) => {
    if (
      !confirm(`¿Eliminar para siempre la cuenta "${u.email}"? No se puede deshacer.`)
    )
      return;
    setProcesando(n.id);
    const { error } = await supabase.rpc('admin_eliminar_usuario', { usuario_id_param: u.id });
    setProcesando(null);
    if (error) {
      alert(`No se pudo eliminar la cuenta:\n${error.message}`);
      return;
    }
    cargar();
  };

  // Abre el modal de confirmación. Antes esto usaba window.prompt(), que en la
  // app instalada (PWA) a veces ni aparece o devuelve vacío, y además el error
  // de la RPC se tragaba en silencio → el negocio "no se borraba" sin explicación.
  const abrirEliminarNegocio = (n: Negocio) => {
    setNegocioAEliminar(n);
    setConfirmNombre('');
    setErrorEliminar(null);
  };

  const nombreConfirmaOk =
    !!negocioAEliminar &&
    confirmNombre.trim().toLowerCase() === negocioAEliminar.nombre.trim().toLowerCase();

  const confirmarEliminarNegocio = async () => {
    if (!negocioAEliminar || !nombreConfirmaOk) return;
    const n = negocioAEliminar;
    setProcesando(n.id);
    setErrorEliminar(null);
    const { error } = await supabase.rpc('admin_eliminar_negocio', { negocio_id_param: n.id });
    setProcesando(null);
    if (error) {
      // Mostramos el error real (ej. una foreign key que impide borrar) en vez
      // de fallar en silencio.
      setErrorEliminar(error.message);
      return;
    }
    setNegocioAEliminar(null);
    setExpandido(null);
    cargar();
  };

  const guardarSuscripcion = async (n: Negocio) => {
    setProcesando(n.id);
    await supabase.rpc('admin_actualizar_suscripcion', {
      neg_id: n.id,
      nuevo_estado: editEstado || null,
      dias_desde_hoy: editDias ? Number(editDias) : null,
      nuevo_plan: editPlan || null,
      quitar_vencimiento: editSinVencimiento,
    });
    setProcesando(null);
    cargar();
  };

  const abrirAprobar = (c: Comprobante) => {
    setAprobandoId(aprobandoId === c.id ? null : c.id);
    setDiasAprobar('30');
    setPlanAprobar('mensual');
  };

  const confirmarAprobar = async (c: Comprobante) => {
    setProcesando(c.id);
    await supabase.rpc('admin_aprobar_pago', {
      comprobante_id: c.id,
      dias: diasAprobar.trim() === '' ? 30 : Number(diasAprobar),
      nuevo_plan: planAprobar,
    });
    setProcesando(null);
    setAprobandoId(null);
    cargar();
  };

  const rechazar = async (c: Comprobante) => {
    const motivo = prompt('¿Por qué se rechaza? (se lo puede volver a intentar)') ?? '';
    setProcesando(c.id);
    await supabase.rpc('admin_rechazar_pago', { comprobante_id: c.id, motivo: motivo || null });
    setProcesando(null);
    cargar();
  };

  const filtrados = negocios
    .filter((n) => n.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    .filter((n) => {
      if (!soloPorVencer) return true;
      const v = vencimientoDe(n);
      return v != null && v.dias <= 7;
    });

  const porVencerCount = negocios.filter((n) => {
    const v = vencimientoDe(n);
    return v != null && v.dias <= 7;
  }).length;

  if (autorizado === null || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!autorizado) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés acceso a esta sección.</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al panel
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-display font-semibold">Panel Admin</span>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5">
          <p className="text-2xl font-display font-semibold leading-none">{negocios.length}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight">Negocios</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5">
          <p className="text-2xl font-display font-semibold leading-none">
            {negocios.filter((n) => n.activo).length}
          </p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight">Activos</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5">
          <p className="text-2xl font-display font-semibold leading-none">
            {negocios.reduce((acc, n) => acc + Number(n.cantidad_ordenes), 0)}
          </p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight">Órdenes totales</p>
        </div>
      </div>

      {comprobantes.length > 0 && (
        <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4 flex flex-col gap-3">
          <p className="text-sm font-semibold">💵 {comprobantes.length} pago{comprobantes.length === 1 ? '' : 's'} pendiente{comprobantes.length === 1 ? '' : 's'} de revisar</p>
          {comprobantes.map((c) => (
            <div key={c.id} className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{c.nombre_negocio}</p>
                <p className="text-xs text-muted dark:text-dark-text-secondary">{formatearFecha(c.created_at)}</p>
              </div>
              <p className="text-sm">
                {c.monto} {c.moneda}
                {c.referencia && <span className="text-xs text-muted dark:text-dark-text-secondary"> · ref: {c.referencia}</span>}
              </p>
              {c.comprobante_imagen && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.comprobante_imagen}
                  alt="Comprobante"
                  onClick={() => setImagenAmpliada(c.comprobante_imagen)}
                  className="max-h-32 rounded-lg border border-border dark:border-dark-border cursor-pointer self-start"
                />
              )}

              {aprobandoId === c.id && (
                <div className="rounded-lg bg-canvas dark:bg-dark-bg p-2 flex flex-col gap-2">
                  <div className="flex gap-3">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted dark:text-dark-text-secondary">Días de acceso</span>
                      <input
                        value={diasAprobar}
                        onChange={(e) => setDiasAprobar(e.target.value)}
                        inputMode="numeric"
                        placeholder="Días"
                        className="w-20 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                      />
                    </label>
                    <label className="flex-1 flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted dark:text-dark-text-secondary">Plan pagado</span>
                      <select
                        value={planAprobar}
                        onChange={(e) => {
                          const p = e.target.value;
                          setPlanAprobar(p);
                          if (p === 'mensual') setDiasAprobar('30');
                          if (p === 'anual') setDiasAprobar('365');
                        }}
                        className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                      >
                        {PLANES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="text-[10px] text-muted dark:text-dark-text-secondary">
                    Días de acceso a otorgar desde hoy (30 si pagó el mes, 365 si pagó el año — se completa solo al elegir el plan).
                  </p>
                  <button
                    disabled={procesando === c.id}
                    onClick={() => confirmarAprobar(c)}
                    className="rounded-lg bg-good text-white py-2 text-xs font-medium disabled:opacity-40"
                  >
                    Confirmar aprobación
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  disabled={procesando === c.id}
                  onClick={() => abrirAprobar(c)}
                  className="flex-1 rounded-lg bg-accent dark:bg-dark-accent text-white py-2 text-xs font-medium disabled:opacity-40"
                >
                  {aprobandoId === c.id ? 'Cancelar' : 'Aprobar'}
                </button>
                <button
                  disabled={procesando === c.id}
                  onClick={() => rechazar(c)}
                  className="flex-1 rounded-lg border border-bad/30 text-bad py-2 text-xs font-medium disabled:opacity-40"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {imagenAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-6"
          onClick={() => setImagenAmpliada(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagenAmpliada} alt="Comprobante ampliado" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      {negocioAEliminar && (
        <div className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-6" onClick={() => setNegocioAEliminar(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-bad">Eliminar negocio para siempre</p>
            <p className="text-sm text-muted dark:text-dark-text-secondary">
              Esto borra <span className="font-medium text-ink dark:text-dark-text">{negocioAEliminar.nombre}</span> y
              todos sus datos (dispositivos, órdenes, etc.) más las cuentas de sus {negocioAEliminar.cantidad_usuarios}{' '}
              usuario(s). <span className="font-medium">No se puede deshacer.</span>
            </p>
            <label className="text-xs text-muted dark:text-dark-text-secondary">
              Para confirmar, escribí el nombre del negocio:
              <input
                autoFocus
                value={confirmNombre}
                onChange={(e) => setConfirmNombre(e.target.value)}
                placeholder={negocioAEliminar.nombre}
                className="mt-1 w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm text-ink dark:text-dark-text"
              />
            </label>

            {errorEliminar && (
              <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2 break-words">
                No se pudo eliminar: {errorEliminar}
              </p>
            )}

            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setNegocioAEliminar(null)}
                className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                disabled={!nombreConfirmaOk || procesando === negocioAEliminar.id}
                onClick={confirmarEliminarNegocio}
                className="flex-1 rounded-lg bg-bad text-white py-2 text-sm font-medium disabled:opacity-40"
              >
                {procesando === negocioAEliminar.id ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar negocio..."
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      <button
        onClick={() => setSoloPorVencer((v) => !v)}
        className={`self-start rounded-full px-3 py-1.5 text-xs font-medium border ${
          soloPorVencer ? 'bg-warn text-white border-warn' : 'border-border dark:border-dark-border text-muted dark:text-dark-text-secondary'
        }`}
      >
        ⏳ Por vencer en ≤7 días {porVencerCount > 0 ? `(${porVencerCount})` : ''}
      </button>

      <div className="flex flex-col gap-2">
        {filtrados.map((n) => {
          const inactivoHaceDias = diasInactivo(n.ultima_actividad);
          const pocaActividad = inactivoHaceDias > 30;
          const venc = vencimientoDe(n);
          return (
            <div key={n.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
              <button onClick={() => toggleExpandir(n)} className="flex items-center justify-between text-left">
                <div>
                  <p className="text-sm font-medium">
                    {n.nombre}{' '}
                    {!n.activo && (
                      <span className="text-[10px] font-bold text-bad bg-bad/10 rounded px-1.5 py-0.5 align-middle">
                        DESACTIVADO
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {n.cantidad_usuarios} usuario{n.cantidad_usuarios === 1 ? '' : 's'} · {n.cantidad_dispositivos}{' '}
                    dispositivos · {n.cantidad_ordenes} órdenes
                  </p>
                  {n.usuarios.length > 0 && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary break-all">
                      {n.usuarios.map((u) => u.email).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {n.estado_suscripcion}
                    {n.plan ? ` · ${n.plan}` : ''}
                  </p>
                  <p className={`text-xs ${venc ? colorVencimiento(venc.dias) : 'text-muted dark:text-dark-text-secondary'}`}>
                    {venc == null
                      ? n.estado_suscripcion === 'trialing'
                        ? 'Sin fecha de fin de prueba'
                        : 'Sin vencimiento (Lemon Squeezy o acceso indefinido)'
                      : venc.dias < 0
                        ? `⚠ Vencido hace ${Math.abs(venc.dias)} día${Math.abs(venc.dias) === 1 ? '' : 's'} (${formatearFecha(venc.fecha)})`
                        : venc.dias === 0
                          ? `Vence hoy (${formatearFecha(venc.fecha)})`
                          : `Vence en ${venc.dias} día${venc.dias === 1 ? '' : 's'} (${formatearFecha(venc.fecha)})`}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {n.ultimo_pago_at
                      ? `Último pago: hace ${diasInactivo(n.ultimo_pago_at)} día${diasInactivo(n.ultimo_pago_at) === 1 ? '' : 's'} (${formatearFecha(n.ultimo_pago_at)})${
                          n.ultimo_pago_monto != null ? ` · ${n.ultimo_pago_monto} ${n.ultimo_pago_moneda ?? ''}`.trim() : ''
                        }`
                      : 'Sin pagos registrados'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-xs ${pocaActividad ? 'text-warn font-medium' : 'text-muted dark:text-dark-text-secondary'}`}>
                    Última actividad: {formatearFecha(n.ultima_actividad)}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary">Alta: {formatearFecha(n.creado)}</p>
                </div>
              </button>

              {expandido === n.id && (
                <div className="rounded-lg bg-canvas dark:bg-dark-bg p-3 flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted dark:text-dark-text-secondary mb-1">Usuarios</p>
                    {n.usuarios.length === 0 ? (
                      <p className="text-xs text-muted dark:text-dark-text-secondary">Sin usuarios registrados.</p>
                    ) : (
                      n.usuarios.map((u) => (
                        <div key={u.id} className="flex items-center justify-between gap-2 py-0.5">
                          <p className="text-xs break-all">
                            {u.email} <span className="text-muted dark:text-dark-text-secondary">· alta {formatearFecha(u.creado)}</span>
                          </p>
                          <button
                            disabled={procesando === n.id}
                            onClick={() => eliminarUsuario(n, u)}
                            className="shrink-0 text-[10px] text-bad underline disabled:opacity-40"
                          >
                            Eliminar
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex flex-col gap-2 border-t border-border dark:border-dark-border pt-3">
                    <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Editar suscripción</p>
                    <select
                      value={editEstado}
                      onChange={(e) => setEditEstado(e.target.value)}
                      className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                    >
                      {ESTADOS_SUSCRIPCION.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editPlan}
                      onChange={(e) => setEditPlan(e.target.value)}
                      className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                    >
                      <option value="">Sin plan asignado</option>
                      {PLANES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        value={editDias}
                        onChange={(e) => setEditDias(e.target.value)}
                        disabled={editSinVencimiento}
                        inputMode="numeric"
                        placeholder="Acceso manual por (días desde hoy)"
                        className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs disabled:opacity-40"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editSinVencimiento}
                        onChange={(e) => setEditSinVencimiento(e.target.checked)}
                        className="h-4 w-4 accent-ink"
                      />
                      Sin vencimiento (acceso indefinido)
                    </label>
                    <button
                      disabled={procesando === n.id}
                      onClick={() => guardarSuscripcion(n)}
                      className="rounded-lg bg-accent dark:bg-dark-accent text-white py-2 text-xs font-medium disabled:opacity-40"
                    >
                      Guardar suscripción
                    </button>
                  </div>

                  <div className="border-t border-border dark:border-dark-border pt-3">
                    <button
                      disabled={procesando === n.id}
                      onClick={() => abrirEliminarNegocio(n)}
                      className="w-full rounded-lg bg-bad text-white py-2 text-xs font-medium disabled:opacity-40"
                    >
                      Eliminar negocio y sus usuarios para siempre
                    </button>
                    <p className="text-[10px] text-muted dark:text-dark-text-secondary mt-1">
                      Borra todo (dispositivos, órdenes, etc.) y las cuentas de sus usuarios. No se puede deshacer.
                    </p>
                  </div>
                </div>
              )}

              <button
                disabled={procesando === n.id}
                onClick={() => toggleActivo(n)}
                className={`rounded-lg py-2 text-xs font-medium disabled:opacity-40 ${
                  n.activo ? 'border border-bad/30 text-bad' : 'bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors text-white'
                }`}
              >
                {n.activo ? 'Desactivar acceso' : 'Reactivar acceso'}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
}
