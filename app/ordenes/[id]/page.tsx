'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { revertirComisionesOrden } from '../../lib/comisiones/operaciones';
import { limpiarImei } from '../../lib/imei';
import { asegurarModelo, normalizarNombreModelo } from '../../lib/modelos';
import { useActor, getActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { useT } from '../../lib/idioma';
import { simboloMoneda } from '../../lib/monedas';
import { MEDIOS_PAGO, medioLabel } from '../../lib/cuentaCorriente';
import { sanitizarDecimal, formatearMonto } from '../../lib/numeros';
import { liberarRepuestosDeReparaciones } from '../../lib/repuestos';
import Avatar from '../../Avatar';
import SelectorColorAuto from '../../SelectorColorAuto';
import SelectorEstadoDispositivo from '../../SelectorEstadoDispositivo';
import { useSucursalActual } from '../../lib/sucursal';

const ESTADOS = ['pendiente', 'pagado', 'entregado'];
const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta'];
const STORAGE_OPTIONS = [64, 128, 256, 512];

function idTemporal() {
  return Math.random().toString(36).slice(2);
}

type Item = {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  dispositivo_id: string | null;
  producto_id: string | null;
  tipo: string;
};

type Vendedor = { id: string; nombre: string };

type Orden = {
  id: string;
  numero_orden: string | null;
  forma_pago: string | null;
  total: number | null;
  anticipo: number | null;
  impuesto_porcentaje: number | null;
  monto_canje: number | null;
  vendedor_id: string | null;
  cliente_id: string | null;
  moneda: string | null;
  monto_secundario: number | null;
  moneda_secundaria: string | null;
  boleta_moneda: string | null;
  aclaraciones_tecnico: string | null;
  incluir_aclaraciones_tecnico: boolean;
  checklist_ingreso: Record<string, unknown> | null;
  estado: string;
  created_at: string;
  nota: string | null;
  incluir_garantia: boolean;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
  vendedores: { nombre: string; foto_url: string | null } | null;
  orden_items: Item[];
};

type ItemEditable = {
  id: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  tipo: string;
  bateria: string;
  esNuevo?: boolean;
  dispositivoId?: string | null;
};

type DispositivoStockEdit = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  precio: number | null;
  salud_bateria: number | null;
};

// La batería del equipo vendido se guarda como sufijo " · Batería X%" en la
// descripción del ítem, así aparece en las dos boletas (interna y pública)
// sin tocar la RPC ni el render. Es idempotente: al abrir la edición se separa
// del texto (SEPARAR_BATERIA) y al guardar se vuelve a pegar limpio, de modo
// que editar varias veces nunca lo duplica.
const BATERIA_RE = /\s*·\s*bater[íi]a\s*(\d{1,3})\s*%\s*$/i;
function separarBateria(descripcion: string): { texto: string; bateria: string } {
  const m = descripcion.match(BATERIA_RE);
  if (!m) return { texto: descripcion, bateria: '' };
  return { texto: descripcion.replace(BATERIA_RE, '').trimEnd(), bateria: m[1] };
}
function componerDescripcion(texto: string, bateria: string): string {
  const base = texto.trim();
  const b = bateria.trim();
  return b ? `${base} · Batería ${b}%` : base;
}

type Canje = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  salud_bateria: number | null;
  detalles: string | null;
  monto: number | null;
  condicion: string | null;
  ubicacion_fisica: string | null;
};

// id: null para un canje nuevo que todavía no existe en la base (se crea
// recién al guardar) — así se puede diferenciar de uno ya cargado que solo
// se está editando.
type CanjeEditable = {
  id: string | null;
  tempId: string;
  modelo: string;
  capacidad_gb: number | null;
  color: string;
  imei: string;
  salud_bateria: string;
  detalles: string;
  monto: string;
  condicion: string;
  ubicacion_fisica: string;
};

export default function DetalleOrden() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const puedeRecibirServicioTecnico = tienePermiso(actor, 'recibir_servicio_tecnico');
  const t = useT();
  const sucursalActual = useSucursalActual();

  const [orden, setOrden] = useState<Orden | null>(null);
  const [canjes, setCanjes] = useState<Canje[]>([]);
  // Los canjes se cargan DESPUÉS de la orden. Este flag evita abrir la edición
  // (sobre todo el auto-abrir con ?editar=1) antes de tenerlos: si no, la
  // edición arrancaría con la lista de canjes vacía y al guardar los borraría
  // por creer que el usuario los quitó.
  const [canjesCargados, setCanjesCargados] = useState(false);
  // Si la consulta de canjes falla (red, timeout), NO hay que asumir "cero
  // canjes": eso llevaría a borrar/pisar un plan canje real al guardar una
  // edición. Bloquea la página con un reintento en vez de seguir.
  const [canjesError, setCanjesError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  // Marcar "pagado" una orden que sigue "pendiente" (el caso real: cobrar
  // una reparación terminada) nunca había registrado un pago de verdad en
  // `pagos` — solo cambiaba el texto del estado. Sin esto, esa plata no
  // tenía forma de llegar a ninguna caja ni a las estadísticas de cobro.
  const [modalCobro, setModalCobro] = useState(false);
  const [medioCobro, setMedioCobro] = useState('efectivo');
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [formaPagoEdit, setFormaPagoEdit] = useState('Efectivo');
  const [notaEdit, setNotaEdit] = useState('');
  const [incluirGarantiaEdit, setIncluirGarantiaEdit] = useState(true);
  const [aclaracionesEdit, setAclaracionesEdit] = useState('');
  const [incluirAclaracionesEdit, setIncluirAclaracionesEdit] = useState(true);
  const [anticipoEdit, setAnticipoEdit] = useState('');
  const [impuestoEdit, setImpuestoEdit] = useState('');
  const [itemsEdit, setItemsEdit] = useState<ItemEditable[]>([]);
  // --- agregar un dispositivo (del stock o cargar nuevo) mientras se edita ---
  const [agregandoDispositivoEdit, setAgregandoDispositivoEdit] = useState(false);
  const [modoDispositivoEdit, setModoDispositivoEdit] = useState<'stock' | 'nuevo'>('stock');
  const [dispositivosStockEdit, setDispositivosStockEdit] = useState<DispositivoStockEdit[]>([]);
  const [buscarDispositivoEdit, setBuscarDispositivoEdit] = useState('');
  const [nuevoModeloDispEdit, setNuevoModeloDispEdit] = useState('');
  const [nuevaCapacidadDispEdit, setNuevaCapacidadDispEdit] = useState<number | null>(null);
  const [nuevoColorDispEdit, setNuevoColorDispEdit] = useState('');
  const [nuevoEstadoDispEdit, setNuevoEstadoDispEdit] = useState('usado');
  const [nuevoImeiDispEdit, setNuevoImeiDispEdit] = useState('');
  const [nuevoPrecioDispEdit, setNuevoPrecioDispEdit] = useState('');
  const [cargandoDispositivoEdit, setCargandoDispositivoEdit] = useState(false);
  const [vendedorEdit, setVendedorEdit] = useState('');
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [monedasDisponibles, setMonedasDisponibles] = useState<string[]>([]);
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);
  // Cómo se muestra el monto en la boleta (la orden siempre queda en la
  // moneda principal). 'principal' = solo US$, 'ambas' = US$ + referencia en
  // pesos. Se mantiene en sync con boleta_moneda de la orden. ("solo pesos"
  // se sacó de la app, ver comentario en ordenes/nueva.)
  const [boletaMonedaEdit, setBoletaMonedaEdit] = useState<'principal' | 'ambas'>('principal');
  const [montoSecundarioEdit, setMontoSecundarioEdit] = useState('');
  const muestraSecundariaEdit = boletaMonedaEdit !== 'principal';

  // --- canjes (Plan canje) de esta orden ---
  const [canjesEdit, setCanjesEdit] = useState<CanjeEditable[]>([]);
  const [canjeModelo, setCanjeModelo] = useState('');
  const [canjeCapacidad, setCanjeCapacidad] = useState<number | null>(null);
  const [canjeColor, setCanjeColor] = useState('');
  const [canjeImei, setCanjeImei] = useState('');
  const [canjeBateria, setCanjeBateria] = useState('');
  const [canjeMonto, setCanjeMonto] = useState('');
  const [canjeDetalles, setCanjeDetalles] = useState('');
  const [canjeCondicion, setCanjeCondicion] = useState('usado');
  const [canjeUbicacion, setCanjeUbicacion] = useState('');
  const [agregandoCanje, setAgregandoCanje] = useState(false);

  const [yaDerivado, setYaDerivado] = useState(false);
  const [reparacionesDerivadasIds, setReparacionesDerivadasIds] = useState<string[]>([]);
  const [derivarAbierto, setDerivarAbierto] = useState(false);
  const [derivarModelo, setDerivarModelo] = useState('');
  const [derivarCapacidad, setDerivarCapacidad] = useState<number | null>(null);
  const [derivarColor, setDerivarColor] = useState('');
  const [derivarImei, setDerivarImei] = useState('');
  const [derivarDetalles, setDerivarDetalles] = useState('');
  const [derivando, setDerivando] = useState(false);

  const cargar = async () => {
    // Las 3 consultas son independientes entre sí (todas filtran por el
    // mismo id de orden) — antes se pedían una tras otra, ahora en paralelo.
    const [{ data }, { data: reparacionesLigadas }, { data: canjesData, error: canjesErr }] = await Promise.all([
      supabase
        .from('ordenes')
        .select(
          '*, clientes ( nombre, apellido, telefono ), vendedores ( nombre, foto_url ), orden_items ( id, descripcion, cantidad, precio_unitario, dispositivo_id, producto_id, tipo )'
        )
        .eq('id', id)
        .single(),
      // Una orden puede tener VARIAS reparaciones derivadas (varios equipos de
      // la misma boleta). Por eso NO se usa .maybeSingle() (que con >1 fila
      // devuelve null y haría creer que no se derivó nada): se traen todas.
      supabase.from('reparaciones').select('id').eq('orden_origen_id', id),
      supabase
        .from('canjes')
        .select('id, modelo, capacidad_gb, color, imei, salud_bateria, detalles, monto, condicion, ubicacion_fisica')
        .eq('orden_id', id)
        .eq('estado', 'en_canje')
        .order('created_at'),
    ]);
    setOrden(data as any);
    const idsRep = (reparacionesLigadas ?? []).map((r: any) => r.id as string);
    setYaDerivado(idsRep.length > 0);
    setReparacionesDerivadasIds(idsRep);
    if (canjesErr) {
      // No seguimos: si diéramos por "cargados" cero canjes sin haber
      // confirmado la consulta, una edición posterior guardaría monto_canje=0
      // y pisaría un plan canje real que sigue existiendo en la base.
      setCanjesError(true);
      setLoading(false);
      return;
    }
    setCanjes((canjesData as Canje[]) ?? []);
    setCanjesCargados(true);
    // Recién acá se apaga el "Cargando…": así ni el auto-abrir ni el botón
    // "Editar" pueden arrancar la edición sin los canjes ya cargados.
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').order('nombre');
      setVendedores((data as Vendedor[]) ?? []);
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( monedas_habilitadas, tipo_cambio )')
        .eq('id', user.id)
        .single();
      const negocio = (perfil as any)?.negocios;
      setMonedasDisponibles(negocio?.monedas_habilitadas?.length ? negocio.monedas_habilitadas : []);
      setTipoCambio(negocio?.tipo_cambio ?? null);
    })();
  }, []);

  const tieneTrabajo = orden?.orden_items.some((i) => i.tipo === 'trabajo') ?? false;

  const abrirDerivar = () => {
    if (!orden) return;
    // Pre-cargamos con lo que el vendedor ya registró en la orden (modelo,
    // imei, color) — es el MISMO equipo, no hay que reescribirlo.
    const ci = (orden.checklist_ingreso ?? {}) as any;
    const descripciones = orden.orden_items.filter((i) => i.tipo === 'trabajo').map((i) => i.descripcion);
    setDerivarModelo(ci.modelo || '');
    setDerivarCapacidad(null);
    setDerivarColor(ci.color || '');
    setDerivarImei(ci.imei || '');
    setDerivarDetalles(descripciones.join(', '));
    setDerivarAbierto(true);
  };

  const derivarAServicioTecnico = async () => {
    if (!orden || !derivarModelo.trim() || !puedeRecibirServicioTecnico) return;
    setDerivando(true);
    const nombreCliente = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : 'sin cliente';
    // Checklist de ingreso que cargó el vendedor → se copia a la reparación
    // para que el técnico lo reciba ya cargado (no recarga nada).
    const ci = (orden.checklist_ingreso ?? {}) as any;
    const { data: nueva } = await supabase
      .from('reparaciones')
      .insert({
        orden_origen_id: orden.id,
        cliente_id: orden.cliente_id,
        modelo: derivarModelo.trim(),
        capacidad_gb: derivarCapacidad,
        color: derivarColor.trim() || null,
        imei: limpiarImei(derivarImei) || null,
        falla_declarada: derivarDetalles.trim() || null,
        estado: 'recibido',
        enciende: ci.enciende ?? null,
        modulo_ok: ci.modulo_ok ?? null,
        senal_ok: ci.senal_ok ?? null,
        camara_frontal_ok: ci.camara_frontal_ok ?? null,
        camara_trasera_ok: ci.camara_trasera_ok ?? null,
        flash_ok: ci.flash_ok ?? null,
        microfono_superior_ok: ci.microfono_superior_ok ?? null,
        microfono_inferior_ok: ci.microfono_inferior_ok ?? null,
        altavoces_ok: ci.altavoces_ok ?? null,
        boton_silencio_ok: ci.boton_silencio_ok ?? null,
        boton_power_ok: ci.boton_power_ok ?? null,
        boton_volumen_ok: ci.boton_volumen_ok ?? null,
        biometria_ok: ci.biometria_ok ?? null,
        conectores_ok: ci.conectores_ok ?? null,
        humedad: ci.humedad ?? null,
        garantia_excepcion_manual: ci.garantia_excepcion_manual ?? null,
        ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
      })
      .select('id, numero_orden')
      .single();
    await registrarAuditoria(supabase, {
      accion: `derivó a Servicio Técnico un equipo de una orden (${nueva?.numero_orden || ''}, ${nombreCliente}, ${derivarModelo.trim()})`,
      entidad: 'reparacion',
      entidadId: nueva?.id,
      valorNuevo: { modelo: derivarModelo.trim(), capacidad_gb: derivarCapacidad, color: derivarColor.trim() || null, imei: limpiarImei(derivarImei) || null },
    });
    setYaDerivado(true);
    if (nueva?.id) setReparacionesDerivadasIds((ids) => [...ids, nueva.id]);
    setDerivarAbierto(false);
    setDerivando(false);
  };

  const empezarEdicion = () => {
    if (!orden) return;
    setFormaPagoEdit(orden.forma_pago || 'Efectivo');
    setNotaEdit(orden.nota || '');
    setIncluirGarantiaEdit(orden.incluir_garantia);
    setAclaracionesEdit(orden.aclaraciones_tecnico || '');
    setIncluirAclaracionesEdit(orden.incluir_aclaraciones_tecnico);
    setAnticipoEdit(orden.anticipo != null ? String(orden.anticipo) : '');
    setImpuestoEdit(orden.impuesto_porcentaje != null ? String(orden.impuesto_porcentaje) : '');
    setVendedorEdit(orden.vendedor_id || '');
    // Orden nueva: usa boleta_moneda. Orden vieja (sin el campo) con monto
    // secundario cargado = el viejo modo "mostrar también", o sea 'ambas'.
    // "Solo secundaria" se sacó de la app (mostraba números mal calculados
    // en toda la boleta): una orden vieja que la tuviera guardada se abre
    // directo en 'ambas' — al guardar, esa orden queda corregida.
    const modoInicial: 'principal' | 'ambas' =
      orden.boleta_moneda === 'ambas' || orden.boleta_moneda === 'secundaria' || orden.monto_secundario != null
        ? 'ambas'
        : 'principal';
    setBoletaMonedaEdit(modoInicial);
    setMontoSecundarioEdit(orden.monto_secundario != null ? String(orden.monto_secundario) : '');
    setItemsEdit(
      orden.orden_items.map((i) => {
        const { texto, bateria } = separarBateria(i.descripcion);
        return {
          id: i.id,
          descripcion: texto,
          cantidad: String(i.cantidad),
          precioUnitario: String(i.precio_unitario),
          tipo: i.tipo,
          bateria,
        };
      })
    );
    setCanjesEdit(
      canjes.map((c) => ({
        id: c.id,
        tempId: c.id,
        modelo: c.modelo || '',
        capacidad_gb: c.capacidad_gb,
        color: c.color || '',
        imei: c.imei || '',
        salud_bateria: c.salud_bateria != null ? String(c.salud_bateria) : '',
        detalles: c.detalles || '',
        monto: c.monto != null ? String(c.monto) : '',
        condicion: c.condicion || 'usado',
        ubicacion_fisica: c.ubicacion_fisica || '',
      }))
    );
    setCanjeModelo('');
    setCanjeCapacidad(null);
    setCanjeColor('');
    setCanjeImei('');
    setCanjeBateria('');
    setCanjeMonto('');
    setCanjeDetalles('');
    setAgregandoCanje(false);
    setAgregandoDispositivoEdit(false);
    setBuscarDispositivoEdit('');
    setModoDispositivoEdit('stock');
    setNuevoModeloDispEdit('');
    setNuevaCapacidadDispEdit(null);
    setNuevoColorDispEdit('');
    setNuevoEstadoDispEdit('usado');
    setNuevoImeiDispEdit('');
    setNuevoPrecioDispEdit('');
    setError(null);
    setEditando(true);
  };

  // Al llegar desde la boleta con "Editar boleta" (?editar=1), abre
  // directo el formulario de edición en vez de mostrar primero el
  // detalle de solo lectura.
  const abrioEdicionDesdeQuery = useRef(false);
  useEffect(() => {
    if (orden && canjesCargados && !abrioEdicionDesdeQuery.current && new URLSearchParams(window.location.search).get('editar') === '1') {
      abrioEdicionDesdeQuery.current = true;
      empezarEdicion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden, canjesCargados]);

  const actualizarItemEdit = (
    itemId: string,
    campo: 'descripcion' | 'cantidad' | 'precioUnitario' | 'bateria',
    valor: string
  ) => setItemsEdit((items) => items.map((i) => (i.id === itemId ? { ...i, [campo]: valor } : i)));

  const agregarItemEdit = () =>
    setItemsEdit((items) => [
      ...items,
      { id: idTemporal(), descripcion: '', cantidad: '1', precioUnitario: '', tipo: 'producto', bateria: '', esNuevo: true },
    ]);

  const quitarItemEdit = (itemId: string) => setItemsEdit((items) => items.filter((i) => i.id !== itemId));

  // Dispositivos ya agregados en esta misma edición (para no ofrecerlos de
  // nuevo en la lista "del stock").
  const idsDispositivoEnItemsEdit = new Set(itemsEdit.map((i) => i.dispositivoId).filter(Boolean));
  const dispositivosStockEditFiltrados = dispositivosStockEdit.filter((d) => {
    if (idsDispositivoEnItemsEdit.has(d.id)) return false;
    const q = buscarDispositivoEdit.trim().toLowerCase();
    if (!q) return true;
    return [d.modelo, d.imei].filter(Boolean).some((x) => x!.toLowerCase().includes(q));
  });

  const abrirDispositivoEdit = async () => {
    setAgregandoDispositivoEdit(true);
    setModoDispositivoEdit('stock');
    const { data, error: fetchError } = await supabase
      .from('dispositivos')
      .select('id, modelo, capacidad_gb, color, imei, precio, salud_bateria')
      .eq('en_stock', true);
    if (fetchError) {
      setError(t('No pudimos traer el stock:') + ' ' + fetchError.message);
      return;
    }
    setDispositivosStockEdit((data as DispositivoStockEdit[]) ?? []);
  };

  const agregarDispositivoDelStockEdit = (d: DispositivoStockEdit) => {
    setItemsEdit((items) => [
      ...items,
      {
        id: idTemporal(),
        descripcion: `${d.modelo || 'Dispositivo'}${d.capacidad_gb ? ` ${d.capacidad_gb}GB` : ''}${
          d.color ? ` ${d.color}` : ''
        }${d.imei ? ` · IMEI ${d.imei}` : ''}`,
        cantidad: '1',
        precioUnitario: d.precio != null ? String(d.precio) : '',
        tipo: 'dispositivo',
        bateria: d.salud_bateria != null ? String(d.salud_bateria) : '',
        esNuevo: true,
        dispositivoId: d.id,
      },
    ]);
    setAgregandoDispositivoEdit(false);
    setBuscarDispositivoEdit('');
  };

  const agregarDispositivoNuevoEdit = async () => {
    if (!nuevoModeloDispEdit.trim()) return;
    const imeiLimpio = limpiarImei(nuevoImeiDispEdit);
    if (imeiLimpio) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', imeiLimpio).maybeSingle();
      if (existente && !confirm(`${t('Ya hay un dispositivo en Stock con el IMEI')} ${imeiLimpio}. ${t('¿Agregarlo igual?')}`)) return;
    }
    setCargandoDispositivoEdit(true);
    setError(null);
    const modeloNormalizado = normalizarNombreModelo(nuevoModeloDispEdit.trim());
    const { data, error: dErr } = await supabase
      .from('dispositivos')
      .insert({
        modelo: modeloNormalizado,
        capacidad_gb: nuevaCapacidadDispEdit,
        color: nuevoColorDispEdit.trim() || null,
        imei: imeiLimpio,
        precio: nuevoPrecioDispEdit ? Number(nuevoPrecioDispEdit) : null,
        estado: nuevoEstadoDispEdit,
        en_stock: true,
        agregado_por_nombre: actor?.nombre ?? null,
        agregado_por_foto_url: actor?.fotoUrl ?? null,
        ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
      })
      .select()
      .single();
    setCargandoDispositivoEdit(false);
    if (dErr || !data) {
      setError(t('No pudimos cargar el dispositivo:') + ' ' + (dErr?.message || ''));
      return;
    }
    await asegurarModelo(supabase, modeloNormalizado);
    agregarDispositivoDelStockEdit(data as DispositivoStockEdit);
    setNuevoModeloDispEdit('');
    setNuevaCapacidadDispEdit(null);
    setNuevoColorDispEdit('');
    setNuevoEstadoDispEdit('usado');
    setNuevoImeiDispEdit('');
    setNuevoPrecioDispEdit('');
  };

  const agregarCanjeEdit = () => {
    if (!canjeModelo.trim()) return;
    setCanjesEdit((c) => [
      ...c,
      {
        id: null,
        tempId: idTemporal(),
        modelo: canjeModelo.trim(),
        capacidad_gb: canjeCapacidad,
        color: canjeColor.trim(),
        imei: canjeImei.trim(),
        salud_bateria: canjeBateria,
        monto: canjeMonto,
        detalles: canjeDetalles.trim(),
        condicion: canjeCondicion,
        ubicacion_fisica: canjeUbicacion.trim(),
      },
    ]);
    setCanjeModelo('');
    setCanjeCapacidad(null);
    setCanjeColor('');
    setCanjeImei('');
    setCanjeBateria('');
    setCanjeMonto('');
    setCanjeDetalles('');
    setCanjeCondicion('usado');
    setCanjeUbicacion('');
    setAgregandoCanje(false);
  };

  const quitarCanjeEdit = (tempId: string) => setCanjesEdit((c) => c.filter((x) => x.tempId !== tempId));

  const actualizarCanjeEdit = (tempId: string, monto: string) =>
    setCanjesEdit((c) => c.map((x) => (x.tempId === tempId ? { ...x, monto } : x)));

  // Un ítem nuevo sin descripción no se guarda, así que tampoco cuenta para el
  // total (si no, el total mostraría plata de una línea que después no existe).
  // La cantidad se acota a 1 igual que al guardar (Math.max(1, ...)): si no,
  // una cantidad "0" daría total 0 pero la línea se guardaría como 1 → desfase.
  const subtotalEdit = itemsEdit.reduce((acc, i) => {
    if (i.esNuevo && !i.descripcion.trim()) return acc;
    const cantidad = Math.max(1, Number(i.cantidad) || 1);
    return acc + cantidad * (Number(i.precioUnitario) || 0);
  }, 0);
  const montoCanjeEdit = canjesEdit.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
  // Sin Math.max(0, ...) a propósito: un anticipo mayor al precio puede dejar
  // el total en negativo (saldo a favor del cliente), y eso es válido.
  const totalEdit =
    subtotalEdit * (1 + (Number(impuestoEdit) || 0) / 100) - (Number(anticipoEdit) || 0) - montoCanjeEdit;

  const guardarEdicion = async () => {
    if (!orden) return;
    setGuardando(true);
    setError(null);

    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    if ((orden.forma_pago || '') !== formaPagoEdit) cambios.forma_pago = { antes: orden.forma_pago, despues: formaPagoEdit };
    if ((orden.nota || '') !== notaEdit.trim()) cambios.nota = { antes: orden.nota, despues: notaEdit.trim() || null };
    if (orden.incluir_garantia !== incluirGarantiaEdit) cambios.incluir_garantia = { antes: orden.incluir_garantia, despues: incluirGarantiaEdit };
    if ((orden.aclaraciones_tecnico || '') !== aclaracionesEdit.trim())
      cambios.aclaraciones_tecnico = { antes: orden.aclaraciones_tecnico, despues: aclaracionesEdit.trim() || null };
    if (orden.incluir_aclaraciones_tecnico !== incluirAclaracionesEdit)
      cambios.incluir_aclaraciones_tecnico = { antes: orden.incluir_aclaraciones_tecnico, despues: incluirAclaracionesEdit };
    const anticipoNuevo = Number(anticipoEdit) || 0;
    if ((orden.anticipo || 0) !== anticipoNuevo) cambios.anticipo = { antes: orden.anticipo, despues: anticipoNuevo };
    const impuestoNuevo = Number(impuestoEdit) || 0;
    if ((orden.impuesto_porcentaje || 0) !== impuestoNuevo) cambios.impuesto_porcentaje = { antes: orden.impuesto_porcentaje, despues: impuestoNuevo };
    if ((orden.total || 0) !== totalEdit) cambios.total = { antes: orden.total, despues: totalEdit };
    const vendedorNuevo = vendedorEdit || null;
    if ((orden.vendedor_id || null) !== vendedorNuevo) {
      const nombreAntes = orden.vendedores?.nombre || 'Sin asignar';
      const nombreDespues = vendedores.find((v) => v.id === vendedorNuevo)?.nombre || 'Sin asignar';
      cambios.vendedor_id = { antes: nombreAntes, despues: nombreDespues };
    }
    const montoSecundarioNuevo = muestraSecundariaEdit && montoSecundarioEdit ? Number(montoSecundarioEdit) : null;
    const monedaSecundariaNueva = muestraSecundariaEdit ? monedasDisponibles[1] || orden.moneda_secundaria || null : null;
    if ((orden.monto_secundario ?? null) !== montoSecundarioNuevo) {
      cambios.monto_secundario = { antes: orden.monto_secundario, despues: montoSecundarioNuevo };
    }
    if ((orden.boleta_moneda || 'principal') !== boletaMonedaEdit) {
      cambios.boleta_moneda = { antes: orden.boleta_moneda, despues: boletaMonedaEdit };
    }
    if ((orden.monto_canje || 0) !== montoCanjeEdit) {
      cambios.monto_canje = { antes: orden.monto_canje, despues: montoCanjeEdit };
    }

    // Para un canje ya existente, el formulario solo deja editar el monto
    // (el resto de los datos del equipo se cargan una sola vez al recibirlo)
    // — por eso el diff de "modificados" compara únicamente eso.
    const canjesNuevos = canjesEdit.filter((c) => c.id === null);
    const canjesEliminados = canjes.filter((original) => !canjesEdit.some((c) => c.id === original.id));
    const canjesModificados = canjesEdit.filter((c) => {
      if (c.id === null) return false;
      const original = canjes.find((o) => o.id === c.id);
      if (!original) return false;
      const montoNuevo = c.monto ? Number(c.monto) : null;
      return (original.monto ?? null) !== montoNuevo;
    });

    const itemsCambiados = itemsEdit
      .map((edit) => {
        if (edit.esNuevo) return null;
        const original = orden.orden_items.find((i) => i.id === edit.id);
        if (!original) return null;
        const cantidad = Math.max(1, Number(edit.cantidad) || 1);
        const precio = Number(edit.precioUnitario) || 0;
        // Si borran el texto pero el ítem tenía descripción, no la pisamos con
        // vacío: conservamos la original (sin su sufijo de batería) como base.
        const base = edit.descripcion.trim() || separarBateria(original.descripcion).texto;
        const descripcion = componerDescripcion(base, edit.bateria);
        if (original.cantidad === cantidad && original.precio_unitario === precio && original.descripcion === descripcion) {
          return null;
        }
        return {
          id: edit.id,
          antes: { descripcion: original.descripcion, cantidad: original.cantidad, precio_unitario: original.precio_unitario },
          despues: { descripcion, cantidad, precio_unitario: precio },
        };
      })
      .filter(Boolean) as { id: string; antes: unknown; despues: unknown }[];

    // Ítems nuevos agregados a una boleta ya hecha: accesorios sueltos (no
    // tocan el stock) o un dispositivo real (con dispositivoId, del stock o
    // recién cargado) — a esos sí hay que reservarlos antes de insertar.
    const itemsNuevos = itemsEdit
      .filter((edit) => edit.esNuevo && edit.descripcion.trim())
      .map((edit) => ({
        orden_id: id,
        descripcion: componerDescripcion(edit.descripcion, edit.bateria),
        cantidad: Math.max(1, Number(edit.cantidad) || 1),
        precio_unitario: Number(edit.precioUnitario) || 0,
        tipo: edit.tipo || 'producto',
        dispositivo_id: edit.dispositivoId || null,
      }));

    if (
      Object.keys(cambios).length === 0 &&
      itemsCambiados.length === 0 &&
      itemsNuevos.length === 0 &&
      canjesNuevos.length === 0 &&
      canjesEliminados.length === 0 &&
      canjesModificados.length === 0
    ) {
      setEditando(false);
      setGuardando(false);
      return;
    }

    // Importante: primero se sincronizan los ítems y los canjes (los datos
    // que justifican el total), y recién al final se actualiza la orden
    // con el total ya calculado. Si se hiciera al revés y algún paso de
    // en medio fallara, la orden quedaría con un total que descuenta un
    // canje que en realidad nunca se llegó a crear/borrar/editar en la
    // base — un descuento fantasma sin canje real detrás.
    // En paralelo (Promise.all), no uno por uno en fila: una boleta con
    // muchas líneas editadas (ej. una venta mayorista) tardaba tantos
    // viajes de ida y vuelta a la base como ítems cambiados hubiera.
    if (itemsCambiados.length > 0) {
      const resultadosItems = await Promise.all(
        itemsCambiados.map((cambio) => {
          const despues = cambio.despues as { descripcion: string; cantidad: number; precio_unitario: number };
          return supabase
            .from('orden_items')
            .update({ descripcion: despues.descripcion, cantidad: despues.cantidad, precio_unitario: despues.precio_unitario })
            .eq('id', cambio.id);
        })
      );
      const itemUpdError = resultadosItems.find((r) => r.error)?.error;
      if (itemUpdError) {
        setError(t('No pudimos actualizar un ítem:') + ' ' + itemUpdError.message);
        setGuardando(false);
        return;
      }
    }

    // Los dispositivos agregados durante la edición se reservan ANTES de
    // insertar los ítems, y solo si seguían en_stock:true en ese momento
    // (mismo criterio atómico que usa Nueva Orden) — evita vender el mismo
    // equipo dos veces si otra persona lo vendió mientras se editaba esta boleta.
    const dispositivoIdsNuevos = itemsNuevos.map((i) => i.dispositivo_id).filter(Boolean) as string[];
    if (dispositivoIdsNuevos.length > 0) {
      const { data: reservados, error: reservaError } = await supabase
        .from('dispositivos')
        .update({ en_stock: false })
        .in('id', dispositivoIdsNuevos)
        .eq('en_stock', true)
        .select('id');
      if (reservaError || !reservados || reservados.length !== dispositivoIdsNuevos.length) {
        if (reservados && reservados.length > 0) {
          await supabase
            .from('dispositivos')
            .update({ en_stock: true })
            .in('id', reservados.map((r) => r.id));
        }
        setError(
          reservaError
            ? t('No pudimos reservar los dispositivos agregados:') + ' ' + reservaError.message
            : t('Alguno de los dispositivos que agregaste ya se vendió (quizás desde otra pestaña). Sacalo de la lista y probá de nuevo.')
        );
        setGuardando(false);
        return;
      }
    }

    if (itemsNuevos.length > 0) {
      const { error: itemsInsError } = await supabase.from('orden_items').insert(itemsNuevos);
      if (itemsInsError) {
        // Si ya se habían reservado dispositivos arriba, hay que devolverlos
        // al stock — si no, quedarían reservados sin ninguna boleta real detrás.
        if (dispositivoIdsNuevos.length > 0) {
          await supabase.from('dispositivos').update({ en_stock: true }).in('id', dispositivoIdsNuevos);
        }
        setError(t('No pudimos agregar un ítem nuevo:') + ' ' + itemsInsError.message);
        setGuardando(false);
        return;
      }
      // Ya quedaron guardados en la base. Los marcamos como no-nuevos para que,
      // si un paso posterior falla y el usuario vuelve a tocar "Guardar", NO se
      // inserten de nuevo (evita el accesorio duplicado y el total desfasado).
      // El insert de Postgres es atómico (van todos o ninguno), así que si no
      // hubo error están todos guardados.
      setItemsEdit((items) => items.map((i) => (i.esNuevo ? { ...i, esNuevo: false } : i)));
    }

    if (canjesEliminados.length > 0) {
      const { error: canjesDelError } = await supabase
        .from('canjes')
        .delete()
        .in('id', canjesEliminados.map((c) => c.id));
      if (canjesDelError) {
        setError(t('No pudimos quitar algún canje:') + ' ' + canjesDelError.message);
        setGuardando(false);
        return;
      }
    }

    if (canjesModificados.length > 0) {
      const resultadosCanjes = await Promise.all(
        canjesModificados.map((c) =>
          supabase
            .from('canjes')
            .update({ monto: c.monto ? Number(c.monto) : null })
            .eq('id', c.id)
        )
      );
      const canjeUpdError = resultadosCanjes.find((r) => r.error)?.error;
      if (canjeUpdError) {
        setError(t('No pudimos actualizar un canje:') + ' ' + canjeUpdError.message);
        setGuardando(false);
        return;
      }
    }

    if (canjesNuevos.length > 0) {
      const { error: canjesInsError } = await supabase.from('canjes').insert(
        canjesNuevos.map((c) => ({
          orden_id: id,
          modelo: c.modelo.trim() ? normalizarNombreModelo(c.modelo.trim()) : null,
          capacidad_gb: c.capacidad_gb,
          color: c.color.trim() || null,
          imei: limpiarImei(c.imei),
          salud_bateria: c.salud_bateria ? Number(c.salud_bateria) : null,
          detalles: c.detalles.trim() || null,
          monto: c.monto ? Number(c.monto) : null,
          vendedor_id: vendedorNuevo,
          condicion: c.condicion,
          ubicacion_fisica: c.ubicacion_fisica.trim() || null,
        }))
      );
      if (canjesInsError) {
        setError(t('No pudimos agregar algún canje nuevo:') + ' ' + canjesInsError.message);
        setGuardando(false);
        return;
      }
      // Ya insertados: les damos un id no-nulo (deja de contar como "nuevo") para
      // que un reintento tras un error posterior no los duplique. Con id no-nulo
      // tampoco entran a canjesModificados (no existen en `canjes` original).
      const tempIdsInsertados = new Set(canjesNuevos.map((c) => c.tempId));
      setCanjesEdit((cs) =>
        cs.map((c) => (c.id === null && tempIdsInsertados.has(c.tempId) ? { ...c, id: `guardado-${c.tempId}` } : c))
      );
    }

    const { error: updateError } = await supabase
      .from('ordenes')
      .update({
        forma_pago: formaPagoEdit,
        nota: notaEdit.trim() || null,
        incluir_garantia: incluirGarantiaEdit,
        aclaraciones_tecnico: aclaracionesEdit.trim() || null,
        incluir_aclaraciones_tecnico: incluirAclaracionesEdit,
        anticipo: anticipoNuevo,
        impuesto_porcentaje: impuestoNuevo,
        total: totalEdit,
        monto_canje: montoCanjeEdit,
        vendedor_id: vendedorNuevo,
        monto_secundario: montoSecundarioNuevo,
        moneda_secundaria: monedaSecundariaNueva,
        boleta_moneda: boletaMonedaEdit,
      })
      .eq('id', id);
    if (updateError) {
      setError(t('No pudimos guardar los cambios:') + ' ' + updateError.message);
      setGuardando(false);
      return;
    }

    const nombreCliente = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : 'sin cliente';
    const huboCambiosCanje = canjesNuevos.length > 0 || canjesEliminados.length > 0 || canjesModificados.length > 0;
    await registrarAuditoria(supabase, {
      accion: `editó una orden (${nombreCliente})`,
      entidad: 'orden',
      entidadId: orden.id,
      valorAnterior: {
        ...Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.antes])),
        ...(itemsCambiados.length > 0 ? { items: itemsCambiados.map((c) => ({ id: c.id, ...(c.antes as object) })) } : {}),
        ...(huboCambiosCanje ? { canjes: canjes.map((c) => ({ id: c.id, modelo: c.modelo, monto: c.monto })) } : {}),
      },
      valorNuevo: {
        ...Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.despues])),
        ...(itemsCambiados.length > 0 ? { items: itemsCambiados.map((c) => ({ id: c.id, ...(c.despues as object) })) } : {}),
        ...(itemsNuevos.length > 0
          ? { items_agregados: itemsNuevos.map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_unitario })) }
          : {}),
        ...(huboCambiosCanje ? { canjes: canjesEdit.map((c) => ({ id: c.id, modelo: c.modelo, monto: c.monto })) } : {}),
      },
    });

    setEditando(false);
    setGuardando(false);
    cargar();
  };

  const cambiarEstado = async (nuevoEstado: string) => {
    if (!orden) return;
    setGuardando(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('ordenes')
      .update({ estado: nuevoEstado, fecha_entrega: nuevoEstado === 'entregado' ? new Date().toISOString() : null })
      .eq('id', id);
    if (updateError) {
      setError(t('No pudimos actualizar el estado:') + ' ' + updateError.message);
      setGuardando(false);
      return;
    }
    setOrden({ ...orden, estado: nuevoEstado });
    setGuardando(false);
  };

  // Cobrar de verdad (registrar en `pagos`) antes de marcar la orden como
  // pagada — hoy es el único punto de la app donde una orden que nació
  // "pendiente" (sobre todo las de Servicio Técnico, vía generarOrdenDeReparacion)
  // termina de cobrarse. Caja Venta diaria: es una venta/reparación que se
  // cobra íntegra en el momento, no un anticipo ni una cobranza de cta cte.
  const confirmarCobro = async () => {
    if (!orden) return;
    setCobrando(true);
    setError(null);
    const a = getActor();
    const { error: pagoErr } = await supabase.from('pagos').insert({
      cliente_id: orden.cliente_id,
      orden_id: orden.id,
      medio: medioCobro,
      monto: orden.total || 0,
      moneda: orden.moneda || 'ARS',
      caja_tipo: 'venta_diaria',
      registrado_por_nombre: a?.nombre ?? null,
      registrado_por_foto_url: a?.fotoUrl ?? null,
      ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
    });
    if (pagoErr) {
      setError(t('No pudimos registrar el cobro:') + ' ' + pagoErr.message);
      setCobrando(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `cobró la orden ${orden.numero_orden || orden.id.slice(0, 8)} (${medioLabel(medioCobro, t)}, ${formatearMonto(orden.total || 0)})`,
      entidad: 'orden',
      entidadId: orden.id,
    });
    await cambiarEstado('pagado');
    setCobrando(false);
    setModalCobro(false);
  };

  const handleCancelar = async () => {
    if (!orden || !puedeEliminar) return;
    const mensaje = yaDerivado
      ? t('¿Eliminar esta orden? También se va a borrar la reparación derivada en Servicio Técnico. Los dispositivos vendidos vuelven al stock. No se puede deshacer.')
      : t('¿Eliminar esta orden? Los dispositivos vendidos vuelven al stock. No se puede deshacer.');
    if (!confirm(mensaje)) return;
    setGuardando(true);
    setError(null);

    const dispositivoIds = orden.orden_items.map((i) => i.dispositivo_id).filter(Boolean) as string[];
    if (dispositivoIds.length > 0) {
      await supabase
        .from('dispositivos')
        .update({ en_stock: true, en_stock_desde: new Date().toISOString(), alerta_stock_enviada: false })
        .in('id', dispositivoIds);
    }
    // Devuelve al stock los accesorios (tipo 'producto') vendidos en esta
    // orden — simétrico al descuento que se hace al crearla en Nueva Orden.
    // Best-effort: si falla, no bloquea la cancelación (mismo criterio que
    // el resto de esta función).
    await Promise.all(
      orden.orden_items
        .filter((i) => i.producto_id)
        .map((i) =>
          Promise.resolve(
            supabase.rpc('producto_mover_stock', {
              p_producto_id: i.producto_id,
              p_tipo: 'devolucion',
              p_cantidad: i.cantidad,
              p_motivo: 'Venta cancelada',
              p_usuario: actor?.nombre ?? null,
            })
          ).catch(() => {})
        )
    );
    // Se borran antes de eliminar la orden: canjes.orden_id queda en null
    // automáticamente al borrar la orden (on delete set null), así que
    // después ya no se los podría encontrar por ese filtro.
    // agregado_a_stock (no estado) es lo que de verdad indica si este canje
    // ya se convirtió en un dispositivo de Stock — estado solo distingue
    // "en_canje" de "derivado a servicio técnico", nunca pasa a otro valor
    // al agregarlo a Stock. Filtrar por estado acá borraba también canjes
    // que ya eran inventario vendible, perdiendo su trazabilidad (de dónde
    // salió, a quién se le recibió, en qué monto) sin necesidad.
    await supabase.from('canjes').delete().eq('orden_id', id).eq('agregado_a_stock', false);
    // Lo mismo con la cuenta corriente: si esta venta había generado deuda
    // (cargo) o registrado pagos, hay que anularlos ANTES de borrar la orden
    // (después orden_id queda en null y no se los encuentra). Se anulan (no
    // se borran) para no perder el historial; al estar anulados dejan de
    // contar en el saldo del cliente y en la caja.
    await supabase.from('cta_cte_movimientos').update({ anulado: true }).eq('orden_id', id).eq('anulado', false);
    await supabase.from('pagos').update({ anulado: true }).eq('orden_id', id).eq('anulado', false);
    // Comisiones: revertir las de esta venta ANTES de borrar la orden (después
    // orden_id queda en null). Si el módulo no está activo o no había
    // comisiones, la función no hace nada. No rompe la cancelación si falla,
    // pero el error queda en la auditoría en vez de perderse: antes este catch
    // solo atrapaba una excepción de red — revertirComisionesOrden nunca tira,
    // devuelve { error } en un objeto, así que un fallo real de la RPC pasaba
    // completamente desapercibido y el vendedor podía seguir cobrando comisión
    // por una venta ya cancelada.
    let comisionError: string | null = null;
    try {
      const revertido = await revertirComisionesOrden(supabase, id, 'Venta cancelada', null);
      if (revertido.error) comisionError = revertido.error;
    } catch (e) {
      comisionError = e instanceof Error ? e.message : String(e);
    }
    // Si esta orden derivó un equipo a Servicio Técnico, se borra también la
    // reparación para que desaparezca de ahí (pedido del usuario). Antes de
    // borrarla hay que devolver al stock lo que tuviera consumido/reservado
    // (repuestos_reservas y reparaciones_repuestos se van en cascada, pero
    // eso no le devuelve nada al repuesto) — igual que en eliminarDefinitivo
    // de Servicio Técnico. Es best-effort: si falla, no bloquea la
    // cancelación de la orden (pedido del usuario), pero se dice en la
    // auditoría en vez de quedar en silencio.
    let liberacionError: string | null = null;
    if (reparacionesDerivadasIds.length > 0) {
      const liberacion = await liberarRepuestosDeReparaciones(supabase, reparacionesDerivadasIds, actor?.nombre ?? null);
      if (!liberacion.ok) liberacionError = liberacion.error;
    }
    // Se hace ANTES de borrar la orden: si el FK fuera "set null", después no
    // se la podría encontrar por orden_origen_id. reparaciones_eventos se va
    // en cascada. No rompe la eliminación de la orden si esto falla.
    await supabase.from('reparaciones').delete().eq('orden_origen_id', id);
    if (yaDerivado) {
      const clienteRep = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : 'sin cliente';
      const cuenta = reparacionesDerivadasIds.length;
      const avisoLiberacion = liberacionError ? ` (no se pudieron liberar los repuestos: ${liberacionError})` : '';
      await registrarAuditoria(supabase, {
        accion: `eliminó ${cuenta === 1 ? 'la reparación derivada' : `${cuenta} reparaciones derivadas`} de una orden (${clienteRep})${avisoLiberacion}`,
        entidad: 'reparacion',
        entidadId: reparacionesDerivadasIds[0] ?? undefined,
        valorAnterior: { orden_origen_id: id, reparaciones: reparacionesDerivadasIds },
      });
    }
    const { error: deleteError } = await supabase.from('ordenes').delete().eq('id', id);
    if (deleteError) {
      setError(t('No pudimos cancelar la orden:') + ' ' + deleteError.message);
      setGuardando(false);
      return;
    }
    const nombreCliente = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : 'sin cliente';
    const avisoComision = comisionError ? ` (no se pudo revertir la comisión: ${comisionError})` : '';
    await registrarAuditoria(supabase, {
      accion: `eliminó/canceló una orden (${nombreCliente}, total $${orden.total?.toLocaleString('es-AR') ?? 0})${avisoComision}`,
      entidad: 'orden',
      entidadId: orden.id,
      valorAnterior: { estado: orden.estado, total: orden.total },
    });
    router.push('/ordenes');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  if (canjesError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-bad">{t('No pudimos cargar el plan canje de esta orden.')}</p>
        <button
          onClick={() => {
            setCanjesError(false);
            setLoading(true);
            cargar();
          }}
          className="text-sm text-accent dark:text-dark-accent underline"
        >
          {t('Reintentar')}
        </button>
      </main>
    );
  }

  if (!orden) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No encontramos esa orden.')}</p>
        <Link href="/ordenes" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver a órdenes')}
        </Link>
      </main>
    );
  }

  if (editando) {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <button onClick={() => setEditando(false)} className="text-2xl leading-none">
            &larr;
          </button>
          <span className="text-lg font-medium">{t('Editar orden')}</span>
        </header>

        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Forma de pago')}</label>
          <div className="flex gap-2">
            {FORMAS_PAGO.map((f) => (
              <button
                key={f}
                onClick={() => setFormaPagoEdit(f)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  formaPagoEdit === f ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {t(f)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Vendedor')}</label>
          <select
            value={vendedorEdit}
            onChange={(e) => setVendedorEdit(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          >
            <option value="">{t('Sin asignar')}</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        </div>

        {monedasDisponibles.length > 1 && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
            <span className="text-sm font-medium">{t('¿En qué moneda mostrar el monto en la boleta?')}</span>
            <div className="flex gap-2">
              {([
                { v: 'principal', label: `${t('Solo')} ${simboloMoneda(monedasDisponibles[0])}` },
                { v: 'ambas', label: t('Ambas') },
              ] as const).map((op) => (
                <button
                  key={op.v}
                  type="button"
                  onClick={() => {
                    setBoletaMonedaEdit(op.v);
                    if (op.v !== 'principal' && !montoSecundarioEdit && tipoCambio) {
                      setMontoSecundarioEdit((Math.round(totalEdit * tipoCambio * 100) / 100).toString());
                    }
                  }}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                    boletaMonedaEdit === op.v
                      ? 'bg-accent dark:bg-dark-accent text-white'
                      : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
            {muestraSecundariaEdit && (
              <>
                <label className="text-xs text-muted dark:text-dark-text-secondary mt-1">
                  {t('Monto en')} {monedasDisponibles[1]} {t('(con tu tipo de cambio, lo podés corregir)')}
                </label>
                <input
                  value={montoSecundarioEdit}
                  onChange={(e) => setMontoSecundarioEdit(sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  placeholder={`${t('Monto en')} ${monedasDisponibles[1]}`}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                />
                <p className="text-xs text-muted dark:text-dark-text-secondary">
                  {t('Las Estadísticas siempre se calculan en')} {monedasDisponibles[0]}. {t('Esto solo cambia cómo se ve la boleta.')}
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {itemsEdit.map((i) => (
            <div key={i.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  value={i.descripcion}
                  onChange={(e) => actualizarItemEdit(i.id, 'descripcion', e.target.value)}
                  placeholder={i.esNuevo ? t('Accesorio o ítem (ej. Funda, Vidrio templado)') : undefined}
                  className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                {i.esNuevo && (
                  <button onClick={() => quitarItemEdit(i.id)} className="text-xs text-bad underline shrink-0">
                    {t('Quitar')}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <input
                  value={i.cantidad}
                  onChange={(e) => actualizarItemEdit(i.id, 'cantidad', e.target.value)}
                  disabled={i.tipo === 'dispositivo'}
                  title={i.tipo === 'dispositivo' ? t('Un dispositivo del stock siempre se vende de a uno') : undefined}
                  inputMode="numeric"
                  className="w-16 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-2 py-1 text-center disabled:opacity-50"
                />
                <span>×</span>
                <span>$</span>
                <input
                  value={i.precioUnitario}
                  onChange={(e) => actualizarItemEdit(i.id, 'precioUnitario', sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-2 py-1"
                />
              </div>
              {i.tipo === 'dispositivo' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted dark:text-dark-text-secondary">{t('Batería del equipo')}</span>
                  <input
                    value={i.bateria}
                    onChange={(e) => actualizarItemEdit(i.id, 'bateria', e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                    inputMode="numeric"
                    placeholder={t('ej. 89')}
                    className="w-20 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-2 py-1 text-center"
                  />
                  <span className="text-muted dark:text-dark-text-secondary">%</span>
                  <span className="text-[10px] text-muted dark:text-dark-text-secondary">{t('(aparece en la boleta)')}</span>
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button
              onClick={agregarItemEdit}
              className="self-start text-xs text-accent dark:text-dark-accent underline"
            >
              + {t('Agregar ítem / accesorio')}
            </button>
            <button
              onClick={() => (agregandoDispositivoEdit ? setAgregandoDispositivoEdit(false) : abrirDispositivoEdit())}
              className="self-start text-xs text-accent dark:text-dark-accent underline"
            >
              {agregandoDispositivoEdit ? t('Cancelar') : `+ ${t('Agregar dispositivo')}`}
            </button>
          </div>

          {agregandoDispositivoEdit && (
            <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setModoDispositivoEdit('stock')}
                  className={`flex-1 rounded-lg py-2 font-medium ${
                    modoDispositivoEdit === 'stock' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                  }`}
                >
                  {t('Del stock')}
                </button>
                <button
                  onClick={() => setModoDispositivoEdit('nuevo')}
                  className={`flex-1 rounded-lg py-2 font-medium ${
                    modoDispositivoEdit === 'nuevo' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                  }`}
                >
                  {t('Cargar nuevo')}
                </button>
              </div>

              {modoDispositivoEdit === 'stock' ? (
                <>
                  <input
                    value={buscarDispositivoEdit}
                    onChange={(e) => setBuscarDispositivoEdit(e.target.value)}
                    placeholder={t('Buscar por modelo o IMEI...')}
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {dispositivosStockEditFiltrados.length === 0 && (
                      <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">{t('No hay dispositivos disponibles.')}</p>
                    )}
                    {dispositivosStockEditFiltrados.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => agregarDispositivoDelStockEdit(d)}
                        className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 flex items-center justify-between text-left text-sm gap-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">
                            {d.modelo} {d.capacidad_gb ? `· ${d.capacidad_gb}GB` : ''} {d.color ? `· ${d.color}` : ''}
                          </span>
                          {d.imei && (
                            <span className="block text-xs font-bold font-mono text-ink dark:text-dark-text truncate">{d.imei}</span>
                          )}
                        </span>
                        {d.precio != null && (
                          <span className="font-medium shrink-0">
                            {simboloMoneda(orden?.moneda)}
                            {d.precio.toLocaleString('es-AR')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    value={nuevoModeloDispEdit}
                    onChange={(e) => setNuevoModeloDispEdit(e.target.value)}
                    placeholder={t('Modelo (ej. iPhone 13)')}
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    {STORAGE_OPTIONS.map((gb) => (
                      <button
                        key={gb}
                        onClick={() => setNuevaCapacidadDispEdit(gb)}
                        className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                          nuevaCapacidadDispEdit === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                        }`}
                      >
                        {gb}GB
                      </button>
                    ))}
                  </div>
                  <SelectorColorAuto label={t('Color')} modelo={nuevoModeloDispEdit} value={nuevoColorDispEdit} onChange={setNuevoColorDispEdit} />
                  <SelectorEstadoDispositivo value={nuevoEstadoDispEdit} onChange={setNuevoEstadoDispEdit} />
                  <input
                    value={nuevoImeiDispEdit}
                    onChange={(e) => setNuevoImeiDispEdit(e.target.value)}
                    placeholder={t('IMEI')}
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                  />
                  <input
                    value={nuevoPrecioDispEdit}
                    onChange={(e) => setNuevoPrecioDispEdit(sanitizarDecimal(e.target.value))}
                    placeholder={t('Precio')}
                    inputMode="decimal"
                    className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    disabled={!nuevoModeloDispEdit.trim() || cargandoDispositivoEdit}
                    onClick={agregarDispositivoNuevoEdit}
                    className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {cargandoDispositivoEdit ? t('Agregando...') : t('Agregar al carrito')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">{t('Plan canje')}</p>

          {canjesEdit.length > 0 && (
            <div className="flex flex-col gap-2">
              {canjesEdit.map((c, idx) => (
                <div key={c.tempId} className="rounded-lg bg-canvas dark:bg-dark-bg p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {canjesEdit.length > 1 ? `${idx + 1}. ` : ''}
                      {c.modelo || t('Sin modelo')}
                      {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                      {c.color ? ` · ${c.color}` : ''}
                      {c.condicion === 'sellado' && (
                        <span className="text-[10px] font-bold text-black bg-gradient-to-b from-amber-300 to-amber-500 border border-black/40 rounded-full px-2 py-0.5 shrink-0">
                          ✦ {t('SELLADO')}
                        </span>
                      )}
                    </p>
                    {c.imei && <p className="text-xs text-muted dark:text-dark-text-secondary">{t('IMEI:')} {c.imei}</p>}
                    {c.ubicacion_fisica && <p className="text-xs text-muted dark:text-dark-text-secondary">📍 {c.ubicacion_fisica}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs">$</span>
                    <input
                      value={c.monto}
                      onChange={(e) => actualizarCanjeEdit(c.tempId, sanitizarDecimal(e.target.value))}
                      inputMode="decimal"
                      className="w-20 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-2 py-1 text-sm"
                    />
                    <button onClick={() => quitarCanjeEdit(c.tempId)} className="text-xs text-bad underline">
                      {t('Quitar')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {agregandoCanje ? (
            <div className="flex flex-col gap-2 pt-1 border-t border-border dark:border-dark-border">
              <input
                value={canjeModelo}
                onChange={(e) => setCanjeModelo(e.target.value)}
                placeholder={t('Modelo (ej. iPhone 11)')}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <SelectorEstadoDispositivo value={canjeCondicion} onChange={setCanjeCondicion} label={t('Estado')} />
              <div className="flex gap-2">
                {STORAGE_OPTIONS.map((gb) => (
                  <button
                    key={gb}
                    onClick={() => setCanjeCapacidad(gb)}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      canjeCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                    }`}
                  >
                    {gb}GB
                  </button>
                ))}
              </div>
              <SelectorColorAuto modelo={canjeModelo} value={canjeColor} onChange={setCanjeColor} />
              <div className="flex gap-2">
                <input
                  value={canjeImei}
                  onChange={(e) => setCanjeImei(e.target.value)}
                  placeholder={t('IMEI')}
                  className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <input
                  value={canjeBateria}
                  onChange={(e) => setCanjeBateria(e.target.value)}
                  placeholder={t('Batería %')}
                  inputMode="numeric"
                  className="w-24 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <input
                value={canjeUbicacion}
                onChange={(e) => setCanjeUbicacion(e.target.value)}
                placeholder={t('Ubicación física (ej. Estante A-3, Tribuna)')}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <input
                value={canjeMonto}
                onChange={(e) => setCanjeMonto(sanitizarDecimal(e.target.value))}
                placeholder={t('Monto que se le reconoce')}
                inputMode="decimal"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={canjeDetalles}
                onChange={(e) => setCanjeDetalles(e.target.value)}
                placeholder={t('Detalles (opcional)')}
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setAgregandoCanje(false)}
                  className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
                >
                  {t('Cancelar')}
                </button>
                <button
                  disabled={!canjeModelo.trim()}
                  onClick={agregarCanjeEdit}
                  className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {t('Agregar')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAgregandoCanje(true)}
              className="self-start text-xs text-accent dark:text-dark-accent underline"
            >
              + {t('Agregar equipo de canje')}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Anticipo')}</label>
            <input
              value={anticipoEdit}
              onChange={(e) => setAnticipoEdit(sanitizarDecimal(e.target.value))}
              inputMode="decimal"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Impuesto %')}</label>
            <input
              value={impuestoEdit}
              onChange={(e) => setImpuestoEdit(sanitizarDecimal(e.target.value))}
              inputMode="decimal"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Nota para la boleta')}</label>
          <textarea
            value={notaEdit}
            onChange={(e) => setNotaEdit(e.target.value)}
            rows={2}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <label className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={incluirGarantiaEdit}
            onChange={(e) => setIncluirGarantiaEdit(e.target.checked)}
            className="h-5 w-5 accent-ink"
          />
          <span className="text-sm font-medium">{t('Incluir el texto de garantía en la boleta')}</span>
        </label>

        {(tieneTrabajo || orden.aclaraciones_tecnico) && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
            <label className="text-xs font-medium text-muted dark:text-dark-text-secondary">{t('Aclaraciones del técnico (salen en la boleta)')}</label>
            <textarea
              value={aclaracionesEdit}
              onChange={(e) => setAclaracionesEdit(e.target.value)}
              rows={2}
              placeholder={t('Lo que el técnico aclara para el cliente (diagnóstico, qué se hizo, pruebas…)')}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={incluirAclaracionesEdit}
                onChange={(e) => setIncluirAclaracionesEdit(e.target.checked)}
                className="h-4 w-4 accent-ink"
              />
              {t('Incluir estas aclaraciones en la boleta')}
            </label>
          </div>
        )}

        <div className="flex items-center justify-between text-lg font-medium border-t border-border dark:border-dark-border pt-3">
          <span>{t('Total')}</span>
          <span>${totalEdit.toLocaleString('es-AR')}</span>
        </div>

        <button
          disabled={guardando}
          onClick={guardarEdicion}
          className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {guardando ? t('Guardando...') : t('Guardar cambios')}
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/ordenes" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">
          {t('Orden')}
          {orden?.numero_orden && <span className="text-muted dark:text-dark-text-secondary text-sm font-normal"> {orden.numero_orden}</span>}
        </span>
        <button onClick={empezarEdicion} className="text-xs text-accent dark:text-dark-accent underline">
          {t('Editar')}
        </button>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted dark:text-dark-text-secondary">{t('Cliente:')}</span>{' '}
          {orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}` : t('Sin cliente')}
        </p>
        {orden.clientes?.telefono && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">{t('Teléfono:')}</span> {orden.clientes.telefono}
          </p>
        )}
        {orden.vendedores?.nombre && (
          <p className="flex items-center gap-1.5">
            <span className="text-muted dark:text-dark-text-secondary">{t('Vendedor:')}</span>
            <Avatar src={orden.vendedores.foto_url} nombre={orden.vendedores.nombre} size={34} /> {orden.vendedores.nombre}
          </p>
        )}
        <p>
          <span className="text-muted dark:text-dark-text-secondary">{t('Forma de pago:')}</span> {orden.forma_pago && t(orden.forma_pago)}
        </p>
        {orden.total != null && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">{t('Total:')}</span> ${orden.total.toLocaleString('es-AR')}
          </p>
        )}
        {orden.nota && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">{t('Nota:')}</span> {orden.nota}
          </p>
        )}
      </div>

      {orden.aclaraciones_tecnico && (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Aclaraciones del técnico')}</p>
          <p className="text-sm whitespace-pre-wrap">{orden.aclaraciones_tecnico}</p>
          <label className="flex items-center gap-2 cursor-pointer text-sm border-t border-border dark:border-dark-border pt-2">
            <input
              type="checkbox"
              checked={orden.incluir_aclaraciones_tecnico}
              onChange={async (e) => {
                const val = e.target.checked;
                setOrden((o) => (o ? { ...o, incluir_aclaraciones_tecnico: val } : o));
                await supabase.from('ordenes').update({ incluir_aclaraciones_tecnico: val }).eq('id', orden.id);
              }}
              className="h-4 w-4 accent-ink"
            />
            {t('Incluir estas aclaraciones en la boleta')}
          </label>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {orden.orden_items.map((i, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between text-sm"
          >
            <span>
              {i.descripcion} × {i.cantidad}
            </span>
            <span className="font-medium">${(i.cantidad * i.precio_unitario).toLocaleString('es-AR')}</span>
          </div>
        ))}
      </div>

      {canjes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">{t('Plan canje')}</p>
          {canjes.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-1 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 flex-wrap">
                  {c.modelo || t('Sin modelo')}
                  {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                  {c.color ? ` · ${c.color}` : ''}
                  {c.imei ? ` · IMEI ${c.imei}` : ''}
                  {c.condicion === 'sellado' && (
                    <span className="text-[10px] font-bold text-black bg-gradient-to-b from-amber-300 to-amber-500 border border-black/40 rounded-full px-2 py-0.5">
                      ✦ {t('SELLADO')}
                    </span>
                  )}
                </span>
                {c.monto != null && <span className="font-medium shrink-0">${c.monto.toLocaleString('es-AR')}</span>}
              </div>
              {c.ubicacion_fisica && <p className="text-xs text-muted dark:text-dark-text-secondary">📍 {c.ubicacion_fisica}</p>}
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/ordenes/${orden.id}/boleta`}
        className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        {t('Ver boleta')}
      </Link>

      {tieneTrabajo && yaDerivado && (
        <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
          {t('Este equipo ya fue derivado a')}{' '}
          <Link href="/servicio-tecnico" className="text-accent dark:text-dark-accent underline">
            {t('Servicio Técnico')}
          </Link>
          .
        </p>
      )}

      {tieneTrabajo && !yaDerivado && !derivarAbierto && puedeRecibirServicioTecnico && (
        <button
          onClick={abrirDerivar}
          className="w-full rounded-2xl border-2 border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/50 py-3 text-center text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          🔧 {t('Derivar a Servicio Técnico')}
        </button>
      )}

      {derivarAbierto && (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">{t('Datos del equipo a derivar')}</p>
          <input
            value={derivarModelo}
            onChange={(e) => setDerivarModelo(e.target.value)}
            placeholder={t('Modelo (ej. iPhone 13)')}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            {STORAGE_OPTIONS.map((gb) => (
              <button
                key={gb}
                onClick={() => setDerivarCapacidad(gb)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                  derivarCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {gb}GB
              </button>
            ))}
          </div>
          <SelectorColorAuto modelo={derivarModelo} value={derivarColor} onChange={setDerivarColor} />
          <input
            value={derivarImei}
            onChange={(e) => setDerivarImei(e.target.value)}
            placeholder={t('IMEI')}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
          />
          <textarea
            value={derivarDetalles}
            onChange={(e) => setDerivarDetalles(e.target.value)}
            placeholder={t('Detalles (ej. no enciende, pantalla rota)')}
            rows={2}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setDerivarAbierto(false)}
              className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
            >
              {t('Cancelar')}
            </button>
            <button
              disabled={!derivarModelo.trim() || derivando}
              onClick={derivarAServicioTecnico}
              className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {derivando ? t('Derivando...') : t('Derivar a Servicio Técnico')}
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Estado')}</label>
        <div className="flex gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e}
              disabled={guardando}
              onClick={() => (e === 'pagado' && orden.estado === 'pendiente' ? setModalCobro(true) : cambiarEstado(e))}
              className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize disabled:opacity-40 ${
                orden.estado === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {t(e)}
            </button>
          ))}
        </div>
      </div>

      {modalCobro && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-surface rounded-2xl p-5 w-full max-w-sm flex flex-col gap-3">
            <p className="text-sm font-medium">{t('¿Cómo se cobró?')}</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              {t('Total a cobrar:')} <span className="font-medium text-ink dark:text-dark-text">{simboloMoneda(orden.moneda)}{formatearMonto(orden.total || 0)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {MEDIOS_PAGO.map((m) => (
                <button
                  key={m.codigo}
                  onClick={() => setMedioCobro(m.codigo)}
                  className={`rounded-xl px-3 py-2 text-sm font-medium ${
                    medioCobro === m.codigo ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border text-ink dark:text-dark-text'
                  }`}
                >
                  {m.icono} {t(m.label)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setModalCobro(false)} className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium">
                {t('Cancelar')}
              </button>
              <button
                disabled={cobrando}
                onClick={confirmarCobro}
                className="flex-1 rounded-xl bg-accent dark:bg-dark-accent text-white py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {cobrando ? t('Cobrando…') : t('Confirmar cobro')}
              </button>
            </div>
          </div>
        </div>
      )}

      {puedeEliminar && (
        <button
          disabled={guardando}
          onClick={handleCancelar}
          className="mt-auto w-full rounded-2xl border border-bad/30 py-3 text-center text-sm font-medium text-bad disabled:opacity-40"
        >
          {t('Eliminar orden')}
        </button>
      )}
    </main>
  );
}
