'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { asegurarModelo, normalizarNombreModelo } from '../lib/modelos';
import { TODOS_LOS_MODELOS_CATALOGO } from '../lib/catalogosMarcas';
import { limpiarImei } from '../lib/imei';
import { armarLinkWhatsApp, mensajeSeguimientoServicio, mensajeListoServicio } from '../lib/whatsapp';
import { codigoLlamada } from '../lib/paises';
import { obtenerImagenesCarpetas } from '../lib/carpetas';
import { registrarAuditoria } from '../lib/auditoria';
import { cambiarEstadoReparacion } from '../lib/estadoReparacion';
import { liberarRepuestosDeReparaciones } from '../lib/repuestos';
import { getActor, useActor, MENSAJE_ACTOR_REQUERIDO } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { obtenerTodasLasFilas } from '../lib/db';
import {
  calcularAlertas,
  esHoy,
  ITEMS_CHECKLIST_INGRESO,
  CAMPOS_DEPENDEN_MODULO,
  generarTextoCondicionIngreso,
  ChecklistIngreso,
  RepuestoParaAlerta,
  FINALIZADOS,
  esDemorado,
  type TipoBloqueo,
  type TipoDispositivo,
} from '../lib/reparaciones';
import CapturarBloqueo from '../CapturarBloqueo';
import SelectorTipoDispositivo from '../SelectorTipoDispositivo';
import Avatar from '../Avatar';
import SelectorColorAuto from '../SelectorColorAuto';
import CheckTri from '../CheckTri';
import TextoCondicionGenerado from '../TextoCondicionGenerado';
import ServicioTecnicoTabs from '../ServicioTecnicoTabs';
import TarjetaReparacion, { Reparacion, Tecnico } from './TarjetaReparacion';
import MiBanco from './MiBanco';
import { ICONOS } from '../Iconos';
import { QCard } from '../QCard';
import { QoviState } from '../QoviState';
import { useT } from '../lib/idioma';
import { useSucursalActual } from '../lib/sucursal';
import { obtenerSucursales, type Sucursal } from '../lib/sucursales';

const STORAGE_OPTIONS = [64, 128, 256, 512];

function idTemporal() {
  return Math.random().toString(36).slice(2);
}

// Un ingreso puede traer varios equipos del mismo cliente (ej. trae 3
// celulares juntos): cada uno se agrega a esta lista con "+ Agregar otro
// equipo" y se guardan todos de una, compartiendo cliente/técnico/boleta.
type EquipoIngreso = {
  tempId: string;
  modelo: string;
  capacidad_gb: number | null;
  color: string;
  imei: string;
  falla: string;
  ubicacion: string;
  checklist: ChecklistIngreso;
  tipoDispositivo: TipoDispositivo;
  tipoBloqueo: TipoBloqueo | '';
  codigoDesbloqueo: string;
  patronDesbloqueo: string;
};

type Cliente = { id: string; nombre: string; apellido: string | null; telefono: string | null };

function formatearFecha(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-AR');
}

export default function ServicioTecnico() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeRecibir = tienePermiso(actor, 'recibir_servicio_tecnico');
  const puedeGestionar = tienePermiso(actor, 'gestionar_servicio_tecnico');
  const puedeEliminarReparacion = tienePermiso(actor, 'eliminar');
  // Igual que en la ficha individual: agregar al Stock es una actividad
  // distinta de "gestionar la reparación" — puede quedar en manos de otra
  // persona (ver app/servicio-tecnico/[id]/page.tsx).
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');
  // Métricas comparativas entre técnicos (carga relativa, tiempo promedio)
  // quedan reservadas a quien puede ver Estadísticas — mismo permiso que ya
  // existe para el resto de la app, en vez de inventar uno nuevo solo para
  // esto.
  const puedeVerEstadisticas = tienePermiso(actor, 'ver_estadisticas');
  const t = useT();
  const sucursalActual = useSucursalActual();
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'lista' | 'mibanco' | 'tecnicos'>('lista');
  // Se lee de window (no useSearchParams) para no depender de un Suspense
  // boundary — mismo criterio que app/stock/nuevo/page.tsx. Permite llegar
  // directo a /servicio-tecnico?tab=tecnicos o ?tab=mibanco desde otra
  // página del módulo.
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam === 'tecnicos') setTab('tecnicos');
    if (tabParam === 'mibanco') setTab('mibanco');
  }, []);
  const cambiarTab = (nuevoTab: 'lista' | 'mibanco' | 'tecnicos') => {
    setTab(nuevoTab);
    const url = nuevoTab === 'lista' ? '/servicio-tecnico' : `/servicio-tecnico?tab=${nuevoTab}`;
    window.history.replaceState(null, '', url);
  };
  // Indicador operativo elegido (fila clickeable arriba de la lista). Por
  // defecto "activas" para no arrancar mostrando entregados/cancelados
  // viejos mezclados con lo que sí necesita atención hoy.
  const [filtroIndicador, setFiltroIndicador] = useState<'activas' | 'demoradas' | 'aprobacion' | 'repuesto' | 'listas' | null>('activas');
  const [busqueda, setBusqueda] = useState('');
  // Debounce de 250ms: la búsqueda filtra en memoria (no dispara consultas
  // nuevas), pero igual se separa el valor "en vivo" del input del valor que
  // realmente filtra para que escribir se sienta fluido en listas grandes.
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(busqueda), 250);
    return () => clearTimeout(timer);
  }, [busqueda]);
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  // Arranca en la sucursal elegida en el panel — se puede "espiar" otra acá
  // adentro sin tocar la selección global; un useEffect la sigue si el
  // dueño cambia de sucursal MIENTRAS ya está en esta pantalla.
  const [filtroSucursal, setFiltroSucursal] = useState(sucursalActual.id ?? '');
  useEffect(() => {
    setFiltroSucursal(sucursalActual.id ?? '');
  }, [sucursalActual.id]);
  useEffect(() => {
    (async () => {
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Orden temporal de toda la sección (lista, en poder del técnico e
  // historial) — por defecto más recientes primero. Se guarda por navegador
  // para no tener que elegirlo de nuevo cada vez que se entra.
  const [orden, setOrden] = useState<'recientes' | 'antiguos'>('recientes');
  useEffect(() => {
    try {
      const guardado = localStorage.getItem('servicioTecnicoOrden');
      if (guardado === 'recientes' || guardado === 'antiguos') setOrden(guardado);
    } catch {}
  }, []);
  const cambiarOrden = (v: 'recientes' | 'antiguos') => {
    setOrden(v);
    try {
      localStorage.setItem('servicioTecnicoOrden', v);
    } catch {}
  };
  const [guardando, setGuardando] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState<string | null>(null);
  // "banco" es la vista por defecto al entrar al detalle de un técnico: es
  // la más útil (prioriza qué atender primero), "en_poder"/"historial"
  // siguen disponibles para quien prefiera esas vistas más simples.
  const [vistaTecnico, setVistaTecnico] = useState<'banco' | 'en_poder' | 'historial'>('banco');
  // Período para "completadas" y "tiempo promedio" en la lista de técnicos
  // — comparar toda la vida del taller de una no sirve para ver quién está
  // sobrecargado hoy.
  const [periodoTecnicos, setPeriodoTecnicos] = useState<'hoy' | '7d' | '30d' | 'todo'>('7d');
  const [asignadoTecnicoId, setAsignadoTecnicoId] = useState('');

  const [carpetasStock, setCarpetasStock] = useState<string[]>([]);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevaCapacidad, setNuevaCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoImei, setNuevoImei] = useState('');
  const [nuevoTipoDispositivo, setNuevoTipoDispositivo] = useState<TipoDispositivo>('celular');
  const [nuevoTipoBloqueo, setNuevoTipoBloqueo] = useState<TipoBloqueo | ''>('');
  const [nuevoCodigoDesbloqueo, setNuevoCodigoDesbloqueo] = useState('');
  const [nuevoPatronDesbloqueo, setNuevoPatronDesbloqueo] = useState('');
  const [nuevaFalla, setNuevaFalla] = useState('');
  const [nuevaUbicacion, setNuevaUbicacion] = useState('');
  // Equipos ya confirmados con "+ Agregar otro equipo" en este mismo
  // ingreso (además del que esté cargado en el formulario sin agregar).
  const [equiposAgregados, setEquiposAgregados] = useState<EquipoIngreso[]>([]);
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);

  // Checklist de recepción — qué funciona y qué no al ingresar el equipo,
  // de acá sale el texto de condición/garantía (ver TextoCondicionGenerado).
  const [nuevoEnciende, setNuevoEnciende] = useState<boolean | null>(null);
  const [nuevaPantalla, setNuevaPantalla] = useState('');
  const [nuevoChecklist, setNuevoChecklist] = useState<Record<string, boolean | null>>({});
  const [nuevaHumedad, setNuevaHumedad] = useState<boolean | null>(null);
  const [nuevaExcepcionGarantia, setNuevaExcepcionGarantia] = useState('');

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteInput, setClienteInput] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [avisoWhatsApp, setAvisoWhatsApp] = useState<{ link: string; nombre: string; tipo: 'agregado' | 'reparado' } | null>(
    null
  );
  const [avisoAgregarStockPara, setAvisoAgregarStockPara] = useState<Reparacion | null>(null);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [codigoPais, setCodigoPais] = useState('54');

  // Por defecto solo se trae lo ACTIVO (no entregado/cancelado) — con miles
  // de reparaciones acumuladas, traer TODO el historial en cada visita a
  // esta pantalla (la principal del módulo) es lo que hace sentir lento el
  // sistema, cuando el 99% de las visitas solo necesita ver lo que está en
  // curso hoy. El resto del historial se trae en segundo plano recién
  // cuando de verdad hace falta: al buscar texto (la búsqueda ya promete
  // mirar TODAS las reparaciones, ver comentario en `filtrados` más abajo)
  // o al apagar el chip "Activas" para ver entregados/cancelados.
  const [historialCompleto, setHistorialCompleto] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const cargar = async (soloActivas = true) => {
    // Paginado con obtenerTodasLasFilas: sin esto, un negocio con más de
    // 1000 reparaciones históricas perdía resultados en silencio al buscar
    // (esta pantalla promete mirar TODAS las reparaciones al buscar texto,
    // ver comentario en `filtrados` más abajo) — mismo bug de truncamiento
    // de PostgREST ya corregido en Stock/Dispositivos.
    const data = await obtenerTodasLasFilas<Reparacion>(
      supabase,
      'reparaciones',
      'id, numero_orden, modelo, capacidad_gb, color, imei, falla_declarada, diagnostico, ubicacion_fisica, tecnico_id, estado, prioridad, trabajos_realizados, fecha_ingreso_servicio, fecha_estimada, fecha_reparado, fecha_entrega, garantia_dias, estado_actualizado_at, cliente_id, token_seguimiento, en_poder_tecnico, presupuesto_mano_obra, presupuesto_repuestos, importe_total, orden_cobro_id, agregado_a_stock, sucursal_id, clientes ( nombre, apellido, telefono )',
      [{ columna: 'fecha_ingreso_servicio', ascending: false }],
      soloActivas ? (q) => q.not('estado', 'in', `(${FINALIZADOS.join(',')})`) : undefined
    );
    setReparaciones(data);
    if (!soloActivas) setHistorialCompleto(true);
    setLoading(false);
  };

  const asegurarHistorialCompleto = async () => {
    if (historialCompleto || cargandoHistorial) return;
    setCargandoHistorial(true);
    await cargar(false);
    setCargandoHistorial(false);
  };

  // Los casos en que la pantalla necesita de verdad ver más que "lo
  // activo": tipear una búsqueda (mira TODAS las reparaciones a propósito),
  // apagar el chip "Activas" (filtroIndicador pasa a null, que también
  // muestra todo, ver `filtrados` más abajo), o entrar a "Técnicos"/"Mi
  // banco" — ambas pestañas cuentan reparaciones YA entregadas (estadística
  // por técnico, historial de entregas de un técnico puntual) que quedarían
  // en cero/incompletas si solo hubiera llegado lo activo.
  useEffect(() => {
    if (busquedaDebounced.trim() !== '' || filtroIndicador === null || tab !== 'lista') {
      asegurarHistorialCompleto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced, filtroIndicador, tab]);

  useEffect(() => {
    cargar();
    (async () => {
      const { data } = await supabase.from('tecnicos').select('id, nombre, foto_url').order('nombre');
      setTecnicos((data as Tecnico[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      // El buscador de "qué equipo entra" no debería depender de qué marcas
      // el negocio activó para VENDER (Configuración > Datos del negocio):
      // se puede recibir a reparar un Motorola, o cualquier otro modelo del
      // catálogo, aunque el negocio nunca haya tildado esa marca. Se suma
      // el catálogo completo a las carpetas de stock ya creadas, sin
      // duplicar los que ya están en las dos listas.
      const yaEnStock = new Set((data ?? []).map((m) => m.nombre.toLowerCase()));
      const delCatalogo = TODOS_LOS_MODELOS_CATALOGO.filter((m) => !yaEnStock.has(m.toLowerCase()));
      setCarpetasStock([...(data ?? []).map((m) => m.nombre), ...delCatalogo]);
    })();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
    (async () => {
      setClientes(await obtenerTodasLasFilas<Cliente>(supabase, 'clientes', 'id, nombre, apellido, telefono', [{ columna: 'nombre' }]));
    })();
    (async () => {
      const { data } = await supabase.from('repuestos').select('id, nombre, cantidad_stock, cantidad_reservada, stock_minimo');
      setRepuestosParaAlertas((data as RepuestoParaAlerta[]) ?? []);
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( pais )').eq('id', user.id).single();
      setCodigoPais(codigoLlamada((perfil as any)?.negocios?.pais));
    })();
  }, []);

  const nombreCompleto = (c: Cliente) => `${c.nombre} ${c.apellido || ''}`.trim();
  const clienteCoincidente = useMemo(
    () => clientes.find((c) => nombreCompleto(c).toLowerCase() === clienteInput.trim().toLowerCase()),
    [clientes, clienteInput]
  );

  const elegirClienteInput = (valor: string) => {
    setClienteInput(valor);
    const encontrado = clientes.find((c) => nombreCompleto(c).toLowerCase() === valor.trim().toLowerCase());
    if (encontrado) setClienteTelefono(encontrado.telefono ?? '');
  };

  const nombreTecnico = (tecnicoId: string | null) => tecnicos.find((tec) => tec.id === tecnicoId)?.nombre;
  const fotoTecnico = (tecnicoId: string | null) => tecnicos.find((tec) => tec.id === tecnicoId)?.foto_url ?? null;

  // Filtro central por sucursal — TODO lo demás de esta pantalla (lista,
  // indicadores, alertas, Mi banco, estadísticas por técnico) deriva de
  // esto en vez de leer `reparaciones` directo, para que cambiar de
  // sucursal actualice la pantalla entera de una sola vez.
  const reparacionesSucursal = useMemo(
    () => reparaciones.filter((r) => !filtroSucursal || r.sucursal_id === filtroSucursal),
    [reparaciones, filtroSucursal]
  );

  // Base ordenada por fecha de ingreso según el toggle de arriba — de acá
  // derivan la lista principal, "en poder del técnico" y el historial, para
  // que las tres respeten el mismo orden en vez de cada una el suyo.
  const reparacionesOrdenadas = useMemo(() => {
    const signo = orden === 'recientes' ? -1 : 1;
    return [...reparacionesSucursal].sort(
      (a, b) => signo * (new Date(a.fecha_ingreso_servicio).getTime() - new Date(b.fecha_ingreso_servicio).getTime())
    );
  }, [reparacionesSucursal, orden]);

  // Igual orden que reparacionesOrdenadas pero SIN el recorte por sucursal
  // — solo existe para el caso de abajo, cuando hay texto de búsqueda.
  const todasOrdenadas = useMemo(() => {
    const signo = orden === 'recientes' ? -1 : 1;
    return [...reparaciones].sort(
      (a, b) => signo * (new Date(a.fecha_ingreso_servicio).getTime() - new Date(b.fecha_ingreso_servicio).getTime())
    );
  }, [reparaciones, orden]);

  const filtrados = useMemo(() => {
    const q = busquedaDebounced.trim().toLowerCase();
    // Con texto de búsqueda se busca en TODAS las reparaciones del negocio
    // — todas las sucursales, técnicos y estados, ignorando esos tres
    // filtros — no solo dentro de lo que ya está filtrado. Antes, buscar
    // un equipo puntual por IMEI/orden/cliente solo miraba adentro de la
    // sucursal y el técnico ya seleccionados (y de "activas", que excluye
    // entregados/cancelados): un equipo derivado a otra sucursal, asignado
    // a otro técnico, o ya entregado, se volvía invisible en la búsqueda
    // aunque uno tuviera el dato exacto para encontrarlo.
    if (q) {
      return todasOrdenadas.filter((r) => {
        const nombreCliente = r.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim().toLowerCase() : '';
        return (
          r.numero_orden?.toLowerCase().includes(q) ||
          r.modelo?.toLowerCase().includes(q) ||
          r.imei?.toLowerCase().includes(q) ||
          nombreCliente.includes(q) ||
          r.clientes?.telefono?.includes(q)
        );
      });
    }
    return reparacionesOrdenadas.filter((r) => {
      if (filtroIndicador === 'activas' && FINALIZADOS.includes(r.estado)) return false;
      if (filtroIndicador === 'demoradas' && !esDemorado(r)) return false;
      if (filtroIndicador === 'aprobacion' && r.estado !== 'esperando_aprobacion') return false;
      if (filtroIndicador === 'repuesto' && r.estado !== 'esperando_repuesto') return false;
      if (filtroIndicador === 'listas' && r.estado !== 'listo_para_entregar') return false;
      if (filtroTecnico && r.tecnico_id !== filtroTecnico) return false;
      return true;
    });
  }, [reparacionesOrdenadas, todasOrdenadas, filtroIndicador, filtroTecnico, busquedaDebounced]);

  const hayFiltrosActivos = filtroIndicador !== null || filtroTecnico !== '' || busqueda.trim() !== '';
  const limpiarFiltros = () => {
    setFiltroIndicador(null);
    setFiltroTecnico('');
    setBusqueda('');
  };

  const indicadores = useMemo(() => {
    const activas = reparacionesSucursal.filter((r) => !FINALIZADOS.includes(r.estado));
    return {
      activas: activas.length,
      demoradas: activas.filter(esDemorado).length,
      aprobacion: reparacionesSucursal.filter((r) => r.estado === 'esperando_aprobacion').length,
      repuesto: reparacionesSucursal.filter((r) => r.estado === 'esperando_repuesto').length,
      listas: reparacionesSucursal.filter((r) => r.estado === 'listo_para_entregar').length,
      sinAsignar: activas.filter((r) => !r.tecnico_id).length,
    };
  }, [reparacionesSucursal]);

  // Denominador para la barra de carga relativa entre técnicos (Fase 3) —
  // el que más reparaciones activas tiene marca el 100%.
  const maxActivasTecnicos = useMemo(() => {
    let max = 0;
    for (const tec of tecnicos) {
      const n = reparacionesSucursal.filter((r) => r.tecnico_id === tec.id && !FINALIZADOS.includes(r.estado)).length;
      if (n > max) max = n;
    }
    return max;
  }, [tecnicos, reparacionesSucursal]);

  const dentroPeriodoTecnicos = (iso: string | null) => {
    if (!iso) return false;
    if (periodoTecnicos === 'todo') return true;
    if (periodoTecnicos === 'hoy') return esHoy(iso);
    const dias = periodoTecnicos === '7d' ? 7 : 30;
    return Date.now() - new Date(iso).getTime() <= dias * 86400000;
  };

  // La pestaña "Técnicos" recalculaba estos 7 filter()/reduce() por técnico
  // directo en el cuerpo del render, sin memoizar — con años de historial
  // (esta pestaña carga TODO, no solo lo activo) eso es O(técnicos × miles
  // de filas) en cada render mientras la pestaña sigue abierta. Un solo
  // useMemo con un Map evita recalcular si no cambió ninguna de las 3 cosas
  // de las que depende.
  const resumenPorTecnico = useMemo(() => {
    const mapa = new Map<
      string,
      {
        activasArr: typeof reparacionesSucursal;
        enCurso: number;
        demoradas: number;
        esperandoDiagnostico: number;
        listasHoy: number;
        completadasPeriodo: number;
        tiempoPromedioDias: number | null;
      }
    >();
    for (const tec of tecnicos) {
      const propias = reparacionesSucursal.filter((r) => r.tecnico_id === tec.id);
      const activasArr = propias.filter((r) => !FINALIZADOS.includes(r.estado));
      const enCurso = activasArr.filter((r) => r.estado === 'en_reparacion').length;
      const demoradas = activasArr.filter(esDemorado).length;
      const esperandoDiagnostico = activasArr.filter((r) => r.estado === 'recibido' || r.estado === 'esperando_diagnostico').length;
      const listasHoy = propias.filter((r) => r.estado === 'listo_para_entregar' && esHoy(r.fecha_reparado)).length;
      const completadasPeriodo = propias.filter((r) => r.estado === 'entregado' && dentroPeriodoTecnicos(r.fecha_reparado));
      const tiempoPromedioDias =
        completadasPeriodo.length > 0
          ? completadasPeriodo.reduce(
              (acc, r) => acc + (new Date(r.fecha_reparado as string).getTime() - new Date(r.fecha_ingreso_servicio).getTime()),
              0
            ) /
            completadasPeriodo.length /
            86400000
          : null;
      mapa.set(tec.id, { activasArr, enCurso, demoradas, esperandoDiagnostico, listasHoy, completadasPeriodo: completadasPeriodo.length, tiempoPromedioDias });
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tecnicos, reparacionesSucursal, periodoTecnicos]);

  const [repuestosParaAlertas, setRepuestosParaAlertas] = useState<RepuestoParaAlerta[]>([]);
  // "Descartar" una alerta la oculta en este navegador (sección 22: poder
  // marcarla como resuelta) — no hay una tabla de alertas en la base (son
  // calculadas, no filas propias), así que el descarte queda local; si la
  // causa sigue vigente más adelante (ej. sigue sin técnico varios días
  // después), vuelve a aparecer con una key distinta.
  const [alertasDescartadas, setAlertasDescartadas] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const guardado = localStorage.getItem('servicioTecnicoAlertasDescartadas');
      if (guardado) setAlertasDescartadas(new Set(JSON.parse(guardado)));
    } catch {}
  }, []);
  const descartarAlerta = (key: string) => {
    setAlertasDescartadas((prev) => {
      const next = new Set(prev);
      next.add(key);
      try {
        localStorage.setItem('servicioTecnicoAlertasDescartadas', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };
  const alertasKey = (a: { tipo: string; id: string; categoria: string }) => `${a.tipo}:${a.id}:${a.categoria}`;
  const alertas = useMemo(
    () => calcularAlertas(reparacionesSucursal, repuestosParaAlertas).filter((a) => !alertasDescartadas.has(alertasKey(a))),
    [reparacionesSucursal, repuestosParaAlertas, alertasDescartadas]
  );
  const [alertasAbiertas, setAlertasAbiertas] = useState(false);

  const historialTecnico = useMemo(
    () => reparacionesOrdenadas.filter((r) => r.estado === 'entregado' && r.tecnico_id === tecnicoSeleccionado),
    [reparacionesOrdenadas, tecnicoSeleccionado]
  );

  const equiposEnPoder = useMemo(
    () => reparacionesOrdenadas.filter((r) => r.tecnico_id === tecnicoSeleccionado && r.en_poder_tecnico && !FINALIZADOS.includes(r.estado)),
    [reparacionesOrdenadas, tecnicoSeleccionado]
  );

  const datosChecklistNuevo = (): ChecklistIngreso => ({
    enciende: nuevoEnciende,
    pantalla_estado: nuevaPantalla || null,
    modulo_ok: nuevoChecklist.modulo_ok ?? null,
    senal_ok: nuevoChecklist.senal_ok ?? null,
    boton_silencio_ok: nuevoChecklist.boton_silencio_ok ?? null,
    camara_frontal_ok: nuevoChecklist.camara_frontal_ok ?? null,
    camara_trasera_ok: nuevoChecklist.camara_trasera_ok ?? null,
    flash_ok: nuevoChecklist.flash_ok ?? null,
    microfono_superior_ok: nuevoChecklist.microfono_superior_ok ?? null,
    microfono_inferior_ok: nuevoChecklist.microfono_inferior_ok ?? null,
    altavoces_ok: nuevoChecklist.altavoces_ok ?? null,
    boton_power_ok: nuevoChecklist.boton_power_ok ?? null,
    boton_volumen_ok: nuevoChecklist.boton_volumen_ok ?? null,
    pin_carga_ok: nuevoChecklist.pin_carga_ok ?? null,
    carga_magsafe_ok: nuevoChecklist.carga_magsafe_ok ?? null,
    biometria_ok: nuevoChecklist.biometria_ok ?? null,
    conectores_ok: nuevoChecklist.conectores_ok ?? null,
    humedad: nuevaHumedad,
    garantia_excepcion_manual: nuevaExcepcionGarantia.trim() || null,
  });

  // El equipo que se está completando en el formulario cuenta aunque el
  // usuario no haya tocado "+ Agregar otro equipo" — mismo criterio que
  // Plan Canje en Nueva Orden, para no perder un equipo por olvido.
  const equipoEnProgreso: EquipoIngreso | null = nuevoModelo.trim()
    ? {
        tempId: '__en_progreso__',
        modelo: nuevoModelo.trim(),
        capacidad_gb: nuevaCapacidad,
        color: nuevoColor.trim(),
        imei: nuevoImei.trim(),
        falla: nuevaFalla.trim(),
        ubicacion: nuevaUbicacion.trim(),
        checklist: datosChecklistNuevo(),
        tipoDispositivo: nuevoTipoDispositivo,
        tipoBloqueo: nuevoTipoBloqueo,
        codigoDesbloqueo: nuevoCodigoDesbloqueo.trim(),
        patronDesbloqueo: nuevoPatronDesbloqueo,
      }
    : null;
  const equiposEfectivos: EquipoIngreso[] = equipoEnProgreso ? [...equiposAgregados, equipoEnProgreso] : equiposAgregados;

  const agregarOtroEquipo = () => {
    if (!equipoEnProgreso) return;
    setEquiposAgregados((eqs) => [...eqs, { ...equipoEnProgreso, tempId: idTemporal() }]);
    setNuevoModelo('');
    setNuevaCapacidad(null);
    setNuevoColor('');
    setNuevoImei('');
    setNuevaFalla('');
    setNuevaUbicacion('');
    setNuevoTipoDispositivo('celular');
    setNuevoTipoBloqueo('');
    setNuevoCodigoDesbloqueo('');
    setNuevoPatronDesbloqueo('');
    setNuevoEnciende(null);
    setNuevaPantalla('');
    setNuevoChecklist({});
    setNuevaHumedad(null);
    setNuevaExcepcionGarantia('');
  };

  const quitarEquipoAgregado = (tempId: string) => setEquiposAgregados((eqs) => eqs.filter((e) => e.tempId !== tempId));

  const recibirEquipos = async () => {
    if (equiposEfectivos.length === 0 || !puedeRecibir) return;
    setGuardandoNuevo(true);
    setErrorNuevo(null);

    let clienteId = clienteCoincidente?.id ?? null;
    const nombreParaMensaje = clienteCoincidente ? nombreCompleto(clienteCoincidente) : clienteInput.trim();

    if (!clienteId && clienteInput.trim()) {
      const { data: nuevoCliente } = await supabase
        .from('clientes')
        .insert({ nombre: clienteInput.trim(), telefono: clienteTelefono.trim() || null })
        .select('id')
        .single();
      clienteId = nuevoCliente?.id ?? null;
    }

    // Si hay un cliente (no es un equipo propio del local), se arma de una
    // una orden vinculada — así hay una boleta para entregarle desde el
    // momento en que se recibe el equipo, con la condición de ingreso ya
    // en la nota, en vez de recién al terminar la reparación. "Generar
    // orden de cobro" más adelante actualiza esta misma orden en vez de
    // crear una segunda (ver generarOrdenCobro en la ficha). Con VARIOS
    // equipos en el mismo ingreso, todos comparten esta única orden/boleta
    // (un ítem por equipo) en vez de generar una boleta por cada uno.
    let ordenId: string | null = null;
    if (clienteId) {
      // Con más de un equipo hay que aclarar a cuál corresponde cada
      // condición de ingreso — si no, la nota mezclaría "Funciona: ..." de
      // varios equipos sin poder distinguirlos.
      const notaCondicion =
        equiposEfectivos
          .map((eq) => {
            const texto = generarTextoCondicionIngreso(eq.checklist);
            if (!texto) return '';
            return equiposEfectivos.length > 1 ? `${eq.modelo}\n${texto}` : texto;
          })
          .filter(Boolean)
          .join('\n\n') || null;
      const { data: orden, error: ordenError } = await supabase
        .from('ordenes')
        .insert({
          cliente_id: clienteId,
          estado: 'pendiente',
          total: 0,
          nota: notaCondicion,
          ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
        })
        .select('id')
        .single();
      if (ordenError || !orden) {
        // No seguimos como si nada: sin avisar, quedaría exactamente el
        // mismo problema de siempre ("no me deja generar boletas"), solo
        // que ahora en silencio.
        setErrorNuevo(t('No pudimos crear la orden para la boleta:') + ' ' + (ordenError?.message || t('sin datos')));
        setGuardandoNuevo(false);
        return;
      }
      ordenId = orden.id;
      const { error: itemsError } = await supabase.from('orden_items').insert(
        equiposEfectivos.map((eq) => ({
          orden_id: orden.id,
          // El vendedor carga modelo/capacidad/color/IMEI en el formulario de
          // ingreso, pero antes se perdían: la boleta solo mostraba "Servicio
          // técnico — {modelo}". Se arma igual que la línea de un dispositivo
          // vendido (ver agregarDispositivoDelStock en Nueva Orden) para que
          // toda esa info quede visible en la boleta.
          descripcion: `Servicio técnico — ${eq.modelo}${eq.capacidad_gb ? ` ${eq.capacidad_gb}GB` : ''}${
            eq.color ? ` ${eq.color}` : ''
          }${eq.imei ? ` · IMEI ${eq.imei}` : ''}`,
          cantidad: 1,
          precio_unitario: 0,
          tipo: 'trabajo',
        }))
      );
      if (itemsError) {
        setErrorNuevo(t('No pudimos terminar de armar la boleta:') + ' ' + itemsError.message);
        setGuardandoNuevo(false);
        return;
      }
    }

    const { data: creadas, error: repError } = await supabase
      .from('reparaciones')
      .insert(
        equiposEfectivos.map((eq) => ({
          modelo: eq.modelo ? normalizarNombreModelo(eq.modelo) : eq.modelo,
          capacidad_gb: eq.capacidad_gb,
          color: eq.color || null,
          imei: limpiarImei(eq.imei),
          tipo_dispositivo: eq.tipoDispositivo,
          tipo_bloqueo: eq.tipoBloqueo || null,
          codigo_desbloqueo: eq.tipoBloqueo === 'pin' || eq.tipoBloqueo === 'contrasena' ? eq.codigoDesbloqueo || null : null,
          patron_desbloqueo: eq.tipoBloqueo === 'patron' ? eq.patronDesbloqueo || null : null,
          falla_declarada: eq.falla || null,
          ubicacion_fisica: eq.ubicacion || null,
          estado: 'recibido',
          cliente_id: clienteId,
          tecnico_id: asignadoTecnicoId || null,
          orden_cobro_id: ordenId,
          ...eq.checklist,
          ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
        }))
      )
      .select('modelo, token_seguimiento');
    if (repError) {
      setErrorNuevo('No pudimos registrar los equipos: ' + repError.message);
      setGuardandoNuevo(false);
      return;
    }

    // Si alguno de los modelos es nuevo (no existía como carpeta en Stock),
    // se da de alta acá — si no, un ingreso con un modelo recién tipeado
    // (ej. un modelo que todavía no se había cargado nunca) no aparecía
    // como carpeta en ningún lado.
    for (const modeloUnico of new Set(equiposEfectivos.map((eq) => eq.modelo))) {
      await asegurarModelo(supabase, modeloUnico);
    }

    if (clienteId && clienteTelefono.trim() && creadas && creadas.length > 0) {
      if (creadas.length === 1) {
        if (creadas[0].token_seguimiento) {
          const url = `${window.location.origin}/seguimiento/${creadas[0].token_seguimiento}`;
          const mensaje = mensajeSeguimientoServicio(nombreParaMensaje || 'estimado/a', creadas[0].modelo || 'equipo', url);
          setAvisoWhatsApp({ link: armarLinkWhatsApp(clienteTelefono, mensaje, codigoPais), nombre: nombreParaMensaje, tipo: 'agregado' });
        }
      } else {
        // Cada equipo tiene su propio seguimiento — se manda un solo mensaje
        // avisando de todos, con el link del primero (los demás se pueden
        // reenviar después desde la ficha de cada uno).
        const primeraConToken = creadas.find((c) => c.token_seguimiento);
        const modelos = creadas.map((c) => c.modelo).filter(Boolean).join(', ');
        const url = primeraConToken ? `${window.location.origin}/seguimiento/${primeraConToken.token_seguimiento}` : '';
        const mensaje = `${t('Hola')} ${nombreParaMensaje || t('estimado/a')}! ${t('Gracias por elegirnos')} 🙌 ${t('Ya registramos tus equipos')} (${modelos}) ${t('para el servicio técnico.')}${url ? ` ${t('Podés seguir el estado de a uno acá:')} ${url}` : ''}`;
        setAvisoWhatsApp({ link: armarLinkWhatsApp(clienteTelefono, mensaje, codigoPais), nombre: nombreParaMensaje, tipo: 'agregado' });
      }
    }

    setEquiposAgregados([]);
    setNuevoModelo('');
    setNuevaCapacidad(null);
    setNuevoColor('');
    setNuevoImei('');
    setNuevaFalla('');
    setNuevaUbicacion('');
    setClienteInput('');
    setClienteTelefono('');
    setAsignadoTecnicoId('');
    setNuevoEnciende(null);
    setNuevaPantalla('');
    setNuevoChecklist({});
    setNuevaHumedad(null);
    setNuevaExcepcionGarantia('');
    setPanelNuevo(false);
    setGuardandoNuevo(false);
    cargar();
  };

  const asignarTecnico = async (id: string, tecnicoId: string) => {
    if (!puedeGestionar) {
      alert(t('No tenés permiso para gestionar Servicio Técnico.'));
      return;
    }
    setGuardando(id);
    const r = reparaciones.find((x) => x.id === id);
    const cambios: { tecnico_id: string | null; en_poder_tecnico?: boolean } = { tecnico_id: tecnicoId || null };
    if (tecnicoId) cambios.en_poder_tecnico = true;
    await supabase.from('reparaciones').update(cambios).eq('id', id);
    const nombreNuevo = tecnicos.find((tec) => tec.id === tecnicoId)?.nombre;
    await registrarAuditoria(supabase, {
      accion: tecnicoId
        ? `asignó a ${nombreNuevo || 'un técnico'} la reparación ${r?.numero_orden || ''} (${r?.modelo || 'sin modelo'})`
        : `quitó la asignación de técnico de la reparación ${r?.numero_orden || ''} (${r?.modelo || 'sin modelo'})`,
      entidad: 'reparacion',
      entidadId: id,
    });
    setReparaciones((rs) => rs.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
    setGuardando(null);
  };

  const marcarEnPoder = async (r: Reparacion, enPoder: boolean) => {
    if (!puedeGestionar) {
      alert(t('No tenés permiso para gestionar Servicio Técnico.'));
      return;
    }
    setGuardando(r.id);
    await supabase.from('reparaciones').update({ en_poder_tecnico: enPoder }).eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `registró que ${nombreTecnico(r.tecnico_id) || 'el técnico'} ${enPoder ? 'todavía tiene' : 'ya entregó'} la reparación ${r.numero_orden || ''} (${r.modelo || 'sin modelo'})`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setReparaciones((rs) => rs.map((x) => (x.id === r.id ? { ...x, en_poder_tecnico: enPoder } : x)));
    setGuardando(null);
  };

  const cambiarEstado = async (r: Reparacion, nuevoEstado: string) => {
    if (!puedeGestionar) {
      alert(t('No tenés permiso para gestionar Servicio Técnico.'));
      return;
    }
    setGuardando(r.id);
    const resultado = await cambiarEstadoReparacion(supabase, r, nuevoEstado, actor?.nombre ?? null);
    if (resultado === 'cancelado') {
      setGuardando(null);
      return;
    }

    if (nuevoEstado === 'listo_para_entregar' && r.cliente_id && r.clientes?.telefono && r.token_seguimiento) {
      const url = `${window.location.origin}/seguimiento/${r.token_seguimiento}`;
      const nombre = `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim();
      const mensaje = mensajeListoServicio(nombre || 'estimado/a', r.modelo || 'equipo', url);
      setAvisoWhatsApp({ link: armarLinkWhatsApp(r.clientes.telefono, mensaje, codigoPais), nombre, tipo: 'reparado' });
    }

    // Equipo propio marcado "Entregado" directo desde el selector de estado,
    // salteando el botón "Agregar al Stock" — igual que en la ficha
    // individual, preguntamos para no perder el paso.
    if (nuevoEstado === 'entregado' && !r.cliente_id && !r.agregado_a_stock && puedeAgregarStock) {
      setAvisoAgregarStockPara(r);
    }

    setGuardando(null);
    cargar();
  };

  const agregarAlStock = async (r: Reparacion) => {
    if (guardando || !puedeAgregarStock) return;
    const actor = getActor();
    if (!actor) {
      alert(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    if (r.imei) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', r.imei).maybeSingle();
      if (existente && !confirm(`${t('Ya hay un dispositivo en Stock con el IMEI')} ${r.imei}. ${t('¿Agregarlo igual?')}`)) return;
    }
    if (!confirm(t('¿Pasar este equipo al Stock como dispositivo disponible para vender?'))) return;
    setGuardando(r.id);
    setAvisoAgregarStockPara(null);
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
      // Hereda la sucursal de la reparación de origen, no la que esté
      // eligiendo ahora quien aprieta el botón — quien agrega al Stock
      // puede estar viendo "Todas las sucursales" en ese momento.
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
    setGuardando(null);
    cargar();
  };

  const marcarEntregadoCliente = async (r: Reparacion) => {
    if (guardando || !puedeGestionar) return;
    if (!confirm(t('¿Marcar este equipo como entregado al cliente?'))) return;
    setGuardando(r.id);
    await supabase
      .from('reparaciones')
      .update({
        estado: 'entregado',
        fecha_entrega: new Date().toISOString(),
        estado_actualizado_at: new Date().toISOString(),
        fecha_reparado: r.fecha_reparado ?? new Date().toISOString(),
      })
      .eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `marcó como entregado al cliente un equipo reparado en Servicio Técnico (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'}${r.imei ? `, IMEI ${r.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setGuardando(null);
    cargar();
  };

  const archivarCancelar = async (r: Reparacion) => {
    if (!puedeGestionar) {
      alert(t('No tenés permiso para gestionar Servicio Técnico.'));
      return;
    }
    if (!confirm(t('¿Cancelar esta reparación? Va a quedar marcada como cancelada en "Listos", no se borra el historial.'))) return;
    setMenuAbierto(null);
    await cambiarEstado(r, 'cancelado');
  };

  const eliminarDefinitivo = async (r: Reparacion) => {
    if (!puedeEliminarReparacion) {
      alert(t('No tenés permiso para eliminar.'));
      return;
    }
    if (!confirm(t('¿Eliminar definitivamente esta reparación? Esta acción no se puede deshacer y borra todo su historial.'))) return;
    setGuardando(r.id);
    setMenuAbierto(null);
    // Borrar la reparación de una no alcanza: reparaciones_repuestos y
    // repuestos_reservas se borran en cascada, pero eso NO le devuelve nada
    // al stock — hay que liberar/devolver primero por las mismas RPC que usa
    // el resto del módulo. Si CUALQUIER liberación falla, se aborta el
    // borrado en vez de seguir igual — si no, la reparación se iría en
    // cascada con parte del stock sin devolver y sin ninguna fila que
    // permita corregirlo después.
    const actorActual = getActor();
    const liberacion = await liberarRepuestosDeReparaciones(supabase, [r.id], actorActual?.nombre ?? null);
    if (!liberacion.ok) {
      alert(t('No pudimos liberar los repuestos de esta reparación, así que no se eliminó:') + ' ' + liberacion.error);
      setGuardando(null);
      return;
    }
    await supabase.from('reparaciones').delete().eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó definitivamente una reparación (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'}${r.imei ? `, IMEI ${r.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorAnterior: { modelo: r.modelo, capacidad_gb: r.capacidad_gb, color: r.color, imei: r.imei, estado: r.estado },
    });
    setGuardando(null);
    cargar();
  };

  const enviarWhatsApp = async (r: Reparacion) => {
    if (!r.cliente_id || !r.clientes?.telefono || !r.token_seguimiento || guardando) return;
    setGuardando(r.id);
    const url = `${window.location.origin}/seguimiento/${r.token_seguimiento}`;
    const nombre = `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim();
    const mensaje =
      r.estado === 'listo_para_entregar'
        ? mensajeListoServicio(nombre || 'estimado/a', r.modelo || 'equipo', url)
        : mensajeSeguimientoServicio(nombre || 'estimado/a', r.modelo || 'equipo', url);
    await supabase.from('reparaciones_eventos').insert({
      reparacion_id: r.id,
      tipo: 'mensaje_cliente',
      texto: mensaje,
    });
    window.open(armarLinkWhatsApp(r.clientes.telefono, mensaje, codigoPais), '_blank');
    setGuardando(null);
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-start gap-3">
        <Link href="/" aria-label={t('Volver al inicio')} className="text-2xl leading-none mt-0.5">
          &larr;
        </Link>
        <div className="mr-auto">
          <h1 className="text-lg font-medium leading-tight">{t('Servicio Técnico')}</h1>
          <p className="text-xs text-muted dark:text-dark-text-secondary">
            {t('Gestioná reparaciones, técnicos, repuestos y rentabilidad desde un solo lugar')}
          </p>
        </div>
        {puedeRecibir && (
          <button
            onClick={() => {
              if (!panelNuevo && tab === 'tecnicos' && tecnicoSeleccionado) setAsignadoTecnicoId(tecnicoSeleccionado);
              setPanelNuevo((v) => !v);
            }}
            className="shrink-0 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-4 py-2.5 text-sm font-medium text-white"
          >
            {panelNuevo ? t('Cancelar') : `+ ${t('Recibir equipo')}`}
          </button>
        )}
      </header>

      <ServicioTecnicoTabs
        active={tab === 'tecnicos' ? 'tecnicos' : tab === 'mibanco' ? 'mibanco' : 'reparaciones'}
        mostrarMiBanco={actor?.tipo === 'tecnico'}
        onSelectReparaciones={() => cambiarTab('lista')}
        onSelectMiBanco={() => cambiarTab('mibanco')}
        onSelectTecnicos={() => {
          cambiarTab('tecnicos');
          setTecnicoSeleccionado(null);
        }}
      />
      {cargandoHistorial && (
        <p className="text-xs text-muted dark:text-dark-text-secondary text-center">{t('Cargando historial completo…')}</p>
      )}

      {!puedeRecibir && (
        <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
          {t('No tenés permiso para recibir equipos de Servicio Técnico.')}
        </p>
      )}

      {(tab === 'lista' || (tab === 'tecnicos' && tecnicoSeleccionado)) && (
        <div className="flex items-center justify-end">
          <select
            value={orden}
            onChange={(e) => cambiarOrden(e.target.value as 'recientes' | 'antiguos')}
            aria-label={t('Ordenar por')}
            className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="recientes">{t('Más recientes')}</option>
            <option value="antiguos">{t('Más antiguos')}</option>
          </select>
        </div>
      )}

      {(tab === 'lista' || tab === 'mibanco' || (tab === 'tecnicos' && tecnicoSeleccionado)) && (
        <>
          {panelNuevo && (
            <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
              {errorNuevo && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{errorNuevo}</p>}
              {equiposAgregados.length > 0 && (
                <div className="rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border p-2 flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">{t('Equipos ya cargados en este ingreso')}</p>
                  {equiposAgregados.map((eq, idx) => (
                    <div key={eq.tempId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-ink dark:text-dark-text">
                        {idx + 1}. {eq.modelo}
                        {eq.capacidad_gb ? ` · ${eq.capacidad_gb}GB` : ''}
                        {eq.imei ? ` · IMEI ${eq.imei}` : ''}
                      </span>
                      <button onClick={() => quitarEquipoAgregado(eq.tempId)} className="text-bad underline shrink-0">
                        {t('Quitar')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">
                {equiposAgregados.length > 0 ? `${t('Equipo')} ${equiposAgregados.length + 1}` : t('Datos del equipo')}
              </p>
              <SelectorTipoDispositivo value={nuevoTipoDispositivo} onChange={setNuevoTipoDispositivo} />
              <input
                value={nuevoModelo}
                onChange={(e) => setNuevoModelo(e.target.value)}
                placeholder={t('Modelo (ej. iPhone 13)')}
                list="carpetas-stock-servicio"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <datalist id="carpetas-stock-servicio">
                {carpetasStock.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <div className="flex gap-2">
                {STORAGE_OPTIONS.map((gb) => (
                  <button
                    key={gb}
                    onClick={() => setNuevaCapacidad(gb)}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      nuevaCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                    }`}
                  >
                    {gb}GB
                  </button>
                ))}
              </div>
              <SelectorColorAuto modelo={nuevoModelo} value={nuevoColor} onChange={setNuevoColor} />
              <input
                value={nuevoImei}
                onChange={(e) => setNuevoImei(e.target.value)}
                placeholder="IMEI"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
              />
              <CapturarBloqueo
                tipoBloqueo={nuevoTipoBloqueo}
                onTipoBloqueoChange={setNuevoTipoBloqueo}
                codigo={nuevoCodigoDesbloqueo}
                onCodigoChange={setNuevoCodigoDesbloqueo}
                patron={nuevoPatronDesbloqueo}
                onPatronChange={setNuevoPatronDesbloqueo}
              />
              <textarea
                value={nuevaFalla}
                onChange={(e) => setNuevaFalla(e.target.value)}
                placeholder={t('Falla declarada por el cliente (ej. no enciende, pantalla rota)')}
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />

              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary mt-1">
                {t('¿Cómo entra el equipo? (para saber qué se garantiza al entregarlo)')}
              </p>
              <CheckTri label={t('Enciende')} valor={nuevoEnciende} onChange={setNuevoEnciende} />
              {nuevoTipoDispositivo === 'celular' &&
                ITEMS_CHECKLIST_INGRESO.map((item) => {
                  const deshabilitado = CAMPOS_DEPENDEN_MODULO.includes(item.campo) && nuevoChecklist.modulo_ok === false;
                  return (
                    <CheckTri
                      key={item.campo}
                      label={t(item.label)}
                      disabled={deshabilitado}
                      valor={deshabilitado ? null : nuevoChecklist[item.campo] ?? null}
                      onChange={(v) => setNuevoChecklist((p) => ({ ...p, [item.campo]: v }))}
                    />
                  );
                })}
              <CheckTri label={t('Humedad / manipulación')} valor={nuevaHumedad} onChange={setNuevaHumedad} invertido />
              <textarea
                value={nuevaExcepcionGarantia}
                onChange={(e) => setNuevaExcepcionGarantia(e.target.value)}
                placeholder={t('Excepción adicional a la garantía (opcional, ej. "por golpe fuerte, no garantizamos Face ID")')}
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <TextoCondicionGenerado datos={datosChecklistNuevo()} />

              <input
                value={nuevaUbicacion}
                onChange={(e) => setNuevaUbicacion(e.target.value)}
                placeholder={t('Ubicación física (ej. Estante A-3)')}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />

              <button
                type="button"
                disabled={!nuevoModelo.trim()}
                onClick={agregarOtroEquipo}
                className="rounded-lg border border-dashed border-border dark:border-dark-border py-2 text-xs font-medium text-accent dark:text-dark-accent disabled:opacity-40"
              >
                + {t('Agregar otro equipo a este ingreso')}
              </button>

              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary mt-1">{t('Técnico asignado (opcional)')}</p>
              <select
                value={asignadoTecnicoId}
                onChange={(e) => setAsignadoTecnicoId(e.target.value)}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">{t('Sin asignar')}</option>
                {tecnicos.map((tec) => (
                  <option key={tec.id} value={tec.id}>
                    {tec.nombre}
                  </option>
                ))}
              </select>

              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary mt-1">
                {t('Cliente (opcional — para avisarle por WhatsApp)')}
              </p>
              <input
                value={clienteInput}
                onChange={(e) => elegirClienteInput(e.target.value)}
                placeholder={t('Nombre del cliente')}
                list="clientes-servicio"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <datalist id="clientes-servicio">
                {clientes.map((c) => (
                  <option key={c.id} value={nombreCompleto(c)} />
                ))}
              </datalist>
              <input
                value={clienteTelefono}
                onChange={(e) => setClienteTelefono(e.target.value)}
                placeholder={t('Teléfono (con código de área)')}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />

              <button
                disabled={equiposEfectivos.length === 0 || guardandoNuevo}
                onClick={recibirEquipos}
                className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {guardandoNuevo
                  ? t('Recibiendo...')
                  : equiposEfectivos.length > 1
                    ? `${t('Recibir')} ${equiposEfectivos.length} ${t('equipos')}`
                    : t('Recibir equipo')}
              </button>
            </div>
          )}
        </>
      )}

      {avisoWhatsApp && (
        <div className="rounded-xl border border-good/30 bg-good/10 p-3 flex flex-col gap-2">
          <p className="text-sm">
            {avisoWhatsApp.tipo === 'agregado' ? t('Equipo recibido.') : t('¡Equipo marcado como listo!')} {t('¿Le avisamos a')}{' '}
            <strong>{avisoWhatsApp.nombre}</strong> {t('por WhatsApp?')}
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

      {avisoAgregarStockPara && (
        <div className="rounded-xl border border-good/30 bg-good/10 p-3 flex flex-col gap-2">
          <p className="text-sm">
            {t('¿Agregamos')} <strong>{avisoAgregarStockPara.modelo || t('este equipo')}</strong> {t('al Stock ahora?')}
          </p>
          <div className="flex gap-2">
            <button
              disabled={!!guardando}
              onClick={() => agregarAlStock(avisoAgregarStockPara)}
              className="flex-1 rounded-lg bg-good text-white text-center py-2 text-sm font-medium disabled:opacity-40"
            >
              {t('Agregar al Stock')}
            </button>
            <button
              onClick={() => setAvisoAgregarStockPara(null)}
              className="rounded-lg border border-border dark:border-dark-border px-3 py-2 text-sm font-medium"
            >
              {t('Ahora no')}
            </button>
          </div>
        </div>
      )}

      {tab === 'mibanco' &&
        (actor?.tipo === 'tecnico' ? (
          <MiBanco
            tecnicoId={actor.id}
            nombreTecnico={nombreTecnico}
            fotoTecnico={fotoTecnico}
            reparaciones={reparacionesSucursal}
            tecnicos={tecnicos}
            guardando={guardando}
            menuAbierto={menuAbierto}
            setMenuAbierto={setMenuAbierto}
            onAsignarTecnico={asignarTecnico}
            onCambiarEstado={cambiarEstado}
            onWhatsApp={enviarWhatsApp}
            onArchivar={archivarCancelar}
            onEliminar={eliminarDefinitivo}
            onAgregarAlStock={agregarAlStock}
            onEntregadoCliente={marcarEntregadoCliente}
            imagenesCarpetas={imagenesCarpetas}
            puedeAgregarStock={puedeAgregarStock}
            esPropio
          />
        ) : (
          <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t(MENSAJE_ACTOR_REQUERIDO)}</p>
        ))}

      {tab === 'tecnicos' ? (
        tecnicoSeleccionado ? (
          <>
            <button
              onClick={() => setTecnicoSeleccionado(null)}
              className="text-sm text-accent dark:text-dark-accent underline self-start"
            >
              &larr; {t('Todos los técnicos')}
            </button>
            <p className="text-sm font-medium flex items-center gap-2">
              <Avatar src={fotoTecnico(tecnicoSeleccionado)} nombre={nombreTecnico(tecnicoSeleccionado) ?? '?'} size={50} />
              {nombreTecnico(tecnicoSeleccionado)}
            </p>

            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setVistaTecnico('banco')}
                className={`flex-1 rounded-xl py-2 font-medium ${
                  vistaTecnico === 'banco' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {t('Banco')}
              </button>
              <button
                onClick={() => setVistaTecnico('en_poder')}
                className={`flex-1 rounded-xl py-2 font-medium ${
                  vistaTecnico === 'en_poder' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {t('En su poder')}
              </button>
              <button
                onClick={() => setVistaTecnico('historial')}
                className={`flex-1 rounded-xl py-2 font-medium ${
                  vistaTecnico === 'historial' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {t('Historial')}
              </button>
            </div>

            {vistaTecnico === 'banco' && (
              <MiBanco
                tecnicoId={tecnicoSeleccionado}
                nombreTecnico={nombreTecnico}
                fotoTecnico={fotoTecnico}
                reparaciones={reparacionesSucursal}
                tecnicos={tecnicos}
                guardando={guardando}
                menuAbierto={menuAbierto}
                setMenuAbierto={setMenuAbierto}
                onAsignarTecnico={asignarTecnico}
                onCambiarEstado={cambiarEstado}
                onWhatsApp={enviarWhatsApp}
                onArchivar={archivarCancelar}
                onEliminar={eliminarDefinitivo}
                onAgregarAlStock={agregarAlStock}
                onEntregadoCliente={marcarEntregadoCliente}
                imagenesCarpetas={imagenesCarpetas}
                puedeAgregarStock={puedeAgregarStock}
                esPropio={actor?.tipo === 'tecnico' && actor.id === tecnicoSeleccionado}
              />
            )}

            {vistaTecnico === 'en_poder' && (
              <>
                {equiposEnPoder.length === 0 && (
                  <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
                    {t('No tiene equipos en su poder en este momento.')}
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {equiposEnPoder.map((r) => (
                    <TarjetaReparacion
                      key={r.id}
                      r={r}
                      nombreTecnico={nombreTecnico}
                      guardando={guardando}
                      menuAbierto={menuAbierto}
                      setMenuAbierto={setMenuAbierto}
                      tecnicos={tecnicos}
                      onAsignarTecnico={asignarTecnico}
                      onCambiarEstado={cambiarEstado}
                      onWhatsApp={enviarWhatsApp}
                      onArchivar={archivarCancelar}
                      onEliminar={eliminarDefinitivo}
                      onAgregarAlStock={agregarAlStock}
                      onEntregadoCliente={marcarEntregadoCliente}
                      imagenesCarpetas={imagenesCarpetas}
                      puedeAgregarStock={puedeAgregarStock}
                      extra={
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={r.en_poder_tecnico}
                            disabled={guardando === r.id}
                            onChange={(ev) => marcarEnPoder(r, ev.target.checked)}
                            className="h-4 w-4 accent-ink"
                          />
                          {r.en_poder_tecnico ? t('Lo tiene el técnico') : t('Ya lo entregó')}
                        </label>
                      }
                    />
                  ))}
                </div>
              </>
            )}

            {vistaTecnico === 'historial' && (
              <>
                {historialTecnico.length === 0 && (
                  <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Todavía no tiene reparaciones entregadas.')}</p>
                )}
                <div className="flex flex-col gap-2">
                  {historialTecnico.map((r) => (
                    <div key={r.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        {r.numero_orden} · {r.modelo}
                        {r.capacidad_gb ? ` · ${r.capacidad_gb}GB` : ''}
                      </p>
                      {r.imei && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">
                          IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{r.imei}</span>
                        </p>
                      )}
                      {r.trabajos_realizados && r.trabajos_realizados.length > 0 && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Arreglo:')} {r.trabajos_realizados.join(', ')}</p>
                      )}
                      {r.fecha_reparado && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Reparado el')} {formatearFecha(r.fecha_reparado)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {tecnicos.length === 0 && (
              <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
                {t('Todavía no cargaste técnicos.')}{' '}
                <Link href="/configuracion/tecnicos" className="text-accent dark:text-dark-accent underline">
                  {t('Cargar acá')}
                </Link>
              </p>
            )}
            {tecnicos.length > 0 && (
              <div className="flex items-center justify-end gap-2 text-xs">
                <label htmlFor="periodo-tecnicos" className="text-muted dark:text-dark-text-secondary">
                  {t('Completadas y promedio de:')}
                </label>
                <select
                  id="periodo-tecnicos"
                  value={periodoTecnicos}
                  onChange={(e) => setPeriodoTecnicos(e.target.value as 'hoy' | '7d' | '30d' | 'todo')}
                  className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5"
                >
                  <option value="hoy">{t('Hoy')}</option>
                  <option value="7d">{t('Últimos 7 días')}</option>
                  <option value="30d">{t('Últimos 30 días')}</option>
                  <option value="todo">{t('Todo')}</option>
                </select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {tecnicos.map((tec) => {
                const resumen = resumenPorTecnico.get(tec.id);
                const activasArr = resumen?.activasArr ?? [];
                const enCurso = resumen?.enCurso ?? 0;
                const demoradas = resumen?.demoradas ?? 0;
                const esperandoDiagnostico = resumen?.esperandoDiagnostico ?? 0;
                const listasHoy = resumen?.listasHoy ?? 0;
                const completadasPeriodoCount = resumen?.completadasPeriodo ?? 0;
                const tiempoPromedioDias = resumen?.tiempoPromedioDias ?? null;
                const ocupado = activasArr.length > 0;
                const cargaPct = maxActivasTecnicos > 0 ? Math.round((activasArr.length / maxActivasTecnicos) * 100) : 0;
                return (
                  <button
                    key={tec.id}
                    onClick={() => {
                      setTecnicoSeleccionado(tec.id);
                      setVistaTecnico('banco');
                    }}
                    className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2 text-left"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={tec.foto_url} nombre={tec.nombre} size={52} />
                        <span className="min-w-0">
                          <p className="text-sm font-medium truncate">{tec.nombre}</p>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ocupado ? 'text-warn' : 'text-good'}`}>
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ocupado ? 'bg-warn' : 'bg-good'}`} />
                            {ocupado ? t('Ocupado') : t('Disponible')}
                          </span>
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <p className="text-xs font-medium">
                          {activasArr.length} {activasArr.length === 1 ? t('activa') : t('activas')}
                        </p>
                        {demoradas > 0 && (
                          <p className="text-xs text-bad font-medium">
                            {demoradas} {demoradas === 1 ? t('demorada') : t('demoradas')}
                          </p>
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-xs text-muted dark:text-dark-text-secondary">
                      <span className="flex items-center gap-1">
                        <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">{ICONOS.lupa}</span>
                        {esperandoDiagnostico} {t('diagnóstico')}
                      </span>
                      <span className="flex items-center gap-1">
                        <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">{ICONOS.herramienta}</span>
                        {enCurso} {t('en curso')}
                      </span>
                      <span className="flex items-center gap-1">
                        <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">{ICONOS.chequeado}</span>
                        {listasHoy} {t('listas hoy')}
                      </span>
                    </div>

                    {/* Carga relativa y tiempo promedio: comparan técnicos entre
                        sí, así que quedan reservados a quien puede ver
                        Estadísticas (sección 10 del rediseño). */}
                    {puedeVerEstadisticas && (
                      <div className="flex flex-col gap-1">
                        <div className="h-1.5 rounded-full bg-canvas dark:bg-dark-bg overflow-hidden" aria-hidden="true">
                          <div className="h-full bg-accent dark:bg-dark-accent" style={{ width: `${cargaPct}%` }} />
                        </div>
                        <p className="text-xs text-muted dark:text-dark-text-secondary">
                          {completadasPeriodoCount} {completadasPeriodoCount === 1 ? t('completada') : t('completadas')} {t('en el período')}
                          {tiempoPromedioDias != null ? ` · ${t('promedio')} ${tiempoPromedioDias.toFixed(1)} ${t('días')}` : ''}
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )
      ) : (
        <>
          {alertas.length > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn/10 flex flex-col overflow-hidden">
              <button
                onClick={() => setAlertasAbiertas((v) => !v)}
                className="flex items-center justify-between px-4 py-3 text-sm font-medium"
              >
                <span className="flex items-center gap-1">
                  <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">{ICONOS.campana}</span>
                  {alertas.length} {alertas.length === 1 ? t('alerta') : t('alertas')}
                </span>
                <span className="text-xs text-muted dark:text-dark-text-secondary">{alertasAbiertas ? t('Ocultar') : t('Ver')}</span>
              </button>
              {alertasAbiertas && (
                <div className="flex flex-col border-t border-warn/20">
                  {alertas.map((a) => (
                    <div key={alertasKey(a)} className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-white/40 dark:hover:bg-black/10">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${a.color === 'bad' ? 'bg-bad' : 'bg-warn'}`} />
                      <Link href={a.tipo === 'repuesto' ? '/servicio-tecnico/stock' : `/servicio-tecnico/${a.id}`} className="flex-1 min-w-0 truncate">
                        {a.texto}
                      </Link>
                      <button
                        onClick={() => descartarAlerta(alertasKey(a))}
                        className="shrink-0 text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text underline"
                      >
                        {t('Descartar')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resumen operativo: indicadores clickeables con datos reales,
              icono + color (nunca solo color) y su propio filtro. */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-xs">
            {(
              [
                { id: 'activas', icono: 'herramienta', label: t('Activas'), valor: indicadores.activas, acento: 'accent' },
                { id: 'demoradas', icono: 'reloj', label: t('Demoradas'), valor: indicadores.demoradas, acento: 'bad' },
                { id: 'aprobacion', icono: 'documento', label: t('Esperando aprobación'), valor: indicadores.aprobacion, acento: 'warn' },
                { id: 'repuesto', icono: 'stock', label: t('Esperando repuesto'), valor: indicadores.repuesto, acento: 'warn' },
                { id: 'listas', icono: 'chequeado', label: t('Listas'), valor: indicadores.listas, acento: 'good' },
              ] as const
            ).map((ind) => {
              const activo = filtroIndicador === ind.id;
              const colorTexto =
                ind.acento === 'bad' ? 'text-bad' : ind.acento === 'warn' ? 'text-warn' : ind.acento === 'good' ? 'text-good' : 'text-accent dark:text-dark-accent';
              return (
                <button
                  key={ind.id}
                  onClick={() => setFiltroIndicador(activo ? null : ind.id)}
                  aria-pressed={activo}
                  className={`rounded-xl border px-2.5 py-2 flex flex-col items-start gap-0.5 text-left transition-colors ${
                    activo
                      ? 'border-accent dark:border-dark-accent bg-accent-soft dark:bg-dark-accent-soft'
                      : 'border-border dark:border-dark-border bg-white dark:bg-dark-surface hover:border-accent/40 dark:hover:border-dark-accent/40'
                  }`}
                >
                  <span className={`text-base font-semibold inline-flex items-center gap-1 ${colorTexto}`}>
                    <span aria-hidden="true" className="[&_svg]:h-4 [&_svg]:w-4">
                      {ICONOS[ind.icono]}
                    </span>
                    {ind.valor}
                  </span>
                  <span className="text-muted dark:text-dark-text-secondary leading-tight">{ind.label}</span>
                </button>
              );
            })}
          </div>

          {/* Qovi acompaña el resumen de demoradas UNA sola vez, solo cuando
              hay reparaciones demoradas de verdad y ese filtro está activo —
              no reemplaza la lista de abajo, solo la introduce. Se apaga si
              además hay una búsqueda activa: si esa combinación no encuentra
              nada, el bloque de "sin resultados" de más abajo ya cubre ese
              caso y Qovi no debe aparecer dos veces en la misma pantalla. */}
          {filtroIndicador === 'demoradas' && indicadores.demoradas > 0 && busqueda.trim() === '' && (
            <QCard firma padding="sm">
              <QoviState
                escena="reparacionDemorada"
                tamano="sm"
                alineacion="izquierda"
                titulo={`${indicadores.demoradas} ${indicadores.demoradas === 1 ? t('reparación demorada') : t('reparaciones demoradas')}`}
                descripcion={t('Llevan más de 5 días en el taller o pasaron su fecha estimada. Priorizalas para no perder el ritmo de entrega.')}
              />
            </QCard>
          )}

          <div className="flex flex-col gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('Buscar por orden, cliente, IMEI o teléfono...')}
              aria-label={t('Buscar por orden, cliente, IMEI o teléfono')}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex gap-2">
              <select
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
                aria-label={t('Filtrar por técnico')}
                className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">{t('Todos los técnicos')}</option>
                {tecnicos.map((tec) => (
                  <option key={tec.id} value={tec.id}>
                    {tec.nombre}
                  </option>
                ))}
              </select>
              {sucursales.length > 1 && (
                <select
                  value={filtroSucursal}
                  onChange={(e) => setFiltroSucursal(e.target.value)}
                  aria-label={t('Filtrar por sucursal')}
                  className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">🏬 {t('Todas las sucursales')}</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      🏬 {s.nombre}
                    </option>
                  ))}
                </select>
              )}
              {hayFiltrosActivos && (
                <button
                  onClick={limpiarFiltros}
                  className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium border border-border dark:border-dark-border"
                >
                  {t('Limpiar filtros')}
                </button>
              )}
            </div>
            {indicadores.sinAsignar > 0 && (
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {indicadores.sinAsignar} {indicadores.sinAsignar === 1 ? t('reparación activa sin técnico asignado.') : t('reparaciones activas sin técnico asignado.')}
              </p>
            )}
          </div>

          {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}
          {!loading && filtrados.length === 0 && busqueda.trim() !== '' && (
            <QoviState
              escena="sinResultados"
              tamano="sm"
              titulo={t('No encontramos resultados')}
              descripcion={`${t('Nada coincide con')} "${busqueda.trim()}" ${t('en este filtro.')}`}
              accionSecundaria={{ label: t('Limpiar filtros'), onClick: limpiarFiltros }}
            />
          )}
          {!loading && filtrados.length === 0 && busqueda.trim() === '' && (
            <div className="flex flex-col items-center gap-3 text-center py-8">
              <p className="text-sm text-muted dark:text-dark-text-secondary">
                {!hayFiltrosActivos
                  ? t('Todavía no recibiste ningún equipo.')
                  : filtroIndicador === 'demoradas'
                  ? t('No hay reparaciones demoradas. Todo el taller está al día.')
                  : filtroIndicador === 'aprobacion'
                  ? t('Ninguna reparación está esperando aprobación del cliente.')
                  : filtroIndicador === 'repuesto'
                  ? t('Ninguna reparación está esperando un repuesto.')
                  : filtroIndicador === 'listas'
                  ? t('No hay equipos listos para entregar todavía.')
                  : t('No hay reparaciones en este filtro.')}
              </p>
              {hayFiltrosActivos && (
                <button onClick={limpiarFiltros} className="text-xs text-accent dark:text-dark-accent underline">
                  {t('Limpiar filtros')}
                </button>
              )}
              {!hayFiltrosActivos && puedeRecibir && (
                <button
                  onClick={() => setPanelNuevo(true)}
                  className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-4 py-2 text-sm font-medium text-white"
                >
                  + {t('Recibir equipo')}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {filtrados.map((r) => (
              <div key={r.id} className="flex flex-col gap-1">
                {busquedaDebounced.trim() !== '' && sucursales.length > 1 && (
                  <span className="self-start text-[10px] font-medium text-accent dark:text-dark-accent bg-accent-soft dark:bg-dark-accent-soft rounded-full px-2 py-0.5">
                    🏬 {sucursales.find((s) => s.id === r.sucursal_id)?.nombre ?? t('Sin sucursal')}
                  </span>
                )}
                <TarjetaReparacion
                  r={r}
                  nombreTecnico={nombreTecnico}
                  guardando={guardando}
                  menuAbierto={menuAbierto}
                  setMenuAbierto={setMenuAbierto}
                  tecnicos={tecnicos}
                  onAsignarTecnico={asignarTecnico}
                  onCambiarEstado={cambiarEstado}
                  onWhatsApp={enviarWhatsApp}
                  onArchivar={archivarCancelar}
                  onEliminar={eliminarDefinitivo}
                  onAgregarAlStock={agregarAlStock}
                  onEntregadoCliente={marcarEntregadoCliente}
                  imagenesCarpetas={imagenesCarpetas}
                  puedeAgregarStock={puedeAgregarStock}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
