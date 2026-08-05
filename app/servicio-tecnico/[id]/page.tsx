'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';
import { limpiarImei } from '../../lib/imei';
import { registrarAuditoria } from '../../lib/auditoria';
import { getActor, useActor, MENSAJE_ACTOR_REQUERIDO } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { armarLinkWhatsApp, mensajeSeguimientoServicio, mensajeListoServicio, mensajePresupuesto, mensajeEsperandoRepuesto } from '../../lib/whatsapp';
import { codigoLlamada } from '../../lib/paises';
import { simboloMoneda, MONEDAS } from '../../lib/monedas';
import {
  ESTADOS_REPARACION,
  PRIORIDADES,
  infoEstado,
  ITEMS_CHECKLIST_INGRESO,
  generarTextoCondicionIngreso,
} from '../../lib/reparaciones';
import SelectorColor from '../../SelectorColor';
import Avatar from '../../Avatar';
import CheckTri from '../../CheckTri';
import TextoCondicionGenerado from '../../TextoCondicionGenerado';

const STORAGE_OPTIONS = [64, 128, 256, 512];
const ACCESORIOS_OPCIONES = ['Funda', 'Cargador', 'SIM', 'Bandeja SIM'];
const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta'];

type Tecnico = { id: string; nombre: string; foto_url: string | null };
type Trabajo = { id: string; nombre: string; imagen_url: string | null };

type Reparacion = {
  id: string;
  numero_orden: string | null;
  cliente_id: string | null;
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
  flash_ok: boolean | null;
  camara_frontal_ok: boolean | null;
  camara_trasera_ok: boolean | null;
  microfono_superior_ok: boolean | null;
  microfono_inferior_ok: boolean | null;
  boton_power_ok: boolean | null;
  boton_volumen_ok: boolean | null;
  garantia_excepcion_manual: string | null;
  humedad: boolean | null;
  garantia_condiciones_aceptadas: boolean;
  diagnostico: string | null;
  tecnico_id: string | null;
  prioridad: string;
  trabajo_recomendado: string | null;
  presupuesto_mano_obra: number | null;
  presupuesto_repuestos: number | null;
  fecha_estimada: string | null;
  observaciones_internas: string | null;
  estado: string;
  en_poder_tecnico: boolean;
  trabajos_realizados: string[];
  repuestos_utilizados: string | null;
  resultado_final: string | null;
  importe_total: number | null;
  moneda: string | null;
  forma_pago: string | null;
  garantia_dias: number | null;
  fecha_entrega: string | null;
  orden_cobro_id: string | null;
  token_seguimiento: string;
  fecha_ingreso_servicio: string;
  fecha_reparado: string | null;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

type Evento = {
  id: string;
  tipo: 'nota_interna' | 'mensaje_cliente' | 'sistema';
  texto: string;
  actor_nombre: string | null;
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

  const [r, setR] = useState<Reparacion | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [codigoVisible, setCodigoVisible] = useState(false);
  const [notaTexto, setNotaTexto] = useState('');
  const [codigoPais, setCodigoPais] = useState('54');
  const [monedasNegocio, setMonedasNegocio] = useState<string[]>([]);
  const [monedaPrincipal, setMonedaPrincipal] = useState('ARS');
  const [avisoWhatsApp, setAvisoWhatsApp] = useState<{ link: string; nombre: string } | null>(null);

  const [f, setFm] = useState<Record<string, any>>({});

  const cargar = async () => {
    const { data } = await supabase
      .from('reparaciones')
      .select('*, clientes ( nombre, apellido, telefono )')
      .eq('id', id)
      .single();
    setR(data as any);
    setLoading(false);

    const [{ data: aud }, { data: evs }] = await Promise.all([
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
    ]);
    const deAuditoria: Evento[] = (aud ?? []).map((a: any) => ({
      id: `a-${a.id}`,
      tipo: 'sistema',
      texto: a.accion,
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
      const { data } = await supabase.from('trabajos').select('id, nombre, imagen_url').order('nombre');
      setTrabajos((data as Trabajo[]) ?? []);
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( pais, moneda, monedas_habilitadas )')
        .eq('id', user.id)
        .single();
      const neg = (perfil as any)?.negocios;
      setCodigoPais(codigoLlamada(neg?.pais));
      const habilitadas: string[] = neg?.monedas_habilitadas?.length ? neg.monedas_habilitadas : [neg?.moneda || 'ARS'];
      setMonedasNegocio(habilitadas);
      setMonedaPrincipal(neg?.moneda || habilitadas[0]);
    })();
  }, [id]);

  const nombreCliente = r?.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim() : null;
  const nombreTecnico = (tid: string | null) => tecnicos.find((t) => t.id === tid)?.nombre;
  const fotoTecnico = (tid: string | null) => tecnicos.find((t) => t.id === tid)?.foto_url ?? null;

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
      flash_ok: r.flash_ok,
      camara_frontal_ok: r.camara_frontal_ok,
      camara_trasera_ok: r.camara_trasera_ok,
      microfono_superior_ok: r.microfono_superior_ok,
      microfono_inferior_ok: r.microfono_inferior_ok,
      boton_power_ok: r.boton_power_ok,
      boton_volumen_ok: r.boton_volumen_ok,
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
      moneda: r.moneda ?? '',
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
      modelo: f.modelo.trim() || null,
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
      flash_ok: f.flash_ok,
      camara_frontal_ok: f.camara_frontal_ok,
      camara_trasera_ok: f.camara_trasera_ok,
      microfono_superior_ok: f.microfono_superior_ok,
      microfono_inferior_ok: f.microfono_inferior_ok,
      boton_power_ok: f.boton_power_ok,
      boton_volumen_ok: f.boton_volumen_ok,
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
      moneda: f.moneda || null,
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

    const { error: updateError } = await supabase.from('reparaciones').update(nuevo).eq('id', r.id);
    if (updateError) {
      setError('No pudimos guardar los cambios: ' + updateError.message);
      setGuardando(false);
      return;
    }

    await registrarAuditoria(supabase, {
      accion: `editó la reparación ${r.numero_orden || ''} (${nuevo.modelo || 'sin modelo'})`,
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
    const cambios: any = { estado: nuevoEstado, estado_actualizado_at: new Date().toISOString() };
    if (nuevoEstado === 'listo_para_entregar' && !r.fecha_reparado) cambios.fecha_reparado = new Date().toISOString();
    await supabase.from('reparaciones').update(cambios).eq('id', r.id);

    // La orden vinculada (creada al recibir el equipo, ver agregarEquipo)
    // se borra al cancelar SOLO si sigue en $0 y pendiente — es decir, si
    // nunca se llegó a cobrar. Si ya tiene un total cargado o está pagada
    // o entregada, es plata real y no se toca aunque después la marquen
    // como cancelada. La referencia en reparaciones se limpia sola
    // (orden_cobro_id tiene "on delete set null") cuando sí se borra.
    if (nuevoEstado === 'cancelado' && r.orden_cobro_id) {
      const { data: ordenVinculada } = await supabase
        .from('ordenes')
        .select('estado, total')
        .eq('id', r.orden_cobro_id)
        .maybeSingle();
      if (ordenVinculada && ordenVinculada.estado === 'pendiente' && !ordenVinculada.total) {
        await supabase.from('ordenes').delete().eq('id', r.orden_cobro_id);
      }
    }

    await registrarAuditoria(supabase, {
      accion: `cambió el estado de la reparación ${r.numero_orden || ''} de "${infoEstado(r.estado).label}" a "${infoEstado(nuevoEstado).label}"`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorAnterior: { estado: r.estado },
      valorNuevo: { estado: nuevoEstado },
    });

    if (nuevoEstado === 'listo_para_entregar' && r.cliente_id && r.clientes?.telefono && r.token_seguimiento) {
      const url = `${window.location.origin}/seguimiento/${r.token_seguimiento}`;
      const nombre = nombreCliente || 'estimado/a';
      const mensaje = mensajeListoServicio(nombre, r.modelo || 'equipo', url);
      setAvisoWhatsApp({ link: armarLinkWhatsApp(r.clientes.telefono, mensaje, codigoPais), nombre });
    }

    setGuardando(false);
    cargar();
  };

  const agregarNota = async () => {
    if (!r || !notaTexto.trim()) return;
    const actor = getActor();
    await supabase.from('reparaciones_eventos').insert({
      reparacion_id: r.id,
      tipo: 'nota_interna',
      texto: notaTexto.trim(),
      actor_nombre: actor?.nombre ?? null,
      actor_tipo: actor?.tipo ?? null,
    });
    setNotaTexto('');
    cargar();
  };

  const enviarWhatsApp = async (tipo: 'recibido' | 'presupuesto' | 'repuesto' | 'listo') => {
    if (!r || !r.clientes?.telefono) return;
    const url = `${window.location.origin}/seguimiento/${r.token_seguimiento}`;
    const nombre = nombreCliente || 'estimado/a';
    const modelo = r.modelo || 'equipo';
    let mensaje = '';
    if (tipo === 'recibido') mensaje = mensajeSeguimientoServicio(nombre, modelo, url);
    if (tipo === 'presupuesto') {
      const monto = `${simboloMoneda(r.moneda || monedaPrincipal)}${((r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0)).toLocaleString('es-AR')}`;
      mensaje = mensajePresupuesto(nombre, modelo, monto, url);
    }
    if (tipo === 'repuesto') mensaje = mensajeEsperandoRepuesto(nombre, modelo, url);
    if (tipo === 'listo') mensaje = mensajeListoServicio(nombre, modelo, url);

    await supabase.from('reparaciones_eventos').insert({ reparacion_id: r.id, tipo: 'mensaje_cliente', texto: mensaje });
    window.open(armarLinkWhatsApp(r.clientes.telefono, mensaje, codigoPais), '_blank');
    cargar();
  };

  const generarOrdenCobro = async () => {
    if (!r || !puedeGestionar) return;
    if (!confirm('¿Generar la orden de cobro con el importe de esta reparación?')) return;
    setGuardando(true);
    const total = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
    const descripcion = `Servicio técnico — ${r.modelo || 'equipo'}${r.diagnostico ? `: ${r.diagnostico}` : ''}`;
    // Así el cliente ve en la boleta, sin que nadie tenga que acordarse de
    // copiarlo a mano, qué no está cubierto por la garantía y por qué.
    const notaCondicion = generarTextoCondicionIngreso(r as any) || null;

    let ordenId = r.orden_cobro_id;

    if (ordenId) {
      // Ya existía desde que se recibió el equipo (ver agregarEquipo en la
      // lista) — se actualiza en vez de crear una segunda orden duplicada.
      const { error: updateError } = await supabase
        .from('ordenes')
        .update({ total, forma_pago: r.forma_pago || 'Efectivo', moneda: r.moneda || monedaPrincipal, nota: notaCondicion })
        .eq('id', ordenId);
      if (updateError) {
        setError('No pudimos actualizar la orden: ' + updateError.message);
        setGuardando(false);
        return;
      }
      const { data: itemExistente, error: itemBuscarError } = await supabase
        .from('orden_items')
        .select('id')
        .eq('orden_id', ordenId)
        .limit(1)
        .maybeSingle();
      if (itemBuscarError) {
        // Si esto falla por un error real (no porque no exista el ítem),
        // no hay que asumir que no existe: insertar acá duplicaría la
        // línea de la boleta (una vieja en $0 + una nueva con el total).
        setError('No pudimos actualizar el ítem de la orden: ' + itemBuscarError.message);
        setGuardando(false);
        return;
      }
      if (itemExistente) {
        await supabase.from('orden_items').update({ descripcion, precio_unitario: total }).eq('id', itemExistente.id);
      } else {
        await supabase.from('orden_items').insert({ orden_id: ordenId, descripcion, cantidad: 1, precio_unitario: total, tipo: 'trabajo' });
      }
    } else {
      // Reparaciones sin cliente al recibirse (equipo propio) o cargadas
      // antes de este cambio no tienen una orden vinculada todavía — se
      // crea acá, como antes.
      const { data: orden, error: ordenError } = await supabase
        .from('ordenes')
        .insert({
          cliente_id: r.cliente_id,
          forma_pago: r.forma_pago || 'Efectivo',
          moneda: r.moneda || monedaPrincipal,
          total,
          estado: 'pendiente',
          nota: notaCondicion,
        })
        .select()
        .single();

      if (ordenError || !orden) {
        setError('No pudimos generar la orden: ' + (ordenError?.message || ''));
        setGuardando(false);
        return;
      }

      ordenId = orden.id;
      await supabase.from('orden_items').insert({
        orden_id: orden.id,
        descripcion,
        cantidad: 1,
        precio_unitario: total,
        tipo: 'trabajo',
      });
    }

    await supabase
      .from('reparaciones')
      .update({
        orden_cobro_id: ordenId,
        estado: 'entregado',
        fecha_entrega: new Date().toISOString(),
        estado_actualizado_at: new Date().toISOString(),
      })
      .eq('id', r.id);

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
    if (!r || !puedeGestionar) return;
    const actor = getActor();
    if (!actor) {
      setError(MENSAJE_ACTOR_REQUERIDO);
      return;
    }
    if (r.imei) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', r.imei).maybeSingle();
      if (existente && !confirm(`Ya hay un dispositivo en Stock con el IMEI ${r.imei}. ¿Agregarlo igual?`)) return;
    }
    if (!confirm('¿Pasar este equipo al Stock como dispositivo disponible para vender?')) return;
    setGuardando(true);
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
    setGuardando(false);
    cargar();
  };

  const marcarEntregadoClienteFicha = async () => {
    if (!r || !puedeGestionar) return;
    if (!confirm('¿Marcar este equipo como entregado al cliente?')) return;
    setGuardando(true);
    await supabase
      .from('reparaciones')
      .update({ estado: 'entregado', fecha_entrega: new Date().toISOString(), estado_actualizado_at: new Date().toISOString() })
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

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!r) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos esa reparación.</p>
        <Link href="/servicio-tecnico" className="text-sm text-accent dark:text-dark-accent underline">
          Volver a Servicio Técnico
        </Link>
      </main>
    );
  }

  const est = infoEstado(r.estado);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/servicio-tecnico" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">{r.numero_orden}</span>
        <Link href={`/servicio-tecnico/etiqueta/${r.id}`} className="text-xs text-accent dark:text-dark-accent underline">
          🏷️ Etiqueta
        </Link>
        {puedeGestionar && (
          <button onClick={() => (editando ? setEditando(false) : abrirEdicion())} className="text-xs text-accent dark:text-dark-accent underline">
            {editando ? 'Cancelar' : 'Editar'}
          </button>
        )}
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {!puedeGestionar && (
        <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
          No tenés permiso para gestionar Servicio Técnico — solo podés ver esta ficha.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${est.color}`}>{est.label}</span>
        <select
          value={r.estado}
          disabled={guardando || !puedeGestionar}
          onChange={(e) => cambiarEstado(e.target.value)}
          className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs disabled:opacity-40"
        >
          {ESTADOS_REPARACION.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        {nombreTecnico(r.tecnico_id) && (
          <span className="flex items-center gap-1.5 text-xs text-muted dark:text-dark-text-secondary">
            <Avatar src={fotoTecnico(r.tecnico_id)} nombre={nombreTecnico(r.tecnico_id) ?? '?'} size={24} />
            {nombreTecnico(r.tecnico_id)}
          </span>
        )}
      </div>

      {avisoWhatsApp && (
        <div className="rounded-xl border border-good/30 bg-good/10 p-3 flex flex-col gap-2">
          <p className="text-sm">
            ¡Equipo marcado como listo! ¿Le avisamos a <strong>{avisoWhatsApp.nombre}</strong> por WhatsApp?
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

      {/* Identificación */}
      <Seccion titulo="Identificación">
        {editando ? (
          <div className="flex flex-col gap-2">
            <Campo label="Modelo" valor={f.modelo} onChange={(v) => setFm((p) => ({ ...p, modelo: v }))} />
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
            <SelectorColor value={f.color} onChange={(v) => setFm((p) => ({ ...p, color: v }))} />
            <Campo label="IMEI" valor={f.imei} onChange={(v) => setFm((p) => ({ ...p, imei: v }))} mono />
            <Campo label="Código de desbloqueo (opcional)" valor={f.codigo_desbloqueo} onChange={(v) => setFm((p) => ({ ...p, codigo_desbloqueo: v }))} />
            <Campo label="Ubicación física (ej. Estante A-3)" valor={f.ubicacion_fisica} onChange={(v) => setFm((p) => ({ ...p, ubicacion_fisica: v }))} />
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Accesorios entregados</label>
              <div className="flex flex-wrap gap-2">
                {ACCESORIOS_OPCIONES.map((a) => (
                  <button
                    key={a}
                    onClick={() => toggleAccesorio(a)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      f.accesorios.includes(a) ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm flex flex-col gap-1">
            <p className="text-xs">
              {r.cliente_id ? (
                <span className="text-accent dark:text-dark-accent">👤 Equipo de un cliente</span>
              ) : (
                <span className="text-muted dark:text-dark-text-secondary">🏬 Equipo propio del local</span>
              )}
            </p>
            {nombreCliente && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Cliente: </span>
                {nombreCliente} {r.clientes?.telefono ? `· ${r.clientes.telefono}` : ''}
              </p>
            )}
            <p>
              <span className="text-muted dark:text-dark-text-secondary">Equipo: </span>
              {r.modelo}
              {r.capacidad_gb ? ` · ${r.capacidad_gb}GB` : ''}
              {r.color ? ` · ${r.color}` : ''}
            </p>
            {r.imei && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">IMEI: </span>
                <span className="font-mono font-bold">{r.imei}</span>
              </p>
            )}
            {r.codigo_desbloqueo && (
              <p className="flex items-center gap-2">
                <span className="text-muted dark:text-dark-text-secondary">Código de desbloqueo: </span>
                <span className="font-mono">{codigoVisible ? r.codigo_desbloqueo : '••••••'}</span>
                <button onClick={() => setCodigoVisible((v) => !v)} className="text-xs text-accent dark:text-dark-accent underline">
                  {codigoVisible ? 'ocultar' : 'mostrar'}
                </button>
              </p>
            )}
            {r.accesorios?.length > 0 && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Accesorios: </span>
                {r.accesorios.join(', ')}
              </p>
            )}
            {r.ubicacion_fisica && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Ubicación: </span>📍 {r.ubicacion_fisica}
              </p>
            )}
          </div>
        )}
      </Seccion>

      {/* Recepción / checklist */}
      <Seccion titulo="Recepción">
        {editando ? (
          <div className="flex flex-col gap-2">
            <Campo label="Falla declarada por el cliente" valor={f.falla_declarada} onChange={(v) => setFm((p) => ({ ...p, falla_declarada: v }))} textarea />
            <Campo label="Estado estético" valor={f.estado_estetico} onChange={(v) => setFm((p) => ({ ...p, estado_estetico: v }))} />
            <CheckTri label="Enciende" valor={f.enciende} onChange={(v) => setFm((p) => ({ ...p, enciende: v }))} />
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
                    onClick={() => setFm((p) => ({ ...p, pantalla_estado: op.id }))}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      f.pantalla_estado === op.id ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
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
                valor={f[item.campo]}
                onChange={(v) => setFm((p) => ({ ...p, [item.campo]: v }))}
              />
            ))}
            <CheckTri label="Humedad / manipulación" valor={f.humedad} onChange={(v) => setFm((p) => ({ ...p, humedad: v }))} invertido />
            <Campo
              label="Excepción adicional a la garantía (opcional)"
              valor={f.garantia_excepcion_manual}
              onChange={(v) => setFm((p) => ({ ...p, garantia_excepcion_manual: v }))}
              textarea
            />
            <p className="text-[10px] text-muted dark:text-dark-text-secondary -mt-1">
              Para excluir algo que hoy funciona pero quedó en duda (ej.: "por golpe fuerte, no garantizamos Face ID").
              Lo que ya marcaste como falla arriba se excluye solo, no hace falta repetirlo acá.
            </p>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={f.garantia_condiciones_aceptadas}
                onChange={(e) => setFm((p) => ({ ...p, garantia_condiciones_aceptadas: e.target.checked }))}
                className="h-4 w-4 accent-ink"
              />
              El cliente aceptó las condiciones de garantía y diagnóstico
            </label>
            <TextoCondicionGenerado datos={f as any} />
          </div>
        ) : (
          <div className="text-sm flex flex-col gap-1">
            {r.falla_declarada && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Falla declarada: </span>
                {r.falla_declarada}
              </p>
            )}
            {r.estado_estetico && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Estado estético: </span>
                {r.estado_estetico}
              </p>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted dark:text-dark-text-secondary">
              {itemChecklist('Enciende', r.enciende)}
              {r.pantalla_estado && <span>Pantalla: {r.pantalla_estado}</span>}
              {ITEMS_CHECKLIST_INGRESO.map((item) => itemChecklist(item.label, (r as any)[item.campo]))}
              {/* Reparaciones cargadas antes de este cambio: si nunca se usó la checklist nueva, mostramos la vieja para no perder ese historial. */}
              {r.camara_frontal_ok == null && r.camara_trasera_ok == null && itemChecklist('Cámaras', r.camaras_ok)}
              {r.boton_power_ok == null && r.boton_volumen_ok == null && itemChecklist('Botones', r.botones_ok)}
              {r.humedad != null && <span>{r.humedad ? '⚠️ Con humedad/manipulación' : '✅ Sin humedad'}</span>}
            </p>
            {r.garantia_condiciones_aceptadas && <p className="text-xs text-good">✓ Cliente aceptó condiciones de garantía</p>}
            <TextoCondicionGenerado datos={r as any} />
          </div>
        )}
      </Seccion>

      {/* Diagnóstico */}
      <Seccion titulo="Diagnóstico y presupuesto">
        {editando ? (
          <div className="flex flex-col gap-2">
            <Campo label="Diagnóstico técnico" valor={f.diagnostico} onChange={(v) => setFm((p) => ({ ...p, diagnostico: v }))} textarea />
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Técnico asignado</label>
              <select
                value={f.tecnico_id}
                onChange={(e) => setFm((p) => ({ ...p, tecnico_id: e.target.value }))}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Sin asignar</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Prioridad</label>
              <div className="flex gap-2">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setFm((prev) => ({ ...prev, prioridad: p.id }))}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      f.prioridad === p.id ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <Campo label="Trabajo recomendado" valor={f.trabajo_recomendado} onChange={(v) => setFm((p) => ({ ...p, trabajo_recomendado: v }))} textarea />
            {monedasNegocio.length > 1 && (
              <div>
                <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Moneda del cobro</label>
                <div className="flex gap-2">
                  {monedasNegocio.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFm((p) => ({ ...p, moneda: m }))}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                        (f.moneda || monedaPrincipal) === m ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                      }`}
                    >
                      {simboloMoneda(m)} {MONEDAS.find((x) => x.codigo === m)?.nombre ?? m}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Campo label={`Mano de obra (${simboloMoneda(f.moneda || monedaPrincipal)})`} valor={f.presupuesto_mano_obra} onChange={(v) => setFm((p) => ({ ...p, presupuesto_mano_obra: v }))} numerico />
              <Campo label={`Repuestos (${simboloMoneda(f.moneda || monedaPrincipal)})`} valor={f.presupuesto_repuestos} onChange={(v) => setFm((p) => ({ ...p, presupuesto_repuestos: v }))} numerico />
            </div>
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Fecha estimada de entrega</label>
              <input
                type="date"
                value={f.fecha_estimada}
                onChange={(e) => setFm((p) => ({ ...p, fecha_estimada: e.target.value }))}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
            </div>
            <Campo label="Observaciones internas (no las ve el cliente)" valor={f.observaciones_internas} onChange={(v) => setFm((p) => ({ ...p, observaciones_internas: v }))} textarea />
          </div>
        ) : (
          <div className="text-sm flex flex-col gap-1">
            {r.diagnostico && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Diagnóstico: </span>
                {r.diagnostico}
              </p>
            )}
            {r.trabajo_recomendado && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Trabajo recomendado: </span>
                {r.trabajo_recomendado}
              </p>
            )}
            {(r.presupuesto_mano_obra != null || r.presupuesto_repuestos != null) && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Presupuesto: </span>
                {simboloMoneda(r.moneda || monedaPrincipal)}
                {((r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0)).toLocaleString('es-AR')}
                {' '}
                <span className="text-xs text-muted dark:text-dark-text-secondary">
                  (mano de obra {simboloMoneda(r.moneda || monedaPrincipal)}
                  {(r.presupuesto_mano_obra || 0).toLocaleString('es-AR')} + repuestos{' '}
                  {simboloMoneda(r.moneda || monedaPrincipal)}
                  {(r.presupuesto_repuestos || 0).toLocaleString('es-AR')})
                </span>
              </p>
            )}
            {r.fecha_estimada && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Fecha estimada: </span>
                {new Date(r.fecha_estimada + 'T00:00:00').toLocaleDateString('es-AR')}
              </p>
            )}
            {r.observaciones_internas && (
              <p className="text-xs text-muted dark:text-dark-text-secondary italic">Nota interna: {r.observaciones_internas}</p>
            )}
          </div>
        )}
      </Seccion>

      {/* Reparación y entrega */}
      <Seccion titulo="Reparación y entrega">
        {editando ? (
          <div className="flex flex-col gap-2">
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Trabajos realizados</label>
              <div className="flex flex-wrap gap-2">
                {trabajos.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTrabajo(t.nombre)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      f.trabajos_realizados.includes(t.nombre) ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                    }`}
                  >
                    {t.nombre}
                  </button>
                ))}
              </div>
            </div>
            <Campo label="Repuestos utilizados" valor={f.repuestos_utilizados} onChange={(v) => setFm((p) => ({ ...p, repuestos_utilizados: v }))} textarea />
            <Campo label="Resultado final / pruebas" valor={f.resultado_final} onChange={(v) => setFm((p) => ({ ...p, resultado_final: v }))} textarea />
            <Campo label={`Importe total (${simboloMoneda(f.moneda || monedaPrincipal)})`} valor={f.importe_total} onChange={(v) => setFm((p) => ({ ...p, importe_total: v }))} numerico />
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Forma de pago</label>
              <div className="flex gap-2">
                {FORMAS_PAGO.map((fp) => (
                  <button
                    key={fp}
                    onClick={() => setFm((p) => ({ ...p, forma_pago: fp }))}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      f.forma_pago === fp ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                    }`}
                  >
                    {fp}
                  </button>
                ))}
              </div>
            </div>
            <Campo label="Garantía de la reparación (días)" valor={f.garantia_dias} onChange={(v) => setFm((p) => ({ ...p, garantia_dias: v }))} numerico />
          </div>
        ) : (
          <div className="text-sm flex flex-col gap-1">
            {r.trabajos_realizados?.length > 0 && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Trabajos realizados: </span>
                {r.trabajos_realizados.join(', ')}
              </p>
            )}
            {r.repuestos_utilizados && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Repuestos utilizados: </span>
                {r.repuestos_utilizados}
              </p>
            )}
            {r.resultado_final && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Resultado: </span>
                {r.resultado_final}
              </p>
            )}
            {r.importe_total != null && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Importe total: </span>
                {simboloMoneda(r.moneda || monedaPrincipal)}
                {r.importe_total.toLocaleString('es-AR')}
              </p>
            )}
            {r.forma_pago && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Forma de pago: </span>
                {r.forma_pago}
              </p>
            )}
            {r.garantia_dias != null && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Garantía: </span>
                {r.garantia_dias} días
              </p>
            )}
            {r.fecha_entrega && (
              <p>
                <span className="text-muted dark:text-dark-text-secondary">Entregado: </span>
                {fmt(r.fecha_entrega)}
              </p>
            )}
          </div>
        )}
      </Seccion>

      {editando && (
        <button
          disabled={guardando}
          onClick={guardar}
          className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      )}

      {!editando && (
        <>
          {r.cliente_id && r.clientes?.telefono && (
            <Seccion titulo="WhatsApp al cliente">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => enviarWhatsApp('recibido')} className="rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium">
                  Recibimos tu equipo
                </button>
                <button onClick={() => enviarWhatsApp('presupuesto')} className="rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium">
                  Presupuesto
                </button>
                <button onClick={() => enviarWhatsApp('repuesto')} className="rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium">
                  Esperando repuesto
                </button>
                <button onClick={() => enviarWhatsApp('listo')} className="rounded-lg border border-good/30 text-good px-3 py-1.5 text-xs font-medium">
                  Ya está listo
                </button>
              </div>
            </Seccion>
          )}

          {!r.orden_cobro_id && r.estado === 'listo_para_entregar' && puedeGestionar && (
            r.cliente_id ? (
              <div className="flex gap-2">
                <button
                  disabled={guardando}
                  onClick={marcarEntregadoClienteFicha}
                  className="flex-1 rounded-2xl bg-good hover:opacity-90 transition-opacity py-3 text-center text-sm font-medium text-white disabled:opacity-40"
                >
                  Marcar entregado al cliente
                </button>
                <button
                  disabled={guardando}
                  onClick={generarOrdenCobro}
                  className="flex-1 rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium disabled:opacity-40"
                >
                  Generar orden de cobro
                </button>
              </div>
            ) : (
              <button
                disabled={guardando}
                onClick={agregarAlStockFicha}
                className="w-full rounded-2xl bg-good hover:opacity-90 transition-opacity py-3 text-center text-sm font-medium text-white disabled:opacity-40"
              >
                Agregar al Stock
              </button>
            )
          )}

          {r.orden_cobro_id && (
            <Link
              href={`/ordenes/${r.orden_cobro_id}`}
              className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
            >
              Ver orden de cobro
            </Link>
          )}

          <Seccion titulo="Historial">
            <div className="flex flex-col gap-2 mb-2">
              <textarea
                value={notaTexto}
                onChange={(e) => setNotaTexto(e.target.value)}
                placeholder="Agregar nota interna (solo la ve el personal)..."
                rows={2}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <button
                disabled={!notaTexto.trim()}
                onClick={agregarNota}
                className="self-start rounded-lg bg-accent dark:bg-dark-accent text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                Agregar nota
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {eventos.map((ev) => (
                <div key={ev.id} className="text-xs flex gap-2">
                  <span className="shrink-0">{ev.tipo === 'nota_interna' ? '📝' : ev.tipo === 'mensaje_cliente' ? '💬' : '⚙️'}</span>
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
        </>
      )}
    </main>
  );
}

function itemChecklist(label: string, valor: boolean | null) {
  if (valor == null) return null;
  return <span key={label}>{valor ? `✅ ${label}` : `❌ ${label}`}</span>;
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
          onChange={(e) => onChange(e.target.value)}
          inputMode={numerico ? 'decimal' : undefined}
          className={`w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm ${mono ? 'font-mono' : ''}`}
        />
      )}
    </div>
  );
}

