'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo, normalizarNombreModelo } from '../../lib/modelos';
import { limpiarImei } from '../../lib/imei';
import { registrarAuditoria } from '../../lib/auditoria';
import { getActor, useActor, MENSAJE_ACTOR_REQUERIDO } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { armarLinkWhatsApp, mensajeSeguimientoServicio, mensajeListoServicio, mensajePresupuesto, mensajeEsperandoRepuesto } from '../../lib/whatsapp';
import { codigoLlamada } from '../../lib/paises';
import {
  ESTADOS_REPARACION,
  PRIORIDADES,
  ITEMS_CHECKLIST_INGRESO,
  CAMPOS_DEPENDEN_MODULO,
  esDemorado,
  hace,
  CHECKLIST_CALIDAD_GENERICO,
  TIPOS_INGRESO,
} from '../../lib/reparaciones';
import { cambiarEstadoReparacion } from '../../lib/estadoReparacion';
import { generarOrdenDeReparacion } from '../../lib/ordenesServicio';
import { extraerStockInsuficiente } from '../../lib/repuestos';
import { sanitizarDecimal } from '../../lib/numeros';
import { comprimirImagen } from '../../lib/comprimirImagen';
import SelectorColorAuto from '../../SelectorColorAuto';
import Avatar from '../../Avatar';
import CheckTri from '../../CheckTri';
import TextoCondicionGenerado from '../../TextoCondicionGenerado';
import EstadoBadge from '../../EstadoBadge';
import ControlCalidad, { ControlCalidadItem } from '../ControlCalidad';
import { ICONOS } from '../../Iconos';
import CampoFecha from '../../CampoFecha';
import { useT, useIdioma } from '../../lib/idioma';
import { traducirAccion } from '../../lib/i18n/traducirAccion';
import { useSucursalActual } from '../../lib/sucursal';

// Mismo patrón que TarjetaReparacion/EstadoBadge para reescalar los SVG de
// 24px a un tamaño chico inline junto a texto.
function IconoChico({ nombre, className = '' }: { nombre: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0 ${className}`}>
      {ICONOS[nombre]}
    </span>
  );
}

const STORAGE_OPTIONS = [64, 128, 256, 512];
const ACCESORIOS_OPCIONES = ['Funda', 'Cargador', 'SIM', 'Bandeja SIM'];
const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta'];

type Tab = 'resumen' | 'recepcion' | 'diagnostico' | 'presupuesto' | 'servicios' | 'control' | 'evidencias' | 'comunicacion' | 'historial';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'recepcion', label: 'Recepción' },
  { id: 'diagnostico', label: 'Diagnóstico' },
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'servicios', label: 'Servicios y repuestos' },
  { id: 'control', label: 'Control de calidad' },
  { id: 'evidencias', label: 'Evidencias' },
  { id: 'comunicacion', label: 'Comunicación' },
  { id: 'historial', label: 'Historial' },
];

// Línea de progreso del encabezado: presentación derivada del estado actual
// (no un historial real de tránsito por cada etapa), para que se entienda
// el avance de un vistazo — sección 15 del rediseño. "Control de calidad"
// se suma acá el día que exista de verdad un checklist antes de entregar;
// hasta entonces no se muestra una etapa que no representa nada real.
const ETAPAS_PROGRESO: { label: string; estados: string[] }[] = [
  { label: 'Recepción', estados: ['recibido'] },
  { label: 'Diagnóstico', estados: ['esperando_diagnostico'] },
  { label: 'Aprobación', estados: ['esperando_aprobacion'] },
  { label: 'Reparación', estados: ['en_reparacion', 'esperando_repuesto'] },
  { label: 'Entrega', estados: ['listo_para_entregar', 'entregado'] },
];

// Próxima acción del panel lateral: solo para estados donde el técnico
// tiene algo concreto para avanzar — mismo criterio que Mi banco (Fase 3).
const ACCION_SIGUIENTE: Record<string, { label: string; estado: string } | undefined> = {
  recibido: { label: 'Iniciar diagnóstico', estado: 'esperando_diagnostico' },
  esperando_diagnostico: { label: 'Enviar presupuesto', estado: 'esperando_aprobacion' },
  en_reparacion: { label: 'Marcar listo para entregar', estado: 'listo_para_entregar' },
};

type Tecnico = { id: string; nombre: string; foto_url: string | null };
type Trabajo = { id: string; nombre: string; imagen_url: string | null; checklist_tecnico: string[] | null };
type ReparacionRelacionada = {
  id: string;
  numero_orden: string | null;
  fecha_ingreso_servicio: string;
  fecha_entrega: string | null;
  garantia_dias: number | null;
  trabajos_realizados: string[] | null;
  tecnico_id: string | null;
  estado: string;
};

type Reparacion = {
  id: string;
  numero_orden: string | null;
  cliente_id: string | null;
  sucursal_id: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  codigo_desbloqueo: string | null;
  accesorios: string[];
  ubicacion_fisica: string | null;
  falla_declarada: string | null;
  estado_estetico: string | null;
  enciende: boolean | null;
  pantalla_estado: string | null;
  camaras_ok: boolean | null;
  botones_ok: boolean | null;
  biometria_ok: boolean | null;
  altavoces_ok: boolean | null;
  conectores_ok: boolean | null;
  modulo_ok: boolean | null;
  senal_ok: boolean | null;
  boton_silencio_ok: boolean | null;
  flash_ok: boolean | null;
  camara_frontal_ok: boolean | null;
  camara_trasera_ok: boolean | null;
  microfono_superior_ok: boolean | null;
  microfono_inferior_ok: boolean | null;
  boton_power_ok: boolean | null;
  boton_volumen_ok: boolean | null;
  pin_carga_ok: boolean | null;
  carga_magsafe_ok: boolean | null;
  garantia_excepcion_manual: string | null;
  humedad: boolean | null;
  garantia_condiciones_aceptadas: boolean;
  diagnostico: string | null;
  tecnico_id: string | null;
  prioridad: string;
  trabajo_recomendado: string | null;
  presupuesto_mano_obra: number | null;
  presupuesto_repuestos: number | null;
  presupuesto_estado: string | null;
  presupuesto_enviado_at: string | null;
  presupuesto_medio: string | null;
  presupuesto_respondido_at: string | null;
  presupuesto_importe_aceptado: number | null;
  presupuesto_texto_aceptado: string | null;
  control_calidad_override: boolean;
  tipo_ingreso: string | null;
  reparacion_relacionada_id: string | null;
  fecha_estimada: string | null;
  observaciones_internas: string | null;
  estado: string;
  en_poder_tecnico: boolean;
  trabajos_realizados: string[];
  repuestos_utilizados: string | null;
  resultado_final: string | null;
  importe_total: number | null;
  forma_pago: string | null;
  garantia_dias: number | null;
  fecha_entrega: string | null;
  orden_cobro_id: string | null;
  token_seguimiento: string;
  fecha_ingreso_servicio: string;
  fecha_reparado: string | null;
  agregado_a_stock: boolean;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

type Evento = {
  id: string;
  tipo: 'nota_interna' | 'mensaje_cliente' | 'sistema';
  texto: string;
  actor_nombre: string | null;
  created_at: string;
};

type Evidencia = {
  id: string;
  foto_url: string | null;
  nota: string | null;
  actor_nombre: string | null;
  created_at: string;
};

type RepuestoStock = { id: string; nombre: string; cantidad_stock: number; costo_unitario: number | null };
type RepuestoUsado = {
  id: string;
  repuesto_id: string | null;
  nombre_repuesto: string;
  cantidad: number;
  costo_unitario: number | null;
  created_at: string;
};

function fmt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('es-AR');
}

export default function FichaReparacion() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeGestionar = tienePermiso(actor, 'gestionar_servicio_tecnico');
  // El agregado a Stock es una actividad distinta de "gestionar la reparación":
  // un técnico puede tener permiso para trabajar la reparación pero no para
  // agregar al Stock (esa tarea suele quedar en manos de otra persona, p.ej.
  // el administrador), así que se chequea con su propio permiso.
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');
  const t = useT();
  const idioma = useIdioma();
  const sucursalActual = useSucursalActual();

  const [r, setR] = useState<Reparacion | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [notaEvidencia, setNotaEvidencia] = useState('');
  const [fotoEvidenciaBase64, setFotoEvidenciaBase64] = useState<string | null>(null);
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [repuestosStock, setRepuestosStock] = useState<RepuestoStock[]>([]);
  const [repuestosUsados, setRepuestosUsados] = useState<RepuestoUsado[]>([]);
  const [buscarRepuesto, setBuscarRepuesto] = useState('');
  const [repuestoElegido, setRepuestoElegido] = useState<RepuestoStock | null>(null);
  const [cantidadRepuesto, setCantidadRepuesto] = useState('1');
  const [guardandoRepuesto, setGuardandoRepuesto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [codigoVisible, setCodigoVisible] = useState(false);
  const [notaTexto, setNotaTexto] = useState('');
  const [codigoPais, setCodigoPais] = useState('54');
  const [avisoWhatsApp, setAvisoWhatsApp] = useState<{ link: string; nombre: string } | null>(null);
  const [avisoAgregarStock, setAvisoAgregarStock] = useState(false);
  const [tab, setTab] = useState<Tab>('resumen');
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [controlCalidad, setControlCalidad] = useState<ControlCalidadItem[]>([]);
  const [reparacionesRelacionadas, setReparacionesRelacionadas] = useState<ReparacionRelacionada[]>([]);
  const [guardandoClasificacion, setGuardandoClasificacion] = useState(false);
  // Con más de una reparación anterior del mismo equipo, hay que elegir a
  // cuál se vincula el retrabajo/garantía — antes siempre se enganchaba a
  // la más reciente sin importar cuál tocara el técnico, lo cual podía
  // vincular mal (ej. un retrabajo que en realidad es sobre un arreglo de
  // hace 3 ingresos, no el último).
  const [reparacionRelacionadaElegida, setReparacionRelacionadaElegida] = useState<string | null>(null);

  const [f, setFm] = useState<Record<string, any>>({});

  const cargar = async () => {
    const { data } = await supabase
      .from('reparaciones')
      .select('*, clientes ( nombre, apellido, telefono )')
      .eq('id', id)
      .single();
    setR(data as any);
    setLoading(false);

    const [{ data: aud }, { data: evs }, { data: evids }, { data: repUsados }, { data: cc }] = await Promise.all([
      supabase
        .from('auditoria')
        .select('id, accion, actor_nombre, created_at')
        .eq('entidad', 'reparacion')
        .eq('entidad_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('reparaciones_eventos')
        .select('id, tipo, texto, actor_nombre, created_at')
        .eq('reparacion_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('reparaciones_evidencias')
        .select('id, foto_url, nota, actor_nombre, created_at')
        .eq('reparacion_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('reparaciones_repuestos')
        .select('id, repuesto_id, nombre_repuesto, cantidad, costo_unitario, created_at')
        .eq('reparacion_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('reparaciones_control_calidad')
        .select('id, item, resultado, observacion, foto_url, actor_nombre, created_at')
        .eq('reparacion_id', id),
    ]);
    setEvidencias((evids as Evidencia[]) ?? []);
    setRepuestosUsados((repUsados as RepuestoUsado[]) ?? []);
    setControlCalidad((cc as ControlCalidadItem[]) ?? []);
    const deAuditoria: Evento[] = (aud ?? []).map((a: any) => ({
      id: `a-${a.id}`,
      tipo: 'sistema',
      texto: traducirAccion(a.accion, idioma),
      actor_nombre: a.actor_nombre,
      created_at: a.created_at,
    }));
    const deEventos: Evento[] = (evs ?? []).map((e: any) => ({
      id: `e-${e.id}`,
      tipo: e.tipo,
      texto: e.texto,
      actor_nombre: e.actor_nombre,
      created_at: e.created_at,
    }));
    setEventos([...deAuditoria, ...deEventos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  };

  useEffect(() => {
    cargar();
    (async () => {
      const { data } = await supabase.from('tecnicos').select('id, nombre, foto_url').order('nombre');
      setTecnicos((data as Tecnico[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('trabajos').select('id, nombre, imagen_url, checklist_tecnico').eq('activo', true).order('nombre');
      setTrabajos((data as Trabajo[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('repuestos').select('id, nombre, cantidad_stock, costo_unitario').order('nombre');
      setRepuestosStock((data as RepuestoStock[]) ?? []);
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( pais )').eq('id', user.id).single();
      setCodigoPais(codigoLlamada((perfil as any)?.negocios?.pais));
    })();
  }, [id]);

  // Garantías y retrabajos (sección 21): reparaciones anteriores del MISMO
  // equipo (mismo IMEI), para poder clasificar este ingreso. Se busca recién
  // cuando ya sabemos el IMEI de esta reparación, no en el efecto de arriba.
  // Depende también de r?.id (no solo r?.imei): al navegar entre dos
  // reparaciones vinculadas por garantía (mismo IMEI) desde la tarjeta de
  // "Garantías y retrabajos", el imei no cambia, así que si solo dependiera
  // de imei el efecto no se volvería a ejecutar y quedarían datos de la
  // reparación anterior (incluyendo el filtro .neq('id', r.id) con el id
  // viejo).
  useEffect(() => {
    if (!r?.imei) {
      setReparacionesRelacionadas([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('reparaciones')
        .select('id, numero_orden, fecha_ingreso_servicio, fecha_entrega, garantia_dias, trabajos_realizados, tecnico_id, estado')
        .eq('imei', r.imei)
        .neq('id', r.id)
        .order('fecha_ingreso_servicio', { ascending: false })
        .limit(5);
      const relacionadas = (data as ReparacionRelacionada[]) ?? [];
      setReparacionesRelacionadas(relacionadas);
      setReparacionRelacionadaElegida(r.reparacion_relacionada_id ?? relacionadas[0]?.id ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.imei, r?.id]);

  const nombreCliente = r?.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim() : null;
  const nombreTecnico = (tid: string | null) => tecnicos.find((tec) => tec.id === tid)?.nombre;
  const fotoTecnico = (tid: string | null) => tecnicos.find((tec) => tec.id === tid)?.foto_url ?? null;

  // Costo histórico de repuestos y margen — mismo cálculo que antes, ahora
  // levantado para poder mostrarlo también en el panel lateral fijo, no
  // solo adentro de la pestaña de Servicios y repuestos.
  const costoRepuestosTotal = repuestosUsados.reduce((acc, ru) => acc + (ru.costo_unitario ?? 0) * ru.cantidad, 0);
  const hayCostosFaltantes = repuestosUsados.some((ru) => ru.costo_unitario == null);
  const presupuestoSuma = r ? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0) : 0;
  const cobrado = r ? r.importe_total ?? (presupuestoSuma > 0 ? presupuestoSuma : null) : null;
  const margen = cobrado != null ? cobrado - costoRepuestosTotal : null;

  // Checklist de control de calidad aplicable a esta reparación (sección
  // 17): unión de checklist_tecnico de los servicios realizados (Fase 4,
  // "el administrador puede definir qué controles son obligatorios según el
  // servicio"). Si ninguno de los servicios tiene un checklist propio
  // cargado, se usa el genérico por defecto — nunca se deja sin controlar
  // por falta de configuración.
  const checklistAplicable = useMemo(() => {
    if (!r) return [];
    const deServicios = new Set<string>();
    for (const nombre of r.trabajos_realizados ?? []) {
      const trabajo = trabajos.find((tr) => tr.nombre === nombre);
      for (const item of trabajo?.checklist_tecnico ?? []) deServicios.add(item);
    }
    return deServicios.size > 0 ? Array.from(deServicios) : CHECKLIST_CALIDAD_GENERICO;
  }, [r, trabajos]);
  const controlesFaltantes = checklistAplicable.filter((item) => !controlCalidad.some((c) => c.item === item));

  const demorado = r ? esDemorado(r) : false;
  // Si el cliente (o alguien manualmente) ya aprobó el presupuesto, la
  // próxima acción real es arrancar la reparación, no repetir "enviar
  // presupuesto" — sustituye el mapeo genérico de ACCION_SIGUIENTE para
  // ese caso puntual.
  const accionSiguiente =
    r?.estado === 'esperando_aprobacion' && r.presupuesto_estado === 'aprobado'
      ? { label: t('Iniciar reparación'), estado: 'en_reparacion' }
      : r
        ? ACCION_SIGUIENTE[r.estado]
        : undefined;

  const abrirEdicion = () => {
    if (!r) return;
    setFm({
      modelo: r.modelo ?? '',
      capacidad_gb: r.capacidad_gb,
      color: r.color ?? '',
      imei: r.imei ?? '',
      codigo_desbloqueo: r.codigo_desbloqueo ?? '',
      accesorios: r.accesorios ?? [],
      ubicacion_fisica: r.ubicacion_fisica ?? '',
      falla_declarada: r.falla_declarada ?? '',
      estado_estetico: r.estado_estetico ?? '',
      enciende: r.enciende,
      pantalla_estado: r.pantalla_estado ?? '',
      biometria_ok: r.biometria_ok,
      altavoces_ok: r.altavoces_ok,
      conectores_ok: r.conectores_ok,
      modulo_ok: r.modulo_ok,
      senal_ok: r.senal_ok,
      boton_silencio_ok: r.boton_silencio_ok,
      flash_ok: r.flash_ok,
      camara_frontal_ok: r.camara_frontal_ok,
      camara_trasera_ok: r.camara_trasera_ok,
      microfono_superior_ok: r.microfono_superior_ok,
      microfono_inferior_ok: r.microfono_inferior_ok,
      boton_power_ok: r.boton_power_ok,
      boton_volumen_ok: r.boton_volumen_ok,
      pin_carga_ok: r.pin_carga_ok,
      carga_magsafe_ok: r.carga_magsafe_ok,
      garantia_excepcion_manual: r.garantia_excepcion_manual ?? '',
      humedad: r.humedad,
      garantia_condiciones_aceptadas: r.garantia_condiciones_aceptadas,
      diagnostico: r.diagnostico ?? '',
      tecnico_id: r.tecnico_id ?? '',
      prioridad: r.prioridad,
      trabajo_recomendado: r.trabajo_recomendado ?? '',
      presupuesto_mano_obra: r.presupuesto_mano_obra != null ? String(r.presupuesto_mano_obra) : '',
      presupuesto_repuestos: r.presupuesto_repuestos != null ? String(r.presupuesto_repuestos) : '',
      fecha_estimada: r.fecha_estimada ?? '',
      observaciones_internas: r.observaciones_internas ?? '',
      trabajos_realizados: r.trabajos_realizados ?? [],
      repuestos_utilizados: r.repuestos_utilizados ?? '',
      resultado_final: r.resultado_final ?? '',
      importe_total: r.importe_total != null ? String(r.importe_total) : '',
      forma_pago: r.forma_pago ?? '',
      garantia_dias: r.garantia_dias != null ? String(r.garantia_dias) : '',
    });
    setError(null);
    setEditando(true);
  };

  const toggleAccesorio = (a: string) =>
    setFm((prev) => ({
      ...prev,
      accesorios: prev.accesorios.includes(a) ? prev.accesorios.filter((x: string) => x !== a) : [...prev.accesorios, a],
    }));

  const toggleTrabajo = (nombre: string) =>
    setFm((prev) => ({
      ...prev,
      trabajos_realizados: prev.trabajos_realizados.includes(nombre)
        ? prev.trabajos_realizados.filter((x: string) => x !== nombre)
        : [...prev.trabajos_realizados, nombre],
    }));

  const guardar = async () => {
    if (!r || !puedeGestionar) return;
    setGuardando(true);
    setError(null);

    const nuevo = {
      modelo: f.modelo.trim() ? normalizarNombreModelo(f.modelo.trim()) : null,
      capacidad_gb: f.capacidad_gb,
      color: f.color.trim() || null,
      imei: limpiarImei(f.imei) || null,
      codigo_desbloqueo: f.codigo_desbloqueo.trim() || null,
      accesorios: f.accesorios,
      ubicacion_fisica: f.ubicacion_fisica.trim() || null,
      falla_declarada: f.falla_declarada.trim() || null,
      estado_estetico: f.estado_estetico.trim() || null,
      enciende: f.enciende,
      pantalla_estado: f.pantalla_estado || null,
      biometria_ok: f.biometria_ok,
      altavoces_ok: f.altavoces_ok,
      conectores_ok: f.conectores_ok,
      modulo_ok: f.modulo_ok,
      senal_ok: f.senal_ok,
      boton_silencio_ok: f.boton_silencio_ok,
      flash_ok: f.flash_ok,
      camara_frontal_ok: f.camara_frontal_ok,
      camara_trasera_ok: f.camara_trasera_ok,
      microfono_superior_ok: f.microfono_superior_ok,
      microfono_inferior_ok: f.microfono_inferior_ok,
      boton_power_ok: f.boton_power_ok,
      boton_volumen_ok: f.boton_volumen_ok,
      pin_carga_ok: f.pin_carga_ok,
      carga_magsafe_ok: f.carga_magsafe_ok,
      garantia_excepcion_manual: f.garantia_excepcion_manual.trim() || null,
      humedad: f.humedad,
      garantia_condiciones_aceptadas: f.garantia_condiciones_aceptadas,
      diagnostico: f.diagnostico.trim() || null,
      tecnico_id: f.tecnico_id || null,
      prioridad: f.prioridad,
      trabajo_recomendado: f.trabajo_recomendado.trim() || null,
      presupuesto_mano_obra: f.presupuesto_mano_obra ? Number(f.presupuesto_mano_obra) : null,
      presupuesto_repuestos: f.presupuesto_repuestos ? Number(f.presupuesto_repuestos) : null,
      fecha_estimada: f.fecha_estimada || null,
      observaciones_internas: f.observaciones_internas.trim() || null,
      trabajos_realizados: f.trabajos_realizados,
      repuestos_utilizados: f.repuestos_utilizados.trim() || null,
      resultado_final: f.resultado_final.trim() || null,
      importe_total: f.importe_total ? Number(f.importe_total) : null,
      forma_pago: f.forma_pago || null,
      garantia_dias: f.garantia_dias ? Number(f.garantia_dias) : null,
    };

    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    for (const key of Object.keys(nuevo) as (keyof typeof nuevo)[]) {
      const antes = (r as any)[key];
      const despues = (nuevo as any)[key];
      const sonArrays = Array.isArray(antes) || Array.isArray(despues);
      const distinto = sonArrays ? JSON.stringify(antes ?? []) !== JSON.stringify(despues ?? []) : antes !== despues;
      if (distinto) cambios[key] = { antes, despues };
    }

    if (Object.keys(cambios).length === 0) {
      setEditando(false);
      setGuardando(false);
      return;
    }

    // Un presupuesto ya aprobado nunca se pisa en silencio: si cambian los
    // montos después de la aprobación, se invalida (vuelve a "sin
    // responder") en vez de dejar una aprobación vieja pegada a un importe
    // que ya no es el que el cliente vio. Se suma a "cambios" (no solo al
    // payload) para que quede explícito en la auditoría — si no, el log
    // solo mostraría el cambio de precio y no diría por qué se perdió la
    // aprobación.
    const payloadFinal: Record<string, unknown> = { ...nuevo };
    const invalidaAprobacion = (cambios.presupuesto_mano_obra || cambios.presupuesto_repuestos) && r.presupuesto_estado === 'aprobado';
    if (invalidaAprobacion) {
      payloadFinal.presupuesto_estado = null;
      cambios.presupuesto_estado = { antes: r.presupuesto_estado, despues: null };
    }

    const { error: updateError } = await supabase.from('reparaciones').update(payloadFinal).eq('id', r.id);
    if (updateError) {
      setError(t('No pudimos guardar los cambios:') + ' ' + updateError.message);
      setGuardando(false);
      return;
    }

    await registrarAuditoria(supabase, {
      accion: `editó la reparación ${r.numero_orden || ''} (${nuevo.modelo || 'sin modelo'})${
        invalidaAprobacion ? ' — se invalidó la aprobación del presupuesto por el cambio de monto' : ''
      }`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorAnterior: Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.antes])),
      valorNuevo: Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.despues])),
    });

    if (cambios.modelo) await asegurarModelo(supabase, nuevo.modelo);

    setEditando(false);
    setGuardando(false);
    cargar();
  };

  const cambiarEstado = async (nuevoEstado: string) => {
    if (!r || !puedeGestionar) return;
    setGuardando(true);
    const resultado = await cambiarEstadoReparacion(supabase, r, nuevoEstado, actor?.nombre ?? null);
    if (resultado === 'cancelado') {
      setGuardando(false);
      return;
    }

    if (nuevoEstado === 'listo_para_entregar' && r.cliente_id && r.clientes?.telefono && r.token_seguimiento) {
      const url = `${window.location.origin}/seguimiento/${r.token_seguimiento}`;
      const nombre = nombreCliente || 'estimado/a';
      const mensaje = mensajeListoServicio(nombre, r.modelo || 'equipo', url);
      setAvisoWhatsApp({ link: armarLinkWhatsApp(r.clientes.telefono, mensaje, codigoPais), nombre });
    }

    // Equipo propio (sin cliente) que se marca "Entregado" directo desde el
    // selector de estado, salteando el botón "Agregar al Stock": preguntamos
    // igual, para no perder el paso. Solo a quien tiene permiso de Stock.
    if (nuevoEstado === 'entregado' && !r.cliente_id && !r.agregado_a_stock && puedeAgregarStock) {
      setAvisoAgregarStock(true);
    }

    setGuardando(false);
    cargar();
  };

  const agregarNota = async () => {
    if (!r || !notaTexto.trim() || guardando) return;
    setGuardando(true);
    const actor = getActor();
    await supabase.from('reparaciones_eventos').insert({
      reparacion_id: r.id,
      tipo: 'nota_interna',
      texto: notaTexto.trim(),
      actor_nombre: actor?.nombre ?? null,
      actor_tipo: actor?.tipo ?? null,
    });
    setNotaTexto('');
    setGuardando(false);
    cargar();
  };

  const elegirFotoEvidencia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFotoEvidenciaBase64(await comprimirImagen(file));
    } catch {
      setError(t('No pudimos leer la foto.'));
    }
  };

  const agregarEvidencia = async () => {
    if (!r || (!fotoEvidenciaBase64 && !notaEvidencia.trim())) return;
    const actor = getActor();
    setSubiendoEvidencia(true);
    const { error: insError } = await supabase.from('reparaciones_evidencias').insert({
      reparacion_id: r.id,
      foto_url: fotoEvidenciaBase64,
      nota: notaEvidencia.trim() || null,
      actor_nombre: actor?.nombre ?? null,
    });
    setSubiendoEvidencia(false);
    if (insError) {
      setError(t('No pudimos guardar la evidencia:') + ' ' + insError.message);
      return;
    }
    setNotaEvidencia('');
    setFotoEvidenciaBase64(null);
    cargar();
  };

  const repuestosFiltrados = repuestosStock.filter(
    (rp) => rp.cantidad_stock > 0 && rp.nombre.toLowerCase().includes(buscarRepuesto.trim().toLowerCase())
  );

  // Consumir un repuesto pasa por la función repuesto_consumir (RPC) en vez
  // de leer/escribir cantidad_stock desde acá: esa función bloquea la fila
  // del repuesto mientras dura la operación, así que dos consumos
  // simultáneos del mismo repuesto (ej. dos técnicos a la vez) se serializan
  // en vez de pisarse — antes esto leía el stock, restaba en JS y escribía
  // el resultado, una condición de carrera real. El mensaje
  // "STOCK_INSUFICIENTE:<n>" que tira la función si no forzamos es lo que
  // permite mantener el mismo cartel de confirmación de siempre.
  const agregarRepuestoUsado = async () => {
    if (!r || !repuestoElegido || !puedeGestionar) return;
    const cantidad = Number(cantidadRepuesto) || 0;
    if (cantidad <= 0) return;
    setGuardandoRepuesto(true);
    const actor = getActor();
    const intentar = async (forzar: boolean) =>
      supabase.rpc('repuesto_consumir', {
        p_repuesto_id: repuestoElegido.id,
        p_reparacion_id: r.id,
        p_cantidad: cantidad,
        p_actor_nombre: actor?.nombre ?? null,
        p_forzar: forzar,
      });

    let { error: rpcError } = await intentar(false);
    if (rpcError) {
      const stockActual = extraerStockInsuficiente(rpcError.message);
      if (
        stockActual == null ||
        !confirm(
          `${t('Solo quedan')} ${stockActual} ${t('de')} "${repuestoElegido.nombre}" ${t('en stock. ¿Usar')} ${cantidad} ${t('igual? El stock va a quedar en negativo.')}`
        )
      ) {
        setGuardandoRepuesto(false);
        return;
      }
      ({ error: rpcError } = await intentar(true));
      if (rpcError) {
        setError(t('No pudimos guardar el repuesto:') + ' ' + rpcError.message);
        setGuardandoRepuesto(false);
        return;
      }
    }

    await registrarAuditoria(supabase, {
      accion: `usó ${cantidad} de "${repuestoElegido.nombre}" en la reparación ${r.numero_orden || ''}`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setRepuestoElegido(null);
    setBuscarRepuesto('');
    setCantidadRepuesto('1');
    setGuardandoRepuesto(false);
    cargar();
    (async () => {
      const { data } = await supabase.from('repuestos').select('id, nombre, cantidad_stock, costo_unitario').order('nombre');
      setRepuestosStock((data as RepuestoStock[]) ?? []);
    })();
  };

  const quitarRepuestoUsado = async (ru: RepuestoUsado) => {
    if (!puedeGestionar) return;
    if (!confirm(`${t('¿Quitar')} "${ru.nombre_repuesto}" ${t('de esta reparación? Vuelve a sumarse al stock.')}`)) return;
    const actor = getActor();
    const { error: rpcError } = await supabase.rpc('repuesto_quitar_consumo', {
      p_reparacion_repuesto_id: ru.id,
      p_actor_nombre: actor?.nombre ?? null,
    });
    if (rpcError) {
      setError(t('No pudimos quitar el repuesto:') + ' ' + rpcError.message);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `quitó "${ru.nombre_repuesto}" de una reparación (se devolvió al stock)`,
      entidad: 'reparacion',
      entidadId: id,
    });
    cargar();
    (async () => {
      const { data } = await supabase.from('repuestos').select('id, nombre, cantidad_stock, costo_unitario').order('nombre');
      setRepuestosStock((data as RepuestoStock[]) ?? []);
    })();
  };

  const enviarWhatsApp = async (tipo: 'recibido' | 'presupuesto' | 'repuesto' | 'listo') => {
    if (!r || !r.clientes?.telefono || guardando) return;
    setGuardando(true);
    const url = `${window.location.origin}/seguimiento/${r.token_seguimiento}`;
    const nombre = nombreCliente || 'estimado/a';
    const modelo = r.modelo || 'equipo';
    let mensaje = '';
    if (tipo === 'recibido') mensaje = mensajeSeguimientoServicio(nombre, modelo, url);
    if (tipo === 'presupuesto') {
      const monto = `$${((r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0)).toLocaleString('es-AR')}`;
      mensaje = mensajePresupuesto(nombre, modelo, monto, url);
    }
    if (tipo === 'repuesto') mensaje = mensajeEsperandoRepuesto(nombre, modelo, url);
    if (tipo === 'listo') mensaje = mensajeListoServicio(nombre, modelo, url);

    await supabase.from('reparaciones_eventos').insert({ reparacion_id: r.id, tipo: 'mensaje_cliente', texto: mensaje });
    // Enviar el presupuesto por WhatsApp deja constancia de cuándo y por qué
    // medio se avisó — no reescribe nada si el cliente ya respondió (evita
    // que reenviar el mismo mensaje borre una aprobación/rechazo ya
    // registrado).
    if (tipo === 'presupuesto' && !r.presupuesto_estado) {
      await supabase
        .from('reparaciones')
        .update({ presupuesto_estado: 'enviado', presupuesto_enviado_at: new Date().toISOString(), presupuesto_medio: 'whatsapp' })
        .eq('id', r.id);
    }
    window.open(armarLinkWhatsApp(r.clientes.telefono, mensaje, codigoPais), '_blank');
    setGuardando(false);
    cargar();
  };

  // Aprobación/rechazo registrados a mano (ej. el cliente avisó por teléfono
  // o en persona) — mismo resultado trazable que si lo hiciera desde el
  // portal público, pero con medio='manual' y quedando quién lo cargó en
  // auditoría.
  const registrarRespuestaPresupuestoManual = async (aprobar: boolean) => {
    if (!r || !puedeGestionar) return;
    if (!confirm(aprobar ? t('¿Registrar que el cliente aprobó este presupuesto?') : t('¿Registrar que el cliente rechazó este presupuesto?'))) return;
    setGuardando(true);
    const total = (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
    await supabase
      .from('reparaciones')
      .update({
        presupuesto_estado: aprobar ? 'aprobado' : 'rechazado',
        presupuesto_medio: 'manual',
        presupuesto_respondido_at: new Date().toISOString(),
        presupuesto_importe_aceptado: total,
        presupuesto_texto_aceptado: r.diagnostico,
      })
      .eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `registró que el cliente ${aprobar ? 'aprobó' : 'rechazó'} el presupuesto de la reparación ${r.numero_orden || ''} (registrado manualmente)`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setGuardando(false);
    cargar();
  };

  // Un presupuesto rechazado quedaba sin salida: el portal público bloquea
  // una segunda respuesta y los botones manuales solo aparecen mientras no
  // hay una respuesta terminal — así que si el taller quiere ofrecer un
  // precio revisado después de un rechazo, primero hay que reabrirlo.
  const reabrirPresupuesto = async () => {
    if (!r || !puedeGestionar) return;
    if (!confirm(t('¿Reabrir este presupuesto para pedirle una nueva respuesta al cliente?'))) return;
    setGuardando(true);
    const actorActual = getActor();
    const { error: rpcError } = await supabase.rpc('reparacion_reabrir_presupuesto', {
      p_reparacion_id: r.id,
      p_actor_nombre: actorActual?.nombre ?? null,
    });
    if (rpcError) {
      setError(t('No pudimos reabrir el presupuesto:') + ' ' + rpcError.message);
      setGuardando(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `reabrió el presupuesto de la reparación ${r.numero_orden || ''} para una nueva respuesta`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setGuardando(false);
    cargar();
  };

  const generarOrdenCobro = async () => {
    if (!r || !puedeGestionar) return;
    const mensaje = r.orden_cobro_id
      ? t('¿Actualizar la orden de cobro con el importe actual de esta reparación? Si el presupuesto cambió después de generarla, la orden se va a corregir.')
      : t('¿Generar la orden de cobro con el importe de esta reparación?');
    if (!confirm(mensaje)) return;
    setGuardando(true);
    // Misma lógica compartida que usa la sección "Listos para cobrar" de Órdenes.
    const { ordenId, total, error: genError } = await generarOrdenDeReparacion(supabase, r as any, { sucursalId: sucursalActual.id });
    if (genError || !ordenId) {
      setError(genError || t('No pudimos generar la orden.'));
      setGuardando(false);
      return;
    }

    await registrarAuditoria(supabase, {
      accion: `generó la orden de cobro de la reparación ${r.numero_orden || ''} (${r.modelo || 'sin modelo'})`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorNuevo: { orden_id: ordenId, total },
    });

    setGuardando(false);
    router.push(`/ordenes/${ordenId}`);
  };

  const agregarAlStockFicha = async () => {
    if (!r || !puedeAgregarStock) return;
    const actor = getActor();
    if (!actor) {
      setError(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    if (r.imei) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', r.imei).maybeSingle();
      if (existente && !confirm(`${t('Ya hay un dispositivo en Stock con el IMEI')} ${r.imei}. ${t('¿Agregarlo igual?')}`)) return;
    }
    if (!confirm(t('¿Pasar este equipo al Stock como dispositivo disponible para vender?'))) return;
    setGuardando(true);
    setAvisoAgregarStock(false);
    const modeloNormalizado = r.modelo ? normalizarNombreModelo(r.modelo) : r.modelo;
    await supabase.from('dispositivos').insert({
      modelo: modeloNormalizado,
      capacidad_gb: r.capacidad_gb,
      color: r.color,
      imei: r.imei,
      estado: 'usado',
      en_stock: true,
      agregado_por_nombre: actor?.nombre ?? null,
      agregado_por_foto_url: actor?.fotoUrl ?? null,
      // Hereda la sucursal de esta misma reparación, no la que esté
      // eligiendo ahora quien aprieta el botón.
      ...(r.sucursal_id ? { sucursal_id: r.sucursal_id } : {}),
    });
    await asegurarModelo(supabase, modeloNormalizado);
    await supabase
      .from('reparaciones')
      .update({
        estado: 'entregado',
        estado_actualizado_at: new Date().toISOString(),
        agregado_a_stock: true,
        fecha_reparado: r.fecha_reparado ?? new Date().toISOString(),
      })
      .eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `agregó al Stock un equipo propio reparado en Servicio Técnico (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'}${r.imei ? `, IMEI ${r.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setGuardando(false);
    cargar();
  };

  const marcarEntregadoClienteFicha = async () => {
    if (!r || !puedeGestionar) return;
    if (!confirm(t('¿Marcar este equipo como entregado al cliente?'))) return;
    setGuardando(true);
    await supabase
      .from('reparaciones')
      .update({
        estado: 'entregado',
        fecha_entrega: new Date().toISOString(),
        estado_actualizado_at: new Date().toISOString(),
        fecha_reparado: r.fecha_reparado ?? new Date().toISOString(),
      })
      .eq('id', r.id);
    // Se entregó sin pasar por "Generar orden de cobro" (ej. reparación
    // gratis) — la orden vinculada queda en $0, pero se marca entregada
    // para que no quede colgada como "pendiente" para siempre.
    if (r.orden_cobro_id) {
      await supabase.from('ordenes').update({ estado: 'entregado' }).eq('id', r.orden_cobro_id);
    }
    await registrarAuditoria(supabase, {
      accion: `marcó como entregado al cliente un equipo reparado en Servicio Técnico (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'}${r.imei ? `, IMEI ${r.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setGuardando(false);
    cargar();
  };

  const copiarLinkSeguimiento = async () => {
    if (!r?.token_seguimiento) return;
    const url = `${window.location.origin}/seguimiento/${r.token_seguimiento}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    } catch {
      setError(t('No pudimos copiar el link — copialo manualmente:') + ' ' + url);
    }
  };

  // Un solo registro por ítem (unique en reparacion_id+item): re-marcar un
  // ítem hace upsert en vez de acumular filas viejas.
  const guardarItemControlCalidad = async (item: string, resultado: string, observacion: string | null, fotoUrl: string | null) => {
    if (!r || !puedeGestionar) return;
    const actorActual = getActor();
    const { error: upsertError } = await supabase.from('reparaciones_control_calidad').upsert(
      {
        reparacion_id: r.id,
        item,
        resultado,
        observacion,
        foto_url: fotoUrl,
        actor_nombre: actorActual?.nombre ?? null,
      },
      { onConflict: 'reparacion_id,item' }
    );
    if (upsertError) {
      setError(t('No pudimos guardar el control:') + ' ' + upsertError.message);
      return;
    }
    const { data } = await supabase
      .from('reparaciones_control_calidad')
      .select('id, item, resultado, observacion, foto_url, actor_nombre, created_at')
      .eq('reparacion_id', r.id);
    const actualizado = (data as ControlCalidadItem[]) ?? [];
    setControlCalidad(actualizado);
    // Si esto era lo último que faltaba, el aviso de "se entregó con
    // controles pendientes" deja de tener sentido — se limpia solo en vez
    // de quedar una advertencia vieja para siempre en una reparación que ya
    // se terminó de controlar.
    if (r.control_calidad_override && checklistAplicable.every((it) => actualizado.some((c) => c.item === it))) {
      await supabase.from('reparaciones').update({ control_calidad_override: false }).eq('id', r.id);
      cargar();
    }
  };

  const reparacionRelacionadaLabel = (rr: ReparacionRelacionada) => {
    const vencida = rr.fecha_entrega && rr.garantia_dias ? Date.now() > new Date(rr.fecha_entrega).getTime() + rr.garantia_dias * 86400000 : null;
    return {
      titulo: `${rr.numero_orden ?? ''} — ${rr.trabajos_realizados?.join(', ') || t('sin trabajos registrados')}`,
      garantiaTexto:
        rr.fecha_entrega == null
          ? t('todavía no se entregó')
          : rr.garantia_dias == null
            ? t('sin garantía cargada')
            : vencida
              ? t('garantía vencida')
              : t('dentro de garantía'),
      vencida,
    };
  };

  const guardarClasificacionIngreso = async (tipo: string, relacionadaId: string | null) => {
    if (!r || !puedeGestionar) return;
    setGuardandoClasificacion(true);
    await supabase.from('reparaciones').update({ tipo_ingreso: tipo, reparacion_relacionada_id: relacionadaId }).eq('id', r.id);
    const relacionada = reparacionesRelacionadas.find((rr) => rr.id === relacionadaId);
    await registrarAuditoria(supabase, {
      accion: `clasificó la reparación ${r.numero_orden || ''} como "${TIPOS_INGRESO.find((ti) => ti.id === tipo)?.label ?? tipo}"${
        relacionada ? ` (vinculada a ${relacionada.numero_orden || 'una reparación anterior'})` : ''
      }`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setGuardandoClasificacion(false);
    cargar();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!r) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No encontramos esa reparación.')}</p>
        <Link href="/servicio-tecnico" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver a Servicio Técnico')}
        </Link>
      </main>
    );
  }

  const etapaActualIdx = ETAPAS_PROGRESO.findIndex((e) => e.estados.includes(r.estado));

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      {/* Encabezado persistente */}
      <header className="flex items-start gap-3">
        <Link href="/servicio-tecnico" aria-label={t('Volver')} className="text-2xl leading-none mt-0.5">
          &larr;
        </Link>
        <div className="min-w-0 mr-auto">
          <p className="text-lg font-medium leading-tight truncate">
            {r.numero_orden} · {r.modelo}
            {r.capacidad_gb ? ` · ${r.capacidad_gb}GB` : ''}
          </p>
          <p className="text-xs text-muted dark:text-dark-text-secondary flex items-center gap-1.5 flex-wrap">
            <span className="flex items-center gap-1">
              <IconoChico nombre={nombreCliente ? 'clientes' : 'local'} />
              {nombreCliente || t('Equipo propio del local')}
            </span>
            <span>· {t('Ingresó')} {hace(r.fecha_ingreso_servicio)}</span>
            {demorado && <span className="text-bad font-medium">· {t('Demorada')}</span>}
          </p>
        </div>
        <Link
          href={`/servicio-tecnico/etiqueta/${r.id}`}
          className="flex items-center gap-1 text-xs text-accent dark:text-dark-accent underline shrink-0"
        >
          <IconoChico nombre="etiqueta" /> {t('Etiqueta')}
        </Link>
        {puedeGestionar && (
          <button
            onClick={() => (editando ? setEditando(false) : abrirEdicion())}
            className="text-xs text-accent dark:text-dark-accent underline shrink-0"
          >
            {editando ? t('Cancelar') : t('Editar')}
          </button>
        )}
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <EstadoBadge estado={r.estado} />
        <select
          value={r.estado}
          disabled={guardando || !puedeGestionar}
          onChange={(e) => cambiarEstado(e.target.value)}
          className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs disabled:opacity-40"
        >
          {ESTADOS_REPARACION.map((e) => (
            <option key={e.id} value={e.id}>
              {t(e.label)}
            </option>
          ))}
        </select>
        {nombreTecnico(r.tecnico_id) && (
          <span className="flex items-center gap-1.5 text-xs text-muted dark:text-dark-text-secondary">
            <Avatar src={fotoTecnico(r.tecnico_id)} nombre={nombreTecnico(r.tecnico_id) ?? '?'} size={24} />
            {nombreTecnico(r.tecnico_id)}
          </span>
        )}
        {r.prioridad !== 'normal' && (
          <span className={`text-xs font-medium ${PRIORIDADES.find((p) => p.id === r.prioridad)?.color}`}>
            {t(PRIORIDADES.find((p) => p.id === r.prioridad)?.label ?? '')}
          </span>
        )}
        {r.fecha_estimada && (
          <span className="text-xs text-muted dark:text-dark-text-secondary">
            {t('Prometida:')} {new Date(r.fecha_estimada + 'T00:00:00').toLocaleDateString('es-AR')}
          </span>
        )}
      </div>

      {/* Línea de progreso — presentación derivada del estado actual, no
          aplica a reparaciones canceladas/sin solución. */}
      {r.estado !== 'cancelado' && etapaActualIdx !== -1 && (
        <div className="flex items-center" aria-hidden="true">
          {ETAPAS_PROGRESO.map((etapa, idx) => {
            const completada = idx < etapaActualIdx || r.estado === 'entregado';
            const activa = idx === etapaActualIdx && r.estado !== 'entregado';
            return (
              <div key={etapa.label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      completada || activa ? 'bg-accent dark:bg-dark-accent' : 'bg-border dark:bg-dark-border'
                    } ${activa ? 'ring-4 ring-accent/20 dark:ring-dark-accent/20' : ''}`}
                  />
                  <span
                    className={`text-[10px] whitespace-nowrap ${
                      completada || activa ? 'text-ink dark:text-dark-text font-medium' : 'text-muted dark:text-dark-text-secondary'
                    }`}
                  >
                    {t(etapa.label)}
                  </span>
                </div>
                {idx < ETAPAS_PROGRESO.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 ${idx < etapaActualIdx ? 'bg-accent dark:bg-dark-accent' : 'bg-border dark:bg-dark-border'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {!puedeGestionar && (
        <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
          {t('No tenés permiso para gestionar Servicio Técnico — solo podés ver esta ficha.')}
        </p>
      )}

      {avisoWhatsApp && (
        <div className="rounded-xl border border-good/30 bg-good/10 p-3 flex flex-col gap-2">
          <p className="text-sm">
            {t('¡Equipo marcado como listo!')} {t('¿Le avisamos a')} <strong>{avisoWhatsApp.nombre}</strong> {t('por WhatsApp?')}
          </p>
          <div className="flex gap-2">
            <a
              href={avisoWhatsApp.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAvisoWhatsApp(null)}
              className="flex-1 rounded-lg bg-good text-white text-center py-2 text-sm font-medium"
            >
              {t('Enviar WhatsApp')}
            </a>
            <button
              onClick={() => setAvisoWhatsApp(null)}
              className="rounded-lg border border-border dark:border-dark-border px-3 py-2 text-sm font-medium"
            >
              {t('Ahora no')}
            </button>
          </div>
        </div>
      )}

      {/* Contenido principal (pestañas) + panel lateral fijo */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="min-w-0 flex-1 flex flex-col gap-3 w-full">
          <nav
            aria-label={t('Secciones de la reparación')}
            className="flex gap-1 overflow-x-auto -mx-6 px-6 lg:mx-0 lg:px-0 border-b border-border dark:border-dark-border"
          >
            {TABS.map((tabItem) => {
              const activo = tab === tabItem.id;
              return (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => setTab(tabItem.id)}
                  aria-current={activo ? 'page' : undefined}
                  className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activo
                      ? 'border-accent dark:border-dark-accent text-accent dark:text-dark-accent'
                      : 'border-transparent text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text'
                  }`}
                >
                  {t(tabItem.label)}
                </button>
              );
            })}
          </nav>

          {tab === 'resumen' && (
            <>
            <Seccion titulo={t('Identificación')}>
              {editando ? (
                <div className="flex flex-col gap-2">
                  <Campo label={t('Modelo')} valor={f.modelo} onChange={(v) => setFm((p) => ({ ...p, modelo: v }))} />
                  <div className="flex gap-2">
                    {STORAGE_OPTIONS.map((gb) => (
                      <button
                        key={gb}
                        onClick={() => setFm((p) => ({ ...p, capacidad_gb: gb }))}
                        className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                          f.capacidad_gb === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                        }`}
                      >
                        {gb}GB
                      </button>
                    ))}
                  </div>
                  <SelectorColorAuto modelo={f.modelo} value={f.color} onChange={(v) => setFm((p) => ({ ...p, color: v }))} />
                  <Campo label={t('IMEI')} valor={f.imei} onChange={(v) => setFm((p) => ({ ...p, imei: v }))} mono />
                  <Campo label={t('Código de desbloqueo (opcional)')} valor={f.codigo_desbloqueo} onChange={(v) => setFm((p) => ({ ...p, codigo_desbloqueo: v }))} />
                  <Campo label={t('Ubicación física (ej. Estante A-3)')} valor={f.ubicacion_fisica} onChange={(v) => setFm((p) => ({ ...p, ubicacion_fisica: v }))} />
                  <div>
                    <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Accesorios entregados')}</label>
                    <div className="flex flex-wrap gap-2">
                      {ACCESORIOS_OPCIONES.map((a) => (
                        <button
                          key={a}
                          onClick={() => toggleAccesorio(a)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                            f.accesorios.includes(a) ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                          }`}
                        >
                          {t(a)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm flex flex-col gap-1">
                  <p className="text-xs">
                    {r.cliente_id ? (
                      <span className="flex items-center gap-1 text-accent dark:text-dark-accent">
                        <IconoChico nombre="clientes" /> {t('Equipo de un cliente')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted dark:text-dark-text-secondary">
                        <IconoChico nombre="local" /> {t('Equipo propio del local')}
                      </span>
                    )}
                  </p>
                  {nombreCliente && (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('Cliente:')} </span>
                      {nombreCliente} {r.clientes?.telefono ? `· ${r.clientes.telefono}` : ''}
                    </p>
                  )}
                  <p>
                    <span className="text-muted dark:text-dark-text-secondary">{t('Equipo:')} </span>
                    {r.modelo}
                    {r.capacidad_gb ? ` · ${r.capacidad_gb}GB` : ''}
                    {r.color ? ` · ${r.color}` : ''}
                  </p>
                  {r.imei && (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('IMEI:')} </span>
                      <span className="font-mono font-bold">{r.imei}</span>
                    </p>
                  )}
                  {r.codigo_desbloqueo && (
                    <p className="flex items-center gap-2">
                      <span className="text-muted dark:text-dark-text-secondary">{t('Código de desbloqueo:')} </span>
                      <span className="font-mono">{codigoVisible ? r.codigo_desbloqueo : '••••••'}</span>
                      <button onClick={() => setCodigoVisible((v) => !v)} className="text-xs text-accent dark:text-dark-accent underline">
                        {codigoVisible ? t('ocultar') : t('mostrar')}
                      </button>
                    </p>
                  )}
                  {r.accesorios?.length > 0 && (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('Accesorios:')} </span>
                      {r.accesorios.join(', ')}
                    </p>
                  )}
                  {r.ubicacion_fisica && (
                    <p className="flex items-center gap-1">
                      <span className="text-muted dark:text-dark-text-secondary">{t('Ubicación:')} </span>
                      <IconoChico nombre="ubicacion" /> {r.ubicacion_fisica}
                    </p>
                  )}
                </div>
              )}
            </Seccion>

            {reparacionesRelacionadas.length > 0 && (
              <Seccion titulo={t('Garantías y retrabajos')}>
                <p className="text-xs text-muted dark:text-dark-text-secondary -mt-1 mb-1">
                  {t('Este equipo (mismo IMEI) ya pasó antes por el taller:')}
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  {reparacionesRelacionadas.map((rr) => {
                    const info = reparacionRelacionadaLabel(rr);
                    const elegida = reparacionRelacionadaElegida === rr.id;
                    return (
                      <div
                        key={rr.id}
                        className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 border ${
                          elegida ? 'border-accent/40 dark:border-dark-accent/40 bg-accent-soft dark:bg-dark-accent-soft' : 'border-transparent bg-canvas dark:bg-dark-bg'
                        }`}
                      >
                        {reparacionesRelacionadas.length > 1 && puedeGestionar && (
                          <input
                            type="radio"
                            name="reparacion-relacionada"
                            checked={elegida}
                            onChange={() => setReparacionRelacionadaElegida(rr.id)}
                            aria-label={`${t('Vincular a')} ${info.titulo}`}
                            className="shrink-0 accent-ink"
                          />
                        )}
                        <Link href={`/servicio-tecnico/${rr.id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {info.titulo}
                        </Link>
                        <span className={`shrink-0 ${info.vencida ? 'text-bad' : 'text-muted dark:text-dark-text-secondary'}`}>
                          {info.garantiaTexto}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {puedeGestionar && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-muted dark:text-dark-text-secondary">
                      {t('¿Cómo clasificamos este ingreso')}{reparacionesRelacionadas.length > 1 ? t(', respecto de la reparación marcada arriba') : ''}?
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {TIPOS_INGRESO.map((ti) => (
                        <button
                          key={ti.id}
                          disabled={guardandoClasificacion}
                          onClick={() => guardarClasificacionIngreso(ti.id, reparacionRelacionadaElegida)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                            r.tipo_ingreso === ti.id ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                          }`}
                        >
                          {t(ti.label)}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted dark:text-dark-text-secondary">
                      {t('No reutiliza el margen ni el costo de la reparación anterior — esta reparación calcula el suyo propio siempre.')}
                    </p>
                  </div>
                )}
              </Seccion>
            )}
            </>
          )}

          {tab === 'recepcion' && (
            <Seccion titulo={t('Recepción')}>
              {editando ? (
                <div className="flex flex-col gap-2">
                  <Campo label={t('Falla declarada por el cliente')} valor={f.falla_declarada} onChange={(v) => setFm((p) => ({ ...p, falla_declarada: v }))} textarea />
                  <Campo label={t('Estado estético')} valor={f.estado_estetico} onChange={(v) => setFm((p) => ({ ...p, estado_estetico: v }))} />
                  <CheckTri label={t('Enciende')} valor={f.enciende} onChange={(v) => setFm((p) => ({ ...p, enciende: v }))} />
                  {ITEMS_CHECKLIST_INGRESO.map((item) => {
                    const deshabilitado = CAMPOS_DEPENDEN_MODULO.includes(item.campo) && f.modulo_ok === false;
                    return (
                      <CheckTri
                        key={item.campo}
                        label={t(item.label)}
                        disabled={deshabilitado}
                        valor={deshabilitado ? null : f[item.campo]}
                        onChange={(v) => setFm((p) => ({ ...p, [item.campo]: v }))}
                      />
                    );
                  })}
                  <CheckTri label={t('Humedad / manipulación')} valor={f.humedad} onChange={(v) => setFm((p) => ({ ...p, humedad: v }))} invertido />
                  <Campo
                    label={t('Excepción adicional a la garantía (opcional)')}
                    valor={f.garantia_excepcion_manual}
                    onChange={(v) => setFm((p) => ({ ...p, garantia_excepcion_manual: v }))}
                    textarea
                  />
                  <p className="text-[10px] text-muted dark:text-dark-text-secondary -mt-1">
                    {t('Para excluir algo que hoy funciona pero quedó en duda (ej.: "por golpe fuerte, no garantizamos Face ID"). Lo que ya marcaste como falla arriba se excluye solo, no hace falta repetirlo acá.')}
                  </p>
                  <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={f.garantia_condiciones_aceptadas}
                      onChange={(e) => setFm((p) => ({ ...p, garantia_condiciones_aceptadas: e.target.checked }))}
                      className="h-4 w-4 accent-ink"
                    />
                    {t('El cliente aceptó las condiciones de garantía y diagnóstico')}
                  </label>
                  <TextoCondicionGenerado datos={f as any} />
                </div>
              ) : (
                <div className="text-sm flex flex-col gap-1">
                  {r.falla_declarada && (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('Falla declarada:')} </span>
                      {r.falla_declarada}
                    </p>
                  )}
                  {r.estado_estetico && (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('Estado estético:')} </span>
                      {r.estado_estetico}
                    </p>
                  )}
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted dark:text-dark-text-secondary">
                    {itemChecklist(t('Enciende'), r.enciende)}
                    {ITEMS_CHECKLIST_INGRESO.map((item) => itemChecklist(t(item.label), (r as any)[item.campo]))}
                    {/* Reparaciones cargadas antes de este cambio: si nunca se usó la checklist nueva, mostramos la vieja para no perder ese historial. */}
                    {r.camara_frontal_ok == null && r.camara_trasera_ok == null && itemChecklist(t('Cámaras'), r.camaras_ok)}
                    {r.boton_power_ok == null && r.boton_volumen_ok == null && itemChecklist(t('Botones'), r.botones_ok)}
                    {r.humedad != null && (
                      <span className="flex items-center gap-1">
                        <IconoChico nombre={r.humedad ? 'alerta' : 'check'} className={r.humedad ? 'text-warn' : 'text-good'} />
                        {r.humedad ? t('Con humedad/manipulación') : t('Sin humedad')}
                      </span>
                    )}
                  </p>
                  {r.garantia_condiciones_aceptadas && <p className="text-xs text-good">✓ {t('Cliente aceptó condiciones de garantía')}</p>}
                  <TextoCondicionGenerado datos={r as any} />
                </div>
              )}
            </Seccion>
          )}

          {tab === 'diagnostico' && (
            <Seccion titulo={t('Diagnóstico')}>
              {editando ? (
                <div className="flex flex-col gap-2">
                  <Campo label={t('Diagnóstico técnico')} valor={f.diagnostico} onChange={(v) => setFm((p) => ({ ...p, diagnostico: v }))} textarea />
                  <div>
                    <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Técnico asignado')}</label>
                    <select
                      value={f.tecnico_id}
                      onChange={(e) => setFm((p) => ({ ...p, tecnico_id: e.target.value }))}
                      className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">{t('Sin asignar')}</option>
                      {tecnicos.map((tec) => (
                        <option key={tec.id} value={tec.id}>
                          {tec.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Prioridad')}</label>
                    <div className="flex gap-2">
                      {PRIORIDADES.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setFm((prev) => ({ ...prev, prioridad: p.id }))}
                          className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                            f.prioridad === p.id ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                          }`}
                        >
                          {t(p.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Campo label={t('Trabajo recomendado')} valor={f.trabajo_recomendado} onChange={(v) => setFm((p) => ({ ...p, trabajo_recomendado: v }))} textarea />
                  <div>
                    <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Fecha estimada de entrega')}</label>
                    <CampoFecha
                      value={f.fecha_estimada}
                      onChange={(iso) => setFm((p) => ({ ...p, fecha_estimada: iso }))}
                      ancho="completo"
                      classNameSelect="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-2 py-3 text-sm"
                    />
                  </div>
                  <Campo label={t('Observaciones internas (no las ve el cliente)')} valor={f.observaciones_internas} onChange={(v) => setFm((p) => ({ ...p, observaciones_internas: v }))} textarea />
                </div>
              ) : (
                <div className="text-sm flex flex-col gap-1">
                  {r.diagnostico && (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('Diagnóstico:')} </span>
                      {r.diagnostico}
                    </p>
                  )}
                  {r.trabajo_recomendado && (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('Trabajo recomendado:')} </span>
                      {r.trabajo_recomendado}
                    </p>
                  )}
                  {r.fecha_estimada && (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('Fecha estimada:')} </span>
                      {new Date(r.fecha_estimada + 'T00:00:00').toLocaleDateString('es-AR')}
                    </p>
                  )}
                  {r.observaciones_internas && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary italic">{t('Nota interna:')} {r.observaciones_internas}</p>
                  )}
                  {!r.diagnostico && !r.trabajo_recomendado && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Todavía no se cargó un diagnóstico.')}</p>
                  )}
                </div>
              )}
            </Seccion>
          )}

          {tab === 'presupuesto' && (
            <Seccion titulo={t('Presupuesto')}>
              {editando ? (
                <div className="flex gap-2">
                  <Campo label={t('Mano de obra ($)')} valor={f.presupuesto_mano_obra} onChange={(v) => setFm((p) => ({ ...p, presupuesto_mano_obra: v }))} numerico />
                  <Campo label={t('Repuestos ($)')} valor={f.presupuesto_repuestos} onChange={(v) => setFm((p) => ({ ...p, presupuesto_repuestos: v }))} numerico />
                </div>
              ) : (
                <div className="text-sm flex flex-col gap-2">
                  {r.presupuesto_mano_obra != null || r.presupuesto_repuestos != null ? (
                    <p>
                      <span className="text-muted dark:text-dark-text-secondary">{t('Total presupuestado:')} </span>$
                      {((r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0)).toLocaleString('es-AR')}{' '}
                      <span className="text-xs text-muted dark:text-dark-text-secondary">
                        ({t('mano de obra')} ${(r.presupuesto_mano_obra || 0).toLocaleString('es-AR')} + {t('repuestos')} $
                        {(r.presupuesto_repuestos || 0).toLocaleString('es-AR')})
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Todavía no se cargó un presupuesto.')}</p>
                  )}

                  {(r.presupuesto_mano_obra != null || r.presupuesto_repuestos != null) && (
                    <div className="rounded-lg bg-canvas dark:bg-dark-bg p-2.5 flex flex-col gap-1.5">
                      <p className="text-xs font-medium flex items-center gap-1.5">
                        {r.presupuesto_estado === 'aprobado' && (
                          <span className="flex items-center gap-1 text-good">
                            <IconoChico nombre="check" /> {t('Aprobado')}
                          </span>
                        )}
                        {r.presupuesto_estado === 'rechazado' && (
                          <span className="flex items-center gap-1 text-bad">
                            <IconoChico nombre="cerrar" /> {t('Rechazado')}
                          </span>
                        )}
                        {r.presupuesto_estado === 'enviado' && (
                          <span className="flex items-center gap-1 text-warn">
                            <IconoChico nombre="enviar" /> {t('Enviado, sin responder')}
                          </span>
                        )}
                        {!r.presupuesto_estado && <span className="text-muted dark:text-dark-text-secondary">{t('Sin enviar')}</span>}
                      </p>
                      {r.presupuesto_enviado_at && (
                        <p className="text-[11px] text-muted dark:text-dark-text-secondary">{t('Enviado')} {fmt(r.presupuesto_enviado_at)}</p>
                      )}
                      {r.presupuesto_respondido_at && (
                        <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                          {t('Respondido')} {fmt(r.presupuesto_respondido_at)} · {t('vía')} {r.presupuesto_medio === 'portal' ? t('link de seguimiento') : r.presupuesto_medio === 'whatsapp' ? 'WhatsApp' : t('registro manual')}
                        </p>
                      )}
                      {r.presupuesto_importe_aceptado != null && (
                        <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                          {t('Importe que se aceptó:')} ${r.presupuesto_importe_aceptado.toLocaleString('es-AR')} {t('(queda fijo aunque el presupuesto cambie después)')}
                        </p>
                      )}
                      {r.presupuesto_estado !== 'aprobado' && r.presupuesto_estado !== 'rechazado' && puedeGestionar && (
                        <div className="flex gap-2 mt-1">
                          <button
                            disabled={guardando}
                            onClick={() => registrarRespuestaPresupuestoManual(true)}
                            className="flex-1 rounded-lg bg-good text-white py-1.5 text-xs font-medium disabled:opacity-40"
                          >
                            {t('Registrar aprobación')}
                          </button>
                          <button
                            disabled={guardando}
                            onClick={() => registrarRespuestaPresupuestoManual(false)}
                            className="flex-1 rounded-lg border border-bad/40 text-bad py-1.5 text-xs font-medium disabled:opacity-40"
                          >
                            {t('Registrar rechazo')}
                          </button>
                        </div>
                      )}
                      {r.presupuesto_estado === 'rechazado' && puedeGestionar && (
                        <button disabled={guardando} onClick={reabrirPresupuesto} className="rounded-lg border border-border dark:border-dark-border py-1.5 text-xs font-medium mt-1 disabled:opacity-40">
                          {t('Reabrir para pedir una nueva respuesta')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Seccion>
          )}

          {tab === 'servicios' && (
            <>
              <Seccion titulo={t('Trabajo realizado')}>
                {editando ? (
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Servicios realizados')}</label>
                      <div className="flex flex-wrap gap-2">
                        {trabajos.map((tr) => (
                          <button
                            key={tr.id}
                            onClick={() => toggleTrabajo(tr.nombre)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                              f.trabajos_realizados.includes(tr.nombre) ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                            }`}
                          >
                            {tr.nombre}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Campo label={t('Repuestos utilizados (nota libre)')} valor={f.repuestos_utilizados} onChange={(v) => setFm((p) => ({ ...p, repuestos_utilizados: v }))} textarea />
                    <Campo label={t('Resultado final / pruebas')} valor={f.resultado_final} onChange={(v) => setFm((p) => ({ ...p, resultado_final: v }))} textarea />
                    <Campo label={t('Importe total ($)')} valor={f.importe_total} onChange={(v) => setFm((p) => ({ ...p, importe_total: v }))} numerico />
                    <div>
                      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Forma de pago')}</label>
                      <div className="flex gap-2">
                        {FORMAS_PAGO.map((fp) => (
                          <button
                            key={fp}
                            onClick={() => setFm((p) => ({ ...p, forma_pago: fp }))}
                            className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                              f.forma_pago === fp ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                            }`}
                          >
                            {t(fp)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Campo label={t('Garantía de la reparación (días)')} valor={f.garantia_dias} onChange={(v) => setFm((p) => ({ ...p, garantia_dias: v }))} numerico />
                  </div>
                ) : (
                  <div className="text-sm flex flex-col gap-1">
                    {r.trabajos_realizados?.length > 0 && (
                      <p>
                        <span className="text-muted dark:text-dark-text-secondary">{t('Trabajos realizados:')} </span>
                        {r.trabajos_realizados.join(', ')}
                      </p>
                    )}
                    {r.repuestos_utilizados && (
                      <p>
                        <span className="text-muted dark:text-dark-text-secondary">{t('Nota de repuestos:')} </span>
                        {r.repuestos_utilizados}
                      </p>
                    )}
                    {r.resultado_final && (
                      <p>
                        <span className="text-muted dark:text-dark-text-secondary">{t('Resultado:')} </span>
                        {r.resultado_final}
                      </p>
                    )}
                    {r.importe_total != null && (
                      <p>
                        <span className="text-muted dark:text-dark-text-secondary">{t('Importe total:')} </span>${r.importe_total.toLocaleString('es-AR')}
                      </p>
                    )}
                    {r.forma_pago && (
                      <p>
                        <span className="text-muted dark:text-dark-text-secondary">{t('Forma de pago:')} </span>
                        {t(r.forma_pago)}
                      </p>
                    )}
                    {r.garantia_dias != null && (
                      <p>
                        <span className="text-muted dark:text-dark-text-secondary">{t('Garantía:')} </span>
                        {r.garantia_dias} {t('días')}
                      </p>
                    )}
                    {r.fecha_entrega && (
                      <p>
                        <span className="text-muted dark:text-dark-text-secondary">{t('Entregado:')} </span>
                        {fmt(r.fecha_entrega)}
                      </p>
                    )}
                  </div>
                )}
              </Seccion>

              <Seccion titulo={t('Repuestos usados (del stock)')}>
                <p className="text-xs text-muted dark:text-dark-text-secondary -mt-1 mb-2">
                  {t('Distinto de la nota de arriba: acá se descuenta stock real y queda el costo de verdad, para calcular la ganancia de esta reparación.')}
                </p>

                {repuestosUsados.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3">
                    {repuestosUsados.map((ru) => (
                      <div key={ru.id} className="flex items-center justify-between gap-2 rounded-lg bg-canvas dark:bg-dark-bg px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {ru.cantidad}× {ru.nombre_repuesto}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-muted dark:text-dark-text-secondary">
                            {ru.costo_unitario != null ? `$${(ru.costo_unitario * ru.cantidad).toLocaleString('es-AR')}` : t('sin costo')}
                          </span>
                          {puedeGestionar && (
                            <button onClick={() => quitarRepuestoUsado(ru)} className="text-xs text-bad underline">
                              {t('Quitar')}
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                    <div className="flex flex-col gap-0.5 pt-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted dark:text-dark-text-secondary">{t('Costo repuestos')} {hayCostosFaltantes && t('(parcial)')}</span>
                        <span className="font-medium">${costoRepuestosTotal.toLocaleString('es-AR')}</span>
                      </div>
                      {margen != null && (
                        <div className="flex justify-between">
                          <span className="text-muted dark:text-dark-text-secondary">{t('Margen (cobrado − repuestos)')}</span>
                          <span className={`font-medium ${margen >= 0 ? 'text-good' : 'text-bad'}`}>${margen.toLocaleString('es-AR')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {puedeGestionar && (
                  <div className="flex flex-col gap-2">
                    {repuestoElegido ? (
                      <div className="rounded-lg border border-accent/40 dark:border-dark-accent/40 bg-accent-soft dark:bg-dark-accent-soft px-3 py-2 flex items-center justify-between gap-2">
                        <span className="text-sm truncate">{repuestoElegido.nombre}</span>
                        <button onClick={() => setRepuestoElegido(null)} className="text-xs text-accent dark:text-dark-accent underline shrink-0">
                          {t('Cambiar')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          value={buscarRepuesto}
                          onChange={(e) => setBuscarRepuesto(e.target.value)}
                          placeholder={t('Buscar repuesto en stock...')}
                          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                        />
                        {buscarRepuesto && (
                          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                            {repuestosFiltrados.length === 0 && (
                              <p className="text-xs text-muted dark:text-dark-text-secondary px-1">
                                {t('Sin resultados con stock disponible.')}{' '}
                                <Link href="/servicio-tecnico/stock" className="underline">
                                  {t('Cargar en Stock de repuestos')}
                                </Link>
                              </p>
                            )}
                            {repuestosFiltrados.map((rp) => (
                              <button
                                key={rp.id}
                                onClick={() => setRepuestoElegido(rp)}
                                className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-left text-xs flex items-center justify-between gap-2"
                              >
                                <span>{rp.nombre}</span>
                                <span className="text-muted dark:text-dark-text-secondary shrink-0">{t('Stock:')} {rp.cantidad_stock}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {repuestoElegido && (
                      <div className="flex gap-2">
                        <input
                          value={cantidadRepuesto}
                          onChange={(e) => setCantidadRepuesto(e.target.value.replace(/[^\d]/g, ''))}
                          inputMode="numeric"
                          placeholder={t('Cantidad')}
                          className="w-24 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                        />
                        <button
                          disabled={guardandoRepuesto || !cantidadRepuesto}
                          onClick={agregarRepuestoUsado}
                          className="flex-1 rounded-lg bg-accent dark:bg-dark-accent text-white py-2 text-sm font-medium disabled:opacity-40"
                        >
                          {guardandoRepuesto ? t('Guardando...') : t('Usar en esta reparación')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Seccion>
            </>
          )}

          {tab === 'control' && (
            <Seccion titulo={t('Control de calidad')}>
              <p className="text-xs text-muted dark:text-dark-text-secondary -mt-1 mb-1">
                {checklistAplicable === CHECKLIST_CALIDAD_GENERICO
                  ? t('Checklist genérico (ninguno de los servicios realizados tiene uno propio cargado).')
                  : t('Checklist tomado de los servicios realizados en esta reparación.')}
              </p>
              {r.control_calidad_override && (
                <p className="flex items-center gap-1 text-xs text-warn mb-1">
                  <IconoChico nombre="alerta" /> {t('Se marcó "Listo para entregar" con controles pendientes (override registrado en el historial).')}
                </p>
              )}
              <ControlCalidad
                checklist={checklistAplicable}
                registros={controlCalidad}
                onGuardar={guardarItemControlCalidad}
                soloLectura={!puedeGestionar}
              />
            </Seccion>
          )}

          {tab === 'evidencias' &&
            (editando ? (
              <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-6">{t('Guardá o cancelá la edición para usar esta sección.')}</p>
            ) : (
              <Seccion titulo={t('Evidencia para el cliente')}>
                <p className="text-xs text-muted dark:text-dark-text-secondary -mt-1 mb-2">
                  {t('Fotos y notas que el cliente ve en /seguimiento (ej. daños encontrados al abrir el equipo).')}
                </p>
                <div className="flex flex-col gap-2 mb-3">
                  {fotoEvidenciaBase64 && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fotoEvidenciaBase64} alt="" className="h-32 w-32 object-cover rounded-lg border border-border dark:border-dark-border self-start" />
                  )}
                  <label className="self-start flex items-center gap-1 rounded-lg border border-border dark:border-dark-border px-3 py-2 text-xs font-medium cursor-pointer">
                    <IconoChico nombre="camara" />
                    {fotoEvidenciaBase64 ? t('Cambiar foto') : t('Sacar/elegir foto (opcional)')}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={elegirFotoEvidencia} />
                  </label>
                  <textarea
                    value={notaEvidencia}
                    onChange={(e) => setNotaEvidencia(e.target.value)}
                    placeholder={t('Ej: al abrir el equipo encontramos el módulo roto y faltaban 3 tornillos')}
                    rows={2}
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    disabled={subiendoEvidencia || (!fotoEvidenciaBase64 && !notaEvidencia.trim())}
                    onClick={agregarEvidencia}
                    className="self-start rounded-lg bg-accent dark:bg-dark-accent text-white px-4 py-2 text-xs font-medium disabled:opacity-40"
                  >
                    {subiendoEvidencia ? t('Guardando...') : t('Agregar evidencia')}
                  </button>
                </div>

                {evidencias.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {evidencias.map((e) => (
                      <div key={e.id} className="rounded-lg bg-canvas dark:bg-dark-bg p-2.5 flex gap-2.5">
                        {e.foto_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.foto_url} alt="" className="h-16 w-16 object-cover rounded-lg shrink-0" />
                        )}
                        <div className="min-w-0">
                          {e.nota && <p className="text-xs whitespace-pre-wrap">{e.nota}</p>}
                          <p className="text-[10px] text-muted dark:text-dark-text-secondary">
                            {e.actor_nombre ? `${e.actor_nombre} · ` : ''}
                            {fmt(e.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Seccion>
            ))}

          {tab === 'comunicacion' &&
            (editando ? (
              <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-6">{t('Guardá o cancelá la edición para usar esta sección.')}</p>
            ) : (
              <Seccion titulo={t('Comunicación')}>
                {r.cliente_id && r.clientes?.telefono ? (
                  <>
                    <p className="text-xs text-muted dark:text-dark-text-secondary -mt-1 mb-1">
                      {t('Genera el mensaje y abre WhatsApp — no confirma que el cliente lo haya recibido, solo que se abrió para enviarlo.')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button disabled={guardando} onClick={() => enviarWhatsApp('recibido')} className="rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium disabled:opacity-40">
                        {t('Recibimos tu equipo')}
                      </button>
                      <button disabled={guardando} onClick={() => enviarWhatsApp('presupuesto')} className="rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium disabled:opacity-40">
                        {t('Presupuesto')}
                      </button>
                      <button disabled={guardando} onClick={() => enviarWhatsApp('repuesto')} className="rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium disabled:opacity-40">
                        {t('Esperando repuesto')}
                      </button>
                      <button disabled={guardando} onClick={() => enviarWhatsApp('listo')} className="rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium disabled:opacity-40">
                        {t('Ya está listo')}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {r.cliente_id ? t('Este cliente no tiene teléfono cargado.') : t('Equipo propio del local — sin cliente para contactar.')}
                  </p>
                )}
                <div className="flex flex-col gap-1.5 mt-3">
                  {eventos
                    .filter((ev) => ev.tipo === 'mensaje_cliente')
                    .map((ev) => (
                      <div key={ev.id} className="text-xs flex gap-2">
                        <IconoChico nombre="soporte" className="mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-ink dark:text-dark-text">{ev.texto}</p>
                          <p className="text-muted dark:text-dark-text-secondary">
                            {ev.actor_nombre ? `${ev.actor_nombre} · ` : ''}
                            {fmt(ev.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  {eventos.filter((ev) => ev.tipo === 'mensaje_cliente').length === 0 && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Todavía no se envió ningún mensaje.')}</p>
                  )}
                </div>
              </Seccion>
            ))}

          {tab === 'historial' &&
            (editando ? (
              <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-6">{t('Guardá o cancelá la edición para usar esta sección.')}</p>
            ) : (
              <Seccion titulo={t('Historial')}>
                <div className="flex flex-col gap-2 mb-2">
                  <textarea
                    value={notaTexto}
                    onChange={(e) => setNotaTexto(e.target.value)}
                    placeholder={t('Agregar nota interna (solo la ve el personal)...')}
                    rows={2}
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    disabled={!notaTexto.trim() || guardando}
                    onClick={agregarNota}
                    className="self-start rounded-lg bg-accent dark:bg-dark-accent text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  >
                    {t('Agregar nota')}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {eventos.map((ev) => (
                    <div key={ev.id} className="text-xs flex gap-2">
                      <IconoChico
                        nombre={ev.tipo === 'nota_interna' ? 'documento' : ev.tipo === 'mensaje_cliente' ? 'soporte' : 'configuracion'}
                        className="mt-0.5"
                      />
                      <div className="min-w-0">
                        <p className="text-ink dark:text-dark-text">{ev.texto}</p>
                        <p className="text-muted dark:text-dark-text-secondary">
                          {ev.actor_nombre ? `${ev.actor_nombre} · ` : ''}
                          {fmt(ev.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Seccion>
            ))}
        </div>

        {/* Panel lateral fijo */}
        <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-3">
          <div className="rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft/40 dark:bg-dark-accent-soft/40 p-3 flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-accent dark:text-dark-accent">{t('Próxima acción')}</p>
            {accionSiguiente ? (
              <button
                disabled={guardando || !puedeGestionar}
                onClick={() => cambiarEstado(accionSiguiente.estado)}
                className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {t(accionSiguiente.label)}
              </button>
            ) : (
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {r.estado === 'esperando_aprobacion' && t('Esperando aprobación del cliente.')}
                {r.estado === 'esperando_repuesto' && t('Esperando que llegue un repuesto.')}
                {r.estado === 'listo_para_entregar' && t('Lista para entregar — usá las acciones de abajo.')}
                {r.estado === 'entregado' && t('Ya se entregó al cliente.')}
                {r.estado === 'cancelado' && t('Cancelada / sin solución.')}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-1.5 text-xs">
            {(r.presupuesto_mano_obra != null || r.presupuesto_repuestos != null) && (
              <div className="flex justify-between">
                <span className="text-muted dark:text-dark-text-secondary">{t('Presupuestado')}</span>
                <span className="font-medium">${presupuestoSuma.toLocaleString('es-AR')}</span>
              </div>
            )}
            {r.importe_total != null && (
              <div className="flex justify-between">
                <span className="text-muted dark:text-dark-text-secondary">{t('Cobrado')}</span>
                <span className="font-medium">${r.importe_total.toLocaleString('es-AR')}</span>
              </div>
            )}
            {puedeGestionar && repuestosUsados.length > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted dark:text-dark-text-secondary">{t('Costo repuestos')}</span>
                  <span className="font-medium">${costoRepuestosTotal.toLocaleString('es-AR')}</span>
                </div>
                {margen != null && (
                  <div className="flex justify-between">
                    <span className="text-muted dark:text-dark-text-secondary">{t('Margen')}</span>
                    <span className={`font-medium ${margen >= 0 ? 'text-good' : 'text-bad'}`}>${margen.toLocaleString('es-AR')}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between">
              <span className="text-muted dark:text-dark-text-secondary">{t('Pago')}</span>
              <span className="font-medium">
                {r.orden_cobro_id ? `✓ ${t('Con orden de cobro')}` : r.importe_total != null ? `✓ ${t('Cobrado')}` : t('Pendiente')}
              </span>
            </div>
          </div>

          <button
            onClick={() => setTab('control')}
            className={`rounded-xl border px-3 py-2.5 text-left text-xs flex items-center justify-between gap-2 ${
              controlesFaltantes.length === 0
                ? 'border-good/30 bg-good/10 text-good'
                : 'border-warn/30 bg-warn/10 text-warn'
            }`}
          >
            <span className="flex items-center gap-1 font-medium">
              <IconoChico nombre="lupa" /> {t('Control de calidad')}
            </span>
            <span>
              {checklistAplicable.length - controlesFaltantes.length}/{checklistAplicable.length}
            </span>
          </button>

          {r.cliente_id && r.token_seguimiento && (
            <button
              onClick={copiarLinkSeguimiento}
              className="rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium"
            >
              {linkCopiado ? (
                <span className="flex items-center justify-center gap-1">
                  <IconoChico nombre="check" /> {t('Copiado')}
                </span>
              ) : (
                t('Copiar link de seguimiento')
              )}
            </button>
          )}
          <Link
            href={`/servicio-tecnico/etiqueta/${r.id}`}
            className="flex items-center justify-center gap-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium"
          >
            <IconoChico nombre="etiqueta" /> {t('Imprimir etiqueta')}
          </Link>

          {!editando && (
            <>
              {!r.orden_cobro_id &&
                puedeGestionar &&
                r.cliente_id &&
                (r.estado === 'listo_para_entregar' || r.estado === 'entregado') && (
                  <div className="flex flex-col gap-2">
                    {r.estado === 'listo_para_entregar' && (
                      <button
                        disabled={guardando}
                        onClick={marcarEntregadoClienteFicha}
                        className="rounded-xl bg-good hover:opacity-90 transition-opacity py-2.5 text-center text-xs font-medium text-white disabled:opacity-40"
                      >
                        {t('Marcar entregado al cliente')}
                      </button>
                    )}
                    <button
                      disabled={guardando}
                      onClick={generarOrdenCobro}
                      className={`rounded-xl py-2.5 text-center text-xs font-medium disabled:opacity-40 ${
                        r.estado === 'listo_para_entregar' ? 'border border-border dark:border-dark-border' : 'bg-good hover:opacity-90 transition-opacity text-white'
                      }`}
                    >
                      {t('Generar orden de cobro')}
                    </button>
                  </div>
                )}

              {!r.cliente_id && (r.estado === 'listo_para_entregar' || r.estado === 'entregado') && !r.agregado_a_stock && (
                puedeAgregarStock ? (
                  <button
                    disabled={guardando}
                    onClick={agregarAlStockFicha}
                    className="rounded-xl bg-good hover:opacity-90 transition-opacity py-2.5 text-center text-xs font-medium text-white disabled:opacity-40"
                  >
                    {t('Agregar al Stock')}
                  </button>
                ) : (
                  r.estado === 'entregado' && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
                      {t('Entregado — el agregado al Stock lo hace quien tiene ese permiso.')}
                    </p>
                  )
                )
              )}
              {!r.cliente_id && r.agregado_a_stock && (
                <p className="flex items-center justify-center gap-1 text-xs text-good text-center">
                  <IconoChico nombre="check" /> {t('Ya se agregó al Stock')}
                </p>
              )}

              {avisoAgregarStock && (
                <div className="rounded-xl border border-good/30 bg-good/10 p-3 flex flex-col gap-2">
                  <p className="text-xs">{t('¿Agregamos este equipo al Stock ahora?')}</p>
                  <div className="flex gap-2">
                    <button
                      disabled={guardando}
                      onClick={agregarAlStockFicha}
                      className="flex-1 rounded-lg bg-good text-white text-center py-2 text-xs font-medium disabled:opacity-40"
                    >
                      {t('Agregar al Stock')}
                    </button>
                    <button
                      onClick={() => setAvisoAgregarStock(false)}
                      className="rounded-lg border border-border dark:border-dark-border px-3 py-2 text-xs font-medium"
                    >
                      {t('Ahora no')}
                    </button>
                  </div>
                </div>
              )}

              {r.orden_cobro_id && (
                <div className="flex flex-col gap-2">
                  <Link href={`/ordenes/${r.orden_cobro_id}`} className="rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium">
                    {t('Ver orden de cobro')}
                  </Link>
                  {puedeGestionar && (
                    <button
                      disabled={guardando}
                      onClick={generarOrdenCobro}
                      className="rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium disabled:opacity-40"
                      title={t('Si editaste el presupuesto después de generar la orden, usá esto para que coincidan.')}
                    >
                      {t('Actualizar orden de cobro')}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      {editando && (
        <button
          disabled={guardando}
          onClick={guardar}
          className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40 sticky bottom-4"
        >
          {guardando ? t('Guardando...') : t('Guardar cambios')}
        </button>
      )}
    </main>
  );
}

function itemChecklist(label: string, valor: boolean | null) {
  if (valor == null) return null;
  return (
    <span key={label} className="inline-flex items-center gap-1">
      <span aria-hidden="true" className={`[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0 ${valor ? 'text-good' : 'text-bad'}`}>
        {ICONOS[valor ? 'check' : 'cerrar']}
      </span>
      {label}
    </span>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary">{titulo}</p>
      {children}
    </div>
  );
}

function Campo({
  label,
  valor,
  onChange,
  mono,
  numerico,
  textarea,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
  numerico?: boolean;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      {textarea ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={valor}
          onChange={(e) => onChange(numerico ? sanitizarDecimal(e.target.value) : e.target.value)}
          inputMode={numerico ? 'decimal' : undefined}
          className={`w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm ${mono ? 'font-mono' : ''}`}
        />
      )}
    </div>
  );
}
