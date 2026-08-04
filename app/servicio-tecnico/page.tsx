'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { asegurarModelo } from '../lib/modelos';
import { limpiarImei } from '../lib/imei';
import { armarLinkWhatsApp, mensajeSeguimientoServicio, mensajeListoServicio } from '../lib/whatsapp';
import { codigoLlamada } from '../lib/paises';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { registrarAuditoria } from '../lib/auditoria';
import { getActor } from '../lib/actor';
import { obtenerTodasLasFilas } from '../lib/db';
import {
  ESTADOS_REPARACION,
  GRUPOS_ESTADO,
  PRIORIDADES,
  infoEstado,
  estadosDeGrupo,
  GrupoEstado,
  calcularAlertas,
  ITEMS_CHECKLIST_INGRESO,
  generarTextoCondicionIngreso,
} from '../lib/reparaciones';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import Avatar from '../Avatar';
import SelectorColor from '../SelectorColor';
import CheckTri from '../CheckTri';
import TextoCondicionGenerado from '../TextoCondicionGenerado';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Tecnico = { id: string; nombre: string; foto_url: string | null };
type Cliente = { id: string; nombre: string; apellido: string | null; telefono: string | null };

type Reparacion = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  falla_declarada: string | null;
  diagnostico: string | null;
  ubicacion_fisica: string | null;
  tecnico_id: string | null;
  estado: string;
  prioridad: string;
  trabajos_realizados: string[] | null;
  fecha_ingreso_servicio: string;
  fecha_estimada: string | null;
  fecha_reparado: string | null;
  fecha_entrega: string | null;
  garantia_dias: number | null;
  estado_actualizado_at: string;
  cliente_id: string | null;
  token_seguimiento: string | null;
  en_poder_tecnico: boolean;
  presupuesto_mano_obra: number | null;
  presupuesto_repuestos: number | null;
  importe_total: number | null;
  orden_cobro_id: string | null;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

function formatearFecha(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-AR');
}

function hace(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias}d`;
}

const FINALIZADOS = ['entregado', 'cancelado'];
const DIAS_DEMORA = 5;

export default function ServicioTecnico() {
  const supabase = crearClienteNavegador();
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'lista' | 'tecnicos'>('lista');
  const [grupo, setGrupo] = useState<GrupoEstado>('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [soloDemorados, setSoloDemorados] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
  const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState<string | null>(null);
  const [vistaTecnico, setVistaTecnico] = useState<'en_poder' | 'historial'>('en_poder');
  const [asignadoTecnicoId, setAsignadoTecnicoId] = useState('');

  const [carpetasStock, setCarpetasStock] = useState<string[]>([]);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevaCapacidad, setNuevaCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoImei, setNuevoImei] = useState('');
  const [nuevaFalla, setNuevaFalla] = useState('');
  const [nuevaUbicacion, setNuevaUbicacion] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

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
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [codigoPais, setCodigoPais] = useState('54');

  const cargar = async () => {
    const { data } = await supabase
      .from('reparaciones')
      .select(
        'id, numero_orden, modelo, capacidad_gb, color, imei, falla_declarada, diagnostico, ubicacion_fisica, tecnico_id, estado, prioridad, trabajos_realizados, fecha_ingreso_servicio, fecha_estimada, fecha_reparado, fecha_entrega, garantia_dias, estado_actualizado_at, cliente_id, token_seguimiento, en_poder_tecnico, presupuesto_mano_obra, presupuesto_repuestos, importe_total, orden_cobro_id, clientes ( nombre, apellido, telefono )'
      )
      .order('fecha_ingreso_servicio', { ascending: false });
    setReparaciones((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      const { data } = await supabase.from('tecnicos').select('id, nombre, foto_url').order('nombre');
      setTecnicos((data as Tecnico[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetasStock((data ?? []).map((m) => m.nombre));
    })();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
    (async () => {
      setClientes(await obtenerTodasLasFilas<Cliente>(supabase, 'clientes', 'id, nombre, apellido, telefono', [{ columna: 'nombre' }]));
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

  const nombreTecnico = (tecnicoId: string | null) => tecnicos.find((t) => t.id === tecnicoId)?.nombre;
  const fotoTecnico = (tecnicoId: string | null) => tecnicos.find((t) => t.id === tecnicoId)?.foto_url ?? null;

  const esDemorado = (r: Reparacion) => {
    if (FINALIZADOS.includes(r.estado)) return false;
    const dias = (Date.now() - new Date(r.fecha_ingreso_servicio).getTime()) / 86400000;
    if (dias > DIAS_DEMORA) return true;
    if (r.fecha_estimada && new Date(r.fecha_estimada) < new Date()) return true;
    return false;
  };

  const filtrados = useMemo(() => {
    const estadosGrupo = estadosDeGrupo(grupo);
    const q = busqueda.trim().toLowerCase();
    return reparaciones.filter((r) => {
      if (!estadosGrupo.includes(r.estado as any)) return false;
      if (filtroTecnico && r.tecnico_id !== filtroTecnico) return false;
      if (soloDemorados && !esDemorado(r)) return false;
      if (q) {
        const nombreCliente = r.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim().toLowerCase() : '';
        const coincide =
          r.numero_orden?.toLowerCase().includes(q) ||
          r.modelo?.toLowerCase().includes(q) ||
          r.imei?.toLowerCase().includes(q) ||
          nombreCliente.includes(q) ||
          r.clientes?.telefono?.includes(q);
        if (!coincide) return false;
      }
      return true;
    });
  }, [reparaciones, grupo, filtroTecnico, soloDemorados, busqueda]);

  const contadores = useMemo(
    () => ({
      sinAsignar: reparaciones.filter((r) => !r.tecnico_id && !FINALIZADOS.includes(r.estado)).length,
      esperandoRepuesto: reparaciones.filter((r) => r.estado === 'esperando_repuesto').length,
      listos: reparaciones.filter((r) => r.estado === 'listo_para_entregar').length,
    }),
    [reparaciones]
  );

  const alertas = useMemo(() => calcularAlertas(reparaciones), [reparaciones]);
  const [alertasAbiertas, setAlertasAbiertas] = useState(false);

  const historialTecnico = useMemo(
    () => reparaciones.filter((r) => r.estado === 'entregado' && r.tecnico_id === tecnicoSeleccionado),
    [reparaciones, tecnicoSeleccionado]
  );

  const equiposEnPoder = useMemo(
    () => reparaciones.filter((r) => r.tecnico_id === tecnicoSeleccionado && r.en_poder_tecnico && !FINALIZADOS.includes(r.estado)),
    [reparaciones, tecnicoSeleccionado]
  );

  const datosChecklistNuevo = () => ({
    enciende: nuevoEnciende,
    pantalla_estado: nuevaPantalla || null,
    modulo_ok: nuevoChecklist.modulo_ok ?? null,
    camara_frontal_ok: nuevoChecklist.camara_frontal_ok ?? null,
    camara_trasera_ok: nuevoChecklist.camara_trasera_ok ?? null,
    flash_ok: nuevoChecklist.flash_ok ?? null,
    microfono_superior_ok: nuevoChecklist.microfono_superior_ok ?? null,
    microfono_inferior_ok: nuevoChecklist.microfono_inferior_ok ?? null,
    altavoces_ok: nuevoChecklist.altavoces_ok ?? null,
    boton_power_ok: nuevoChecklist.boton_power_ok ?? null,
    boton_volumen_ok: nuevoChecklist.boton_volumen_ok ?? null,
    biometria_ok: nuevoChecklist.biometria_ok ?? null,
    conectores_ok: nuevoChecklist.conectores_ok ?? null,
    humedad: nuevaHumedad,
    garantia_excepcion_manual: nuevaExcepcionGarantia.trim() || null,
  });

  const agregarEquipo = async () => {
    if (!nuevoModelo.trim()) return;
    setGuardandoNuevo(true);

    let clienteId = clienteCoincidente?.id ?? null;
    let nombreParaMensaje = clienteCoincidente ? nombreCompleto(clienteCoincidente) : clienteInput.trim();

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
    // crear una segunda (ver generarOrdenCobro en la ficha).
    let ordenId: string | null = null;
    if (clienteId) {
      const notaCondicion = generarTextoCondicionIngreso(datosChecklistNuevo()) || null;
      const { data: orden } = await supabase
        .from('ordenes')
        .insert({ cliente_id: clienteId, estado: 'pendiente', total: 0, nota: notaCondicion })
        .select('id')
        .single();
      if (orden) {
        ordenId = orden.id;
        await supabase.from('orden_items').insert({
          orden_id: orden.id,
          descripcion: `Servicio técnico — ${nuevoModelo.trim()}`,
          cantidad: 1,
          precio_unitario: 0,
          tipo: 'trabajo',
        });
      }
    }

    const { data: nueva } = await supabase
      .from('reparaciones')
      .insert({
        modelo: nuevoModelo.trim(),
        capacidad_gb: nuevaCapacidad,
        color: nuevoColor.trim() || null,
        imei: limpiarImei(nuevoImei),
        falla_declarada: nuevaFalla.trim() || null,
        ubicacion_fisica: nuevaUbicacion.trim() || null,
        estado: 'recibido',
        cliente_id: clienteId,
        tecnico_id: asignadoTecnicoId || null,
        enciende: nuevoEnciende,
        pantalla_estado: nuevaPantalla || null,
        ...nuevoChecklist,
        humedad: nuevaHumedad,
        garantia_excepcion_manual: nuevaExcepcionGarantia.trim() || null,
        orden_cobro_id: ordenId,
      })
      .select('token_seguimiento')
      .single();

    if (clienteId && clienteTelefono.trim() && nueva?.token_seguimiento) {
      const url = `${window.location.origin}/seguimiento/${nueva.token_seguimiento}`;
      const mensaje = mensajeSeguimientoServicio(nombreParaMensaje || 'estimado/a', nuevoModelo.trim(), url);
      setAvisoWhatsApp({ link: armarLinkWhatsApp(clienteTelefono, mensaje, codigoPais), nombre: nombreParaMensaje, tipo: 'agregado' });
    }

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
    setGuardando(id);
    const r = reparaciones.find((x) => x.id === id);
    const cambios: { tecnico_id: string | null; en_poder_tecnico?: boolean } = { tecnico_id: tecnicoId || null };
    if (tecnicoId) cambios.en_poder_tecnico = true;
    await supabase.from('reparaciones').update(cambios).eq('id', id);
    const nombreNuevo = tecnicos.find((t) => t.id === tecnicoId)?.nombre;
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
    setGuardando(r.id);
    const cambios: any = { estado: nuevoEstado, estado_actualizado_at: new Date().toISOString() };
    if (nuevoEstado === 'listo_para_entregar' && !r.fecha_reparado) cambios.fecha_reparado = new Date().toISOString();
    await supabase.from('reparaciones').update(cambios).eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `cambió el estado de la reparación ${r.numero_orden || ''} (${r.modelo || 'sin modelo'}) de "${infoEstado(r.estado).label}" a "${infoEstado(nuevoEstado).label}"`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorAnterior: { estado: r.estado },
      valorNuevo: { estado: nuevoEstado },
    });

    if (nuevoEstado === 'listo_para_entregar' && r.cliente_id && r.clientes?.telefono && r.token_seguimiento) {
      const url = `${window.location.origin}/seguimiento/${r.token_seguimiento}`;
      const nombre = `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim();
      const mensaje = mensajeListoServicio(nombre || 'estimado/a', r.modelo || 'equipo', url);
      setAvisoWhatsApp({ link: armarLinkWhatsApp(r.clientes.telefono, mensaje, codigoPais), nombre, tipo: 'reparado' });
    }

    setGuardando(null);
    cargar();
  };

  const agregarAlStock = async (r: Reparacion) => {
    if (guardando) return;
    if (r.imei) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', r.imei).maybeSingle();
      if (existente && !confirm(`Ya hay un dispositivo en Stock con el IMEI ${r.imei}. ¿Agregarlo igual?`)) return;
    }
    if (!confirm('¿Pasar este equipo al Stock como dispositivo disponible para vender?')) return;
    setGuardando(r.id);
    const actor = getActor();
    await supabase.from('dispositivos').insert({
      modelo: r.modelo,
      capacidad_gb: r.capacidad_gb,
      color: r.color,
      imei: r.imei,
      estado: 'usado',
      en_stock: true,
      agregado_por_nombre: actor?.nombre ?? null,
      agregado_por_foto_url: actor?.fotoUrl ?? null,
    });
    await asegurarModelo(supabase, r.modelo);
    await supabase.from('reparaciones').update({ estado: 'entregado', estado_actualizado_at: new Date().toISOString() }).eq('id', r.id);
    await registrarAuditoria(supabase, {
      accion: `agregó al Stock un equipo propio reparado en Servicio Técnico (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'}${r.imei ? `, IMEI ${r.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: r.id,
    });
    setGuardando(null);
    cargar();
  };

  const marcarEntregadoCliente = async (r: Reparacion) => {
    if (guardando) return;
    if (!confirm('¿Marcar este equipo como entregado al cliente?')) return;
    setGuardando(r.id);
    await supabase
      .from('reparaciones')
      .update({ estado: 'entregado', fecha_entrega: new Date().toISOString(), estado_actualizado_at: new Date().toISOString() })
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
    if (!confirm('¿Cancelar/archivar esta reparación? Va a quedar en "Finalizados", no se borra el historial.')) return;
    setMenuAbierto(null);
    await cambiarEstado(r, 'cancelado');
  };

  const eliminarDefinitivo = async (r: Reparacion) => {
    if (!confirm('¿Eliminar definitivamente esta reparación? Esta acción no se puede deshacer y borra todo su historial.')) return;
    setGuardando(r.id);
    setMenuAbierto(null);
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
    if (!r.cliente_id || !r.clientes?.telefono || !r.token_seguimiento) return;
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
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">Servicio Técnico</span>
        <Link href="/servicio-tecnico/repuestos" className="text-xs text-accent dark:text-dark-accent underline">
          Proveedores
        </Link>
        <Link href="/servicio-tecnico/trabajos" className="text-xs text-accent dark:text-dark-accent underline">
          Trabajos
        </Link>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setTab('lista')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'lista' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Reparaciones
        </button>
        <button
          onClick={() => {
            setTab('tecnicos');
            setTecnicoSeleccionado(null);
          }}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'tecnicos' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Técnicos
        </button>
      </div>

      {(tab === 'lista' || (tab === 'tecnicos' && tecnicoSeleccionado)) && (
        <>
          <button
            onClick={() => {
              if (!panelNuevo && tab === 'tecnicos' && tecnicoSeleccionado) setAsignadoTecnicoId(tecnicoSeleccionado);
              setPanelNuevo((v) => !v);
            }}
            className="w-full rounded-xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
          >
            {panelNuevo ? 'Cancelar' : '+ Recibir equipo'}
          </button>

          {panelNuevo && (
            <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
              <input
                value={nuevoModelo}
                onChange={(e) => setNuevoModelo(e.target.value)}
                placeholder="Modelo (ej. iPhone 13)"
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
              <SelectorColor value={nuevoColor} onChange={setNuevoColor} />
              <input
                value={nuevoImei}
                onChange={(e) => setNuevoImei(e.target.value)}
                placeholder="IMEI"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
              />
              <textarea
                value={nuevaFalla}
                onChange={(e) => setNuevaFalla(e.target.value)}
                placeholder="Falla declarada por el cliente (ej. no enciende, pantalla rota)"
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />

              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary mt-1">
                ¿Cómo entra el equipo? (para saber qué se garantiza al entregarlo)
              </p>
              <CheckTri label="Enciende" valor={nuevoEnciende} onChange={setNuevoEnciende} />
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Pantalla</label>
                <div className="flex gap-2">
                  {[
                    { id: 'ok', label: 'OK' },
                    { id: 'marcada', label: 'Marcada' },
                    { id: 'rota', label: 'Rota' },
                  ].map((op) => (
                    <button
                      key={op.id}
                      onClick={() => setNuevaPantalla(op.id)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                        nuevaPantalla === op.id ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                      }`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>
              {ITEMS_CHECKLIST_INGRESO.map((item) => (
                <CheckTri
                  key={item.campo}
                  label={item.label}
                  valor={nuevoChecklist[item.campo] ?? null}
                  onChange={(v) => setNuevoChecklist((p) => ({ ...p, [item.campo]: v }))}
                />
              ))}
              <CheckTri label="Humedad / manipulación" valor={nuevaHumedad} onChange={setNuevaHumedad} invertido />
              <textarea
                value={nuevaExcepcionGarantia}
                onChange={(e) => setNuevaExcepcionGarantia(e.target.value)}
                placeholder='Excepción adicional a la garantía (opcional, ej. "por golpe fuerte, no garantizamos Face ID")'
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <TextoCondicionGenerado datos={datosChecklistNuevo()} />

              <input
                value={nuevaUbicacion}
                onChange={(e) => setNuevaUbicacion(e.target.value)}
                placeholder="Ubicación física (ej. Estante A-3)"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />

              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary mt-1">Técnico asignado (opcional)</p>
              <select
                value={asignadoTecnicoId}
                onChange={(e) => setAsignadoTecnicoId(e.target.value)}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Sin asignar</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>

              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary mt-1">
                Cliente (opcional — para avisarle por WhatsApp)
              </p>
              <input
                value={clienteInput}
                onChange={(e) => elegirClienteInput(e.target.value)}
                placeholder="Nombre del cliente"
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
                placeholder="Teléfono (con código de área)"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />

              <button
                disabled={!nuevoModelo.trim() || guardandoNuevo}
                onClick={agregarEquipo}
                className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {guardandoNuevo ? 'Recibiendo...' : 'Recibir equipo'}
              </button>
            </div>
          )}
        </>
      )}

      {avisoWhatsApp && (
        <div className="rounded-xl border border-good/30 bg-good/10 p-3 flex flex-col gap-2">
          <p className="text-sm">
            {avisoWhatsApp.tipo === 'agregado' ? 'Equipo recibido.' : '¡Equipo marcado como listo!'} ¿Le avisamos a{' '}
            <strong>{avisoWhatsApp.nombre}</strong> por WhatsApp?
          </p>
          <div className="flex gap-2">
            <a
              href={avisoWhatsApp.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAvisoWhatsApp(null)}
              className="flex-1 rounded-lg bg-good text-white text-center py-2 text-sm font-medium"
            >
              Enviar WhatsApp
            </a>
            <button
              onClick={() => setAvisoWhatsApp(null)}
              className="rounded-lg border border-border dark:border-dark-border px-3 py-2 text-sm font-medium"
            >
              Ahora no
            </button>
          </div>
        </div>
      )}

      {tab === 'tecnicos' ? (
        tecnicoSeleccionado ? (
          <>
            <button
              onClick={() => setTecnicoSeleccionado(null)}
              className="text-sm text-accent dark:text-dark-accent underline self-start"
            >
              &larr; Todos los técnicos
            </button>
            <p className="text-sm font-medium flex items-center gap-2">
              <Avatar src={fotoTecnico(tecnicoSeleccionado)} nombre={nombreTecnico(tecnicoSeleccionado) ?? '?'} size={50} />
              {nombreTecnico(tecnicoSeleccionado)}
            </p>

            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setVistaTecnico('en_poder')}
                className={`flex-1 rounded-xl py-2 font-medium ${
                  vistaTecnico === 'en_poder' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                En su poder
              </button>
              <button
                onClick={() => setVistaTecnico('historial')}
                className={`flex-1 rounded-xl py-2 font-medium ${
                  vistaTecnico === 'historial' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                Historial
              </button>
            </div>

            {vistaTecnico === 'en_poder' && (
              <>
                {equiposEnPoder.length === 0 && (
                  <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
                    No tiene equipos en su poder en este momento.
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
                      extra={
                        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={r.en_poder_tecnico}
                            disabled={guardando === r.id}
                            onChange={(ev) => marcarEnPoder(r, ev.target.checked)}
                            className="h-4 w-4 accent-ink"
                          />
                          {r.en_poder_tecnico ? 'Lo tiene el técnico' : 'Ya lo entregó'}
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
                  <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Todavía no tiene reparaciones entregadas.</p>
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
                        <p className="text-xs text-muted dark:text-dark-text-secondary">Arreglo: {r.trabajos_realizados.join(', ')}</p>
                      )}
                      {r.fecha_reparado && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">Reparado el {formatearFecha(r.fecha_reparado)}</p>
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
                Todavía no cargaste técnicos.{' '}
                <Link href="/configuracion/tecnicos" className="text-accent dark:text-dark-accent underline">
                  Cargar acá
                </Link>
              </p>
            )}
            <div className="flex flex-col gap-2">
              {tecnicos.map((t) => {
                const entregadas = reparaciones.filter((r) => r.estado === 'entregado' && r.tecnico_id === t.id).length;
                const enPoder = reparaciones.filter((r) => r.tecnico_id === t.id && r.en_poder_tecnico && !FINALIZADOS.includes(r.estado)).length;
                const enCurso = reparaciones.filter((r) => r.tecnico_id === t.id && r.estado === 'en_reparacion').length;
                const demoradas = reparaciones.filter((r) => r.tecnico_id === t.id && esDemorado(r)).length;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTecnicoSeleccionado(t.id);
                      setVistaTecnico('en_poder');
                    }}
                    className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <Avatar src={t.foto_url} nombre={t.nombre} size={60} />
                      <p className="text-sm font-medium">{t.nombre}</p>
                    </span>
                    <span className="text-right">
                      <p className="text-xs font-medium">{enPoder} en su poder{enCurso > 0 ? ` · ${enCurso} en curso` : ''}</p>
                      <p className="text-xs text-muted dark:text-dark-text-secondary">
                        {entregadas} entregada{entregadas === 1 ? '' : 's'}
                        {demoradas > 0 ? ` · ${demoradas} demorada${demoradas === 1 ? '' : 's'}` : ''}
                      </p>
                    </span>
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
                <span>🔔 {alertas.length} alerta{alertas.length === 1 ? '' : 's'}</span>
                <span className="text-xs text-muted dark:text-dark-text-secondary">{alertasAbiertas ? 'Ocultar' : 'Ver'}</span>
              </button>
              {alertasAbiertas && (
                <div className="flex flex-col border-t border-warn/20">
                  {alertas.map((a) => (
                    <Link
                      key={a.id}
                      href={`/servicio-tecnico/${a.id}`}
                      className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-white/40 dark:hover:bg-black/10"
                    >
                      <span className={`h-2 w-2 rounded-full shrink-0 ${a.color === 'bad' ? 'bg-bad' : 'bg-warn'}`} />
                      {a.texto}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por orden, cliente, IMEI o teléfono..."
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex gap-2">
              <select
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
                className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos los técnicos</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSoloDemorados((v) => !v)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium border ${
                  soloDemorados ? 'bg-bad text-white border-bad' : 'border-border dark:border-dark-border'
                }`}
              >
                Solo demorados
              </button>
            </div>
          </div>

          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-canvas dark:bg-dark-bg px-3 py-1 font-medium">Sin asignar {contadores.sinAsignar}</span>
            <span className="rounded-full bg-canvas dark:bg-dark-bg px-3 py-1 font-medium">Esperando repuesto {contadores.esperandoRepuesto}</span>
            <span className="rounded-full bg-canvas dark:bg-dark-bg px-3 py-1 font-medium">Listos {contadores.listos}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
            {GRUPOS_ESTADO.map((g) => (
              <button
                key={g.id}
                onClick={() => setGrupo(g.id)}
                className={`shrink-0 rounded-xl px-3 py-2 font-medium ${
                  grupo === g.id ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
          {!loading && filtrados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              No hay reparaciones en este filtro.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {filtrados.map((r) => (
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
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function TarjetaReparacion({
  r,
  nombreTecnico,
  guardando,
  menuAbierto,
  setMenuAbierto,
  tecnicos,
  onAsignarTecnico,
  onCambiarEstado,
  onWhatsApp,
  onArchivar,
  onEliminar,
  onAgregarAlStock,
  onEntregadoCliente,
  imagenesCarpetas,
  extra,
}: {
  r: Reparacion;
  nombreTecnico: (id: string | null) => string | undefined;
  guardando: string | null;
  menuAbierto: string | null;
  setMenuAbierto: (id: string | null) => void;
  tecnicos: Tecnico[];
  onAsignarTecnico: (id: string, tecnicoId: string) => void;
  onCambiarEstado: (r: Reparacion, estado: string) => void;
  onWhatsApp: (r: Reparacion) => void;
  onArchivar: (r: Reparacion) => void;
  onEliminar: (r: Reparacion) => void;
  onAgregarAlStock: (r: Reparacion) => void;
  onEntregadoCliente: (r: Reparacion) => void;
  imagenesCarpetas: Map<string, string>;
  extra?: React.ReactNode;
}) {
  const est = infoEstado(r.estado);
  const presupuesto =
    r.presupuesto_mano_obra != null || r.presupuesto_repuestos != null
      ? `$${((r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0)).toLocaleString('es-AR')}`
      : 'pendiente';
  const nombreCliente = r.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim() : null;

  return (
    <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <MiniaturaDispositivo src={imagenPorNombreExacto(r.modelo, imagenesCarpetas)} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {r.numero_orden} · {r.modelo}
            {r.capacidad_gb ? ` · ${r.capacidad_gb}GB` : ''}
            {r.color ? ` · ${r.color}` : ''}
          </p>
          <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
            {nombreTecnico(r.tecnico_id) || 'Sin técnico'}
            {nombreCliente ? ` · ${nombreCliente}` : ''}
          </p>
          {r.imei && (
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{r.imei}</span>
            </p>
          )}
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuAbierto(menuAbierto === r.id ? null : r.id)}
            className="text-lg leading-none px-1 text-muted dark:text-dark-text-secondary"
          >
            ⋯
          </button>
          {menuAbierto === r.id && (
            <div className="absolute right-0 top-6 z-10 w-44 rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-elevated flex flex-col overflow-hidden">
              <Link
                href={`/servicio-tecnico/etiqueta/${r.id}`}
                className="px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg"
              >
                🏷️ Imprimir etiqueta
              </Link>
              <button
                onClick={() => onArchivar(r)}
                className="px-3 py-2 text-xs text-left hover:bg-canvas dark:hover:bg-dark-bg"
              >
                Cancelar / archivar
              </button>
              <button
                onClick={() => onEliminar(r)}
                className="px-3 py-2 text-xs text-left text-bad hover:bg-bad/10"
              >
                Eliminar definitivamente
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs">
        {r.cliente_id ? (
          <span className="text-accent dark:text-dark-accent">👤 Cliente</span>
        ) : (
          <span className="text-muted dark:text-dark-text-secondary">🏬 Propio del local</span>
        )}
      </p>

      {r.falla_declarada && <p className="text-xs text-muted dark:text-dark-text-secondary">{r.falla_declarada}</p>}

      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${est.color}`}>{est.label}</span>
        {r.prioridad !== 'normal' && (
          <span className={`font-medium ${PRIORIDADES.find((p) => p.id === r.prioridad)?.color}`}>
            {PRIORIDADES.find((p) => p.id === r.prioridad)?.label}
          </span>
        )}
        {r.ubicacion_fisica && <span className="text-muted dark:text-dark-text-secondary">📍 {r.ubicacion_fisica}</span>}
        <span className="text-muted dark:text-dark-text-secondary">Ingresó {hace(r.fecha_ingreso_servicio)}</span>
      </div>

      <p className="text-xs text-muted dark:text-dark-text-secondary">Presupuesto: {presupuesto}</p>

      {extra}

      {r.estado === 'listo_para_entregar' && (
        <button
          disabled={guardando === r.id}
          onClick={() => (r.cliente_id ? onEntregadoCliente(r) : onAgregarAlStock(r))}
          className="rounded-lg bg-good hover:opacity-90 transition-opacity py-2 text-center text-xs font-medium text-white disabled:opacity-40"
        >
          {r.cliente_id ? '✓ Marcar entregado al cliente' : '✓ Agregar al Stock'}
        </button>
      )}

      <div className="flex gap-2">
        <Link
          href={`/servicio-tecnico/${r.id}`}
          className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-center text-xs font-medium text-white"
        >
          Abrir ficha
        </Link>
        {r.cliente_id && (
          <button
            disabled={guardando === r.id}
            onClick={() => onWhatsApp(r)}
            className="rounded-lg border border-good/30 text-good px-3 py-2 text-xs font-medium disabled:opacity-40"
          >
            WhatsApp
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={r.tecnico_id ?? ''}
          disabled={guardando === r.id}
          onChange={(ev) => onAsignarTecnico(r.id, ev.target.value)}
          className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-xs disabled:opacity-40"
        >
          <option value="">Sin asignar</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <select
          value={r.estado}
          disabled={guardando === r.id}
          onChange={(ev) => onCambiarEstado(r, ev.target.value)}
          className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-xs disabled:opacity-40"
        >
          {ESTADOS_REPARACION.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
