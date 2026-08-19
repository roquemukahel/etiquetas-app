'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ShieldAlert, ShieldCheck, Trash2, Plus, X } from 'lucide-react';
import { crearClienteNavegador } from '../../../lib/supabase/client';
import {
  SeccionCard, EmptyState, Skeleton, EstadoBadge, AccesoManualChip, EtiquetaNotaChip,
} from '../../_ui';

type Detalle = {
  id: string;
  nombre: string;
  activo: boolean;
  estado_suscripcion: string;
  plan: string | null;
  fecha_fin_prueba: string | null;
  acceso_manual_hasta: string | null;
  created_at: string;
  telefono: string | null;
  pais: string | null;
  moneda: string | null;
  lemonsqueezy_customer_id: string | null;
  lemonsqueezy_subscription_id: string | null;
  cantidad_usuarios: number;
  cantidad_dispositivos: number;
  cantidad_ordenes: number;
  cantidad_reparaciones: number;
  cantidad_clientes: number;
  ordenes_30d: number;
  reparaciones_30d: number;
  ultima_actividad: string;
  usuarios: { id: string; email: string; creado: string; ultimo_acceso: string | null }[];
};

type Comprobante = {
  id: string;
  monto: number;
  moneda: string;
  comprobante_imagen: string | null;
  referencia: string | null;
  estado: string;
  nota_admin: string | null;
  created_at: string;
  revisado_at: string | null;
};

type Nota = { id: string; texto: string; etiqueta: string | null; autor_email: string; created_at: string };

type Auditoria = {
  id: string;
  admin_email: string;
  accion: string;
  entidad: string;
  valor_anterior: Record<string, unknown> | null;
  valor_nuevo: Record<string, unknown> | null;
  motivo: string | null;
  created_at: string;
};

const ESTADOS = [
  { value: 'trialing', label: 'En prueba' },
  { value: 'active', label: 'Activa' },
  { value: 'past_due', label: 'Pago pendiente (past_due)' },
  { value: 'unpaid', label: 'Pago pendiente (unpaid)' },
  { value: 'paused', label: 'Pausada' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'expired', label: 'Expirada' },
];
const PLANES = ['mensual', 'anual', 'pro'];
const ETIQUETAS_NOTA = [
  { value: '', label: 'Sin etiqueta' },
  { value: 'vip', label: 'VIP' },
  { value: 'necesita_asistencia', label: 'Necesita asistencia' },
  { value: 'contactar_antes_vencimiento', label: 'Contactar antes del vencimiento' },
  { value: 'prueba_extendida', label: 'Prueba extendida' },
  { value: 'incidencia_pago', label: 'Incidencia de pago' },
  { value: 'cliente_recuperado', label: 'Cliente recuperado' },
];

function formatearFecha(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR');
}
function formatearFechaHora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR');
}
function aInputDate(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}
function diasDesde(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function saludCuenta(d: Detalle): { label: string; color: string } {
  if (!d.activo) return { label: 'Suspendida', color: 'text-bad' };
  if (d.estado_suscripcion === 'cancelled' || d.estado_suscripcion === 'expired') return { label: 'Cancelada', color: 'text-bad' };
  if (d.estado_suscripcion === 'past_due' || d.estado_suscripcion === 'unpaid') return { label: 'Pago con problemas', color: 'text-warn' };
  if (d.estado_suscripcion === 'trialing' && d.fecha_fin_prueba && new Date(d.fecha_fin_prueba).getTime() - Date.now() < 3 * 86400000) {
    return { label: 'Prueba por vencer', color: 'text-warn' };
  }
  if (diasDesde(d.ultima_actividad) > 30) return { label: 'Inactiva', color: 'text-warn' };
  return { label: 'Saludable', color: 'text-good' };
}

function porcentajeConfiguracion(d: Detalle): number {
  const checks = [d.cantidad_dispositivos > 0, d.cantidad_clientes > 0, d.cantidad_ordenes > 0, d.cantidad_usuarios > 1];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'suscripcion', label: 'Suscripción y facturación' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'notas', label: 'Notas' },
  { key: 'auditoria', label: 'Auditoría' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export default function AdminNegocioDetalle() {
  const supabase = crearClienteNavegador();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [tab, setTab] = useState<Tab>('resumen');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = async () => {
    const { data, error } = await supabase.rpc('admin_negocio_detalle', { negocio_id_param: id });
    if (error) {
      setErrorCarga(error.message);
      setDetalle(null);
      setCargando(false);
      return;
    }
    setErrorCarga(null);
    const fila = (data as Detalle[])?.[0] ?? null;
    setDetalle(fila);
    setCargando(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleActivo = async () => {
    if (!detalle) return;
    if (!confirm(`¿${detalle.activo ? 'Suspender' : 'Reactivar'} el acceso de "${detalle.nombre}"?`)) return;
    setGuardando(true);
    const { error } = await supabase.rpc('admin_set_negocio_activo', { negocio_id_param: detalle.id, nuevo_estado: !detalle.activo });
    setGuardando(false);
    if (error) {
      alert('No se pudo cambiar el acceso:\n' + error.message);
      return;
    }
    cargar();
  };

  if (cargando) {
    return (
      <div className="flex flex-col gap-4 max-w-5xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (errorCarga) {
    return <EmptyState titulo="No pudimos cargar el negocio" texto={errorCarga} icono="—" />;
  }

  if (!detalle) {
    return <EmptyState titulo="No se encontró el negocio" texto="Puede que haya sido eliminado." icono="—" />;
  }

  const salud = saludCuenta(detalle);
  const pctConfig = porcentajeConfiguracion(detalle);

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <Link href="/admin/negocios" className="inline-flex items-center gap-1.5 text-xs text-dark-text-secondary hover:text-dark-text mb-2">
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al directorio
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-display font-semibold">{detalle.nombre}</h1>
              <EstadoBadge activo={detalle.activo} estadoSuscripcion={detalle.estado_suscripcion} />
              <AccesoManualChip hasta={detalle.acceso_manual_hasta} />
            </div>
            <p className="text-xs text-dark-text-secondary mt-1">
              ID {detalle.id} · Alta {formatearFecha(detalle.created_at)} · Salud: <span className={salud.color}>{salud.label}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={guardando}
            onClick={toggleActivo}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40 ${
              detalle.activo ? 'border border-bad/40 text-bad hover:bg-bad/10' : 'bg-good text-white hover:opacity-90'
            }`}
          >
            {detalle.activo ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {detalle.activo ? 'Suspender acceso' : 'Reactivar acceso'}
          </button>
        </div>
      </div>

      <div className="border-b border-dark-border overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key ? 'text-dark-text' : 'text-dark-text-secondary hover:text-dark-text'
              }`}
            >
              {t.label}
              {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-dark-accent" />}
            </button>
          ))}
        </div>
      </div>

      {tab === 'resumen' && <TabResumen detalle={detalle} pctConfig={pctConfig} />}
      {tab === 'suscripcion' && <TabSuscripcion detalle={detalle} onGuardado={cargar} supabase={supabase} />}
      {tab === 'usuarios' && <TabUsuarios detalle={detalle} onCambio={cargar} supabase={supabase} />}
      {tab === 'notas' && <TabNotas negocioId={detalle.id} supabase={supabase} />}
      {tab === 'auditoria' && <TabAuditoria negocioId={detalle.id} supabase={supabase} />}

      <ZonaDePeligro detalle={detalle} supabase={supabase} onEliminado={() => router.push('/admin/negocios')} />
    </div>
  );
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] text-dark-text-secondary">{label}</p>
      <p className="text-sm">{valor}</p>
    </div>
  );
}

function TabResumen({ detalle, pctConfig }: { detalle: Detalle; pctConfig: number }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <SeccionCard titulo="Datos del negocio">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Propietario" valor={detalle.usuarios[0]?.email ?? '—'} />
          <Campo label="Teléfono" valor={detalle.telefono ?? '—'} />
          <Campo label="País" valor={detalle.pais ?? '—'} />
          <Campo label="Moneda" valor={detalle.moneda ?? '—'} />
          <Campo label="Última actividad" valor={formatearFecha(detalle.ultima_actividad)} />
          <Campo label="Configuración inicial" valor={`${pctConfig}% completada`} />
        </div>
      </SeccionCard>
      <SeccionCard titulo="Uso (30 días)">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Usuarios" valor={String(detalle.cantidad_usuarios)} />
          <Campo label="Dispositivos" valor={String(detalle.cantidad_dispositivos)} />
          <Campo label="Clientes" valor={String(detalle.cantidad_clientes)} />
          <Campo label="Órdenes totales" valor={String(detalle.cantidad_ordenes)} />
          <Campo label="Órdenes (30d)" valor={String(detalle.ordenes_30d)} />
          <Campo label="Reparaciones totales" valor={String(detalle.cantidad_reparaciones)} />
          <Campo label="Reparaciones (30d)" valor={String(detalle.reparaciones_30d)} />
        </div>
      </SeccionCard>
      <SeccionCard titulo="Suscripción">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Plan" valor={detalle.plan ?? 'Sin plan'} />
          <Campo label="Estado" valor={detalle.estado_suscripcion} />
          <Campo label="Fin de prueba" valor={formatearFecha(detalle.fecha_fin_prueba)} />
          <Campo label="Acceso manual hasta" valor={formatearFecha(detalle.acceso_manual_hasta)} />
        </div>
      </SeccionCard>
    </div>
  );
}

function TabUsuarios({ detalle, onCambio, supabase }: { detalle: Detalle; onCambio: () => void; supabase: any }) {
  const [procesando, setProcesando] = useState<string | null>(null);
  const eliminar = async (u: { id: string; email: string }) => {
    if (!confirm(`¿Eliminar para siempre la cuenta "${u.email}"? No se puede deshacer.`)) return;
    setProcesando(u.id);
    const { error } = await supabase.rpc('admin_eliminar_usuario', { usuario_id_param: u.id });
    setProcesando(null);
    if (error) {
      alert('No se pudo eliminar la cuenta:\n' + error.message);
      return;
    }
    onCambio();
  };
  return (
    <SeccionCard titulo="Usuarios" subtitulo={`${detalle.usuarios.length} cuenta(s) vinculada(s)`}>
      {detalle.usuarios.length === 0 ? (
        <EmptyState titulo="Sin usuarios" icono="—" />
      ) : (
        <div className="flex flex-col divide-y divide-dark-border">
          {detalle.usuarios.map((u, i) => (
            <div key={u.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm truncate">
                  {u.email} {i === 0 && <span className="text-[10px] text-dark-accent ml-1">Propietario</span>}
                </p>
                <p className="text-[11px] text-dark-text-secondary">
                  Alta {formatearFecha(u.creado)} · Último acceso {formatearFechaHora(u.ultimo_acceso)}
                </p>
              </div>
              <button
                type="button"
                disabled={procesando === u.id}
                onClick={() => eliminar(u)}
                className="shrink-0 text-xs text-bad hover:underline disabled:opacity-40"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </SeccionCard>
  );
}

function TabNotas({ negocioId, supabase }: { negocioId: string; supabase: any }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    const { data, error } = await supabase.rpc('admin_listar_notas', { negocio_id_param: negocioId });
    if (error) console.error('admin_listar_notas:', error);
    setNotas((data as Nota[]) ?? []);
    setCargando(false);
  };
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId]);

  const agregar = async () => {
    if (!texto.trim()) return;
    setGuardando(true);
    const { error } = await supabase.rpc('admin_agregar_nota', {
      negocio_id_param: negocioId,
      texto_param: texto.trim(),
      etiqueta_param: etiqueta || null,
    });
    setGuardando(false);
    if (error) {
      alert('No se pudo agregar la nota:\n' + error.message);
      return;
    }
    setTexto('');
    setEtiqueta('');
    cargar();
  };

  const eliminar = async (notaId: string) => {
    if (!confirm('¿Eliminar esta nota?')) return;
    const { error } = await supabase.rpc('admin_eliminar_nota', { nota_id_param: notaId });
    if (error) {
      alert('No se pudo eliminar la nota:\n' + error.message);
      return;
    }
    cargar();
  };

  return (
    <SeccionCard titulo="Notas administrativas" subtitulo="Nunca visibles para el cliente">
      <div className="flex flex-col gap-2 border-b border-dark-border pb-4 mb-1">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribí una nota interna..."
          rows={2}
          className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm placeholder:text-dark-text-secondary"
        />
        <div className="flex items-center gap-2">
          <select
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1.5 text-xs flex-1"
          >
            {ETIQUETAS_NOTA.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={guardando || !texto.trim()}
            onClick={agregar}
            className="inline-flex items-center gap-1 rounded-lg bg-dark-accent text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </div>
      </div>
      {cargando ? (
        <Skeleton className="h-16" />
      ) : notas.length === 0 ? (
        <EmptyState titulo="Sin notas todavía" icono="—" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {notas.map((n) => (
            <div key={n.id} className="rounded-lg bg-dark-bg px-3 py-2.5 flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {n.etiqueta && <EtiquetaNotaChip etiqueta={n.etiqueta} />}
                  <span className="text-[11px] text-dark-text-secondary">
                    {n.autor_email} · {formatearFechaHora(n.created_at)}
                  </span>
                </div>
                <button type="button" onClick={() => eliminar(n.id)} className="text-dark-text-secondary hover:text-bad shrink-0" aria-label="Eliminar nota">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-sm whitespace-pre-wrap">{n.texto}</p>
            </div>
          ))}
        </div>
      )}
    </SeccionCard>
  );
}

function TabAuditoria({ negocioId, supabase }: { negocioId: string; supabase: any }) {
  const [filas, setFilas] = useState<Auditoria[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('admin_auditoria_listar', { p_negocio_id: negocioId, p_pagina: 1, p_por_pagina: 50 });
      if (error) console.error('admin_auditoria_listar:', error);
      setFilas((data as Auditoria[]) ?? []);
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId]);

  return (
    <SeccionCard titulo="Registro de auditoría" subtitulo="Cada acción administrativa sobre este negocio, quién la hizo y por qué">
      {cargando ? (
        <Skeleton className="h-32" />
      ) : filas.length === 0 ? (
        <EmptyState titulo="Sin acciones registradas todavía" icono="—" />
      ) : (
        <div className="flex flex-col divide-y divide-dark-border">
          {filas.map((f) => (
            <div key={f.id} className="py-2.5 flex flex-col gap-0.5">
              <p className="text-sm">
                <span className="font-medium">{f.admin_email}</span> {f.accion}
              </p>
              <p className="text-[11px] text-dark-text-secondary">{formatearFechaHora(f.created_at)}</p>
              {f.motivo && <p className="text-xs text-dark-text-secondary">Motivo: {f.motivo}</p>}
            </div>
          ))}
        </div>
      )}
    </SeccionCard>
  );
}

function TabSuscripcion({ detalle, onGuardado, supabase }: { detalle: Detalle; onGuardado: () => void; supabase: any }) {
  const [estado, setEstado] = useState(detalle.estado_suscripcion);
  const [plan, setPlan] = useState(detalle.plan ?? '');
  const [finPrueba, setFinPrueba] = useState(aInputDate(detalle.fecha_fin_prueba));
  const [accesoManual, setAccesoManual] = useState(aInputDate(detalle.acceso_manual_hasta));
  const [sinVencimiento, setSinVencimiento] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('admin_listar_comprobantes', { negocio_id_param: detalle.id });
      if (error) console.error('admin_listar_comprobantes:', error);
      setComprobantes((data as Comprobante[]) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalle.id]);

  const cambios: string[] = [];
  if (estado !== detalle.estado_suscripcion) {
    cambios.push(`Estado: "${ESTADOS.find((e) => e.value === detalle.estado_suscripcion)?.label}" → "${ESTADOS.find((e) => e.value === estado)?.label}"`);
  }
  if (plan !== (detalle.plan ?? '')) {
    cambios.push(`Plan: "${detalle.plan ?? 'sin plan'}" → "${plan || 'sin plan'}"`);
  }
  if (finPrueba && finPrueba !== aInputDate(detalle.fecha_fin_prueba)) {
    cambios.push(`Fin de prueba: pasa a vencer el ${new Date(finPrueba).toLocaleDateString('es-AR')}`);
  }
  if (sinVencimiento && detalle.acceso_manual_hasta) {
    cambios.push('Acceso manual: se quita el vencimiento (acceso indefinido)');
  } else if (!sinVencimiento && accesoManual && accesoManual !== aInputDate(detalle.acceso_manual_hasta)) {
    cambios.push(`Acceso manual: vence el ${new Date(accesoManual).toLocaleDateString('es-AR')}`);
  }

  const guardar = async () => {
    if (cambios.length === 0) return;
    if (!motivo.trim()) {
      alert('Escribí el motivo del cambio.');
      return;
    }
    setGuardando(true);
    const { error } = await supabase.rpc('admin_actualizar_suscripcion', {
      neg_id: detalle.id,
      nuevo_estado: estado !== detalle.estado_suscripcion ? estado : null,
      nueva_fecha_fin_prueba: finPrueba && finPrueba !== aInputDate(detalle.fecha_fin_prueba) ? new Date(finPrueba + 'T12:00:00').toISOString() : null,
      nuevo_acceso_manual_hasta:
        !sinVencimiento && accesoManual && accesoManual !== aInputDate(detalle.acceso_manual_hasta)
          ? new Date(accesoManual + 'T23:59:59').toISOString()
          : null,
      nuevo_plan: plan !== (detalle.plan ?? '') ? plan || null : null,
      quitar_vencimiento: sinVencimiento,
      p_motivo: motivo.trim(),
    });
    setGuardando(false);
    if (error) {
      alert('No se pudo guardar la suscripción:\n' + error.message);
      return;
    }
    setMotivo('');
    onGuardado();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SeccionCard titulo="Editar suscripción">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-text-secondary">Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="bg-dark-bg border border-dark-border rounded-lg px-2.5 py-2 text-sm">
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-text-secondary">Plan</span>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="bg-dark-bg border border-dark-border rounded-lg px-2.5 py-2 text-sm">
              <option value="">Sin plan asignado</option>
              {PLANES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-text-secondary">Extender prueba hasta</span>
            <input
              type="date"
              value={finPrueba}
              onChange={(e) => setFinPrueba(e.target.value)}
              className="bg-dark-bg border border-dark-border rounded-lg px-2.5 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-text-secondary">Acceso manual otorgado hasta</span>
            <input
              type="date"
              value={accesoManual}
              disabled={sinVencimiento}
              onChange={(e) => setAccesoManual(e.target.value)}
              className="bg-dark-bg border border-dark-border rounded-lg px-2.5 py-2 text-sm disabled:opacity-40"
            />
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={sinVencimiento} onChange={(e) => setSinVencimiento(e.target.checked)} className="h-4 w-4" />
            Acceso indefinido (sin vencimiento)
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dark-text-secondary">Motivo del cambio</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder='Ej. "extensión comercial", "cortesía por incidente técnico"...'
              rows={2}
              className="bg-dark-bg border border-dark-border rounded-lg px-2.5 py-2 text-sm placeholder:text-dark-text-secondary"
            />
          </label>

          {cambios.length > 0 && (
            <div className="rounded-lg border border-dark-accent/30 bg-dark-accent/10 px-3 py-2.5 flex flex-col gap-1">
              <p className="text-xs font-medium">Se va a aplicar:</p>
              <ul className="text-xs text-dark-text-secondary list-disc list-inside">
                {cambios.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            disabled={guardando || cambios.length === 0 || !motivo.trim()}
            onClick={guardar}
            className="rounded-lg bg-dark-accent text-white py-2 text-sm font-medium disabled:opacity-40"
          >
            {guardando ? 'Guardando...' : 'Confirmar cambios'}
          </button>
          <p className="text-[10px] text-dark-text-secondary">
            El proveedor de pago (Lemon Squeezy) sigue siendo la fuente de verdad para las cuentas que pagan con tarjeta: su
            próximo webhook puede volver a pisar estado_suscripcion. Estos cambios manuales son para pagos alternativos o
            ajustes puntuales.
          </p>
        </div>
      </SeccionCard>

      <SeccionCard titulo="Facturación" subtitulo="Identificadores del proveedor e historial de comprobantes">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Lemon Squeezy — cliente" valor={detalle.lemonsqueezy_customer_id ?? '—'} />
            <Campo label="Lemon Squeezy — suscripción" valor={detalle.lemonsqueezy_subscription_id ?? '—'} />
          </div>
          <div className="border-t border-dark-border pt-3">
            <p className="text-xs font-medium text-dark-text-secondary mb-2">Historial de comprobantes</p>
            {comprobantes.length === 0 ? (
              <p className="text-xs text-dark-text-secondary">Este negocio todavía no mandó ningún comprobante.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {comprobantes.map((c) => (
                  <div key={c.id} className="rounded-lg bg-dark-bg px-3 py-2 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">
                        {c.monto} {c.moneda}
                      </span>
                      <span
                        className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                          c.estado === 'aprobado' ? 'text-good bg-good/10' : c.estado === 'rechazado' ? 'text-bad bg-bad/10' : 'text-warn bg-warn/10'
                        }`}
                      >
                        {c.estado}
                      </span>
                    </div>
                    <p className="text-[11px] text-dark-text-secondary">
                      Enviado {formatearFecha(c.created_at)}
                      {c.revisado_at ? ` · revisado ${formatearFecha(c.revisado_at)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SeccionCard>
    </div>
  );
}

function ZonaDePeligro({ detalle, supabase, onEliminado }: { detalle: Detalle; supabase: any; onEliminado: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [confirmNombre, setConfirmNombre] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const nombreOk = confirmNombre.trim().toLowerCase() === detalle.nombre.trim().toLowerCase();

  const eliminar = async () => {
    if (!nombreOk) return;
    setProcesando(true);
    setError(null);
    const { error: err } = await supabase.rpc('admin_eliminar_negocio', { negocio_id_param: detalle.id, p_motivo: motivo.trim() || null });
    setProcesando(false);
    if (err) {
      setError(err.message);
      return;
    }
    onEliminado();
  };

  return (
    <SeccionCard titulo="Zona de peligro" subtitulo="Acciones irreversibles — separadas del resto a propósito">
      {!abierta ? (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="inline-flex items-center gap-1.5 text-xs text-bad hover:underline"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar este negocio definitivamente
        </button>
      ) : !confirmando ? (
        <div className="flex flex-col gap-2 rounded-lg border border-bad/30 bg-bad/5 p-3">
          <p className="text-sm">
            Esto borra <span className="font-medium">{detalle.nombre}</span> y todos sus datos: {detalle.cantidad_dispositivos}{' '}
            dispositivos, {detalle.cantidad_ordenes} órdenes, {detalle.cantidad_clientes} clientes y las cuentas de sus{' '}
            {detalle.cantidad_usuarios} usuario(s). <span className="font-medium">No se puede deshacer.</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAbierta(false)} className="flex-1 rounded-lg border border-dark-border py-2 text-xs font-medium">
              Cancelar
            </button>
            <button type="button" onClick={() => setConfirmando(true)} className="flex-1 rounded-lg bg-bad text-white py-2 text-xs font-medium">
              Continuar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-bad/30 bg-bad/5 p-3">
          <label className="text-xs text-dark-text-secondary">
            Para confirmar, escribí el nombre exacto del negocio:
            <input
              autoFocus
              value={confirmNombre}
              onChange={(e) => setConfirmNombre(e.target.value)}
              placeholder={detalle.nombre}
              className="mt-1 w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-dark-text-secondary">
            Motivo de la eliminación:
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className="mt-1 w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </label>
          {error && <p className="text-xs text-bad bg-bad/10 rounded-lg px-3 py-2 break-words">No se pudo eliminar: {error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmando(false);
                setAbierta(false);
                setConfirmNombre('');
                setMotivo('');
                setError(null);
              }}
              className="flex-1 rounded-lg border border-dark-border py-2 text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!nombreOk || procesando}
              onClick={eliminar}
              className="flex-1 rounded-lg bg-bad text-white py-2 text-xs font-medium disabled:opacity-40"
            >
              {procesando ? 'Eliminando...' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      )}
    </SeccionCard>
  );
}
