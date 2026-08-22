'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { imagenColorDeModelo } from '../lib/coloresModelo';
import { hexColorDe } from '../lib/coloresIphone';
import { registrarAuditoria } from '../lib/auditoria';
import { getActor, useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { leerCSV, valorDe, descargarCSV, insertarEnTandas } from '../lib/csv';
import { obtenerTodasLasFilas } from '../lib/db';
import { asegurarModelo, normalizarNombreModelo } from '../lib/modelos';
import { compararModelosPorSalida } from '../lib/catalogosMarcas';
import { sanitizarDecimal } from '../lib/numeros';
import { obtenerCategorias, type Categoria } from '../lib/categorias';
import { asegurarProveedor } from '../lib/proveedores';
import { useT } from '../lib/idioma';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import { QoviState } from '../QoviState';
import { ICONOS } from '../Iconos';

function IconoChico({ nombre, className = '' }: { nombre: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`[&_svg]:h-3 [&_svg]:w-3 inline-flex shrink-0 ${className}`}>
      {ICONOS[nombre]}
    </span>
  );
}

// Cuando el CSV viene de otro sistema y no separó el IMEI, la batería ni la
// capacidad en columnas propias, suelen venir mezclados en un texto libre
// (ej. "iPhone 11 Black 128GB 73% de bateria imei: 353968107575889"). Estas
// funciones los rescatan con expresiones regulares — no son perfectas, pero
// cubren el patrón que se ve en la práctica.
function extraerImei(texto: string): string | null {
  const m = texto.match(/imei[:\s]*([0-9]{6,17})/i) || texto.match(/\b(\d{15})\b/);
  return m ? m[1] : null;
}
function extraerBateria(texto: string): number | null {
  const m = texto.match(/(\d{1,3})\s?%/);
  return m ? Number(m[1]) : null;
}
function extraerCapacidad(texto: string): number | null {
  const m = texto.match(/(\d+)\s?gb/i);
  return m ? Number(m[1]) : null;
}

type Dispositivo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  numero_serie: string | null;
  salud_bateria: number | null;
  color: string | null;
  precio: number | null;
  costo: number | null;
  proveedor: string | null;
  estado: string | null;
  detalles: string | null;
  en_stock: boolean;
  created_at: string;
  agregado_por_nombre: string | null;
};

type Producto = {
  id: string;
  nombre: string;
  precio: number | null;
  costo: number | null;
  imagen_url: string | null;
  cantidad: number;
  categoria_id?: string | null;
  modalidad?: string | null;
  marca?: string | null;
  numero_serie?: string | null;
  sku?: string | null;
  codigo_barras?: string | null;
  proveedor_id?: string | null;
  stock_minimo?: number | null;
  garantia_dias?: number | null;
  descripcion?: string | null;
  notas?: string | null;
};

// Catálogo inicial que se puede cargar con un toque desde "Agregar accesorios
// por defecto" — se insertan sin precio/costo/cantidad (el dueño los completa
// después); las fotos viven en /public así no pesan la base de datos.
const ACCESORIOS_DEFAULT: { nombre: string; imagen: string }[] = [
  // La foto vieja de "AirPods Pro" (genérica) en realidad era la Pro 3 —
  // ahora quedan separados porque no son el mismo accesorio.
  { nombre: 'AirPods Pro 2', imagen: '/accesorios-default/airpods-pro-2.webp' },
  { nombre: 'AirPods Pro 3', imagen: '/accesorios-default/airpods-pro-3.webp' },
  { nombre: 'AirTag', imagen: '/accesorios-default/airtag.webp' },
  { nombre: 'Auriculares con cable (Lightning)', imagen: '/accesorios-default/auriculares-cable.webp' },
  { nombre: 'Cargador (cabezal + cable USB-C)', imagen: '/accesorios-default/cargador-cabezal-cable.webp' },
  { nombre: 'Cabezal 20W', imagen: '/accesorios-default/cabezal-20w.webp' },
  { nombre: 'Cable USB-C a Lightning', imagen: '/accesorios-default/cable-usb-c-lightning.webp' },
  { nombre: 'Cargador de Apple Watch', imagen: '/accesorios-default/cargador-apple-watch.webp' },
  { nombre: 'Adaptador de enchufe', imagen: '/accesorios-default/adaptador-enchufe.webp' },
  { nombre: 'Protector de cámara', imagen: '/accesorios-default/protector-camara.webp' },
  { nombre: 'Funda transparente', imagen: '/accesorios-default/funda-transparente.webp' },
  { nombre: 'Funda MagSafe', imagen: '/accesorios-default/funda-magsafe.webp' },
  { nombre: 'Joystick PS5 (DualSense)', imagen: '/accesorios-default/joystick-ps5.webp' },
  { nombre: 'Parlante JBL Xtreme', imagen: '/accesorios-default/parlante-jbl-xtreme.webp' },
  { nombre: 'Parlante JBL Clip', imagen: '/accesorios-default/parlante-jbl-clip.webp' },
  { nombre: 'Consola PS5', imagen: '/accesorios-default/ps5-consola.webp' },
  { nombre: 'Vidrio templado', imagen: '/accesorios-default/templado-vidrio.webp' },
];

type FiltroRapido = 'todos' | 'bateria_baja' | 'sellados' | 'por_reponer' | 'sin_precio' | 'sin_costo' | 'incompletos';
const VISTAS_RAPIDAS: { id: FiltroRapido; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'bateria_baja', label: 'Batería baja' },
  { id: 'sellados', label: 'Sellados' },
  { id: 'por_reponer', label: 'Por reponer' },
  { id: 'sin_precio', label: 'Sin precio' },
  { id: 'sin_costo', label: 'Sin costo' },
  { id: 'incompletos', label: 'Datos incompletos' },
];

export default function Stock() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');
  const puedeRecibirServicioTecnico = tienePermiso(actor, 'recibir_servicio_tecnico');
  // El capital muestra costos y ganancias (info sensible del dueño): se
  // protege con el mismo permiso que las Estadísticas.
  const puedeVerCapital = tienePermiso(actor, 'ver_estadisticas');
  const [tab, setTab] = useState<'celulares' | 'accesorios'>('celulares');

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  // "Vendidos" puede tener miles de filas (el historial completo) contra
  // un puñado "en stock" — traerlas de arranque es exactamente lo que hacía
  // lenta a esta pantalla. Ahora solo se cargan la primera vez que el
  // usuario entra a esa pestaña; hasta entonces, los contadores (cuántos
  // hay en total/vendidos) salen de un count() liviano, no de tener todo
  // ya en memoria.
  const [vendidosCargados, setVendidosCargados] = useState(false);
  const [cargandoVendidos, setCargandoVendidos] = useState(false);
  const [totalVendidos, setTotalVendidos] = useState(0);
  const [totalDispositivos, setTotalDispositivos] = useState(0);
  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  // La búsqueda se filtra sobre esta versión "atrasada" del texto (250ms),
  // no sobre `busqueda` directamente: escribir sigue sintiéndose instantáneo
  // en el input, pero filtrar y reagrupar cientos de dispositivos no se
  // recalcula en cada tecla, solo cuando el usuario hace una pausa.
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 250);
    return () => clearTimeout(t);
  }, [busqueda]);
  const [vista, setVista] = useState<'stock' | 'vendidos'>('stock');
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('todos');

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [nombreProducto, setNombreProducto] = useState('');
  const [precioProducto, setPrecioProducto] = useState('');
  const [costoProducto, setCostoProducto] = useState('');
  // Categorías de stock (app/lib/categorias.ts): si el negocio no corrió
  // todavía la migración correspondiente, esta consulta simplemente vuelve
  // vacía (la tabla no existe) y el selector no se muestra — agregar un
  // accesorio sigue funcionando exactamente igual que antes.
  const [categoriasStock, setCategoriasStock] = useState<Categoria[]>([]);
  const [categoriaProducto, setCategoriaProducto] = useState('');
  // Modalidad del producto que se está por agregar: la sugiere la categoría
  // elegida (modalidad_default), pero queda editable — la spec pide que sea
  // "explícitamente seleccionable por producto", no fija por categoría.
  const [modalidadProducto, setModalidadProducto] = useState<'cantidad' | 'serializado'>('cantidad');
  const [marcaProducto, setMarcaProducto] = useState('');
  const [numeroSerieProducto, setNumeroSerieProducto] = useState('');
  const [cantidadInicialProducto, setCantidadInicialProducto] = useState('1');
  // "Perfil genérico" (categorias_stock_supabase.sql): campos que existen en
  // la base hace tiempo pero nunca tuvieron formulario — colapsados detrás
  // de "Más campos" para no abrumar el alta rápida de un accesorio simple.
  const [mostrarMasCamposProducto, setMostrarMasCamposProducto] = useState(false);
  const [skuProducto, setSkuProducto] = useState('');
  const [codigoBarrasProducto, setCodigoBarrasProducto] = useState('');
  const [proveedorProducto, setProveedorProducto] = useState('');
  const [stockMinimoProducto, setStockMinimoProducto] = useState('');
  const [garantiaDiasProducto, setGarantiaDiasProducto] = useState('');
  const [descripcionProducto, setDescripcionProducto] = useState('');
  const [notasProducto, setNotasProducto] = useState('');
  const [proveedoresSugeridos, setProveedoresSugeridos] = useState<string[]>([]);
  // Filtro de la grilla de accesorios por categoría — '' = todas.
  const [filtroCategoriaProducto, setFiltroCategoriaProducto] = useState('');
  const [guardandoProducto, setGuardandoProducto] = useState(false);
  const [errorProducto, setErrorProducto] = useState<string | null>(null);
  const [editandoCantidad, setEditandoCantidad] = useState<string | null>(null);
  const [valorCantidad, setValorCantidad] = useState('');
  const [valorCosto, setValorCosto] = useState('');
  const [valorPrecio, setValorPrecio] = useState('');
  const [preparando, setPreparando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState<{ hechas: number; total: number } | null>(null);
  const [resultadoImport, setResultadoImport] = useState<string | null>(null);
  const [planImport, setPlanImport] = useState<{
    filas: Record<string, unknown>[];
    totalCSV: number;
    omitidosSinModelo: number;
    omitidosDuplicado: number;
  } | null>(null);
  const inputImportRef = useRef<HTMLInputElement>(null);
  const [categoriaImportId, setCategoriaImportId] = useState('');

  const [menuAbierto, setMenuAbierto] = useState<'agregar' | 'mas' | null>(null);

  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [eliminandoSeleccion, setEliminandoSeleccion] = useState(false);

  // En "Vendidos" las carpetas arrancan cerradas (pueden acumular cientos de
  // unidades del mismo modelo) y se abren una por una al tocarlas. En "En
  // stock"/"Historial" arrancan abiertas, como siempre. `colapsadas` guarda
  // las EXCEPCIONES al default de la vista actual (tocadas a mano, o por
  // "Expandir/Contraer todas") — el nombre ya no es "alternadas" porque
  // ahora también lo escriben las acciones masivas, no solo el toggle
  // individual de cada carpeta.
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());
  const [mostrarVacias, setMostrarVacias] = useState(false);
  const [carpetaMenuAbierta, setCarpetaMenuAbierta] = useState<string | null>(null);

  useEffect(() => {
    setColapsadas(new Set());
  }, [vista]);

  // Con un catálogo chico, todas las carpetas abiertas de entrada es más
  // cómodo (se ve todo de un vistazo). Pero con miles de dispositivos
  // (importados de otro sistema, por ejemplo) expandir TODAS las carpetas
  // de arranque significa renderizar miles de filas antes de que el
  // usuario pida ver ninguna — ahí arrancan cerradas, igual que "Vendidos"
  // siempre hizo por la misma razón, y se abren las que hacen falta.
  const UMBRAL_AUTOEXPANDIR = 300;
  const expandidoPorDefecto = vista !== 'vendidos' && dispositivos.length <= UMBRAL_AUTOEXPANDIR;

  const grupoExpandido = (modelo: string) => {
    // Buscando, siempre expandido: así se ven los resultados sin tener que
    // ir tocando carpeta por carpeta.
    if (busquedaDebounced.trim()) return true;
    return colapsadas.has(modelo) ? !expandidoPorDefecto : expandidoPorDefecto;
  };

  const toggleGrupo = (modelo: string) => {
    setColapsadas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(modelo)) nuevo.delete(modelo);
      else nuevo.add(modelo);
      return nuevo;
    });
  };

  // "Expandir todas"/"Contraer todas": como el default cambia según la
  // vista y el tamaño del catálogo, en vez de expandido/contraído "a secas"
  // lo que se guarda son las excepciones al default — por eso una acción
  // vacía el set y la otra lo llena con todas las carpetas visibles.
  const expandirTodas = () => setColapsadas(expandidoPorDefecto ? new Set() : new Set(grupos.map(([nombre]) => nombre)));
  const contraerTodas = () => setColapsadas(expandidoPorDefecto ? new Set(grupos.map(([nombre]) => nombre)) : new Set());

  const [eliminandoCarpeta, setEliminandoCarpeta] = useState<string | null>(null);

  // Elimina TODOS los dispositivos de la carpeta (acción fuerte, ya existía)
  // — distinta de "eliminar carpeta" del menú, que borra solo el catálogo
  // vacío y por eso está bloqueada si hay dispositivos adentro.
  const eliminarCarpeta = async (modelo: string, items: Dispositivo[]) => {
    if (items.length === 0 || !puedeEliminar) return;
    setCarpetaMenuAbierta(null);
    if (
      !confirm(
        `¿Eliminar los ${items.length} dispositivo${items.length === 1 ? '' : 's'} de "${modelo}"? No se puede deshacer.`
      )
    )
      return;

    setEliminandoCarpeta(modelo);
    const { error } = await supabase.from('dispositivos').delete().in('id', items.map((d) => d.id));
    if (!error) {
      await registrarAuditoria(supabase, {
        accion: `eliminó toda la carpeta "${modelo}" de Stock (${items.length} dispositivo${items.length === 1 ? '' : 's'})`,
        entidad: 'dispositivo',
      });
    }
    setEliminandoCarpeta(null);
    cargarDispositivos();
  };

  // Esta es la acción SEGURA del menú "Eliminar carpeta": solo saca la
  // carpeta vacía del catálogo (modelos_stock), no toca ningún dispositivo
  // — por eso solo se ofrece cuando la carpeta no tiene ninguno.
  const eliminarCarpetaVacia = async (modelo: string) => {
    if (!puedeEliminar) return;
    setCarpetaMenuAbierta(null);
    if (!confirm(`${t('¿Eliminar la carpeta')} "${modelo}"? ${t('No tiene dispositivos, así que no se pierde nada.')}`)) return;
    const { error } = await supabase.from('modelos_stock').delete().eq('nombre', modelo);
    if (error) {
      alert(`${t('No pudimos eliminar la carpeta:')} ` + error.message);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `eliminó la carpeta vacía "${modelo}" de Stock`,
      entidad: 'carpeta',
    });
    setCarpetas((cs) => cs.filter((c) => c !== modelo));
  };

  const cargarProductos = async () => {
    const data = await obtenerTodasLasFilas<Producto>(supabase, 'productos', '*', [{ columna: 'nombre' }]);
    setProductos(data);
    setLoadingProductos(false);
  };

  // Columnas explícitas (no "*"): "agregado_por_foto_url" es la foto del
  // vendedor/técnico en base64 — no se usa en esta pantalla (solo se
  // muestra el nombre), pero al guardarse copiada en CADA dispositivo que
  // esa persona cargó, traerla en un listado de miles de filas multiplica
  // el peso de la respuesta varias veces sin necesidad.
  const COLUMNAS_DISPOSITIVO =
    'id, modelo, capacidad_gb, imei, numero_serie, salud_bateria, color, precio, costo, proveedor, estado, detalles, en_stock, created_at, agregado_por_nombre';
  const ORDEN_DISPOSITIVO = [{ columna: 'modelo' }, { columna: 'created_at', ascending: false }];

  // "En stock" se trae siempre (es lo chico y lo que se usa a cada rato).
  // "Vendidos" es el historial completo — puede ser miles de filas — así
  // que solo se trae si ya se cargó antes (para refrescar después de una
  // acción) o si se pide explícitamente al entrar a esa pestaña por
  // primera vez. Los conteos para los contadores de la pantalla salen de
  // un count() aparte, liviano, independiente de si el detalle ya está en
  // memoria o no.
  const cargarDispositivos = async (opts?: { incluirVendidos?: boolean }) => {
    const incluirVendidos = opts?.incluirVendidos ?? vendidosCargados;
    const [enStock, vendidos, { count: countVendidos }, { count: countTotal }] = await Promise.all([
      obtenerTodasLasFilas<Dispositivo>(supabase, 'dispositivos', COLUMNAS_DISPOSITIVO, ORDEN_DISPOSITIVO, (q) =>
        q.eq('en_stock', true)
      ),
      incluirVendidos
        ? obtenerTodasLasFilas<Dispositivo>(supabase, 'dispositivos', COLUMNAS_DISPOSITIVO, ORDEN_DISPOSITIVO, (q) =>
            q.eq('en_stock', false)
          )
        : Promise.resolve([]),
      supabase.from('dispositivos').select('id', { count: 'exact', head: true }).eq('en_stock', false),
      supabase.from('dispositivos').select('id', { count: 'exact', head: true }),
    ]);
    setDispositivos([...enStock, ...vendidos]);
    setVendidosCargados(incluirVendidos);
    setTotalVendidos(countVendidos ?? 0);
    setTotalDispositivos(countTotal ?? 0);
    setLoading(false);
  };

  // Al entrar por primera vez a "Vendidos", recién ahí se trae el historial.
  useEffect(() => {
    if (vista === 'vendidos' && !vendidosCargados && !cargandoVendidos) {
      setCargandoVendidos(true);
      cargarDispositivos({ incluirVendidos: true }).finally(() => setCargandoVendidos(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista]);

  useEffect(() => {
    (async () => {
      try {
        const data = await obtenerCategorias(supabase, false);
        setCategoriasStock(data);
        // Default razonable: "Accesorios" (la migrada) si existe, si no la
        // primera de perfil genérico — nunca "Celulares" por default acá,
        // este formulario es el de accesorios.
        const sugerida = data.find((c) => c.nombre.toLowerCase() === 'accesorios') ?? data.find((c) => c.perfil_default === 'generico');
        if (sugerida) {
          setCategoriaProducto(sugerida.id);
          setModalidadProducto(sugerida.modalidad_default);
        }
        // Mismo criterio para la importación por CSV, pero de perfil
        // "dispositivo" — esto importa celulares.
        const sugeridaDispositivo = data.find((c) => c.nombre.toLowerCase() === 'celulares') ?? data.find((c) => c.perfil_default === 'dispositivo');
        if (sugeridaDispositivo) setCategoriaImportId(sugeridaDispositivo.id);
      } catch {
        // Tabla stock_categorias todavía no existe en este negocio (no se
        // corrió la migración) — el formulario sigue funcionando igual que
        // antes, simplemente sin selector de categoría.
      }
    })();
    // Mismo patrón que Proveedor en app/stock/nuevo/page.tsx: nombres
    // existentes como sugerencia de autocompletar, nunca bloquea escribir
    // uno nuevo. Si la tabla no existe o está vacía, el datalist queda vacío
    // y listo — no rompe nada.
    (async () => {
      const { data } = await supabase.from('proveedores').select('nombre').order('nombre');
      setProveedoresSugeridos(((data as { nombre: string }[]) ?? []).map((p) => p.nombre));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [exportandoDispositivos, setExportandoDispositivos] = useState(false);
  // No exporta lo que ya está en memoria: si "Vendidos" todavía no se
  // cargó, `dispositivos` solo tiene lo que está en stock, y el CSV
  // saldría incompleto sin que se note (no hay ningún aviso visual de
  // que falta el historial). Trae todo fresco al momento de exportar.
  const exportarDispositivos = async () => {
    setExportandoDispositivos(true);
    const todos = await obtenerTodasLasFilas<Dispositivo>(supabase, 'dispositivos', COLUMNAS_DISPOSITIVO, ORDEN_DISPOSITIVO);
    descargarCSV(
      'stock-celulares-qovento.csv',
      ['modelo', 'capacidad_gb', 'color', 'imei', 'numero_serie', 'salud_bateria', 'precio', 'costo', 'proveedor', 'estado', 'en_stock', 'created_at'],
      todos
    );
    setExportandoDispositivos(false);
  };

  const prepararImportacion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setPreparando(true);
    setResultadoImport(null);
    setPlanImport(null);

    try {
      const filas = await leerCSV(archivo);
      const imeisExistentes = new Set(dispositivos.map((d) => d.imei).filter(Boolean));
      let omitidosSinModelo = 0;
      let omitidosDuplicado = 0;

      const nuevos = filas
        .map((fila) => {
          const modeloTexto = valorDe(fila, 'modelo', 'category');
          const modelo = modeloTexto ? normalizarNombreModelo(modeloTexto) : null;
          const textoLibre = [valorDe(fila, 'name'), valorDe(fila, 'description')].filter(Boolean).join(' ');

          const imeiDirecto = valorDe(fila, 'imei');
          const imei = imeiDirecto || extraerImei(textoLibre);

          const bateriaDirecta = valorDe(fila, 'salud_bateria', 'bateria');
          const salud_bateria = bateriaDirecta ? Number(bateriaDirecta) : extraerBateria(textoLibre);

          const capacidadDirecta = valorDe(fila, 'capacidad_gb', 'capacidad');
          const capacidad_gb = capacidadDirecta ? Number(capacidadDirecta) : extraerCapacidad(`${modelo || ''} ${textoLibre}`);

          const precioTexto = valorDe(fila, 'precio', 'price');
          const precio = precioTexto ? Number(precioTexto) : null;

          const costoTexto = valorDe(fila, 'costo', 'cost');
          const costo = costoTexto ? Number(costoTexto) : null;

          const cantidadTexto = valorDe(fila, 'quantity');
          const enStockTexto = valorDe(fila, 'en_stock');
          const en_stock = enStockTexto
            ? ['true', '1', 'si', 'sí'].includes(enStockTexto.toLowerCase())
            : cantidadTexto
            ? Number(cantidadTexto) > 0
            : true;

          const creadoTexto = valorDe(fila, 'created_at', 'createdat');
          const fechaCreado = creadoTexto ? new Date(creadoTexto) : null;

          if (!modelo) {
            omitidosSinModelo++;
            return null;
          }

          const actor = getActor();
          return {
            modelo,
            capacidad_gb: capacidad_gb || null,
            color: valorDe(fila, 'color') || null,
            imei: imei || null,
            numero_serie: valorDe(fila, 'numero_serie', 'serial') || null,
            salud_bateria,
            precio,
            costo,
            estado: valorDe(fila, 'estado') || 'usado',
            en_stock,
            proveedor: valorDe(fila, 'proveedor') || null,
            agregado_por_nombre: actor?.nombre ?? null,
            agregado_por_foto_url: actor?.fotoUrl ?? null,
            ...(fechaCreado && !isNaN(fechaCreado.getTime()) ? { created_at: fechaCreado.toISOString() } : {}),
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .filter((d) => {
          // imeisExistentes se va completando con cada fila aceptada, así
          // que si el mismo CSV trae el mismo IMEI dos veces (típico al
          // re-exportar de otro sistema), la segunda también se detecta
          // como duplicada — antes solo se comparaba contra el stock ya
          // cargado, y ambas filas pasaban.
          const esDuplicado = !!d.imei && imeisExistentes.has(d.imei);
          if (esDuplicado) {
            omitidosDuplicado++;
            return false;
          }
          if (d.imei) imeisExistentes.add(d.imei);
          return true;
        });

      setPlanImport({ filas: nuevos, totalCSV: filas.length, omitidosSinModelo, omitidosDuplicado });
    } catch (err: any) {
      setResultadoImport('No pudimos leer el archivo: ' + (err?.message ?? 'error desconocido'));
    }

    setPreparando(false);
    if (inputImportRef.current) inputImportRef.current.value = '';
  };

  const confirmarImportacion = async () => {
    if (!planImport || !puedeAgregarStock) return;
    setImportando(true);
    setProgresoImport(null);

    const filasConCategoria = categoriaImportId
      ? planImport.filas.map((f) => ({ ...f, categoria_id: categoriaImportId }))
      : planImport.filas;
    const { guardadas, error } = await insertarEnTandas(
      (tanda) => supabase.from('dispositivos').insert(tanda),
      filasConCategoria,
      500,
      (hechas, total) => setProgresoImport({ hechas, total })
    );

    setResultadoImport(
      error
        ? `Se guardaron ${guardadas} de ${planImport.filas.length} antes de un error: ${error}`
        : `Listo: se importaron ${guardadas} dispositivos.`
    );
    setPlanImport(null);
    setImportando(false);
    setProgresoImport(null);
    cargarDispositivos();
  };

  const cancelarImportacion = () => {
    setPlanImport(null);
    setResultadoImport(null);
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
    setMoviendoCarpeta(false);
    setCarpetaDestino('');
  };

  const eliminarSeleccionados = async () => {
    if (!puedeEliminar) return;
    const ids = Array.from(seleccionados);
    if (ids.length === 0) return;
    if (
      !confirm(
        `${t('¿Eliminar')} ${ids.length} ${ids.length === 1 ? t('dispositivo') : t('dispositivos')} ${t('del historial? No se puede deshacer.')}`
      )
    )
      return;

    setEliminandoSeleccion(true);
    const aEliminar = dispositivos.filter((d) => seleccionados.has(d.id));

    const { error } = await supabase.from('dispositivos').delete().in('id', ids);
    if (!error) {
      for (const d of aEliminar) {
        await registrarAuditoria(supabase, {
          accion: `eliminó el dispositivo ${d.modelo || 'sin modelo'}${d.imei ? ` (IMEI ${d.imei})` : ''} del historial`,
          entidad: 'dispositivo',
          entidadId: d.id,
        });
      }
    }

    setEliminandoSeleccion(false);
    salirDeSeleccion();
    cargarDispositivos();
  };

  // Resto de la barra contextual de selección múltiple: marcar stock, mover
  // de carpeta, exportar. `procesandoSeleccion` es compartido por las tres
  // (no corren a la vez, alcanza con un solo flag para deshabilitar botones).
  const [procesandoSeleccion, setProcesandoSeleccion] = useState(false);
  const [moviendoCarpeta, setMoviendoCarpeta] = useState(false);
  const [carpetaDestino, setCarpetaDestino] = useState('');

  const marcarStockSeleccionados = async (enStock: boolean) => {
    if (!puedeAgregarStock) return;
    const ids = Array.from(seleccionados);
    if (ids.length === 0) return;
    setProcesandoSeleccion(true);
    const { error } = await supabase
      .from('dispositivos')
      .update({ en_stock: enStock, ...(enStock ? { en_stock_desde: new Date().toISOString(), alerta_stock_enviada: false } : {}) })
      .in('id', ids);
    if (!error) {
      await registrarAuditoria(supabase, {
        accion: `marcó ${ids.length} dispositivo${ids.length === 1 ? '' : 's'} como ${enStock ? 'en stock' : 'fuera de stock'} (selección múltiple)`,
        entidad: 'dispositivo',
      });
      salirDeSeleccion();
      cargarDispositivos();
    } else {
      alert(`${t('No pudimos actualizar los dispositivos seleccionados:')} ` + error.message);
    }
    setProcesandoSeleccion(false);
  };

  const moverSeleccionadosACarpeta = async () => {
    if (!puedeAgregarStock) return;
    const destino = normalizarNombreModelo(carpetaDestino.trim());
    const ids = Array.from(seleccionados);
    if (!destino || ids.length === 0) return;
    setProcesandoSeleccion(true);
    const { error } = await supabase.from('dispositivos').update({ modelo: destino }).in('id', ids);
    if (!error) {
      await asegurarModelo(supabase, destino);
      await registrarAuditoria(supabase, {
        accion: `movió ${ids.length} dispositivo${ids.length === 1 ? '' : 's'} a la carpeta "${destino}" (selección múltiple)`,
        entidad: 'dispositivo',
      });
      setMoviendoCarpeta(false);
      setCarpetaDestino('');
      salirDeSeleccion();
      cargarDispositivos();
    } else {
      alert(`${t('No pudimos mover los dispositivos seleccionados:')} ` + error.message);
    }
    setProcesandoSeleccion(false);
  };

  const exportarSeleccionados = () => {
    const elegidos = dispositivos.filter((d) => seleccionados.has(d.id));
    descargarCSV(
      'stock-seleccion-qovento.csv',
      ['modelo', 'capacidad_gb', 'color', 'imei', 'numero_serie', 'salud_bateria', 'precio', 'costo', 'proveedor', 'estado', 'en_stock', 'created_at'],
      elegidos
    );
  };

  // Acciones rápidas por dispositivo (menú "···" de cada fila) — mismas
  // operaciones que ya existen en la ficha individual (app/stock/[id]),
  // solo que accesibles sin tener que entrar. Un solo id de menú abierto a
  // la vez, y `procesandoAccion` deshabilita los botones mientras corre.
  const [accionAbiertaId, setAccionAbiertaId] = useState<string | null>(null);
  const [procesandoAccion, setProcesandoAccion] = useState<string | null>(null);

  const toggleStockDispositivo = async (d: Dispositivo) => {
    if (!puedeAgregarStock) return;
    setAccionAbiertaId(null);
    setProcesandoAccion(d.id);
    const volvioAStock = !d.en_stock;
    const { error } = await supabase
      .from('dispositivos')
      .update({
        en_stock: volvioAStock,
        ...(volvioAStock ? { en_stock_desde: new Date().toISOString(), alerta_stock_enviada: false } : {}),
      })
      .eq('id', d.id);
    if (!error) {
      await registrarAuditoria(supabase, {
        accion: `marcó ${d.modelo || 'un dispositivo'}${d.imei ? ` (IMEI ${d.imei})` : ''} como ${volvioAStock ? 'en stock' : 'fuera de stock'}`,
        entidad: 'dispositivo',
        entidadId: d.id,
      });
      cargarDispositivos();
    }
    setProcesandoAccion(null);
  };

  const derivarDispositivoAServicio = async (d: Dispositivo) => {
    if (!puedeRecibirServicioTecnico) return;
    setAccionAbiertaId(null);
    if (
      !confirm(
        `${t('¿Derivar')} ${d.modelo || t('este dispositivo')} ${t('a Servicio Técnico? Sale de Stock y aparece ahí para diagnosticarlo.')}`
      )
    )
      return;
    setProcesandoAccion(d.id);
    const { data: nueva, error: insertError } = await supabase
      .from('reparaciones')
      .insert({ modelo: d.modelo, capacidad_gb: d.capacidad_gb, color: d.color, imei: d.imei, estado: 'recibido' })
      .select('id, numero_orden')
      .single();
    // Si esto falla no seguimos: si igual marcáramos el dispositivo fuera de
    // stock, quedaría "perdido" (ni en Stock ni en Servicio Técnico, sin
    // ninguna reparación real que lo respalde).
    if (insertError || !nueva) {
      alert(`${t('No pudimos derivar el dispositivo a Servicio Técnico:')} ` + (insertError?.message ?? t('error desconocido')));
      setProcesandoAccion(null);
      return;
    }
    const { error: updateError } = await supabase.from('dispositivos').update({ en_stock: false }).eq('id', d.id);
    if (updateError) {
      alert(`${t('Se creó la reparación pero no pudimos sacar el dispositivo de Stock:')} ` + updateError.message);
    }
    await registrarAuditoria(supabase, {
      accion: `derivó de Stock a Servicio Técnico un dispositivo (${nueva.numero_orden || ''}, ${d.modelo || 'sin modelo'}${d.imei ? `, IMEI ${d.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: nueva.id,
    });
    setProcesandoAccion(null);
    cargarDispositivos();
  };

  const eliminarDispositivo = async (d: Dispositivo) => {
    if (!puedeEliminar) return;
    setAccionAbiertaId(null);
    if (!confirm(`${t('¿Eliminar')} ${d.modelo || t('este dispositivo')} ${t('del historial? No se puede deshacer.')}`)) return;
    setProcesandoAccion(d.id);
    const { error } = await supabase.from('dispositivos').delete().eq('id', d.id);
    if (!error) {
      await registrarAuditoria(supabase, {
        accion: `eliminó el dispositivo ${d.modelo || 'sin modelo'}${d.imei ? ` (IMEI ${d.imei})` : ''} del historial`,
        entidad: 'dispositivo',
        entidadId: d.id,
      });
      cargarDispositivos();
    }
    setProcesandoAccion(null);
  };

  useEffect(() => {
    cargarDispositivos();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
    (async () => {
      const data = await obtenerTodasLasFilas<Producto>(supabase, 'productos', '*', [{ columna: 'nombre' }]);
      // Catálogo de accesorios todavía vacío: se carga el set inicial acá
      // mismo, sin pedirle a nadie que active nada — a diferencia de
      // Servicios/Trabajos (que sí quedan como catálogo manual porque cada
      // taller ofrece arreglos distintos), estos accesorios genéricos
      // (AirPods, cargadores, fundas, etc.) le sirven a cualquier negocio
      // desde el primer momento.
      if (data.length === 0 && puedeAgregarStock) {
        const { error: insertError } = await supabase
          .from('productos')
          .insert(ACCESORIOS_DEFAULT.map((a) => ({ nombre: a.nombre, imagen_url: a.imagen })));
        if (!insertError) {
          await registrarAuditoria(supabase, {
            accion: `cargó el catálogo de accesorios por defecto (${ACCESORIOS_DEFAULT.length} accesorios)`,
            entidad: 'producto',
            valorNuevo: { accesorios: ACCESORIOS_DEFAULT.map((a) => a.nombre) },
          });
          setProductos(await obtenerTodasLasFilas<Producto>(supabase, 'productos', '*', [{ columna: 'nombre' }]));
          setLoadingProductos(false);
          return;
        }
      }
      setProductos(data);
      setLoadingProductos(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Para la alerta de reposición contamos el stock real de cada modelo,
  // sin importar qué pestaña (En stock / Historial) esté activa. Se necesita
  // antes que "filtrados" porque la vista rápida "Por reponer" lo usa.
  const conteoEnStockPorModelo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const d of dispositivos) {
      if (!d.en_stock) continue;
      const clave = d.modelo || 'Sin modelo';
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    return mapa;
  }, [dispositivos]);

  // Un dispositivo en stock cuenta como "dato incompleto" si le falta algo
  // relevante para venderlo bien: precio, costo, color o capacidad. Se usa
  // en la vista rápida y en el indicador financiero de más arriba.
  const dispositivoIncompleto = (d: Dispositivo) => d.precio == null || d.costo == null || !d.color || !d.capacidad_gb;

  const cumpleFiltroRapido = (d: Dispositivo) => {
    switch (filtroRapido) {
      case 'bateria_baja':
        return d.salud_bateria != null && d.salud_bateria < 80;
      case 'sellados':
        return d.estado === 'sellado';
      case 'por_reponer':
        return d.en_stock && (conteoEnStockPorModelo.get(d.modelo || 'Sin modelo') ?? 0) < 3;
      case 'sin_precio':
        return d.precio == null;
      case 'sin_costo':
        return d.costo == null;
      case 'incompletos':
        return dispositivoIncompleto(d);
      default:
        return true;
    }
  };

  const filtrados = useMemo(() => {
    const q = busquedaDebounced.trim().toLowerCase();
    const qImei = q.replace(/\s+/g, '');
    return dispositivos.filter((d) => {
      if (vista === 'stock' && !d.en_stock) return false;
      if (vista === 'vendidos' && d.en_stock) return false;
      if (!cumpleFiltroRapido(d)) return false;
      if (!q) return true;
      // Modelo, serie y color con espacios normales; el IMEI se compara
      // también sin espacios (así encuentra uno pegado de Ajustes del
      // iPhone, que a veces lo copia con espacios adentro).
      const campos = [d.modelo, d.numero_serie, d.color, puedeVerCapital ? d.proveedor : null].filter(Boolean) as string[];
      if (campos.some((campo) => campo.toLowerCase().includes(q))) return true;
      if (d.imei && qImei.length >= 3 && d.imei.replace(/\s+/g, '').toLowerCase().includes(qImei)) return true;
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispositivos, busquedaDebounced, vista, filtroRapido, conteoEnStockPorModelo, puedeVerCapital]);

  // Si la búsqueda es un IMEI exacto, esa carpeta pasa primera en la lista
  // — no hace falta buscar entre las demás para encontrar el equipo.
  const imeiExactoModelo = useMemo(() => {
    const q = busquedaDebounced.trim().replace(/\s+/g, '');
    if (q.length < 6) return null;
    return dispositivos.find((d) => d.imei && d.imei.replace(/\s+/g, '') === q)?.modelo ?? null;
  }, [dispositivos, busquedaDebounced]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Dispositivo[]>();
    if (!busquedaDebounced.trim() && filtroRapido === 'todos' && vista !== 'vendidos') {
      for (const nombre of carpetas) mapa.set(nombre, []);
    }
    for (const d of filtrados) {
      const clave = d.modelo || 'Sin modelo';
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(d);
    }
    // Dentro de cada carpeta, agrupados por capacidad ascendente (todos los
    // de 128GB primero, después todos los de 256GB, etc.) en vez de mezclados
    // por fecha de carga.
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.capacidad_gb ?? Infinity) - (b.capacidad_gb ?? Infinity));
    }
    const ordenado = Array.from(mapa.entries()).sort(([a], [b]) => compararModelosPorSalida(a, b));
    const clave = imeiExactoModelo || 'Sin modelo';
    const idx = imeiExactoModelo != null ? ordenado.findIndex(([nombre]) => nombre === clave) : -1;
    if (idx > 0) {
      const [grupo] = ordenado.splice(idx, 1);
      ordenado.unshift(grupo);
    }
    return ordenado;
  }, [filtrados, carpetas, busquedaDebounced, vista, filtroRapido, imeiExactoModelo]);

  // Carpetas vacías ocultas por defecto (no aportan nada operativo la
  // mayoría del tiempo) — con una opción para mostrarlas igual.
  const gruposVacios = useMemo(() => grupos.filter(([, items]) => items.length === 0).length, [grupos]);
  const gruposVisibles = useMemo(
    () => (mostrarVacias ? grupos : grupos.filter(([, items]) => items.length > 0)),
    [grupos, mostrarVacias]
  );

  // Capital invertido en stock: celulares en stock + accesorios (cantidad ×
  // costo/precio). A diferencia de antes, un campo AUSENTE (null) ya no se
  // trata como si fuera $0: un dispositivo sin costo cargado simplemente no
  // entra en la cuenta de "Invertido", en vez de sumar $0 y hacer parecer
  // que no costó nada. Cada indicador informa cuántos ítems entraron en el
  // cálculo, para que la plata mostrada nunca se confunda con "así de bajo
  // es de verdad".
  const capital = useMemo(() => {
    const enStock = dispositivos.filter((d) => d.en_stock);
    const unidadesAcc = productos.reduce((a, p) => a + p.cantidad, 0);
    const totalItems = enStock.length + unidadesAcc;

    const celConCosto = enStock.filter((d) => d.costo != null);
    const accConCosto = productos.filter((p) => p.costo != null && p.cantidad > 0);
    const costo = celConCosto.reduce((a, d) => a + (d.costo || 0), 0) + accConCosto.reduce((a, p) => a + (p.costo || 0) * p.cantidad, 0);
    const costoCobertura = celConCosto.length + accConCosto.reduce((a, p) => a + p.cantidad, 0);

    const celConPrecio = enStock.filter((d) => d.precio != null);
    const accConPrecio = productos.filter((p) => p.precio != null && p.cantidad > 0);
    const venta = celConPrecio.reduce((a, d) => a + (d.precio || 0), 0) + accConPrecio.reduce((a, p) => a + (p.precio || 0) * p.cantidad, 0);
    const ventaCobertura = celConPrecio.length + accConPrecio.reduce((a, p) => a + p.cantidad, 0);

    // Ganancia SOLO sobre los ítems que tienen costo Y precio a la vez —
    // nunca restando un costo ausente (eso inflaría la ganancia).
    const celConAmbos = enStock.filter((d) => d.costo != null && d.precio != null);
    const accConAmbos = productos.filter((p) => p.costo != null && p.precio != null && p.cantidad > 0);
    const ganancia =
      celConAmbos.reduce((a, d) => a + ((d.precio || 0) - (d.costo || 0)), 0) +
      accConAmbos.reduce((a, p) => a + ((p.precio || 0) - (p.costo || 0)) * p.cantidad, 0);
    const gananciaCobertura = celConAmbos.length + accConAmbos.reduce((a, p) => a + p.cantidad, 0);

    const incompletos = enStock.filter(dispositivoIncompleto).length;

    return {
      costo,
      costoCobertura,
      venta,
      ventaCobertura,
      ganancia,
      gananciaCobertura,
      totalItems,
      incompletos,
      unidadesCel: enStock.length,
      unidadesAcc,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispositivos, productos]);

  // Cuántos productos hay por categoría — para los chips de filtro. Los
  // productos sin categoria_id (negocios que todavía no corrieron la
  // migración, o productos de antes del backfill) cuentan como "Sin
  // categoría", nunca se pierden de la cuenta total.
  const conteoPorCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of productos) {
      const clave = p.categoria_id || '__sin_categoria__';
      mapa.set(clave, (mapa.get(clave) || 0) + 1);
    }
    return mapa;
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    if (!filtroCategoriaProducto) return productos;
    if (filtroCategoriaProducto === '__sin_categoria__') return productos.filter((p) => !p.categoria_id);
    return productos.filter((p) => p.categoria_id === filtroCategoriaProducto);
  }, [productos, filtroCategoriaProducto]);

  const agregarProducto = async () => {
    if (!nombreProducto.trim() || !puedeAgregarStock) return;
    setGuardandoProducto(true);
    setErrorProducto(null);
    // Serializado = un registro es UNA unidad con identidad propia (como un
    // celular): cantidad siempre 1, no tiene sentido pedir "cantidad inicial".
    // Por cantidad = varias unidades idénticas bajo el mismo registro.
    const esSerializado = categoriasStock.length > 0 && modalidadProducto === 'serializado';
    const proveedorId = mostrarMasCamposProducto ? await asegurarProveedor(supabase, proveedorProducto) : null;
    const { error: insertError } = await supabase.from('productos').insert({
      nombre: nombreProducto.trim(),
      precio: precioProducto ? Number(precioProducto) : null,
      costo: costoProducto ? Number(costoProducto) : null,
      cantidad: esSerializado ? 1 : Math.max(0, Math.floor(Number(cantidadInicialProducto) || 0)),
      ...(categoriaProducto ? { categoria_id: categoriaProducto, modalidad: modalidadProducto } : {}),
      ...(esSerializado ? { marca: marcaProducto.trim() || null, numero_serie: numeroSerieProducto.trim() || null } : {}),
      ...(mostrarMasCamposProducto
        ? {
            sku: skuProducto.trim() || null,
            codigo_barras: codigoBarrasProducto.trim() || null,
            proveedor_id: proveedorId,
            stock_minimo: stockMinimoProducto ? Math.max(0, Math.floor(Number(stockMinimoProducto))) : null,
            garantia_dias: garantiaDiasProducto ? Math.max(0, Math.floor(Number(garantiaDiasProducto))) : null,
            descripcion: descripcionProducto.trim() || null,
            notas: notasProducto.trim() || null,
          }
        : {}),
    });
    if (insertError) {
      setErrorProducto(`${t('No pudimos guardar:')} ` + insertError.message);
      setGuardandoProducto(false);
      return;
    }
    setNombreProducto('');
    setPrecioProducto('');
    setCostoProducto('');
    setMarcaProducto('');
    setNumeroSerieProducto('');
    setCantidadInicialProducto('1');
    setSkuProducto('');
    setCodigoBarrasProducto('');
    setProveedorProducto('');
    setStockMinimoProducto('');
    setGarantiaDiasProducto('');
    setDescripcionProducto('');
    setNotasProducto('');
    setMostrarMasCamposProducto(false);
    setGuardandoProducto(false);
    cargarProductos();
  };

  const eliminarProducto = async (id: string) => {
    if (!puedeEliminar) return;
    if (!confirm(t('¿Eliminar este producto?'))) return;
    const producto = productos.find((p) => p.id === id);
    await supabase.from('productos').delete().eq('id', id);
    await registrarAuditoria(supabase, {
      accion: `eliminó un accesorio del Stock (${producto?.nombre || 'sin nombre'})`,
      entidad: 'producto',
      entidadId: id,
      valorAnterior: producto ? { nombre: producto.nombre, cantidad: producto.cantidad, precio: producto.precio } : null,
    });
    cargarProductos();
  };

  const abrirEdicionCantidad = (p: Producto) => {
    const abrir = editandoCantidad !== p.id;
    setEditandoCantidad(abrir ? p.id : null);
    if (abrir) {
      setValorCantidad(String(p.cantidad));
      setValorCosto(p.costo != null ? String(p.costo) : '');
      setValorPrecio(p.precio != null ? String(p.precio) : '');
    }
  };

  const guardarCantidad = async (p: Producto) => {
    const nueva = Math.round(Number(valorCantidad) || 0);
    const costoNuevo = valorCosto ? Number(valorCosto) : null;
    const precioNuevo = valorPrecio ? Number(valorPrecio) : null;
    const cambioCantidad = nueva - p.cantidad;
    const cambianOtros = costoNuevo !== (p.costo ?? null) || precioNuevo !== (p.precio ?? null);
    if (cambioCantidad === 0 && !cambianOtros) {
      setEditandoCantidad(null);
      return;
    }
    const actorProducto = getActor();
    // La cantidad se mueve por el RPC atómico producto_mover_stock (select
    // ... for update, nunca la deja negativa, deja rastro en
    // producto_movimientos) — antes era un update directo con la cantidad
    // capturada al abrir el editor, así que dos ediciones simultáneas del
    // mismo producto (o una pestaña vieja) se pisaban entre sí sin avisar.
    if (cambioCantidad !== 0) {
      const { error: movError } = await supabase.rpc('producto_mover_stock', {
        p_producto_id: p.id,
        p_tipo: 'ajuste',
        p_cantidad: cambioCantidad,
        p_motivo: 'Edición manual desde Stock',
        p_usuario: actorProducto?.nombre ?? null,
      });
      if (movError) {
        // Si el negocio todavía no corrió categorias_stock_supabase.sql, este
        // RPC no existe — no bloqueamos una función tan básica por eso, se
        // cae al update directo de siempre (mismo comportamiento que había).
        const migracionNoCorrida = /producto_mover_stock|schema cache/i.test(movError.message);
        if (!migracionNoCorrida) {
          setErrorProducto(`${t('No pudimos actualizar la cantidad:')} ` + movError.message);
          return;
        }
        await supabase.from('productos').update({ cantidad: nueva }).eq('id', p.id);
      }
    }
    if (cambianOtros) {
      await supabase.from('productos').update({ costo: costoNuevo, precio: precioNuevo }).eq('id', p.id);
    }
    await registrarAuditoria(supabase, {
      accion: `editó el accesorio "${p.nombre}"`,
      entidad: 'producto',
      entidadId: p.id,
      valorAnterior: { cantidad: p.cantidad, costo: p.costo, precio: p.precio },
      valorNuevo: { cantidad: nueva, costo: costoNuevo, precio: precioNuevo },
    });
    setEditandoCantidad(null);
    cargarProductos();
  };

  const cambiarImagenProducto = (p: Producto, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setProductos((ps) => ps.map((x) => (x.id === p.id ? { ...x, imagen_url: dataUrl } : x)));
      await supabase.from('productos').update({ imagen_url: dataUrl }).eq('id', p.id);
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/" className="text-2xl leading-none shrink-0">
          &larr;
        </Link>
        <div className="min-w-0 mr-auto">
          <p className="text-lg font-medium leading-tight">{t('Stock')}</p>
          <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
            {tab === 'celulares'
              ? vista === 'stock'
                ? `${capital.unidadesCel} ${capital.unidadesCel === 1 ? t('dispositivo disponible') : t('dispositivos disponibles')}`
                : `${totalVendidos} ${totalVendidos === 1 ? t('dispositivo vendido') : t('dispositivos vendidos')}`
              : `${productos.length} ${productos.length === 1 ? t('accesorio en catálogo') : t('accesorios en catálogo')}`}
          </p>
        </div>

        {tab === 'celulares' && (
          <div className="flex items-center gap-1.5 shrink-0">
            {puedeAgregarStock && (
              <div className="relative">
                <button
                  onClick={() => setMenuAbierto(menuAbierto === 'agregar' ? null : 'agregar')}
                  className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-3 py-2 text-xs font-medium text-white"
                >
                  + {t('Agregar')}
                </button>
                {menuAbierto === 'agregar' && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated py-1 z-30">
                    <p className="px-3.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary">
                      {t('Celular')}
                    </p>
                    <Link
                      href="/stock/nuevo"
                      onClick={() => setMenuAbierto(null)}
                      className="block px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg"
                    >
                      {t('Cargar a mano')}
                    </Link>
                    <Link
                      href="/stock/foto"
                      onClick={() => setMenuAbierto(null)}
                      className="block px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg"
                    >
                      {t('Cargar con foto')}
                    </Link>
                    <div className="my-1 border-t border-border dark:border-dark-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuAbierto(null);
                        setTab('accesorios');
                      }}
                      className="block w-full text-left px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg"
                    >
                      {t('Otro producto (no celular)')}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setMenuAbierto(menuAbierto === 'mas' ? null : 'mas')}
                className="rounded-lg border border-border dark:border-dark-border px-2.5 py-2 text-sm leading-none"
                aria-label={t('Más acciones')}
              >
                ···
              </button>
              {menuAbierto === 'mas' && (
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated py-1 z-30 flex flex-col">
                  {puedeAgregarStock && (
                    <label className="px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg cursor-pointer">
                      {preparando
                        ? t('Leyendo archivo...')
                        : importando
                        ? progresoImport
                          ? `${t('Importando...')} ${progresoImport.hechas}/${progresoImport.total}`
                          : t('Importando...')
                        : t('Importar CSV')}
                      <input
                        ref={inputImportRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        disabled={preparando || importando}
                        onChange={(e) => {
                          setMenuAbierto(null);
                          prepararImportacion(e);
                        }}
                      />
                    </label>
                  )}
                  <button
                    onClick={() => {
                      setMenuAbierto(null);
                      exportarDispositivos();
                    }}
                    disabled={totalDispositivos === 0 || exportandoDispositivos}
                    className="px-3.5 py-2.5 text-sm text-left hover:bg-canvas dark:hover:bg-dark-bg disabled:opacity-40"
                  >
                    {exportandoDispositivos ? t('Exportando...') : t('Exportar CSV')}
                  </button>
                  <Link
                    href="/stock/carpetas"
                    onClick={() => setMenuAbierto(null)}
                    className="px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg"
                  >
                    {t('Administrar carpetas')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {menuAbierto && <div className="fixed inset-0 z-20" onClick={() => setMenuAbierto(null)} />}
      {accionAbiertaId && <div className="fixed inset-0 z-20" onClick={() => setAccionAbiertaId(null)} />}
      {carpetaMenuAbierta && <div className="fixed inset-0 z-20" onClick={() => setCarpetaMenuAbierta(null)} />}

      {puedeVerCapital && (
        <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary mb-2">
            {t('Capital en stock')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <IndicadorCapital
              etiqueta={t('Invertido (a costo)')}
              valor={capital.costo}
              cobertura={capital.costoCobertura}
              total={capital.totalItems}
            />
            <IndicadorCapital
              etiqueta={t('Valor de venta')}
              valor={capital.venta}
              cobertura={capital.ventaCobertura}
              total={capital.totalItems}
            />
            <IndicadorCapital
              etiqueta={t('Ganancia potencial')}
              valor={capital.ganancia}
              cobertura={capital.gananciaCobertura}
              total={capital.totalItems}
              tono="text-good"
            />
            <button
              type="button"
              onClick={() => {
                setTab('celulares');
                setVista('stock');
                setFiltroRapido(filtroRapido === 'incompletos' ? 'todos' : 'incompletos');
              }}
              className="flex flex-col items-center justify-center rounded-lg -m-1 p-1 hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
            >
              <p className={`text-lg font-display font-semibold ${capital.incompletos > 0 ? 'text-warn' : ''}`}>
                {capital.incompletos}
              </p>
              <p
                className={`text-[11px] ${
                  filtroRapido === 'incompletos'
                    ? 'text-accent dark:text-dark-accent underline decoration-dotted'
                    : 'text-muted dark:text-dark-text-secondary'
                }`}
              >
                {t('Datos incompletos')}
              </p>
            </button>
          </div>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-2.5 text-center">
            {capital.unidadesCel} {capital.unidadesCel === 1 ? t('dispositivo en stock') : t('dispositivos en stock')} · {capital.unidadesAcc}{' '}
            {capital.unidadesAcc === 1 ? t('accesorio') : t('accesorios')}. {t('Cada indicador cuenta solo los ítems con ese dato cargado.')}
          </p>
        </div>
      )}

      <div className="flex items-center gap-1 self-start rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-1 text-sm">
        <button
          onClick={() => setTab('celulares')}
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            tab === 'celulares' ? 'bg-accent dark:bg-dark-accent text-white' : 'text-ink dark:text-dark-text'
          }`}
        >
          {t('Dispositivos')} <span className="opacity-70">{totalDispositivos}</span>
        </button>
        <button
          onClick={() => setTab('accesorios')}
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            tab === 'accesorios' ? 'bg-accent dark:bg-dark-accent text-white' : 'text-ink dark:text-dark-text'
          }`}
        >
          {t('Productos')} <span className="opacity-70">{productos.length}</span>
        </button>
      </div>

      {tab === 'celulares' ? (
        <>
          <div className="sticky top-0 z-10 -mx-6 px-6 py-2.5 bg-canvas dark:bg-dark-bg flex flex-col gap-2.5 border-b border-border/60 dark:border-dark-border/60">
            <div className="relative">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t('Buscar por modelo, IMEI, serie, código, color o proveedor…')}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl pl-4 pr-9 py-3 text-sm"
              />
              {busqueda && (
                <button
                  onClick={() => setBusqueda('')}
                  aria-label={t('Limpiar búsqueda')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full text-muted dark:text-dark-text-secondary hover:bg-canvas dark:hover:bg-dark-bg flex items-center justify-center"
                >
                  ✕
                </button>
              )}
            </div>

            {busquedaDebounced.trim() && (
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {filtrados.length} {filtrados.length === 1 ? t('resultado') : t('resultados')}
              </p>
            )}

            <div className="flex items-center gap-1 self-start rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-1 text-sm shrink-0">
              <button
                onClick={() => setVista('stock')}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  vista === 'stock' ? 'bg-accent dark:bg-dark-accent text-white' : 'text-ink dark:text-dark-text'
                }`}
              >
                {t('En stock')} <span className="opacity-70">{capital.unidadesCel}</span>
              </button>
              <button
                onClick={() => setVista('vendidos')}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  vista === 'vendidos' ? 'bg-accent dark:bg-dark-accent text-white' : 'text-ink dark:text-dark-text'
                }`}
              >
                {t('Vendidos')} <span className="opacity-70">{totalVendidos}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs overflow-x-auto">
              {VISTAS_RAPIDAS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setFiltroRapido(v.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 font-medium ${
                    filtroRapido === v.id
                      ? 'bg-accent dark:bg-dark-accent text-white'
                      : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                  }`}
                >
                  {t(v.label)}
                </button>
              ))}
            </div>
          </div>

          {planImport && puedeAgregarStock && (
            <div className="rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft dark:bg-dark-accent-soft p-3.5 flex flex-col gap-2.5">
              <p className="text-sm font-medium">{t('Revisá antes de confirmar')}</p>
              <ul className="text-xs text-muted dark:text-dark-text-secondary flex flex-col gap-1">
                <li>El archivo tiene {planImport.totalCSV} filas.</li>
                <li>
                  Se van a importar <strong className="text-ink dark:text-dark-text">{planImport.filas.length}</strong> dispositivos
                  nuevos.
                </li>
                {planImport.omitidosDuplicado > 0 && (
                  <li>
                    {t('Se omiten')} <strong className="text-ink dark:text-dark-text">{planImport.omitidosDuplicado}</strong>{' '}
                    {t('por tener el mismo IMEI que uno que ya tenés cargado (para no duplicar).')}
                  </li>
                )}
                {planImport.omitidosSinModelo > 0 && (
                  <li>
                    {t('Se omiten')} {planImport.omitidosSinModelo} {t('filas sin modelo reconocible.')}
                  </li>
                )}
              </ul>
              {categoriasStock.filter((c) => c.perfil_default === 'dispositivo').length > 1 && (
                <div>
                  <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
                    {t('Categoría para todo lo importado')}
                  </label>
                  <select
                    value={categoriaImportId}
                    onChange={(e) => setCategoriaImportId(e.target.value)}
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  >
                    {categoriasStock
                      .filter((c) => c.perfil_default === 'dispositivo')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={cancelarImportacion}
                  disabled={importando}
                  className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-xs font-medium disabled:opacity-40"
                >
                  {t('Cancelar')}
                </button>
                <button
                  onClick={confirmarImportacion}
                  disabled={importando || planImport.filas.length === 0}
                  className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  {importando
                    ? progresoImport
                      ? `${t('Importando...')} ${progresoImport.hechas}/${progresoImport.total}`
                      : t('Importando...')
                    : `${t('Confirmar e importar')} ${planImport.filas.length}`}
                </button>
              </div>
            </div>
          )}

          {resultadoImport && (
            <p className="text-xs bg-canvas dark:bg-dark-bg rounded-lg px-3 py-2 text-muted dark:text-dark-text-secondary">
              {resultadoImport}
            </p>
          )}

          {modoSeleccion ? (
            <div className="sticky top-0 z-10 rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft dark:bg-dark-accent-soft px-4 py-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {seleccionados.size} {seleccionados.size === 1 ? t('seleccionado') : t('seleccionados')}
                </p>
                <button onClick={salirDeSeleccion} className="text-xs text-muted dark:text-dark-text-secondary underline">
                  {t('Cancelar')}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {puedeAgregarStock && (
                  <>
                    <button
                      onClick={() => marcarStockSeleccionados(true)}
                      disabled={seleccionados.size === 0 || procesandoSeleccion}
                      className="rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-xs font-medium px-3 py-1.5 disabled:opacity-40"
                    >
                      {t('Marcar en stock')}
                    </button>
                    <button
                      onClick={() => marcarStockSeleccionados(false)}
                      disabled={seleccionados.size === 0 || procesandoSeleccion}
                      className="rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-xs font-medium px-3 py-1.5 disabled:opacity-40"
                    >
                      {t('Marcar fuera de stock')}
                    </button>
                    <button
                      onClick={() => setMoviendoCarpeta((v) => !v)}
                      disabled={seleccionados.size === 0}
                      className="rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-xs font-medium px-3 py-1.5 disabled:opacity-40"
                    >
                      {t('Mover de carpeta')}
                    </button>
                  </>
                )}
                <button
                  onClick={exportarSeleccionados}
                  disabled={seleccionados.size === 0}
                  className="rounded-lg bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-xs font-medium px-3 py-1.5 disabled:opacity-40"
                >
                  {t('Exportar seleccionados')}
                </button>
              </div>

              {moviendoCarpeta && (
                <div className="flex items-center gap-2">
                  <input
                    value={carpetaDestino}
                    onChange={(e) => setCarpetaDestino(e.target.value)}
                    list="carpetas-mover-seleccion"
                    placeholder={t('Carpeta destino (ej. iPhone 13)')}
                    autoFocus
                    className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <datalist id="carpetas-mover-seleccion">
                    {carpetas.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <button
                    onClick={moverSeleccionadosACarpeta}
                    disabled={!carpetaDestino.trim() || procesandoSeleccion}
                    className="rounded-lg bg-accent dark:bg-dark-accent text-white text-xs font-medium px-3 py-2 disabled:opacity-40 shrink-0"
                  >
                    {t('Mover')}
                  </button>
                </div>
              )}

              {puedeEliminar && (
                <div className="pt-1.5 border-t border-accent/20 dark:border-dark-accent/20 flex justify-end">
                  <button
                    onClick={eliminarSeleccionados}
                    disabled={seleccionados.size === 0 || eliminandoSeleccion}
                    className="rounded-lg bg-bad text-white text-xs font-medium px-3 py-1.5 disabled:opacity-40"
                  >
                    {eliminandoSeleccion ? t('Eliminando...') : t('Eliminar')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            (puedeEliminar || puedeAgregarStock) && (
              <button
                onClick={() => setModoSeleccion(true)}
                className="self-start text-xs text-accent dark:text-dark-accent underline"
              >
                {t('Seleccionar varios')}
              </button>
            )
          )}

          {(loading || (vista === 'vendidos' && cargandoVendidos)) && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {vista === 'vendidos' && cargandoVendidos
                ? `${t('Cargando el historial de vendidos')}${totalVendidos ? ` (${totalVendidos})` : ''}...`
                : t('Cargando...')}
            </p>
          )}

          {!loading && !(vista === 'vendidos' && cargandoVendidos) && grupos.length === 0 && (
            <>
              {busqueda ? (
                <QoviState
                  escena="sinResultados"
                  tamano="sm"
                  titulo={t('No encontramos resultados')}
                  descripcion={`${t('Nada coincide con')} "${busqueda}" ${t('en esta sección.')}`}
                  accionSecundaria={{ label: t('Limpiar búsqueda'), onClick: () => setBusqueda('') }}
                />
              ) : vista === 'vendidos' ? (
                <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
                  {t('Todavía no marcaste ningún dispositivo como vendido.')}
                </p>
              ) : (
                <QoviState
                  escena="stockVacio"
                  titulo={t('Todavía no hay productos en esta sección')}
                  descripcion={t('Cargá tu primer dispositivo para empezar a llevar el inventario.')}
                  accionPrimaria={puedeAgregarStock ? { label: `+ ${t('Nuevo dispositivo')}`, href: '/stock/nuevo' } : undefined}
                />
              )}
            </>
          )}

          {!loading && grupos.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted dark:text-dark-text-secondary">
              <button onClick={expandirTodas} className="underline decoration-dotted hover:text-ink dark:hover:text-dark-text">
                {t('Expandir todas')}
              </button>
              <button onClick={contraerTodas} className="underline decoration-dotted hover:text-ink dark:hover:text-dark-text">
                {t('Contraer todas')}
              </button>
              {gruposVacios > 0 && (
                <button
                  onClick={() => setMostrarVacias((v) => !v)}
                  className="ml-auto underline decoration-dotted hover:text-ink dark:hover:text-dark-text"
                >
                  {mostrarVacias ? t('Ocultar') : t('Mostrar')} {gruposVacios}{' '}
                  {gruposVacios === 1 ? t('carpeta vacía') : t('carpetas vacías')}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-5">
            {gruposVisibles.map(([modelo, items]) => {
              const enStock = conteoEnStockPorModelo.get(modelo) ?? 0;
              const expandido = items.length === 0 || grupoExpandido(modelo);
              return (
              <div key={modelo} className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => items.length > 0 && toggleGrupo(modelo)}
                    className="text-sm text-muted dark:text-dark-text-secondary font-medium flex items-center gap-2.5 text-left flex-1 min-w-0"
                  >
                    {items.length > 0 && <span className="shrink-0">{expandido ? '▾' : '▸'}</span>}
                    <MiniaturaDispositivo src={imagenPorNombreExacto(modelo, imagenesCarpetas)} size={48} />
                    <span className="truncate">
                      {modelo} · {items.length}
                    </span>
                    {enStock > 0 && enStock < 3 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-bad bg-bad/10 rounded-full px-2 py-0.5 shrink-0">
                        <IconoChico nombre="alerta" /> {t('Quedan')} {enStock} — {t('reponer')}
                      </span>
                    )}
                  </button>
                  {(puedeAgregarStock || puedeEliminar) && modelo !== 'Sin modelo' && (
                    <div className="relative shrink-0">
                      <button
                        onClick={() => setCarpetaMenuAbierta(carpetaMenuAbierta === modelo ? null : modelo)}
                        className="h-8 w-8 rounded-lg hover:bg-canvas dark:hover:bg-dark-bg flex items-center justify-center text-muted dark:text-dark-text-secondary"
                        aria-label={`${t('Más acciones de la carpeta')} ${modelo}`}
                      >
                        ···
                      </button>
                      {carpetaMenuAbierta === modelo && (
                        <div className="absolute right-0 top-full mt-1 w-60 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated py-1 z-30 flex flex-col text-left">
                          {puedeAgregarStock && (
                            <Link
                              href={`/stock/nuevo?modelo=${encodeURIComponent(modelo)}`}
                              onClick={() => setCarpetaMenuAbierta(null)}
                              className="px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg"
                            >
                              {t('Agregar dispositivo acá')}
                            </Link>
                          )}
                          {puedeAgregarStock && (
                            <Link
                              href="/stock/carpetas"
                              onClick={() => setCarpetaMenuAbierta(null)}
                              className="px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg"
                            >
                              {t('Renombrar / administrar')}
                            </Link>
                          )}
                          {puedeEliminar &&
                            (items.length === 0 ? (
                              <button
                                onClick={() => eliminarCarpetaVacia(modelo)}
                                className="px-3.5 py-2.5 text-sm text-left text-bad hover:bg-bad/5 border-t border-border dark:border-dark-border mt-1"
                              >
                                {t('Eliminar carpeta')}
                              </button>
                            ) : (
                              <>
                                <p className="px-3.5 pt-2.5 pb-1 text-xs text-muted dark:text-dark-text-secondary border-t border-border dark:border-dark-border mt-1">
                                  {t('Tiene')} {items.length} {items.length === 1 ? t('dispositivo') : t('dispositivos')} —{' '}
                                  {t('movelos o eliminalos para poder borrar la carpeta.')}
                                </p>
                                <button
                                  onClick={() => eliminarCarpeta(modelo, items)}
                                  disabled={eliminandoCarpeta === modelo}
                                  className="px-3.5 py-2.5 text-sm text-left text-bad hover:bg-bad/5 disabled:opacity-40"
                                >
                                  {eliminandoCarpeta === modelo ? t('Eliminando...') : `${t('Eliminar los')} ${items.length} ${t('dispositivos')}`}
                                </button>
                              </>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {items.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary italic">{t('Carpeta vacía, todavía sin dispositivos.')}</p>
                )}
                {expandido && <div className="flex flex-col gap-2">
                  {items.map((d) => {
                    const colorHex = hexColorDe(d.color);
                    const sellado = d.estado === 'sellado';
                    const seleccionado = seleccionados.has(d.id);
                    const procesando = procesandoAccion === d.id;
                    // Franja de color a la izquierda (4px) en vez del borde
                    // grueso de toda la tarjeta: identifica el color físico
                    // sin gritar. Si no hay color registrado queda gris
                    // neutro; con colores muy claros (blanco, etc.) el borde
                    // derecho de la franja le da contorno para que no se
                    // pierda contra la tarjeta blanca.
                    const franjaClase = `absolute left-0 top-0 bottom-0 w-1 ${
                      colorHex ? 'border-r border-black/10 dark:border-white/10' : 'bg-border dark:bg-dark-border'
                    }`;
                    const clases = `relative overflow-hidden rounded-xl pl-3.5 pr-3 py-2.5 flex items-center gap-3 w-full text-left border border-border dark:border-dark-border ${
                      d.en_stock ? 'bg-white dark:bg-dark-surface' : 'bg-white dark:bg-dark-surface opacity-60'
                    } ${sellado ? 'bg-amber-50/70 dark:bg-amber-400/[0.06]' : ''} ${
                      seleccionado ? 'ring-2 ring-accent dark:ring-dark-accent' : ''
                    }`;
                    const imgColor = imagenColorDeModelo(d.modelo, d.color);
                    const contenido = (
                      <>
                        <span className={franjaClase} style={colorHex ? { backgroundColor: colorHex } : undefined} />
                        {modoSeleccion && (
                          <span
                            className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                              seleccionado
                                ? 'bg-accent dark:bg-dark-accent border-accent dark:border-dark-accent'
                                : 'border-border dark:border-dark-border'
                            }`}
                          >
                            {seleccionado && <span className="text-white text-[10px]">✓</span>}
                          </span>
                        )}
                        {imgColor && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgColor}
                            alt={d.color || ''}
                            loading="lazy"
                            className="h-10 w-auto object-contain shrink-0 transition-transform duration-300 ease-out hover:animate-flotarLeve hover:drop-shadow-md"
                          />
                        )}
                        <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                          <div className="min-w-0">
                            <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                              <span>
                                {d.capacidad_gb ? `${d.capacidad_gb} GB` : t('Capacidad s/d')}
                                {d.color ? ` · ${d.color}` : ` · ${t('Sin color')}`}
                              </span>
                              <span className="text-xs text-muted dark:text-dark-text-secondary font-mono">
                                {d.imei || t('sin IMEI')}
                              </span>
                              {d.salud_bateria != null && (
                                <span className={d.salud_bateria < 80 ? 'inline-flex items-center gap-1 text-[10px] font-semibold text-warn bg-warn/10 rounded-full px-2 py-0.5' : 'text-xs text-muted dark:text-dark-text-secondary'}>
                                  {d.salud_bateria < 80 ? (
                                    <>
                                      <IconoChico nombre="alerta" /> {d.salud_bateria}% {t('batería')}
                                    </>
                                  ) : (
                                    `${d.salud_bateria}%`
                                  )}
                                </span>
                              )}
                              {sellado && (
                                <span className="text-[10px] font-bold text-black bg-gradient-to-b from-amber-300 to-amber-500 border border-black/40 rounded-full px-2 py-0.5">
                                  ✦ {t('SELLADO')}
                                </span>
                              )}
                            </p>
                            {(d.detalles || d.agregado_por_nombre) && (
                              <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                                {d.detalles && (
                                  <span className="inline-flex items-center gap-1 text-warn">
                                    <IconoChico nombre="documento" /> {d.detalles}
                                  </span>
                                )}
                                {d.detalles && d.agregado_por_nombre && ' · '}
                                {d.agregado_por_nombre && `${t('Agregado por')} ${d.agregado_por_nombre}`}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-medium">
                              {d.precio != null ? `$${d.precio.toLocaleString('es-AR')}` : (
                                <span className="text-muted dark:text-dark-text-secondary font-normal">{t('Sin precio')}</span>
                              )}
                            </p>
                            {vista === 'vendidos' && (
                              <p className="text-xs text-muted dark:text-dark-text-secondary">{t('vendido')}</p>
                            )}
                          </div>
                        </div>
                      </>
                    );

                    const fila = modoSeleccion ? (
                      <button key={`fila-${d.id}`} onClick={() => toggleSeleccion(d.id)} className={clases}>
                        {contenido}
                      </button>
                    ) : (
                      <Link key={`fila-${d.id}`} href={`/stock/${d.id}`} className={clases}>
                        {contenido}
                      </Link>
                    );

                    return (
                      <div key={d.id} className="relative flex items-center gap-1">
                        {fila}
                        {!modoSeleccion && (
                          <div className="relative shrink-0">
                            <button
                              onClick={() => setAccionAbiertaId(accionAbiertaId === d.id ? null : d.id)}
                              disabled={procesando}
                              aria-label={`${t('Más acciones de')} ${d.modelo || t('este dispositivo')}`}
                              className="h-10 w-10 rounded-lg border border-border dark:border-dark-border text-muted dark:text-dark-text-secondary hover:bg-canvas dark:hover:bg-dark-bg flex items-center justify-center disabled:opacity-40"
                            >
                              {procesando ? '…' : '···'}
                            </button>
                            {accionAbiertaId === d.id && (
                              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated py-1 z-30 flex flex-col">
                                <Link
                                  href={`/stock/${d.id}`}
                                  onClick={() => setAccionAbiertaId(null)}
                                  className="px-3.5 py-2.5 text-sm hover:bg-canvas dark:hover:bg-dark-bg"
                                >
                                  {t('Ver ficha')}
                                </Link>
                                {puedeAgregarStock && (
                                  <button
                                    onClick={() => toggleStockDispositivo(d)}
                                    className="px-3.5 py-2.5 text-sm text-left hover:bg-canvas dark:hover:bg-dark-bg"
                                  >
                                    {d.en_stock ? t('Marcar fuera de stock') : t('Volver a stock')}
                                  </button>
                                )}
                                {d.en_stock && puedeRecibirServicioTecnico && (
                                  <button
                                    onClick={() => derivarDispositivoAServicio(d)}
                                    className="px-3.5 py-2.5 text-sm text-left hover:bg-canvas dark:hover:bg-dark-bg"
                                  >
                                    {t('Derivar a Servicio Técnico')}
                                  </button>
                                )}
                                {puedeEliminar && (
                                  <button
                                    onClick={() => eliminarDispositivo(d)}
                                    className="px-3.5 py-2.5 text-sm text-left text-bad hover:bg-bad/5 border-t border-border dark:border-dark-border mt-1"
                                  >
                                    {t('Eliminar del historial')}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>}
              </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {errorProducto && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{errorProducto}</p>}

          {puedeAgregarStock && (
            <div className="flex flex-col gap-2">
              <input
                value={nombreProducto}
                onChange={(e) => setNombreProducto(e.target.value)}
                placeholder={t('Nombre (ej. Funda, AirPods)')}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
              <div className="flex gap-2">
                <input
                  value={costoProducto}
                  onChange={(e) => setCostoProducto(sanitizarDecimal(e.target.value))}
                  placeholder={t('Costo (lo que te costó)')}
                  inputMode="decimal"
                  className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                />
                <input
                  value={precioProducto}
                  onChange={(e) => setPrecioProducto(sanitizarDecimal(e.target.value))}
                  placeholder={t('Precio (venta)')}
                  inputMode="decimal"
                  className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                />
              </div>
              {categoriasStock.length > 0 && (
                <>
                  <select
                    value={categoriaProducto}
                    onChange={(e) => {
                      setCategoriaProducto(e.target.value);
                      const cat = categoriasStock.find((c) => c.id === e.target.value);
                      if (cat) setModalidadProducto(cat.modalidad_default);
                    }}
                    aria-label={t('Categoría')}
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                  >
                    {categoriasStock.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                  <div className="inline-flex items-center gap-1 rounded-xl bg-canvas dark:bg-dark-bg p-0.5 self-start">
                    {(['cantidad', 'serializado'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModalidadProducto(m)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          modalidadProducto === m
                            ? 'bg-white dark:bg-dark-surface-elevated text-ink dark:text-dark-text shadow-card'
                            : 'text-muted dark:text-dark-text-secondary'
                        }`}
                      >
                        {m === 'cantidad' ? t('Por cantidad') : t('Individual (serializado)')}
                      </button>
                    ))}
                  </div>
                  {modalidadProducto === 'serializado' ? (
                    <div className="flex gap-2">
                      <input
                        value={marcaProducto}
                        onChange={(e) => setMarcaProducto(e.target.value)}
                        placeholder={t('Marca (opcional)')}
                        className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                      />
                      <input
                        value={numeroSerieProducto}
                        onChange={(e) => setNumeroSerieProducto(e.target.value)}
                        placeholder={t('Número de serie (opcional)')}
                        className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                      />
                    </div>
                  ) : (
                    <input
                      value={cantidadInicialProducto}
                      onChange={(e) => setCantidadInicialProducto(e.target.value.replace(/[^\d]/g, ''))}
                      inputMode="numeric"
                      placeholder={t('Cantidad inicial')}
                      className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setMostrarMasCamposProducto((v) => !v)}
                    className="self-start text-xs font-medium text-accent dark:text-dark-accent hover:underline"
                  >
                    {mostrarMasCamposProducto ? `− ${t('Ocultar más campos')}` : `+ ${t('Más campos (SKU, proveedor, garantía…)')}`}
                  </button>
                  {mostrarMasCamposProducto && (
                    <div className="flex flex-col gap-2 rounded-xl bg-canvas dark:bg-dark-bg p-3">
                      <div className="flex gap-2">
                        <input
                          value={skuProducto}
                          onChange={(e) => setSkuProducto(e.target.value)}
                          placeholder={t('SKU (opcional)')}
                          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                        />
                        <input
                          value={codigoBarrasProducto}
                          onChange={(e) => setCodigoBarrasProducto(e.target.value)}
                          placeholder={t('Código de barras (opcional)')}
                          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                        />
                      </div>
                      <input
                        value={proveedorProducto}
                        onChange={(e) => setProveedorProducto(e.target.value)}
                        placeholder={t('Proveedor (opcional)')}
                        list="proveedores-producto"
                        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                      />
                      <datalist id="proveedores-producto">
                        {proveedoresSugeridos.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                      <div className="flex gap-2">
                        <input
                          value={stockMinimoProducto}
                          onChange={(e) => setStockMinimoProducto(e.target.value.replace(/[^\d]/g, ''))}
                          inputMode="numeric"
                          placeholder={t('Stock mínimo (opcional)')}
                          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                        />
                        <input
                          value={garantiaDiasProducto}
                          onChange={(e) => setGarantiaDiasProducto(e.target.value.replace(/[^\d]/g, ''))}
                          inputMode="numeric"
                          placeholder={t('Garantía en días (opcional)')}
                          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                        />
                      </div>
                      <textarea
                        value={descripcionProducto}
                        onChange={(e) => setDescripcionProducto(e.target.value)}
                        placeholder={t('Descripción (opcional)')}
                        rows={2}
                        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm resize-none"
                      />
                      <textarea
                        value={notasProducto}
                        onChange={(e) => setNotasProducto(e.target.value)}
                        placeholder={t('Notas internas (opcional)')}
                        rows={2}
                        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm resize-none"
                      />
                    </div>
                  )}
                </>
              )}
              <button
                disabled={!nombreProducto.trim() || guardandoProducto}
                onClick={agregarProducto}
                className="w-full rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3 text-sm font-medium text-white disabled:opacity-40"
              >
                {t('Agregar al catálogo')}
              </button>
            </div>
          )}

          {categoriasStock.length > 0 && productos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFiltroCategoriaProducto('')}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  !filtroCategoriaProducto ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-canvas dark:bg-dark-bg text-muted dark:text-dark-text-secondary'
                }`}
              >
                {t('Todas')} ({productos.length})
              </button>
              {categoriasStock
                .filter((c) => (conteoPorCategoria.get(c.id) || 0) > 0)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setFiltroCategoriaProducto(c.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      filtroCategoriaProducto === c.id ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-canvas dark:bg-dark-bg text-muted dark:text-dark-text-secondary'
                    }`}
                  >
                    {c.nombre} ({conteoPorCategoria.get(c.id) || 0})
                  </button>
                ))}
              {(conteoPorCategoria.get('__sin_categoria__') || 0) > 0 && (
                <button
                  onClick={() => setFiltroCategoriaProducto('__sin_categoria__')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    filtroCategoriaProducto === '__sin_categoria__' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-canvas dark:bg-dark-bg text-muted dark:text-dark-text-secondary'
                  }`}
                >
                  {t('Sin categoría')} ({conteoPorCategoria.get('__sin_categoria__') || 0})
                </button>
              )}
            </div>
          )}

          {loadingProductos && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}
          {!loadingProductos && productos.length === 0 && (
            <QoviState
              escena="stockVacio"
              tamano="sm"
              titulo={t('Todavía no hay productos en esta sección')}
              descripcion={t('Cargá tu primer accesorio con el formulario de arriba.')}
            />
          )}
          {!loadingProductos && productos.length > 0 && productosFiltrados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">
              {t('No hay productos en esta categoría todavía.')}
            </p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {productosFiltrados.map((p, i) => (
              <div
                key={p.id}
                className="group relative rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col items-center gap-1.5 text-center overflow-hidden"
              >
                {p.cantidad === 0 && (
                  <span className="absolute top-2 left-2 text-[10px] font-semibold text-bad bg-bad/10 rounded-full px-2 py-0.5 z-10">
                    {t('Sin stock')}
                  </span>
                )}
                <label className="cursor-pointer pt-1">
                  <span className="block animate-flotar" style={{ animationDelay: `${(i % 3) * 0.4}s` }}>
                    {p.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imagen_url}
                        alt={p.nombre}
                        className="h-28 w-28 object-contain drop-shadow-md transition-transform duration-300 ease-out group-hover:animate-vaivenLateral"
                      />
                    ) : (
                      <div className="h-28 w-28 rounded-xl bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-muted dark:text-dark-text-secondary [&_svg]:h-8 [&_svg]:w-8">
                        {ICONOS.camara}
                      </div>
                    )}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => cambiarImagenProducto(p, e)} />
                </label>

                <p className="text-sm font-medium leading-tight">{p.nombre}</p>
                {(p.marca || p.numero_serie) && (
                  <p className="text-[10px] text-muted dark:text-dark-text-secondary leading-tight -mt-1">
                    {[p.marca, p.numero_serie].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="leading-tight min-h-[2.2em]">
                  {p.precio != null && <p className="text-sm font-medium">${p.precio.toLocaleString('es-AR')}</p>}
                  {p.costo != null && (
                    <p className="text-[11px] text-muted dark:text-dark-text-secondary">{t('costo')} ${p.costo.toLocaleString('es-AR')}</p>
                  )}
                </div>

                {editandoCantidad === p.id ? (
                  <div className="flex flex-col items-center gap-2 w-full pt-1 border-t border-border dark:border-dark-border mt-1">
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <label className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary">
                        {t('Costo')}
                        <input
                          value={valorCosto}
                          onChange={(e) => setValorCosto(sanitizarDecimal(e.target.value))}
                          inputMode="decimal"
                          placeholder={t('Costo')}
                          className="w-16 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary">
                        {t('Precio')}
                        <input
                          value={valorPrecio}
                          onChange={(e) => setValorPrecio(sanitizarDecimal(e.target.value))}
                          inputMode="decimal"
                          placeholder={t('Precio')}
                          className="w-16 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary">
                        {t('Cant.')}
                        <input
                          value={valorCantidad}
                          onChange={(e) => setValorCantidad(e.target.value)}
                          inputMode="numeric"
                          autoFocus
                          className="w-12 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-2 py-1 text-sm"
                        />
                      </label>
                    </div>
                    <button onClick={() => guardarCantidad(p)} className="text-xs text-accent dark:text-dark-accent underline">
                      {t('Guardar')}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => abrirEdicionCantidad(p)} className="text-xs text-muted dark:text-dark-text-secondary underline decoration-dotted">
                    {t('Stock:')} <span className="font-medium text-ink dark:text-dark-text">{p.cantidad}</span>
                  </button>
                )}
                {puedeEliminar && (
                  <button onClick={() => eliminarProducto(p.id)} className="text-xs text-bad underline">
                    {t('Eliminar')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

// Un valor ausente (nadie cargó costo/precio todavía) NO es lo mismo que
// "$0" — mostrar $0 hace parecer que el capital realmente vale cero. Si
// ningún ítem entró en la cuenta, se muestra "Sin calcular"; si entraron
// algunos pero no todos, se aclara la cobertura para que el número no se
// lea como si fuera el total real del inventario.
function IndicadorCapital({
  etiqueta,
  valor,
  cobertura,
  total,
  tono,
}: {
  etiqueta: string;
  valor: number;
  cobertura: number;
  total: number;
  tono?: string;
}) {
  const t = useT();
  const sinDatos = cobertura === 0;
  return (
    <div>
      {sinDatos ? (
        <p className="text-lg font-display font-semibold text-muted dark:text-dark-text-secondary">{t('Sin calcular')}</p>
      ) : (
        <p className={`text-lg font-display font-semibold ${tono ?? ''}`}>${Math.round(valor).toLocaleString('es-AR')}</p>
      )}
      <p className="text-[11px] text-muted dark:text-dark-text-secondary">{etiqueta}</p>
      {!sinDatos && cobertura < total && (
        <p className="text-[10px] text-muted dark:text-dark-text-secondary">
          {cobertura} {t('de')} {total} {t('incluidos')}
        </p>
      )}
    </div>
  );
}
