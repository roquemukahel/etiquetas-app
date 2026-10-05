'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { obtenerTodasLasFilas } from '../../lib/db';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor, getActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { simboloMoneda } from '../../lib/monedas';
import { sanitizarDecimal, formatearMonto } from '../../lib/numeros';
import { extraerStockInsuficiente, extraerDisponibleInsuficiente } from '../../lib/repuestos';
import { FINALIZADOS } from '../../lib/reparaciones';
import { useSucursalActual } from '../../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../../lib/sucursales';
import ServicioTecnicoTabs from '../../ServicioTecnicoTabs';
import Modal from '../../Modal';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';
import { comprimirImagen, reducirImagenDesdeUrl } from '../../lib/comprimirImagen';
import { CALIDADES_PREDETERMINADAS, combinarOpciones, obtenerOpcionesRepuestos } from '../../lib/repuestosOpciones';

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
  precio_venta: number | null;
  categoria: string | null;
  compatibilidad: string | null;
  calidad: string | null;
  sku: string | null;
  codigo_barras: string | null;
  ubicacion_fisica: string | null;
  proveedor_id: string | null;
  stock_minimo: number | null;
  garantia_dias: number | null;
  observaciones: string | null;
  sucursal_id: string | null;
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

// Las columnas del listado, SIN imagen_url. Las fotos se guardan como base64
// dentro de la tabla (varios MB cada una si se subieron sin comprimir): traerlas
// con select('*') hacía pesar 170 MB cada carga con 44 repuestos, el servidor
// respondía 500 y la pantalla mostraba "Todavía no cargaste repuestos". La foto
// se pide sola, de a un repuesto, cuando se abre su edición.
const COLUMNAS_LISTA =
  'id, nombre, cantidad_stock, cantidad_reservada, costo_unitario, precio_venta, categoria, compatibilidad, calidad, sku, codigo_barras, ubicacion_fisica, proveedor_id, stock_minimo, garantia_dias, observaciones, sucursal_id';

// Foto nueva: ancho máximo y calidad (una foto de repuesto en pantalla chica no
// necesita más; pesa unas decenas de KB en vez de varios MB).
const FOTO_ANCHO_MAX = 800;
const FOTO_CALIDAD = 0.7;
// Una foto guardada que pesa más que esto (en caracteres de base64) se considera
// pesada y la herramienta "Optimizar fotos" la reduce.
const FOTO_PESADA = 250_000;

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
  precio_venta: string;
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
  sucursal_id: string;
};

const FORM_VACIO: FormState = {
  nombre: '',
  cantidad_stock: '',
  costo_unitario: '',
  precio_venta: '',
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
  sucursal_id: '',
};

export default function StockRepuestos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeGestionar = tienePermiso(actor, 'agregar_stock');
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  // Costo y mano de obra son información sensible de rentabilidad — solo
  // para administradores, igual que en Estadísticas. Técnicos/vendedores
  // ven nombre, stock y precio final al cliente, nada más.
  const puedeVerCostos = tienePermiso(actor, 'ver_costos');
  const sucursalActual = useSucursalActual();

  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [reparacionesAbiertas, setReparacionesAbiertas] = useState<ReparacionAbierta[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  // Calidades/categorías que el negocio define en Configuración. Si todavía no
  // hay nada configurado (o la tabla no existe) se usan las de siempre.
  const [calidadesConfig, setCalidadesConfig] = useState<string[]>([]);
  const [categoriasConfig, setCategoriasConfig] = useState<string[]>([]);
  // Foto del repuesto que se está editando: se carga aparte (ver COLUMNAS_LISTA).
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [fotoTocada, setFotoTocada] = useState(false);
  const idFotoPedida = useRef<string | null>(null);
  const [optimizacion, setOptimizacion] = useState<{
    activa: boolean;
    hechas: number;
    total: number;
    optimizadas: number;
    ahorroBytes: number;
  } | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroCalidad, setFiltroCalidad] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  // Arranca en la sucursal elegida en el panel — mismo criterio que
  // Órdenes/Stock, sigue a sucursalActual si cambia mientras la pantalla ya
  // está abierta (ver el useEffect de abajo).
  const [filtroSucursal, setFiltroSucursal] = useState(sucursalActual.id ?? '');
  useEffect(() => {
    setFiltroSucursal(sucursalActual.id ?? '');
  }, [sucursalActual.id]);
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
    // Sin paginar, un catálogo de repuestos con más de 1000 filas se corta en
    // silencio (límite por defecto de PostgREST) — mismo bug ya corregido en
    // Stock/Dispositivos, reusa el mismo helper.
    const data = await obtenerTodasLasFilas<Repuesto>(supabase, 'repuestos', COLUMNAS_LISTA, [{ columna: 'nombre' }]);
    setRepuestos(data);
    // obtenerTodasLasFilas devuelve vacío cuando una consulta falla: antes eso se
    // mostraba como "Todavía no cargaste repuestos" aunque hubiera 44. Si vino
    // vacío se confirma con un conteo liviano antes de afirmarlo.
    let fallo = false;
    if (data.length === 0) {
      const { data: alguna, error: errConteo } = await supabase.from('repuestos').select('id').limit(1);
      fallo = !!errConteo || (alguna?.length ?? 0) > 0;
    }
    setErrorCarga(fallo);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      const [calidades, categorias] = await Promise.all([obtenerOpcionesRepuestos(supabase, 'calidad'), obtenerOpcionesRepuestos(supabase, 'categoria')]);
      setCalidadesConfig(calidades.opciones.map((o) => o.nombre));
      setCategoriasConfig(categorias.opciones.map((o) => o.nombre));
    })();
    (async () => {
      const { data } = await supabase.from('proveedores_repuestos').select('id, nombre').order('nombre');
      setProveedores((data as Proveedor[]) ?? []);
    })();
    (async () => {
      // Filtrado por estado del lado del servidor (no solo en JS): con miles
      // de reparaciones históricas acumuladas, traer TODAS para filtrar acá
      // se corta en 1000 filas sin avisar y hace desaparecer reparaciones
      // abiertas viejas del selector de "reservar repuesto".
      const { data } = await supabase
        .from('reparaciones')
        .select('id, numero_orden, modelo, estado')
        .not('estado', 'in', `(${FINALIZADOS.join(',')})`)
        .order('fecha_ingreso_servicio', { ascending: false });
      setReparacionesAbiertas((data as ReparacionAbierta[]) ?? []);
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
    (async () => {
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nombreProveedor = (id: string | null) => (id ? proveedores.find((p) => p.id === id)?.nombre : undefined);
  const nombreSucursal = (id: string | null) => (id ? sucursales.find((s) => s.id === id)?.nombre : undefined);
  const disponible = (r: Repuesto) => r.cantidad_stock - r.cantidad_reservada;
  const stockBajo = (r: Repuesto) => r.stock_minimo != null && disponible(r) > 0 && disponible(r) <= r.stock_minimo;
  const sinStock = (r: Repuesto) => disponible(r) <= 0;

  // Solo por sucursal (no por búsqueda/categoría/etc.) — es la base de los
  // indicadores y del catálogo de categorías, que no deberían achicarse
  // porque alguien esté buscando texto o filtrando por calidad.
  // Un repuesto con sucursal_id null es uno cargado antes de esta función (o
  // antes de tocar "Volver a sincronizar") — se muestra en CUALQUIER sucursal
  // que se filtre, en vez de desaparecer, para no dar la falsa impresión de
  // que se perdió stock ya cargado.
  const repuestosDeLaSucursal = useMemo(
    () => (filtroSucursal ? repuestos.filter((r) => r.sucursal_id === filtroSucursal || r.sucursal_id == null) : repuestos),
    [repuestos, filtroSucursal]
  );

  const indicadores = useMemo(() => {
    return {
      tipos: repuestosDeLaSucursal.length,
      fisicas: repuestosDeLaSucursal.reduce((acc, r) => acc + r.cantidad_stock, 0),
      reservadas: repuestosDeLaSucursal.reduce((acc, r) => acc + r.cantidad_reservada, 0),
      disponibles: repuestosDeLaSucursal.reduce((acc, r) => acc + disponible(r), 0),
      stockBajo: repuestosDeLaSucursal.filter(stockBajo).length,
      sinStock: repuestosDeLaSucursal.filter(sinStock).length,
      valorTotal: repuestosDeLaSucursal.reduce((acc, r) => acc + (r.costo_unitario ?? 0) * r.cantidad_stock, 0),
    };
  }, [repuestosDeLaSucursal]);

  // Configuradas + las que algún repuesto ya tiene guardadas (así un repuesto
  // con una calidad/categoría que no está en la lista se puede seguir filtrando).
  const calidadesLista = useMemo(
    () => combinarOpciones(calidadesConfig.length > 0 ? calidadesConfig : CALIDADES_PREDETERMINADAS, repuestos.map((r) => r.calidad)),
    [calidadesConfig, repuestos]
  );
  const categoriasLista = useMemo(() => combinarOpciones(categoriasConfig, repuestos.map((r) => r.categoria)), [categoriasConfig, repuestos]);
  // Con categorías configuradas se elige de la lista (así no se escribe "Pantalla"
  // de cinco maneras distintas); sin lista sigue siendo texto libre con sugerencias.
  const categoriasConLista = categoriasConfig.length > 0;
  const igualTexto = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return repuestosDeLaSucursal.filter((r) => {
      if (soloStockBajo && !stockBajo(r)) return false;
      if (soloSinStock && !sinStock(r)) return false;
      if (filtroCategoria && !igualTexto(r.categoria, filtroCategoria)) return false;
      if (filtroCalidad && !igualTexto(r.calidad, filtroCalidad)) return false;
      if (filtroProveedor && r.proveedor_id !== filtroProveedor) return false;
      if (q && !r.nombre.toLowerCase().includes(q) && !(r.sku ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [repuestosDeLaSucursal, busqueda, filtroCategoria, filtroCalidad, filtroProveedor, soloStockBajo, soloSinStock]);

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
    setForm({ ...FORM_VACIO, sucursal_id: sucursalActual.id ?? '' });
    setError(null);
    setMenuAbierto(null);
    idFotoPedida.current = null;
    setCargandoFoto(false);
    setFotoTocada(false);
    setModalAbierto(true);
  };

  const abrirEdicion = (r: Repuesto) => {
    setEditandoId(r.id);
    setForm({
      nombre: r.nombre,
      cantidad_stock: String(r.cantidad_stock),
      costo_unitario: r.costo_unitario != null ? String(r.costo_unitario) : '',
      precio_venta: r.precio_venta != null ? String(r.precio_venta) : '',
      categoria: r.categoria ?? '',
      compatibilidad: r.compatibilidad ?? '',
      calidad: r.calidad ?? '',
      sku: r.sku ?? '',
      codigo_barras: r.codigo_barras ?? '',
      ubicacion_fisica: r.ubicacion_fisica ?? '',
      proveedor_id: r.proveedor_id ?? '',
      imagen_url: null,
      stock_minimo: r.stock_minimo != null ? String(r.stock_minimo) : '',
      garantia_dias: r.garantia_dias != null ? String(r.garantia_dias) : '',
      observaciones: r.observaciones ?? '',
      sucursal_id: r.sucursal_id ?? '',
    });
    setError(null);
    setMenuAbierto(null);
    setFotoTocada(false);
    setModalAbierto(true);
    // La foto (varios MB) no viene en el listado: se pide acá, solo la de este repuesto.
    idFotoPedida.current = r.id;
    setCargandoFoto(true);
    (async () => {
      const { data } = await supabase.from('repuestos').select('imagen_url').eq('id', r.id).maybeSingle();
      // Si mientras tanto se cerró o se abrió otro repuesto, no se pisa nada.
      if (idFotoPedida.current !== r.id) return;
      setForm((f) => ({ ...f, imagen_url: f.imagen_url ?? (data as { imagen_url: string | null } | null)?.imagen_url ?? null }));
      setCargandoFoto(false);
    })();
  };

  const cambiarImagenForm = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Se comprime antes de guardar: una foto de cámara sin comprimir pesa 3-5 MB.
    comprimirImagen(file, FOTO_ANCHO_MAX, FOTO_CALIDAD)
      .then((foto) => {
        setForm((f) => ({ ...f, imagen_url: foto }));
        setFotoTocada(true);
      })
      .catch(() => setError(t('No pudimos leer la foto.')));
    e.target.value = '';
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
      stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : null,
      garantia_dias: form.garantia_dias ? Number(form.garantia_dias) : null,
      observaciones: form.observaciones.trim() || null,
    };
    // La foto solo se escribe si se eligió una nueva: el listado ya no la trae
    // (ver COLUMNAS_LISTA), así que guardar "lo que había" la habría borrado.
    const payloadFoto = fotoTocada ? { imagen_url: form.imagen_url } : {};

    if (editandoId) {
      const { error: updError } = await supabase
        .from('repuestos')
        .update({
          nombre: form.nombre.trim(),
          costo_unitario: form.costo_unitario ? Number(form.costo_unitario) : null,
          precio_venta: form.precio_venta ? Number(form.precio_venta) : null,
          sucursal_id: form.sucursal_id || null,
          ...payloadComun,
          ...payloadFoto,
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

    // Si ya existe un repuesto con ese nombre EN LA MISMA SUCURSAL, sumamos a
    // su stock en vez de crear un duplicado — es lo que va a esperar alguien
    // que escribe "Batería iPhone 13" dos veces sin darse cuenta. La misma
    // sucursal es la condición clave: sin ella, cargar "Pantalla iPhone 11"
    // para la Sucursal 2 terminaría sumándose al stock de la Sucursal 1 si
    // ya existía ahí, mezclando el stock de dos locales distintos.
    // Un repuesto con sucursal_id null (cargado antes de esta función, o
    // creado sin sucursal desde el catálogo de precios de proveedor en
    // Servicio Técnico → Repuestos de un proveedor) también cuenta como
    // "el mismo" — se lo adopta para esta sucursal en vez de crear otra fila
    // separada que quedaría divergiendo de la original.
    const sucursalNueva = form.sucursal_id || null;
    const mismoNombre = (r: Repuesto) => r.nombre.trim().toLowerCase() === form.nombre.trim().toLowerCase();
    // Preferir el match EXACTO de sucursal antes que el legacy sin asignar:
    // repuestos está ordenado por nombre, no por sucursal, así que si un
    // .find() único aceptara los dos casos por igual, cuál de las dos filas
    // "gana" dependería del orden en el array en vez de cuál es la
    // correcta — con un repuesto que ya tiene fila propia en esta sucursal
    // Y una fila vieja sin asignar del mismo nombre, eso podía adoptar la
    // vieja (pisándole la sucursal) en vez de sumar a la que ya era de acá.
    // La calidad también define "el mismo" repuesto: "Modulo A12" Premium y
    // "Modulo A12" Compatible son dos productos distintos (otro precio, otro
    // proveedor). Antes se fusionaban por nombre y el segundo le pisaba la
    // calidad al primero, sumando el stock de los dos en una sola fila.
    // Si no se eligió calidad y hay UN solo repuesto con ese nombre, se suma a
    // ese (como siempre); si hay varios con calidades distintas, no se adivina.
    const conEseNombre = repuestos.filter(mismoNombre);
    const calidadElegida = form.calidad.trim();
    const mismaCalidad = calidadElegida ? conEseNombre.filter((r) => igualTexto(r.calidad, calidadElegida)) : conEseNombre.filter((r) => !(r.calidad ?? '').trim());
    const candidatos = mismaCalidad.length > 0 ? mismaCalidad : !calidadElegida && conEseNombre.length === 1 ? conEseNombre : [];
    const existente = candidatos.find((r) => r.sucursal_id === sucursalNueva) ?? candidatos.find((r) => r.sucursal_id == null);
    if (existente) {
      const nuevaCantidad = existente.cantidad_stock + (Number(form.cantidad_stock) || 0);
      // Sumar stock a uno que ya existe solo toca lo que se completó en el
      // formulario: antes los campos vacíos (categoría, SKU, ubicación…) le
      // borraban al repuesto existente lo que ya tenía cargado.
      const conservar = <T,>(nuevo: T | null, actual: T | null): T | null => (nuevo !== null && nuevo !== '' ? nuevo : actual);
      const { error: updError } = await supabase
        .from('repuestos')
        .update({
          cantidad_stock: nuevaCantidad,
          costo_unitario: form.costo_unitario ? Number(form.costo_unitario) : existente.costo_unitario,
          precio_venta: form.precio_venta ? Number(form.precio_venta) : existente.precio_venta,
          ...(sucursalNueva && existente.sucursal_id == null ? { sucursal_id: sucursalNueva } : {}),
          categoria: conservar(payloadComun.categoria, existente.categoria),
          compatibilidad: conservar(payloadComun.compatibilidad, existente.compatibilidad),
          calidad: conservar(payloadComun.calidad, existente.calidad),
          sku: conservar(payloadComun.sku, existente.sku),
          codigo_barras: conservar(payloadComun.codigo_barras, existente.codigo_barras),
          ubicacion_fisica: conservar(payloadComun.ubicacion_fisica, existente.ubicacion_fisica),
          proveedor_id: conservar(payloadComun.proveedor_id, existente.proveedor_id),
          stock_minimo: conservar(payloadComun.stock_minimo, existente.stock_minimo),
          garantia_dias: conservar(payloadComun.garantia_dias, existente.garantia_dias),
          observaciones: conservar(payloadComun.observaciones, existente.observaciones),
          ...payloadFoto,
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
        precio_venta: form.precio_venta ? Number(form.precio_venta) : null,
        ...(sucursalNueva ? { sucursal_id: sucursalNueva } : {}),
        ...payloadComun,
        ...payloadFoto,
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

  // Achica las fotos que ya estaban guardadas sin comprimir (3-5 MB cada una):
  // de a un repuesto por vez, para no volver a pedir todo junto lo que justo
  // hacía fallar la pantalla. No cambia cómo se ven en pantalla.
  const optimizarFotos = async () => {
    if (!puedeGestionar || optimizacion?.activa) return;
    if (!confirm(t('Esto revisa las fotos de los repuestos y achica las que pesan mucho, sin cambiar cómo se ven. Puede tardar un par de minutos: dejá esta pantalla abierta. ¿Seguir?'))) return;
    const ids = repuestos.map((r) => r.id);
    let optimizadas = 0;
    let ahorro = 0;
    setOptimizacion({ activa: true, hechas: 0, total: ids.length, optimizadas: 0, ahorroBytes: 0 });
    for (let i = 0; i < ids.length; i++) {
      try {
        const { data } = await supabase.from('repuestos').select('imagen_url').eq('id', ids[i]).maybeSingle();
        const url = (data as { imagen_url: string | null } | null)?.imagen_url;
        if (url && url.startsWith('data:') && url.length > FOTO_PESADA) {
          const nueva = await reducirImagenDesdeUrl(url, FOTO_ANCHO_MAX, FOTO_CALIDAD);
          if (nueva.length < url.length * 0.8) {
            const { error: updError } = await supabase.from('repuestos').update({ imagen_url: nueva }).eq('id', ids[i]);
            if (!updError) {
              optimizadas++;
              ahorro += url.length - nueva.length;
            }
          }
        }
      } catch {
        // Una foto que no se pudo leer no frena a las demás.
      }
      setOptimizacion({ activa: true, hechas: i + 1, total: ids.length, optimizadas, ahorroBytes: ahorro });
    }
    setOptimizacion({ activa: false, hechas: ids.length, total: ids.length, optimizadas, ahorroBytes: ahorro });
    if (optimizadas > 0) {
      await registrarAuditoria(supabase, { accion: `optimizó ${optimizadas} foto(s) de repuestos (ahorro ${Math.round(ahorro / 1_000_000)} MB)`, entidad: 'repuesto' });
    }
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

      {puedeGestionar && (
        <div className="flex items-center gap-4 flex-wrap text-xs -mt-1">
          <Link href="/configuracion/repuestos-opciones" className="text-accent dark:text-dark-accent underline">
            {t('Administrar calidades y categorías')}
          </Link>
          <button onClick={optimizarFotos} disabled={optimizacion?.activa} className="text-accent dark:text-dark-accent underline disabled:opacity-50">
            {t('Optimizar fotos')}
          </button>
        </div>
      )}
      {optimizacion && (
        <p className={`text-xs rounded-lg px-3 py-2 ${optimizacion.activa ? 'bg-accent/10 text-accent dark:text-dark-accent' : 'bg-good/10 text-good'}`}>
          {optimizacion.activa
            ? `${t('Optimizando fotos…')} ${optimizacion.hechas}/${optimizacion.total}`
            : optimizacion.optimizadas > 0
              ? `${t('Listo: se achicaron')} ${optimizacion.optimizadas} ${t('fotos y se liberaron')} ${Math.max(1, Math.round(optimizacion.ahorroBytes / 1_000_000))} MB.`
              : t('Listo: ninguna foto necesitaba achicarse.')}
        </p>
      )}

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
          {puedeVerCostos && (
            <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-2.5 py-2 flex flex-col gap-0.5 col-span-2">
              <span className="text-base font-semibold">
                {moneda}
                {formatearMonto(indicadores.valorTotal)}
              </span>
              <span className="text-muted dark:text-dark-text-secondary">{t('Valor del inventario (a costo)')}</span>
            </div>
          )}
        </div>
      )}

      {sucursales.length > 1 && (
        <select
          value={filtroSucursal}
          onChange={(e) => setFiltroSucursal(e.target.value)}
          aria-label={t('Filtrar por sucursal')}
          className="self-start bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs"
        >
          <option value="">🏬 {t('Todas las sucursales')}</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              🏬 {s.nombre}
            </option>
          ))}
        </select>
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
              {categoriasLista.map((c) => (
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
              {calidadesLista.map((c) => (
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

      {repuestos.length === 0 && errorCarga && (
        <div className="flex flex-col items-center gap-3 text-center mt-6">
          <p className="text-sm text-bad">{t('No pudimos cargar tus repuestos. Tus datos están a salvo — probá de nuevo.')}</p>
          <button
            onClick={() => {
              setLoading(true);
              cargar();
            }}
            className="rounded-xl bg-accent dark:bg-dark-accent text-white px-4 py-2 text-sm font-medium"
          >
            {t('Reintentar')}
          </button>
        </div>
      )}
      {repuestos.length === 0 && !errorCarga && (
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
              <div className="h-11 w-11 rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-muted dark:text-dark-text-secondary [&_svg]:h-5 [&_svg]:w-5 shrink-0">
                {ICONOS.repuesto}
              </div>
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
                  {!filtroSucursal && sucursales.length > 1 && nombreSucursal(r.sucursal_id) && (
                    <span className="flex items-center gap-1">
                      · 🏬 {nombreSucursal(r.sucursal_id)}
                    </span>
                  )}
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
              {r.precio_venta != null && (
                <span className="text-good font-medium">
                  · {t('precio')} {moneda}
                  {r.precio_venta.toLocaleString('es-AR')}
                </span>
              )}
              {puedeVerCostos && r.costo_unitario != null && (
                <span className="text-muted dark:text-dark-text-secondary">
                  · {t('costo c/u')} {moneda}
                  {r.costo_unitario.toLocaleString('es-AR')}
                </span>
              )}
              {puedeVerCostos && r.precio_venta != null && r.costo_unitario != null && (
                <span className="text-muted dark:text-dark-text-secondary">
                  · {t('mano de obra')} {moneda}
                  {(r.precio_venta - r.costo_unitario).toLocaleString('es-AR')}
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
            <div className="self-start flex items-end gap-3">
              <label className="cursor-pointer">
                {form.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.imagen_url}
                    alt=""
                    className="h-20 w-20 rounded-lg object-contain bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border p-1"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-lg bg-canvas dark:bg-dark-bg border border-dashed border-border dark:border-dark-border flex items-center justify-center text-muted dark:text-dark-text-secondary [&_svg]:h-6 [&_svg]:w-6">
                    {cargandoFoto ? <span className="text-[10px]">{t('Cargando...')}</span> : ICONOS.camara}
                  </div>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={cambiarImagenForm} />
              </label>
              {form.imagen_url && (
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, imagen_url: null }));
                    setFotoTocada(true);
                  }}
                  className="text-xs text-bad underline"
                >
                  {t('Quitar foto')}
                </button>
              )}
            </div>

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

            {sucursales.length > 1 && (
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Sucursal')}</label>
                <select
                  value={form.sucursal_id}
                  onChange={(e) => setForm((f) => ({ ...f, sucursal_id: e.target.value }))}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">{t('Sin asignar (visible en todas)')}</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Precio final al cliente')}</label>
                <input
                  value={form.precio_venta}
                  onChange={(e) => setForm((f) => ({ ...f, precio_venta: sanitizarDecimal(e.target.value) }))}
                  inputMode="decimal"
                  placeholder={t('Sin cargar')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {puedeVerCostos && (
              <div className="grid grid-cols-2 gap-2">
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
                <div>
                  <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Mano de obra (calculada)')}</label>
                  <div className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm text-muted dark:text-dark-text-secondary">
                    {form.precio_venta && form.costo_unitario
                      ? `${moneda}${(Number(form.precio_venta) - Number(form.costo_unitario)).toLocaleString('es-AR')}`
                      : '—'}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Categoría')}</label>
                {categoriasConLista ? (
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">{t('Sin especificar')}</option>
                    {combinarOpciones(categoriasLista, [form.categoria]).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      value={form.categoria}
                      onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                      placeholder={t('Ej. Batería')}
                      list="categorias-repuestos"
                      className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                    />
                    <datalist id="categorias-repuestos">
                      {categoriasLista.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Calidad')}</label>
                <select
                  value={form.calidad}
                  onChange={(e) => setForm((f) => ({ ...f, calidad: e.target.value }))}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">{t('Sin especificar')}</option>
                  {combinarOpciones(calidadesLista, [form.calidad]).map((c) => (
                    <option key={c} value={c}>
                      {t(c)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {puedeGestionar && (
              <Link href="/configuracion/repuestos-opciones" className="self-start text-xs text-accent dark:text-dark-accent underline -mt-1">
                {t('Administrar calidades y categorías')}
              </Link>
            )}

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
                    {movTipo === 'entrada' && puedeVerCostos && (
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
