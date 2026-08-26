'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor, getActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { simboloMoneda } from '../../lib/monedas';
import { sanitizarDecimal, formatearMonto } from '../../lib/numeros';
import { extraerStockInsuficiente, extraerDisponibleInsuficiente } from '../../lib/repuestos';
import { FINALIZADOS } from '../../lib/reparaciones';
import ServicioTecnicoTabs from '../../ServicioTecnicoTabs';
import Modal from '../../Modal';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';

function IconoChico({ nombre, className = '' }: { nombre: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0 ${className}`}>
      {ICONOS[nombre]}
    </span>
  );
}

type Repuesto = {
  id: string;
  nombre: string;
  cantidad_stock: number;
  cantidad_reservada: number;
  costo_unitario: number | null;
  categoria: string | null;
  compatibilidad: string | null;
  calidad: string | null;
  sku: string | null;
  codigo_barras: string | null;
  ubicacion_fisica: string | null;
  proveedor_id: string | null;
  imagen_url: string | null;
  stock_minimo: number | null;
  garantia_dias: number | null;
  observaciones: string | null;
};

type Proveedor = { id: string; nombre: string };
type ReparacionAbierta = { id: string; numero_orden: string | null; modelo: string | null; estado: string };
type Movimiento = {
  id: string;
  tipo: string;
  cantidad: number;
  costo_unitario: number | null;
  motivo: string | null;
  actor_nombre: string | null;
  created_at: string;
  reparacion_id: string | null;
};
type Reserva = { id: string; reparacion_id: string; cantidad: number; actor_nombre: string | null; created_at: string };

const CALIDADES = ['Original', 'OEM', 'Premium', 'Compatible', 'Otra'];

const LABEL_MOVIMIENTO: Record<string, string> = {
  entrada: 'Entrada',
  consumo: 'Consumo',
  reserva: 'Reserva',
  liberacion: 'Liberación',
  ajuste: 'Ajuste',
  rotura: 'Rotura',
  perdida: 'Pérdida',
  devolucion: 'Devolución',
  transferencia: 'Transferencia',
  correccion: 'Corrección',
};

type FormState = {
  nombre: string;
  cantidad_stock: string;
  costo_unitario: string;
  categoria: string;
  compatibilidad: string;
  calidad: string;
  sku: string;
  codigo_barras: string;
  ubicacion_fisica: string;
  proveedor_id: string;
  imagen_url: string | null;
  stock_minimo: string;
  garantia_dias: string;
  observaciones: string;
};

const FORM_VACIO: FormState = {
  nombre: '',
  cantidad_stock: '',
  costo_unitario: '',
  categoria: '',
  compatibilidad: '',
  calidad: '',
  sku: '',
  codigo_barras: '',
  ubicacion_fisica: '',
  proveedor_id: '',
  imagen_url: null,
  stock_minimo: '',
  garantia_dias: '',
  observaciones: '',
};

export default function StockRepuestos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeGestionar = tienePermiso(actor, 'agregar_stock');
  const puedeEliminar = tienePermiso(actor, 'eliminar');

  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [reparacionesAbiertas, setReparacionesAbiertas] = useState<ReparacionAbierta[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroCalidad, setFiltroCalidad] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [soloSinStock, setSoloSinStock] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);

  // Detalle de un repuesto: reservas activas + movimientos recientes, se
  // cargan al abrir (no de entrada para no pedir N consultas por cada
  // repuesto de la lista).
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [reservasDetalle, setReservasDetalle] = useState<Reserva[]>([]);
  const [movimientosDetalle, setMovimientosDetalle] = useState<Movimiento[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [reservarReparacionId, setReservarReparacionId] = useState('');
  const [reservarCantidad, setReservarCantidad] = useState('1');
  const [guardandoReserva, setGuardandoReserva] = useState(false);

  const [movTipo, setMovTipo] = useState('entrada');
  const [movCantidad, setMovCantidad] = useState('');
  const [movCosto, setMovCosto] = useState('');
  const [movMotivo, setMovMotivo] = useState('');
  const [guardandoMovimiento, setGuardandoMovimiento] = useState(false);

  const cargar = async () => {
    const { data } = await supabase.from('repuestos').select('*').order('nombre');
    setRepuestos((data as Repuesto[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      const { data } = await supabase.from('proveedores_repuestos').select('id, nombre').order('nombre');
      setProveedores((data as Proveedor[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase
        .from('reparaciones')
        .select('id, numero_orden, modelo, estado')
        .order('fecha_ingreso_servicio', { ascending: false });
      setReparacionesAbiertas(((data as ReparacionAbierta[]) ?? []).filter((r) => !FINALIZADOS.includes(r.estado)));
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single();
      const codigo = (perfil as any)?.negocios?.moneda;
      if (codigo) setMoneda(simboloMoneda(codigo));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nombreProveedor = (id: string | null) => (id ? proveedores.find((p) => p.id === id)?.nombre : undefined);
  const disponible = (r: Repuesto) => r.cantidad_stock - r.cantidad_reservada;
  const stockBajo = (r: Repuesto) => r.stock_minimo != null && disponible(r) > 0 && disponible(r) <= r.stock_minimo;
  const sinStock = (r: Repuesto) => disponible(r) <= 0;

  const indicadores = useMemo(() => {
    return {
      tipos: repuestos.length,
      fisicas: repuestos.reduce((acc, r) => acc + r.cantidad_stock, 0),
      reservadas: repuestos.reduce((acc, r) => acc + r.cantidad_reservada, 0),
      disponibles: repuestos.reduce((acc, r) => acc + disponible(r), 0),
      stockBajo: repuestos.filter(stockBajo).length,
      sinStock: repuestos.filter(sinStock).length,
      valorTotal: repuestos.reduce((acc, r) => acc + (r.costo_unitario ?? 0) * r.cantidad_stock, 0),
    };
  }, [repuestos]);

  const categoriasUsadas = useMemo(
    () => Array.from(new Set(repuestos.map((r) => r.categoria).filter(Boolean) as string[])).sort(),
    [repuestos]
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return repuestos.filter((r) => {
      if (soloStockBajo && !stockBajo(r)) return false;
      if (soloSinStock && !sinStock(r)) return false;
      if (filtroCategoria && r.categoria !== filtroCategoria) return false;
      if (filtroCalidad && r.calidad !== filtroCalidad) return false;
      if (filtroProveedor && r.proveedor_id !== filtroProveedor) return false;
      if (q && !r.nombre.toLowerCase().includes(q) && !(r.sku ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [repuestos, busqueda, filtroCategoria, filtroCalidad, filtroProveedor, soloStockBajo, soloSinStock]);

  const hayFiltrosActivos =
    busqueda.trim() !== '' || filtroCategoria !== '' || filtroCalidad !== '' || filtroProveedor !== '' || soloStockBajo || soloSinStock;
  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroCategoria('');
    setFiltroCalidad('');
    setFiltroProveedor('');
    setSoloStockBajo(false);
    setSoloSinStock(false);
  };

  const abrirNuevo = () => {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError(null);
    setMenuAbierto(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (r: Repuesto) => {
    setEditandoId(r.id);
    setForm({
      nombre: r.nombre,
      cantidad_stock: String(r.cantidad_stock),
      costo_unitario: r.costo_unitario != null ? String(r.costo_unitario) : '',
      categoria: r.categoria ?? '',
      compatibilidad: r.compatibilidad ?? '',
      calidad: r.calidad ?? '',
      sku: r.sku ?? '',
      codigo_barras: r.codigo_barras ?? '',
      ubicacion_fisica: r.ubicacion_fisica ?? '',
      proveedor_id: r.proveedor_id ?? '',
      imagen_url: r.imagen_url,
      stock_minimo: r.stock_minimo != null ? String(r.stock_minimo) : '',
      garantia_dias: r.garantia_dias != null ? String(r.garantia_dias) : '',
      observaciones: r.observaciones ?? '',
    });
    setError(null);
    setMenuAbierto(null);
    setModalAbierto(true);
  };

  const cambiarImagenForm = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, imagen_url: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !puedeGestionar) return;
    setGuardando(true);
    setError(null);

    const payloadComun = {
      categoria: form.categoria || null,
      compatibilidad: form.compatibilidad.trim() || null,
      calidad: form.calidad || null,
      sku: form.sku.trim() || null,
      codigo_barras: form.codigo_barras.trim() || null,
      ubicacion_fisica: form.ubicacion_fisica.trim() || null,
      proveedor_id: form.proveedor_id || null,
      imagen_url: form.imagen_url,
      stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : null,
      garantia_dias: form.garantia_dias ? Number(form.garantia_dias) : null,
      observaciones: form.observaciones.trim() || null,
    };

    if (editandoId) {
      const { error: updError } = await supabase
        .from('repuestos')
        .update({
          nombre: form.nombre.trim(),
          costo_unitario: form.costo_unitario ? Number(form.costo_unitario) : null,
          ...payloadComun,
        })
        .eq('id', editandoId);
      if (updError) {
        setError(t('No pudimos guardar:') + ' ' + updError.message);
        setGuardando(false);
        return;
      }
      await registrarAuditoria(supabase, {
        accion: `editó el repuesto "${form.nombre.trim()}"`,
        entidad: 'repuesto',
        entidadId: editandoId,
      });
      setGuardando(false);
      setModalAbierto(false);
      cargar();
      return;
    }

    // Si ya existe un repuesto con ese nombre, sumamos a su stock en vez de
    // crear un duplicado — es lo que va a esperar alguien que escribe
    // "Batería iPhone 13" dos veces sin darse cuenta.
    const existente = repuestos.find((r) => r.nombre.trim().toLowerCase() === form.nombre.trim().toLowerCase());
    if (existente) {
      const nuevaCantidad = existente.cantidad_stock + (Number(form.cantidad_stock) || 0);
      const { error: updError } = await supabase
        .from('repuestos')
        .update({
          cantidad_stock: nuevaCantidad,
          costo_unitario: form.costo_unitario ? Number(form.costo_unitario) : existente.costo_unitario,
          ...payloadComun,
        })
        .eq('id', existente.id);
      if (updError) {
        setError(t('No pudimos guardar:') + ' ' + updError.message);
        setGuardando(false);
        return;
      }
    } else {
      const { error: insError } = await supabase.from('repuestos').insert({
        nombre: form.nombre.trim(),
        cantidad_stock: Number(form.cantidad_stock) || 0,
        costo_unitario: form.costo_unitario ? Number(form.costo_unitario) : null,
        ...payloadComun,
      });
      if (insError) {
        setError(t('No pudimos guardar:') + ' ' + insError.message);
        setGuardando(false);
        return;
      }
    }
    setGuardando(false);
    setModalAbierto(false);
    cargar();
  };

  const eliminarRepuesto = async (r: Repuesto) => {
    setMenuAbierto(null);
    if (!puedeEliminar) return;
    if (!confirm(`${t('¿Eliminar')} "${r.nombre}" ${t('del catálogo de repuestos? No se puede deshacer.')}`)) return;
    await supabase.from('repuestos').delete().eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó el repuesto "${r.nombre}" del catálogo`,
      entidad: 'repuesto',
      entidadId: r.id,
      valorAnterior: { nombre: r.nombre, cantidad_stock: r.cantidad_stock, costo_unitario: r.costo_unitario },
    });
    cargar();
  };

  const abrirDetalle = async (r: Repuesto) => {
    setMenuAbierto(null);
    setDetalleId(r.id);
    setCargandoDetalle(true);
    setReservarReparacionId('');
    setReservarCantidad('1');
    setMovTipo('entrada');
    setMovCantidad('');
    setMovCosto('');
    setMovMotivo('');
    const [{ data: reservas }, { data: movs }] = await Promise.all([
      supabase
        .from('repuestos_reservas')
        .select('id, reparacion_id, cantidad, actor_nombre, created_at')
        .eq('repuesto_id', r.id)
        .eq('estado', 'activa')
        .order('created_at', { ascending: false }),
      supabase
        .from('repuestos_movimientos')
        .select('id, tipo, cantidad, costo_unitario, motivo, actor_nombre, created_at, reparacion_id')
        .eq('repuesto_id', r.id)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);
    setReservasDetalle((reservas as Reserva[]) ?? []);
    setMovimientosDetalle((movs as Movimiento[]) ?? []);
    setCargandoDetalle(false);
  };

  const repuestoDetalle = repuestos.find((r) => r.id === detalleId) ?? null;

  const recargarDetalle = async () => {
    if (repuestoDetalle) await abrirDetalle(repuestoDetalle);
    cargar();
  };

  const reparacionLabel = (id: string) => {
    const rp = reparacionesAbiertas.find((x) => x.id === id);
    return rp ? `${rp.numero_orden ?? ''} · ${rp.modelo ?? t('equipo')}`.trim() : t('Reparación');
  };

  const reservar = async () => {
    if (!repuestoDetalle || !reservarReparacionId || !puedeGestionar) return;
    const cantidad = Number(reservarCantidad) || 0;
    if (cantidad <= 0) return;
    setGuardandoReserva(true);
    const actorActual = getActor();
    const { error: rpcError } = await supabase.rpc('repuesto_reservar', {
      p_repuesto_id: repuestoDetalle.id,
      p_reparacion_id: reservarReparacionId,
      p_cantidad: cantidad,
      p_actor_nombre: actorActual?.nombre ?? null,
    });
    if (rpcError) {
      const disp = extraerDisponibleInsuficiente(rpcError.message);
      setError(disp != null ? `${t('Solo hay')} ${disp} ${t('disponible de')} "${repuestoDetalle.nombre}" ${t('para reservar.')}` : t('No pudimos reservar:') + ' ' + rpcError.message);
      setGuardandoReserva(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `reservó ${cantidad} de "${repuestoDetalle.nombre}" para la reparación ${reparacionLabel(reservarReparacionId)}`,
      entidad: 'repuesto',
      entidadId: repuestoDetalle.id,
    });
    setReservarReparacionId('');
    setReservarCantidad('1');
    setGuardandoReserva(false);
    recargarDetalle();
  };

  const liberarReserva = async (res: Reserva) => {
    if (!repuestoDetalle || !puedeGestionar) return;
    if (!confirm(t('¿Liberar esta reserva? El repuesto vuelve a estar disponible para otra reparación.'))) return;
    const actorActual = getActor();
    const { error: rpcError } = await supabase.rpc('repuesto_liberar_reserva', {
      p_reserva_id: res.id,
      p_actor_nombre: actorActual?.nombre ?? null,
    });
    if (rpcError) {
      setError(t('No pudimos liberar la reserva:') + ' ' + rpcError.message);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `liberó la reserva de ${res.cantidad} de "${repuestoDetalle.nombre}" (${reparacionLabel(res.reparacion_id)})`,
      entidad: 'repuesto',
      entidadId: repuestoDetalle.id,
    });
    recargarDetalle();
  };

  const confirmarReserva = async (res: Reserva) => {
    if (!repuestoDetalle || !puedeGestionar) return;
    if (!confirm(t('¿Confirmar el uso de esta reserva? Se descuenta del stock físico como repuesto consumido en la reparación.'))) return;
    const actorActual = getActor();
    const { error: rpcError } = await supabase.rpc('repuesto_confirmar_reserva', {
      p_reserva_id: res.id,
      p_actor_nombre: actorActual?.nombre ?? null,
    });
    if (rpcError) {
      setError(t('No pudimos confirmar la reserva:') + ' ' + rpcError.message);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `confirmó el uso de ${res.cantidad} de "${repuestoDetalle.nombre}" reservado para ${reparacionLabel(res.reparacion_id)}`,
      entidad: 'repuesto',
      entidadId: repuestoDetalle.id,
    });
    recargarDetalle();
  };

  const registrarMovimiento = async () => {
    if (!repuestoDetalle || !puedeGestionar) return;
    const cantidadIngresada = Number(movCantidad) || 0;
    if (cantidadIngresada === 0) {
      setError(t('Ingresá una cantidad válida distinta de cero.'));
      return;
    }
    // Rotura/pérdida/transferencia siempre restan; entrada/devolución/
    // corrección positiva suman; ajuste usa el signo tal cual lo escriben
    // (permite tanto sumar como restar un conteo físico).
    const restan = ['rotura', 'perdida', 'transferencia'];
    const delta = movTipo === 'ajuste' ? cantidadIngresada : restan.includes(movTipo) ? -Math.abs(cantidadIngresada) : Math.abs(cantidadIngresada);
    setGuardandoMovimiento(true);
    const actorActual = getActor();
    const { error: rpcError } = await supabase.rpc('repuesto_registrar_movimiento', {
      p_repuesto_id: repuestoDetalle.id,
      p_tipo: movTipo,
      p_cantidad: delta,
      p_costo_unitario: movCosto ? Number(movCosto) : null,
      p_motivo: movMotivo.trim() || null,
      p_actor_nombre: actorActual?.nombre ?? null,
    });
    if (rpcError) {
      const stockActual = extraerStockInsuficiente(rpcError.message);
      setError(stockActual != null ? `${t('Ese movimiento dejaría el stock en negativo (hay')} ${stockActual}).` : t('No pudimos registrar el movimiento:') + ' ' + rpcError.message);
      setGuardandoMovimiento(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `registró un movimiento de "${LABEL_MOVIMIENTO[movTipo] ?? movTipo}" (${delta > 0 ? '+' : ''}${delta}) en "${repuestoDetalle.nombre}"`,
      entidad: 'repuesto',
      entidadId: repuestoDetalle.id,
    });
    setMovCantidad('');
    setMovCosto('');
    setMovMotivo('');
    setGuardandoMovimiento(false);
    recargarDetalle();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/servicio-tecnico" aria-label={t('Volver')} className="text-2xl leading-none mt-0.5">
          &larr;
        </Link>
        <div className="mr-auto">
          <h1 className="text-lg font-medium leading-tight">{t('Repuestos')}</h1>
          <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Stock, reservas y movimientos con costo real')}</p>
        </div>
        {puedeGestionar && (
          <button
            onClick={abrirNuevo}
            className="shrink-0 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-4 py-2.5 text-sm font-medium text-white"
          >
            + {t('Nuevo repuesto')}
          </button>
        )}
      </header>

      <ServicioTecnicoTabs active="repuestos" />

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {repuestos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-2.5 py-2 flex flex-col gap-0.5">
            <span className="text-base font-semibold text-accent dark:text-dark-accent">{indicadores.tipos}</span>
            <span className="text-muted dark:text-dark-text-secondary">{t('Tipos')}</span>
          </div>
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-2.5 py-2 flex flex-col gap-0.5">
            <span className="text-base font-semibold">{indicadores.fisicas}</span>
            <span className="text-muted dark:text-dark-text-secondary">{t('Unidades físicas')}</span>
          </div>
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-2.5 py-2 flex flex-col gap-0.5">
            <span className="text-base font-semibold text-warn">{indicadores.reservadas}</span>
            <span className="text-muted dark:text-dark-text-secondary">{t('Reservadas')}</span>
          </div>
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-2.5 py-2 flex flex-col gap-0.5">
            <span className="text-base font-semibold text-good">{indicadores.disponibles}</span>
            <span className="text-muted dark:text-dark-text-secondary">{t('Disponibles')}</span>
          </div>
          <button
            onClick={() => setSoloStockBajo((v) => !v)}
            aria-pressed={soloStockBajo}
            className={`rounded-xl border px-2.5 py-2 flex flex-col items-start gap-0.5 text-left ${
              soloStockBajo ? 'border-warn bg-warn/10' : 'border-border dark:border-dark-border bg-white dark:bg-dark-surface'
            }`}
          >
            <span className="flex items-center gap-1 text-base font-semibold text-warn">
              <IconoChico nombre="alerta" /> {indicadores.stockBajo}
            </span>
            <span className="text-muted dark:text-dark-text-secondary">{t('Stock bajo')}</span>
          </button>
          <button
            onClick={() => setSoloSinStock((v) => !v)}
            aria-pressed={soloSinStock}
            className={`rounded-xl border px-2.5 py-2 flex flex-col items-start gap-0.5 text-left ${
              soloSinStock ? 'border-bad bg-bad/10' : 'border-border dark:border-dark-border bg-white dark:bg-dark-surface'
            }`}
          >
            <span className="flex items-center gap-1 text-base font-semibold text-bad">
              <IconoChico nombre="cerrar" /> {indicadores.sinStock}
            </span>
            <span className="text-muted dark:text-dark-text-secondary">{t('Sin stock')}</span>
          </button>
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-2.5 py-2 flex flex-col gap-0.5 col-span-2">
            <span className="text-base font-semibold">
              {moneda}
              {formatearMonto(indicadores.valorTotal)}
            </span>
            <span className="text-muted dark:text-dark-text-secondary">{t('Valor del inventario (a costo)')}</span>
          </div>
        </div>
      )}

      {repuestos.length > 0 && (
        <div className="flex flex-col gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t('Buscar por nombre o SKU...')}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-2.5 text-sm"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="flex-1 min-w-[120px] bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t('Toda categoría')}</option>
              {categoriasUsadas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={filtroCalidad}
              onChange={(e) => setFiltroCalidad(e.target.value)}
              className="flex-1 min-w-[120px] bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t('Toda calidad')}</option>
              {CALIDADES.map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
            <select
              value={filtroProveedor}
              onChange={(e) => setFiltroProveedor(e.target.value)}
              className="flex-1 min-w-[120px] bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{t('Todo proveedor')}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {hayFiltrosActivos && (
              <button
                onClick={limpiarFiltros}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium border border-border dark:border-dark-border"
              >
                {t('Limpiar filtros')}
              </button>
            )}
          </div>
        </div>
      )}

      {repuestos.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Todavía no cargaste repuestos.')}</p>
      )}
      {repuestos.length > 0 && filtrados.length === 0 && (
        <div className="flex flex-col items-center gap-3 text-center py-8">
          <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No hay repuestos en este filtro.')}</p>
          {hayFiltrosActivos && (
            <button onClick={limpiarFiltros} className="text-xs text-accent dark:text-dark-accent underline">
              {t('Limpiar filtros')}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((r) => (
          <div
            key={r.id}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2"
          >
            <div className="flex items-start gap-3">
              {r.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.imagen_url}
                  alt=""
                  className="h-11 w-11 rounded-lg object-contain bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border p-1 shrink-0"
                />
              ) : (
                <div className="h-11 w-11 rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-muted dark:text-dark-text-secondary [&_svg]:h-5 [&_svg]:w-5 shrink-0">
                  {ICONOS.repuesto}
                </div>
              )}
              <button onClick={() => abrirDetalle(r)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium truncate">{r.nombre}</p>
                <p className="text-xs text-muted dark:text-dark-text-secondary flex items-center gap-1.5 flex-wrap">
                  {r.categoria && <span>{r.categoria}</span>}
                  {r.calidad && <span>· {t(r.calidad)}</span>}
                  {r.sku && <span>· SKU {r.sku}</span>}
                  {r.ubicacion_fisica && (
                    <span className="flex items-center gap-1">
                      · <IconoChico nombre="ubicacion" /> {r.ubicacion_fisica}
                    </span>
                  )}
                  {nombreProveedor(r.proveedor_id) && <span>· {nombreProveedor(r.proveedor_id)}</span>}
                </p>
              </button>
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuAbierto(menuAbierto === r.id ? null : r.id)}
                  aria-label={t('Más acciones')}
                  className="text-lg leading-none px-1 text-muted dark:text-dark-text-secondary"
                >
                  ⋯
                </button>
                {menuAbierto === r.id && (
                  <div className="absolute right-0 top-6 z-10 w-40 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated flex flex-col overflow-hidden">
                    <button onClick={() => abrirDetalle(r)} className="flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg">
                      <IconoChico nombre="lupa" /> {t('Detalle / reservas')}
                    </button>
                    {puedeGestionar && (
                      <button onClick={() => abrirEdicion(r)} className="flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg">
                        <IconoChico nombre="editar" /> {t('Editar')}
                      </button>
                    )}
                    {puedeEliminar && (
                      <button onClick={() => eliminarRepuesto(r)} className="px-3 py-2 text-xs text-left text-bad hover:bg-bad/10">
                        {t('Eliminar')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap text-xs">
              <span>
                {t('Físico:')} <span className="font-medium text-ink dark:text-dark-text">{r.cantidad_stock}</span>
              </span>
              {r.cantidad_reservada > 0 && (
                <span className="text-warn">
                  {t('Reservado:')} <span className="font-medium">{r.cantidad_reservada}</span>
                </span>
              )}
              <span className={sinStock(r) ? 'text-bad font-medium' : stockBajo(r) ? 'text-warn font-medium' : 'text-good font-medium'}>
                {t('Disponible:')} {disponible(r)}
              </span>
              {r.costo_unitario != null && (
                <span className="text-muted dark:text-dark-text-secondary">
                  · {t('costo c/u')} {moneda}
                  {r.costo_unitario.toLocaleString('es-AR')}
                </span>
              )}
              {sinStock(r) && <span className="text-[10px] font-semibold text-bad bg-bad/10 rounded-full px-2 py-0.5">{t('Sin stock')}</span>}
              {!sinStock(r) && stockBajo(r) && (
                <span className="text-[10px] font-semibold text-warn bg-warn/10 rounded-full px-2 py-0.5">{t('Stock bajo')}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalAbierto && (
        <Modal titulo={editandoId ? t('Editar repuesto') : t('Nuevo repuesto')} onClose={() => setModalAbierto(false)} maxWidth="max-w-lg">
          {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex flex-col gap-3">
            <label className="self-start cursor-pointer">
              {form.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.imagen_url}
                  alt=""
                  className="h-20 w-20 rounded-lg object-contain bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border p-1"
                />
              ) : (
                <div className="h-20 w-20 rounded-lg bg-canvas dark:bg-dark-bg border border-dashed border-border dark:border-dark-border flex items-center justify-center text-muted dark:text-dark-text-secondary [&_svg]:h-6 [&_svg]:w-6">
                  {ICONOS.camara}
                </div>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={cambiarImagenForm} />
            </label>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Nombre *')}</label>
              <input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder={t('Ej. Batería iPhone 13')}
                list="catalogo-repuestos-stock"
                autoFocus
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <datalist id="catalogo-repuestos-stock">
                {repuestos.map((r) => (
                  <option key={r.id} value={r.nombre} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
                  {editandoId ? t('Stock físico') : t('Cantidad a agregar')}
                </label>
                <input
                  value={form.cantidad_stock}
                  onChange={(e) => setForm((f) => ({ ...f, cantidad_stock: e.target.value.replace(/[^\d-]/g, '') }))}
                  inputMode="numeric"
                  disabled={!!editandoId}
                  placeholder="0"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                />
                {editandoId && (
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">{t('Para cambiar el stock, registrá un movimiento.')}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Costo por unidad')}</label>
                <input
                  value={form.costo_unitario}
                  onChange={(e) => setForm((f) => ({ ...f, costo_unitario: sanitizarDecimal(e.target.value) }))}
                  inputMode="decimal"
                  placeholder={t('Sin cargar')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Categoría')}</label>
                <input
                  value={form.categoria}
                  onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                  placeholder={t('Ej. Batería')}
                  list="categorias-repuestos"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <datalist id="categorias-repuestos">
                  {categoriasUsadas.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Calidad')}</label>
                <select
                  value={form.calidad}
                  onChange={(e) => setForm((f) => ({ ...f, calidad: e.target.value }))}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">{t('Sin especificar')}</option>
                  {CALIDADES.map((c) => (
                    <option key={c} value={c}>
                      {t(c)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Dispositivos compatibles')}</label>
              <input
                value={form.compatibilidad}
                onChange={(e) => setForm((f) => ({ ...f, compatibilidad: e.target.value }))}
                placeholder={t('Ej. iPhone 11, 11 Pro')}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">SKU</label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Código de barras')}</label>
                <input
                  value={form.codigo_barras}
                  onChange={(e) => setForm((f) => ({ ...f, codigo_barras: e.target.value }))}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Ubicación física')}</label>
                <input
                  value={form.ubicacion_fisica}
                  onChange={(e) => setForm((f) => ({ ...f, ubicacion_fisica: e.target.value }))}
                  placeholder={t('Ej. Estante A-3')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Proveedor')}</label>
                <select
                  value={form.proveedor_id}
                  onChange={(e) => setForm((f) => ({ ...f, proveedor_id: e.target.value }))}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">{t('Sin especificar')}</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Stock mínimo (alerta)')}</label>
                <input
                  value={form.stock_minimo}
                  onChange={(e) => setForm((f) => ({ ...f, stock_minimo: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Garantía (días)')}</label>
                <input
                  value={form.garantia_dias}
                  onChange={(e) => setForm((f) => ({ ...f, garantia_dias: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Observaciones')}</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))}
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setModalAbierto(false)}
              className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium"
            >
              {t('Cancelar')}
            </button>
            <button
              disabled={!form.nombre.trim() || guardando}
              onClick={guardar}
              className="flex-1 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardando ? t('Guardando...') : t('Guardar')}
            </button>
          </div>
        </Modal>
      )}

      {repuestoDetalle && (
        <Modal titulo={repuestoDetalle.nombre} onClose={() => setDetalleId(null)} maxWidth="max-w-lg">
          {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <span>
              {t('Físico:')} <span className="font-medium text-ink dark:text-dark-text">{repuestoDetalle.cantidad_stock}</span>
            </span>
            <span className="text-warn">{t('Reservado:')} {repuestoDetalle.cantidad_reservada}</span>
            <span className="text-good font-medium">{t('Disponible:')} {disponible(repuestoDetalle)}</span>
          </div>

          {cargandoDetalle ? (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-4">{t('Cargando...')}</p>
          ) : (
            <>
              {puedeGestionar && (
                <div className="rounded-xl border border-border dark:border-dark-border p-3 flex flex-col gap-2">
                  <p className="text-xs font-semibold">{t('Reservar para una reparación')}</p>
                  <select
                    value={reservarReparacionId}
                    onChange={(e) => setReservarReparacionId(e.target.value)}
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">{t('Elegí una reparación abierta...')}</option>
                    {reparacionesAbiertas.map((rp) => (
                      <option key={rp.id} value={rp.id}>
                        {rp.numero_orden} · {rp.modelo ?? t('equipo')}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      value={reservarCantidad}
                      onChange={(e) => setReservarCantidad(e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric"
                      className="w-20 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      disabled={!reservarReparacionId || guardandoReserva}
                      onClick={reservar}
                      className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {guardandoReserva ? t('Reservando...') : t('Reservar')}
                    </button>
                  </div>
                </div>
              )}

              {reservasDetalle.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold">{t('Reservas activas')}</p>
                  {reservasDetalle.map((res) => (
                    <div
                      key={res.id}
                      className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <span>
                        {res.cantidad} · {reparacionLabel(res.reparacion_id)}
                      </span>
                      {puedeGestionar && (
                        <span className="flex gap-2 shrink-0">
                          <button onClick={() => confirmarReserva(res)} className="text-good underline font-medium">
                            {t('Confirmar uso')}
                          </button>
                          <button onClick={() => liberarReserva(res)} className="text-bad underline">
                            {t('Liberar')}
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {puedeGestionar && (
                <div className="rounded-xl border border-border dark:border-dark-border p-3 flex flex-col gap-2">
                  <p className="text-xs font-semibold">{t('Registrar movimiento')}</p>
                  <select
                    value={movTipo}
                    onChange={(e) => setMovTipo(e.target.value)}
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  >
                    {Object.entries(LABEL_MOVIMIENTO)
                      .filter(([tipo]) => !['consumo', 'reserva', 'liberacion'].includes(tipo))
                      .map(([tipo, label]) => (
                        <option key={tipo} value={tipo}>
                          {t(label)}
                        </option>
                      ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      value={movCantidad}
                      onChange={(e) => setMovCantidad(e.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, ''))}
                      placeholder={movTipo === 'ajuste' ? t('Cantidad (+/-)') : t('Cantidad')}
                      inputMode="numeric"
                      className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                    />
                    {movTipo === 'entrada' && (
                      <input
                        value={movCosto}
                        onChange={(e) => setMovCosto(sanitizarDecimal(e.target.value))}
                        placeholder={t('Costo c/u')}
                        inputMode="decimal"
                        className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                  <input
                    value={movMotivo}
                    onChange={(e) => setMovMotivo(e.target.value)}
                    placeholder={t('Motivo (opcional)')}
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    disabled={!movCantidad || guardandoMovimiento}
                    onClick={registrarMovimiento}
                    className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {guardandoMovimiento ? t('Guardando...') : t('Registrar')}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold">{t('Movimientos recientes')}</p>
                {movimientosDetalle.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Todavía no hay movimientos registrados.')}</p>
                )}
                {movimientosDetalle.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-xs border-b border-border dark:border-dark-border pb-1.5 last:border-0">
                    <span>
                      {t(LABEL_MOVIMIENTO[m.tipo] ?? m.tipo)}
                      {m.motivo ? ` — ${m.motivo}` : ''}
                    </span>
                    <span className={`font-medium tabular-nums shrink-0 ${m.cantidad < 0 ? 'text-bad' : 'text-good'}`}>
                      {m.cantidad > 0 ? '+' : ''}
                      {m.cantidad}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </main>
  );
}
