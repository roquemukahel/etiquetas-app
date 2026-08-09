'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo } from '../../lib/modelos';
import { obtenerTodasLasFilas } from '../../lib/db';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../../lib/carpetas';
import { simboloMoneda } from '../../lib/monedas';
import { getActor, useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import {
  MEDIOS_PAGO,
  CUENTA_CORRIENTE,
  medioLabel,
  calcularSaldo,
  vencimientoDesdeHoy,
} from '../../lib/cuentaCorriente';
import { planesActivos, interesDe, valorCuota, etiquetaCuotas } from '../../lib/cuotas';
import { generarComisionesAccion } from '../../comisiones/acciones';
import { ITEMS_CHECKLIST_INGRESO, CAMPOS_DEPENDEN_MODULO, generarTextoCondicionIngreso } from '../../lib/reparaciones';
import SelectorColorAuto from '../../SelectorColorAuto';
import { limpiarImei } from '../../lib/imei';
import { registrarAuditoria } from '../../lib/auditoria';
import MiniaturaDispositivo from '../../MiniaturaDispositivo';
import CheckTri from '../../CheckTri';
import TextoCondicionGenerado from '../../TextoCondicionGenerado';

type Dispositivo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  precio: number | null;
  imei: string | null;
  salud_bateria: number | null;
};

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
  cta_cte_habilitada?: boolean;
  limite_credito?: number | null;
  plazo_dias?: number | null;
  suspendido?: boolean;
};

type Vendedor = { id: string; nombre: string };
type Producto = { id: string; nombre: string; precio: number | null };
type Trabajo = { id: string; nombre: string; precio: number | null; imagen_url: string | null };

type CanjeCarrito = {
  tempId: string;
  modelo: string;
  capacidad_gb: number | null;
  color: string;
  imei: string;
  salud_bateria: string;
  monto: string;
  detalles: string;
};

type ItemCarrito = {
  tempId: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  dispositivoId?: string;
  productoId?: string | null; // producto de catálogo (para comisiones por producto)
  costo?: number | null; // snapshot del costo al vender (para comisión sobre ganancia)
  tipo: 'dispositivo' | 'producto' | 'trabajo';
};

// Un equipo candidato a derivarse a Servicio Técnico al confirmar la boleta.
// `desdeTrabajo` = es el equipo de la ficha técnica ("+ Servicio técnico"), el
// único que copia su checklist de ingreso a la reparación.
type Derivacion = {
  key: string;
  incluir: boolean;
  modelo: string;
  capacidad: number | null;
  color: string;
  imei: string;
  motivo: string;
  prioritario: boolean;
  desdeTrabajo: boolean;
  editar: boolean;
};

const STORAGE_OPTIONS = [64, 128, 256, 512];
const ESTADOS_ORDEN = ['pendiente', 'pagado', 'entregado'];

function idTemporal() {
  return Math.random().toString(36).slice(2);
}

// Deja solo dígitos y UN separador decimal, aceptando punto o coma (la coma
// se pasa a punto). Así se pueden escribir precios con decimales (ej. 123.50)
// tanto en compu como en celular.
function sanitizarDecimal(s: string): string {
  let v = s.replace(',', '.').replace(/[^\d.]/g, '');
  const i = v.indexOf('.');
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
  return v;
}

// Input de precio/monto atado a un número pero que conserva lo que el usuario
// tipea (incluido el punto a medio escribir) — si se atara directo al número,
// al convertir "123." a 123 se borraría el punto y nunca se podría poner el
// decimal.
function InputDecimal({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState(value ? String(value) : '');
  useEffect(() => {
    if ((Number(texto) || 0) !== value) setTexto(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      value={texto}
      inputMode="decimal"
      placeholder={placeholder}
      onChange={(e) => {
        const v = sanitizarDecimal(e.target.value);
        setTexto(v);
        onChange(Number(v) || 0);
      }}
      className={className}
    />
  );
}

export default function NuevaOrden() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actorActual = useActor();
  const puedeVender = tienePermiso(actorActual, 'vender');
  const puedeRecibirServicioTecnico = tienePermiso(actorActual, 'recibir_servicio_tecnico');

  const [step, setStep] = useState<'cliente' | 'carrito' | 'confirmar'>('cliente');

  // --- cliente ---
  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente');
  const [buscarCliente, setBuscarCliente] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoDomicilio, setNuevoDomicilio] = useState('');
  const [nuevoDni, setNuevoDni] = useState('');

  // --- carrito ---
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [panelAbierto, setPanelAbierto] = useState<'dispositivo' | 'producto' | 'trabajo' | null>(null);

  const [dispositivosStock, setDispositivosStock] = useState<Dispositivo[]>([]);
  const [carpetasStock, setCarpetasStock] = useState<string[]>([]);
  const [buscarDispositivo, setBuscarDispositivo] = useState('');
  const [modoDispositivo, setModoDispositivo] = useState<'stock' | 'nuevo'>('stock');
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevaCapacidad, setNuevaCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoPrecioDispositivo, setNuevoPrecioDispositivo] = useState('');
  const [nuevoImeiDispositivo, setNuevoImeiDispositivo] = useState('');
  const [cargandoDispositivo, setCargandoDispositivo] = useState(false);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [modoProducto, setModoProducto] = useState<'catalogo' | 'manual'>('catalogo');
  const [productoManualNombre, setProductoManualNombre] = useState('');
  const [productoManualPrecio, setProductoManualPrecio] = useState('');
  const [productoManualCantidad, setProductoManualCantidad] = useState('1');

  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [modoTrabajo, setModoTrabajo] = useState<'catalogo' | 'manual'>('catalogo');
  const [trabajoManualNombre, setTrabajoManualNombre] = useState('');
  const [trabajoManualPrecio, setTrabajoManualPrecio] = useState('');
  const [trabajoModelo, setTrabajoModelo] = useState('');
  const [trabajoImei, setTrabajoImei] = useState('');
  const [trabajoColor, setTrabajoColor] = useState('');
  // Datos del equipo de servicio técnico (modelo/imei/color + checklist),
  // capturados al agregar el trabajo, para guardarlos en la orden y que al
  // derivar a Servicio Técnico NO haya que recargar nada.
  const [checklistOrden, setChecklistOrden] = useState<Record<string, unknown> | null>(null);

  // Derivar a Servicio Técnico al confirmar la boleta: cada equipo de la boleta
  // pasa directo a reparación (ej. subir batería de varios equipos que el
  // cliente ya compró). Panel manual — el vendedor lo activa a propósito. Ahora
  // es una LISTA: un candidato por cada dispositivo vendido + el equipo de la
  // ficha técnica ("+ Servicio técnico"), para poder derivar VARIOS de una.
  const [derivarActivo, setDerivarActivo] = useState(false);
  const [derivaciones, setDerivaciones] = useState<Derivacion[]>([]);

  // Checklist de recepción para el equipo que se deja a reparar acá mismo
  // (venta directa, sin pasar por el circuito completo de Servicio
  // Técnico) — mismo cuadro que en esa sección. De acá sale el texto que
  // se agrega a la nota de la boleta al sumar el trabajo al carrito.
  const [trabajoEnciende, setTrabajoEnciende] = useState<boolean | null>(null);
  const [trabajoPantalla, setTrabajoPantalla] = useState('');
  const [trabajoChecklist, setTrabajoChecklist] = useState<Record<string, boolean | null>>({});
  const [trabajoHumedad, setTrabajoHumedad] = useState<boolean | null>(null);
  const [trabajoExcepcionGarantia, setTrabajoExcepcionGarantia] = useState('');

  // --- confirmar ---
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  // Cobro. En modo simple, un solo medio cubre todo el total. En modo
  // mixto, se reparte el total en varias líneas (medio + monto), y una de
  // ellas puede ser "Cuenta corriente" (que en vez de plata genera deuda).
  const [medioSimple, setMedioSimple] = useState<string>('efectivo');
  const [pagoMixto, setPagoMixto] = useState(false);
  const [lineasPago, setLineasPago] = useState<{ tempId: string; medio: string; monto: string }[]>([]);
  const [saldoCliente, setSaldoCliente] = useState(0);
  const [anticipo, setAnticipo] = useState('');
  const [impuesto, setImpuesto] = useState('');
  const [estadoOrden, setEstadoOrden] = useState('pendiente');
  const [nota, setNota] = useState('');
  const [incluirGarantia, setIncluirGarantia] = useState(true);

  // --- plan canje ---
  const [canjeActivo, setCanjeActivo] = useState(false);
  const [canjesCarrito, setCanjesCarrito] = useState<CanjeCarrito[]>([]);
  const [canjeModelo, setCanjeModelo] = useState('');
  const [canjeCapacidad, setCanjeCapacidad] = useState<number | null>(null);
  const [canjeColor, setCanjeColor] = useState('');
  const [canjeImei, setCanjeImei] = useState('');
  const [canjeBateria, setCanjeBateria] = useState('');
  const [canjeMonto, setCanjeMonto] = useState('');
  const [canjeDetalles, setCanjeDetalles] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [garantiaDias, setGarantiaDias] = useState<number | null>(null);
  const [interesCuotas, setInteresCuotas] = useState<Record<string, number> | null>(null);
  // 0 = Contado (paga ahora, sin recargo). 1+ = financiado en cuotas (1 cuota =
  // a ~1 mes, con recargo). Ver app/lib/cuotas.ts.
  const [cuotasElegidas, setCuotasElegidas] = useState(0);
  // Minorista/mayorista: clasifica la venta (para comisiones). Default minorista.
  const [tipoVenta, setTipoVenta] = useState<'minorista' | 'mayorista'>('minorista');
  const [comisionesActivas, setComisionesActivas] = useState(false);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [monedasDisponibles, setMonedasDisponibles] = useState<string[]>(['ARS']);
  const [monedaOrden, setMonedaOrden] = useState('ARS');
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);
  // Cómo se muestra el monto en la BOLETA (la orden siempre queda en la
  // moneda principal → Estadísticas siempre en la principal). 'principal' =
  // solo US$, 'secundaria' = solo pesos (convertido), 'ambas' = las dos.
  const [boletaMoneda, setBoletaMoneda] = useState<'principal' | 'secundaria' | 'ambas'>('principal');
  const [montoSecundario, setMontoSecundario] = useState('');
  const [montoSecundarioTocado, setMontoSecundarioTocado] = useState(false);
  const muestraSecundaria = boletaMoneda !== 'principal';

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( garantia_dias, moneda, monedas_habilitadas, tipo_cambio, interes_cuotas, comisiones_activas )')
        .eq('id', user.id)
        .single();
      setGarantiaDias((perfil as any)?.negocios?.garantia_dias ?? null);
      setInteresCuotas((perfil as any)?.negocios?.interes_cuotas ?? null);
      const negocio = (perfil as any)?.negocios;
      const monedas: string[] = negocio?.monedas_habilitadas?.length ? negocio.monedas_habilitadas : ['ARS'];
      setMonedasDisponibles(monedas);
      setMonedaOrden(negocio?.moneda || monedas[0]);
      setTipoCambio(negocio?.tipo_cambio ?? null);
      setComisionesActivas(!!negocio?.comisiones_activas);
    })();
    (async () => {
      setClientes(await obtenerTodasLasFilas<Cliente>(supabase, 'clientes', '*'));
    })();
    (async () => {
      const { data } = await supabase.from('dispositivos').select('*').eq('en_stock', true);
      setDispositivosStock((data as Dispositivo[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('productos').select('*').order('nombre');
      setProductos((data as Producto[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('vendedores').select('*').order('nombre');
      setVendedores((data as Vendedor[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('trabajos').select('*').order('nombre');
      setTrabajos((data as Trabajo[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetasStock((data ?? []).map((m) => m.nombre));
    })();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = buscarCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.apellido, c.telefono].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [clientes, buscarCliente]);

  const idsEnCarrito = useMemo(
    () => new Set(carrito.map((i) => i.dispositivoId).filter(Boolean)),
    [carrito]
  );

  const dispositivosFiltrados = useMemo(() => {
    const q = buscarDispositivo.trim().toLowerCase();
    return dispositivosStock
      .filter((d) => !idsEnCarrito.has(d.id))
      .filter((d) => !q || [d.modelo, d.imei].filter(Boolean).some((c) => c!.toLowerCase().includes(q)));
  }, [dispositivosStock, buscarDispositivo, idsEnCarrito]);

  const subtotal = useMemo(
    () => carrito.reduce((acc, i) => acc + i.cantidad * i.precioUnitario, 0),
    [carrito]
  );
  const moneda = useMemo(() => simboloMoneda(monedaOrden), [monedaOrden]);

  // Los canjes que efectivamente cuentan: los ya agregados con el botón MÁS el
  // que esté cargado en el formulario sin agregar todavía. Así, si el usuario
  // completa el canje pero se olvida de tocar "+ Agregar", igual se descuenta
  // del total y se guarda (era la causa de "no me descuenta / no aparece").
  const canjesEfectivos = useMemo<CanjeCarrito[]>(() => {
    const enProgreso: CanjeCarrito[] =
      canjeActivo && canjeModelo.trim()
        ? [
            {
              tempId: '__en_progreso__',
              modelo: canjeModelo.trim(),
              capacidad_gb: canjeCapacidad,
              color: canjeColor,
              imei: canjeImei,
              salud_bateria: canjeBateria,
              monto: canjeMonto,
              detalles: canjeDetalles,
            },
          ]
        : [];
    return [...canjesCarrito, ...enProgreso];
  }, [canjesCarrito, canjeActivo, canjeModelo, canjeCapacidad, canjeColor, canjeImei, canjeBateria, canjeMonto, canjeDetalles]);

  const montoCanjeTotal = useMemo(
    () => canjesEfectivos.reduce((acc, c) => acc + (Number(c.monto) || 0), 0),
    [canjesEfectivos]
  );

  // Financiación en cuotas: el interés del plan elegido se aplica sobre el
  // subtotal (precio de contado de la mercadería), antes de impuesto/anticipo/
  // canje. planes = los planes activos que configuró el negocio.
  const planes = useMemo(() => planesActivos(interesCuotas), [interesCuotas]);
  const interesPlan = interesDe(interesCuotas, cuotasElegidas);
  const subtotalFinanciado = subtotal * (1 + interesPlan / 100);

  const total = useMemo(() => {
    const conImpuesto = subtotalFinanciado * (1 + (Number(impuesto) || 0) / 100);
    // Sin Math.max(0, ...) a propósito: si el anticipo es mayor al precio
    // (ej. seña de una compra anterior más grande que lo que se lleva hoy),
    // el total puede quedar negativo — representa saldo a favor del cliente.
    return conImpuesto - (Number(anticipo) || 0) - montoCanjeTotal;
  }, [subtotalFinanciado, impuesto, anticipo, montoCanjeTotal]);

  // Monto informativo en la segunda moneda: se recalcula solo mientras
  // el usuario no lo haya tocado a mano (si lo edita, respetamos su
  // valor y dejamos de pisarlo con el cálculo automático).
  useEffect(() => {
    if (muestraSecundaria && tipoCambio && !montoSecundarioTocado) {
      setMontoSecundario(Math.round(total * tipoCambio).toString());
    }
  }, [muestraSecundaria, tipoCambio, montoSecundarioTocado, total]);

  // Saldo actual del cliente elegido, para mostrar el crédito disponible y
  // bloquear una venta a cuenta corriente que supere el límite.
  useEffect(() => {
    if (!clienteElegido?.id) {
      setSaldoCliente(0);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('cta_cte_movimientos')
        .select('tipo, monto')
        .eq('cliente_id', clienteElegido.id)
        .eq('anulado', false);
      setSaldoCliente(calcularSaldo((data as { tipo: string; monto: number }[]) ?? []));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteElegido?.id]);

  const ctaCteDisponible = !!clienteElegido?.cta_cte_habilitada && !clienteElegido?.suspendido;

  // Si el cliente no tiene cuenta corriente (o cambió a uno que no la
  // tiene), no dejar "Cuenta corriente" elegido en modo simple.
  useEffect(() => {
    if (!ctaCteDisponible && medioSimple === CUENTA_CORRIENTE) setMedioSimple('efectivo');
  }, [ctaCteDisponible, medioSimple]);

  // Cuánto de esta venta queda como deuda en la cuenta corriente.
  const montoCuentaCorriente = useMemo(() => {
    if (!pagoMixto) return medioSimple === CUENTA_CORRIENTE ? Math.max(0, total) : 0;
    return lineasPago
      .filter((l) => l.medio === CUENTA_CORRIENTE)
      .reduce((acc, l) => acc + (Number(l.monto) || 0), 0);
  }, [pagoMixto, medioSimple, lineasPago, total]);

  const montoAsignado = useMemo(() => {
    if (!pagoMixto) return total;
    return lineasPago.reduce((acc, l) => acc + (Number(l.monto) || 0), 0);
  }, [pagoMixto, lineasPago, total]);

  const restantePorAsignar = total - montoAsignado;
  // En modo mixto, la suma de las líneas tiene que dar el total. Si el total
  // es 0 o negativo (saldo a favor), no hay nada que cobrar.
  const asignacionOk = !pagoMixto || total <= 0 || Math.abs(restantePorAsignar) < 0.5;

  const creditoDisponible =
    clienteElegido?.limite_credito == null ? Infinity : clienteElegido.limite_credito - saldoCliente;
  const excedeLimite = montoCuentaCorriente > creditoDisponible + 0.5;

  const elegirCliente = (c: Cliente) => {
    setClienteElegido(c);
    setStep('carrito');
  };

  const confirmarClienteNuevo = () => {
    if (!nuevoNombre.trim()) return;
    setStep('carrito');
  };

  const agregarDispositivoDelStock = (d: Dispositivo) => {
    setCarrito((c) => [
      ...c,
      {
        tempId: idTemporal(),
        descripcion: `${d.modelo || 'Dispositivo'}${d.capacidad_gb ? ` ${d.capacidad_gb}GB` : ''}${
          d.color ? ` ${d.color}` : ''
        }${d.imei ? ` · IMEI ${d.imei}` : ''}${d.salud_bateria != null ? ` · Batería ${d.salud_bateria}%` : ''}`,
        cantidad: 1,
        precioUnitario: d.precio ?? 0,
        dispositivoId: d.id,
        costo: (d as any).costo ?? null,
        tipo: 'dispositivo',
      },
    ]);
    setPanelAbierto(null);
    setBuscarDispositivo('');
  };

  const agregarDispositivoNuevo = async () => {
    if (!nuevoModelo.trim()) return;
    setCargandoDispositivo(true);
    setError(null);
    const { data, error: dErr } = await supabase
      .from('dispositivos')
      .insert({
        modelo: nuevoModelo.trim(),
        capacidad_gb: nuevaCapacidad,
        color: nuevoColor.trim() || null,
        imei: nuevoImeiDispositivo.trim() || null,
        precio: nuevoPrecioDispositivo ? Number(nuevoPrecioDispositivo) : null,
        estado: 'usado',
        en_stock: true,
      })
      .select()
      .single();
    setCargandoDispositivo(false);
    if (dErr || !data) {
      setError('No pudimos cargar el dispositivo: ' + (dErr?.message || ''));
      return;
    }
    await asegurarModelo(supabase, nuevoModelo);
    setDispositivosStock((s) => [...s, data as Dispositivo]);
    agregarDispositivoDelStock(data as Dispositivo);
    setNuevoModelo('');
    setNuevaCapacidad(null);
    setNuevoColor('');
    setNuevoImeiDispositivo('');
    setNuevoPrecioDispositivo('');
  };

  const agregarProductoDelCatalogo = (p: Producto) => {
    setCarrito((c) => [
      ...c,
      { tempId: idTemporal(), descripcion: p.nombre, cantidad: 1, precioUnitario: p.precio ?? 0, productoId: p.id, costo: (p as any).costo ?? null, tipo: 'producto' },
    ]);
    setPanelAbierto(null);
  };

  const agregarProductoManual = () => {
    if (!productoManualNombre.trim()) return;
    setCarrito((c) => [
      ...c,
      {
        tempId: idTemporal(),
        descripcion: productoManualNombre.trim(),
        cantidad: Number(productoManualCantidad) || 1,
        precioUnitario: productoManualPrecio ? Number(productoManualPrecio) : 0,
        tipo: 'producto',
      },
    ]);
    setProductoManualNombre('');
    setProductoManualPrecio('');
    setProductoManualCantidad('1');
    setPanelAbierto(null);
  };

  const descripcionTrabajo = (nombre: string) => (trabajoModelo.trim() ? `${nombre} — ${trabajoModelo.trim()}` : nombre);

  const datosChecklistTrabajo = () => ({
    enciende: trabajoEnciende,
    pantalla_estado: trabajoPantalla || null,
    modulo_ok: trabajoChecklist.modulo_ok ?? null,
    senal_ok: trabajoChecklist.senal_ok ?? null,
    boton_silencio_ok: trabajoChecklist.boton_silencio_ok ?? null,
    camara_frontal_ok: trabajoChecklist.camara_frontal_ok ?? null,
    camara_trasera_ok: trabajoChecklist.camara_trasera_ok ?? null,
    flash_ok: trabajoChecklist.flash_ok ?? null,
    microfono_superior_ok: trabajoChecklist.microfono_superior_ok ?? null,
    microfono_inferior_ok: trabajoChecklist.microfono_inferior_ok ?? null,
    altavoces_ok: trabajoChecklist.altavoces_ok ?? null,
    boton_power_ok: trabajoChecklist.boton_power_ok ?? null,
    boton_volumen_ok: trabajoChecklist.boton_volumen_ok ?? null,
    pin_carga_ok: trabajoChecklist.pin_carga_ok ?? null,
    carga_magsafe_ok: trabajoChecklist.carga_magsafe_ok ?? null,
    biometria_ok: trabajoChecklist.biometria_ok ?? null,
    conectores_ok: trabajoChecklist.conectores_ok ?? null,
    humedad: trabajoHumedad,
    garantia_excepcion_manual: trabajoExcepcionGarantia.trim() || null,
  });

  // La checklist no crea un ticket en Servicio Técnico (esto es venta
  // directa) — el texto que genera se agrega a la nota de la boleta, para
  // que el cliente se lleve por escrito qué se le garantiza y qué no.
  const agregarTextoCondicionANota = () => {
    const datos = datosChecklistTrabajo();
    // Guardamos el equipo + checklist para poder derivarlo a Servicio Técnico
    // sin recargar (el técnico lo recibe ya cargado).
    setChecklistOrden({
      modelo: trabajoModelo.trim() || null,
      imei: limpiarImei(trabajoImei) || null,
      color: trabajoColor.trim() || null,
      ...datos,
    });
    const texto = generarTextoCondicionIngreso(datos);
    if (!texto) return;
    setNota((n) => (n.trim() ? `${n.trim()}\n\n${texto}` : texto));
  };

  const resetChecklistTrabajo = () => {
    setTrabajoEnciende(null);
    setTrabajoPantalla('');
    setTrabajoChecklist({});
    setTrabajoHumedad(null);
    setTrabajoExcepcionGarantia('');
    setTrabajoImei('');
    setTrabajoColor('');
  };

  const agregarTrabajoDelCatalogo = (t: Trabajo) => {
    setCarrito((c) => [
      ...c,
      { tempId: idTemporal(), descripcion: descripcionTrabajo(t.nombre), cantidad: 1, precioUnitario: t.precio ?? 0, tipo: 'trabajo' },
    ]);
    agregarTextoCondicionANota();
    setTrabajoModelo('');
    resetChecklistTrabajo();
    setPanelAbierto(null);
  };

  const agregarTrabajoManual = () => {
    if (!trabajoManualNombre.trim()) return;
    setCarrito((c) => [
      ...c,
      {
        tempId: idTemporal(),
        descripcion: descripcionTrabajo(trabajoManualNombre.trim()),
        cantidad: 1,
        precioUnitario: trabajoManualPrecio ? Number(trabajoManualPrecio) : 0,
        tipo: 'trabajo',
      },
    ]);
    agregarTextoCondicionANota();
    setTrabajoManualNombre('');
    setTrabajoManualPrecio('');
    setTrabajoModelo('');
    resetChecklistTrabajo();
    setPanelAbierto(null);
  };

  const agregarCanje = () => {
    if (!canjeModelo.trim()) return;
    setCanjesCarrito((c) => [
      ...c,
      {
        tempId: idTemporal(),
        modelo: canjeModelo.trim(),
        capacidad_gb: canjeCapacidad,
        color: canjeColor.trim(),
        imei: canjeImei.trim(),
        salud_bateria: canjeBateria,
        monto: canjeMonto,
        detalles: canjeDetalles.trim(),
      },
    ]);
    setCanjeModelo('');
    setCanjeCapacidad(null);
    setCanjeColor('');
    setCanjeImei('');
    setCanjeBateria('');
    setCanjeMonto('');
    setCanjeDetalles('');
  };

  const quitarCanje = (tempId: string) => setCanjesCarrito((c) => c.filter((x) => x.tempId !== tempId));

  const actualizarMontoCanje = (tempId: string, monto: string) =>
    setCanjesCarrito((c) => c.map((x) => (x.tempId === tempId ? { ...x, monto } : x)));

  const quitarDelCarrito = (tempId: string) => setCarrito((c) => c.filter((i) => i.tempId !== tempId));

  const actualizarPrecioItem = (tempId: string, precio: number) =>
    setCarrito((c) => c.map((i) => (i.tempId === tempId ? { ...i, precioUnitario: precio } : i)));

  const actualizarCantidadItem = (tempId: string, cantidad: string) =>
    setCarrito((c) => c.map((i) => (i.tempId === tempId ? { ...i, cantidad: Math.max(1, Number(cantidad) || 1) } : i)));

  // vendedorId es obligatorio a propósito: dejarlo "Sin asignar" ensuciaba
  // el ranking de vendedores en Estadísticas con ventas sin nadie a quien
  // atribuírselas. Pero si el negocio todavía no cargó ningún vendedor en
  // Configuración, no hay de quién elegir — exigirlo igual dejaría a ese
  // negocio sin poder vender nunca más, así que en ese caso puntual no se
  // bloquea.
  const puedeConfirmar =
    carrito.length > 0 &&
    puedeVender &&
    (vendedores.length === 0 || !!vendedorId) &&
    asignacionOk &&
    !excedeLimite &&
    (montoCuentaCorriente <= 0 || ctaCteDisponible);

  // Etiqueta legible del cobro para guardar en la orden (forma_pago) y
  // mostrar en listados/boleta, sin perder el detalle real que vive en la
  // tabla de pagos.
  const etiquetaCobro = (): string => {
    if (!pagoMixto) return medioLabel(medioSimple);
    const medios = Array.from(new Set(lineasPago.filter((l) => Number(l.monto) > 0).map((l) => l.medio)));
    if (medios.length === 0) return 'Sin especificar';
    // Antes se guardaba "Mixto" a secas: en la boleta no se sabía CON QUÉ pagó.
    // Ahora se guarda el desglose de medios (ej. "Efectivo + Transferencia"),
    // que es lo que muestran las boletas y los listados.
    return medios.map(medioLabel).join(' + ');
  };

  // Construye las filas de pagos (plata que entra) para esta venta.
  const construirPagos = (): { medio: string; monto: number }[] => {
    if (!pagoMixto) {
      if (medioSimple === CUENTA_CORRIENTE || total <= 0) return [];
      return [{ medio: medioSimple, monto: total }];
    }
    return lineasPago
      .filter((l) => l.medio !== CUENTA_CORRIENTE && Number(l.monto) > 0)
      .map((l) => ({ medio: l.medio, monto: Number(l.monto) }));
  };

  const agregarLineaPago = () => {
    const usados = new Set(lineasPago.map((l) => l.medio));
    const medioLibre = [...MEDIOS_PAGO.map((m) => m.codigo), CUENTA_CORRIENTE].find((m) => !usados.has(m)) ?? 'efectivo';
    // La nueva línea arranca con lo que falta asignar, para el caso típico.
    const sugerido = restantePorAsignar > 0 ? String(Math.round(restantePorAsignar)) : '';
    setLineasPago((ls) => [...ls, { tempId: idTemporal(), medio: medioLibre, monto: sugerido }]);
  };
  const actualizarLineaPago = (tempId: string, campo: 'medio' | 'monto', valor: string) =>
    setLineasPago((ls) => ls.map((l) => (l.tempId === tempId ? { ...l, [campo]: valor } : l)));
  const quitarLineaPago = (tempId: string) => setLineasPago((ls) => ls.filter((l) => l.tempId !== tempId));

  // Construye la lista de equipos que se pueden derivar: UNO por cada dispositivo
  // vendido del carrito (caso "lo compró y quiere subir batería" → prioritario
  // por defecto) MÁS el equipo de la ficha técnica ("+ Servicio técnico", que
  // trae su checklist). Si no hay ninguno (solo accesorios), deja una fila
  // manual en blanco para cargar un equipo a mano.
  const construirDerivaciones = (): Derivacion[] => {
    const lista: Derivacion[] = [];
    for (const item of carrito) {
      if (item.tipo !== 'dispositivo' || !item.dispositivoId) continue;
      const disp = dispositivosStock.find((d) => d.id === item.dispositivoId);
      lista.push({
        key: item.dispositivoId,
        incluir: true,
        modelo: disp?.modelo ?? '',
        capacidad: disp?.capacidad_gb ?? null,
        color: disp?.color ?? '',
        imei: disp?.imei ?? '',
        motivo: '',
        prioritario: true,
        desdeTrabajo: false,
        editar: !(disp?.modelo ?? '').trim(),
      });
    }
    const ct = (checklistOrden ?? {}) as any;
    if (typeof ct.modelo === 'string' && ct.modelo.trim()) {
      lista.push({
        key: 'trabajo',
        incluir: true,
        modelo: ct.modelo.trim(),
        capacidad: null,
        color: typeof ct.color === 'string' ? ct.color : '',
        imei: typeof ct.imei === 'string' ? ct.imei : '',
        motivo: '',
        prioritario: false,
        desdeTrabajo: true,
        editar: false,
      });
    }
    if (lista.length === 0) {
      lista.push({ key: 'manual', incluir: true, modelo: '', capacidad: null, color: '', imei: '', motivo: '', prioritario: false, desdeTrabajo: false, editar: true });
    }
    return lista;
  };

  const toggleDerivar = () => {
    setDerivarActivo((prev) => {
      const nuevo = !prev;
      setDerivaciones(nuevo ? construirDerivaciones() : []);
      return nuevo;
    });
  };

  const actualizarDerivacion = (key: string, cambios: Partial<Derivacion>) =>
    setDerivaciones((ds) => ds.map((d) => (d.key === key ? { ...d, ...cambios } : d)));

  // Si el carrito cambia con el panel de derivar ya abierto (el vendedor volvió a
  // "Ítems" y sumó/quitó un equipo), se reconstruye la lista para no derivar un
  // equipo que se sacó ni omitir uno que se agregó — preservando lo que ya
  // editó por equipo (incluir, motivo, prioritario, datos).
  useEffect(() => {
    if (!derivarActivo) return;
    setDerivaciones((prev) =>
      construirDerivaciones().map((nueva) => {
        const anterior = prev.find((p) => p.key === nueva.key);
        return anterior ? { ...nueva, ...anterior } : nueva;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carrito]);

  const handleConfirmar = async () => {
    if (!puedeConfirmar) return;
    setGuardando(true);
    setError(null);

    const dispositivoIds = carrito.map((i) => i.dispositivoId).filter(Boolean) as string[];
    let dispositivosReservados = false;
    let ordenCreadaId: string | null = null;

    try {
      // Se reserva el stock ANTES de crear la orden, y solo se marca
      // en_stock:false si todavía figuraba en_stock:true en ese momento
      // (el "eq" corre en el motor de la base, así que si dos vendedores
      // confirman el mismo dispositivo casi al mismo tiempo, solo uno de
      // los dos logra reservarlo). Si falta alguno, se aborta todo antes
      // de tocar cliente/orden — evita vender dos veces el mismo equipo.
      if (dispositivoIds.length > 0) {
        const actualizacionReserva: { en_stock: boolean; garantia_vencimiento?: string } = { en_stock: false };
        if (garantiaDias) {
          const vencimiento = new Date();
          vencimiento.setDate(vencimiento.getDate() + garantiaDias);
          actualizacionReserva.garantia_vencimiento = vencimiento.toISOString().slice(0, 10);
        }
        const { data: reservados, error: reservaErr } = await supabase
          .from('dispositivos')
          .update(actualizacionReserva)
          .in('id', dispositivoIds)
          .eq('en_stock', true)
          .select('id');
        if (reservaErr) throw new Error(reservaErr.message);
        if (!reservados || reservados.length !== dispositivoIds.length) {
          if (reservados && reservados.length > 0) {
            await supabase
              .from('dispositivos')
              .update({ en_stock: true })
              .in(
                'id',
                reservados.map((r) => r.id)
              );
          }
          throw new Error(
            'Uno o más de estos dispositivos ya se vendieron en otra orden. Volvé a la pantalla anterior y actualizá el carrito.'
          );
        }
        dispositivosReservados = true;
      }

      let clienteId = clienteElegido?.id;
      if (modoCliente === 'nuevo') {
        const actorCliente = getActor();
        const { data, error: cErr } = await supabase
          .from('clientes')
          .insert({
            nombre: nuevoNombre.trim(),
            apellido: nuevoApellido.trim() || null,
            telefono: nuevoTelefono.trim() || null,
            domicilio: nuevoDomicilio.trim() || null,
            dni: nuevoDni.trim() || null,
            agregado_por_nombre: actorCliente?.nombre ?? null,
            agregado_por_foto_url: actorCliente?.fotoUrl ?? null,
          })
          .select()
          .single();
        if (cErr || !data) throw new Error(cErr?.message || 'no se pudo cargar el cliente');
        clienteId = data.id;
      }

      const { data: orden, error: oErr } = await supabase
        .from('ordenes')
        .insert({
          cliente_id: clienteId,
          vendedor_id: vendedorId || null,
          forma_pago: etiquetaCobro(),
          anticipo: Number(anticipo) || 0,
          impuesto_porcentaje: Number(impuesto) || 0,
          cuotas: cuotasElegidas,
          tipo_venta: tipoVenta,
          monto_canje: montoCanjeTotal,
          moneda: monedaOrden,
          monto_secundario: muestraSecundaria && montoSecundario ? Number(montoSecundario) : null,
          moneda_secundaria: muestraSecundaria ? monedasDisponibles[1] : null,
          boleta_moneda: boletaMoneda,
          checklist_ingreso: checklistOrden,
          total,
          estado: estadoOrden,
          fecha_entrega: estadoOrden === 'entregado' ? new Date().toISOString() : null,
          nota: nota.trim() || null,
          incluir_garantia: incluirGarantia,
        })
        .select()
        .single();
      if (oErr || !orden) throw new Error(oErr?.message || 'no se pudo crear la orden');
      ordenCreadaId = orden.id;

      if (canjesEfectivos.length > 0) {
        const { error: canjesErr } = await supabase.from('canjes').insert(
          canjesEfectivos.map((c) => ({
            orden_id: orden.id,
            modelo: c.modelo,
            capacidad_gb: c.capacidad_gb,
            color: c.color.trim() || null,
            imei: c.imei.trim() || null,
            salud_bateria: c.salud_bateria ? Number(c.salud_bateria) : null,
            detalles: c.detalles.trim() || null,
            monto: c.monto ? Number(c.monto) : null,
            vendedor_id: vendedorId || null,
          }))
        );
        if (canjesErr) throw new Error(canjesErr.message || 'no se pudieron cargar los dispositivos de canje');
      }

      const { error: itemsErr } = await supabase.from('orden_items').insert(
        carrito.map((i) => ({
          orden_id: orden.id,
          dispositivo_id: i.dispositivoId || null,
          producto_id: i.productoId || null,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          precio_unitario: i.precioUnitario,
          costo: i.costo ?? null,
          tipo: i.tipo,
        }))
      );
      if (itemsErr) throw new Error(itemsErr.message);

      // Cobro: pagos (plata que entra) + cargo de cuenta corriente (deuda
      // que nace). La etiqueta de la orden ya resume el medio; el detalle
      // real vive acá para poder armar la caja por medio de pago.
      const actorCobro = getActor();
      const pagosNuevos = construirPagos();
      if (pagosNuevos.length > 0) {
        const { error: pagosErr } = await supabase.from('pagos').insert(
          pagosNuevos.map((p) => ({
            cliente_id: clienteId ?? null,
            orden_id: orden.id,
            medio: p.medio,
            monto: p.monto,
            moneda: monedaOrden,
            registrado_por_nombre: actorCobro?.nombre ?? null,
            registrado_por_foto_url: actorCobro?.fotoUrl ?? null,
          }))
        );
        if (pagosErr) throw new Error(pagosErr.message);
      }
      if (montoCuentaCorriente > 0 && clienteId) {
        const { error: movErr } = await supabase.from('cta_cte_movimientos').insert({
          cliente_id: clienteId,
          tipo: 'cargo',
          concepto: 'venta',
          monto: montoCuentaCorriente,
          moneda: monedaOrden,
          orden_id: orden.id,
          vencimiento: vencimientoDesdeHoy(clienteElegido?.plazo_dias),
          registrado_por_nombre: actorCobro?.nombre ?? null,
          registrado_por_foto_url: actorCobro?.fotoUrl ?? null,
        });
        if (movErr) throw new Error(movErr.message);
      }

      // Derivar a Servicio Técnico: crea UNA reparación por cada equipo tildado
      // (ligada a esta orden por orden_origen_id) para que el técnico las
      // trabaje. No rompe la venta si falla (la boleta ya se hizo) — se avisa
      // por cada una. El checklist solo se copia al equipo de la ficha técnica
      // ("+ Servicio técnico"); los dispositivos vendidos no tienen checklist.
      const aDerivar = derivarActivo ? derivaciones.filter((d) => d.incluir && d.modelo.trim()) : [];
      for (const der of aDerivar) {
        const ci = (der.desdeTrabajo ? checklistOrden ?? {} : {}) as any;
        const { data: repNueva, error: repErr } = await supabase
          .from('reparaciones')
          .insert({
            orden_origen_id: orden.id,
            cliente_id: clienteId ?? null,
            modelo: der.modelo.trim(),
            capacidad_gb: der.capacidad,
            color: der.color.trim() || null,
            imei: limpiarImei(der.imei) || null,
            falla_declarada: der.motivo.trim() || null,
            estado: 'recibido',
            prioridad: der.prioritario ? 'urgente' : 'normal',
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
            pin_carga_ok: ci.pin_carga_ok ?? null,
            carga_magsafe_ok: ci.carga_magsafe_ok ?? null,
            biometria_ok: ci.biometria_ok ?? null,
            conectores_ok: ci.conectores_ok ?? null,
            humedad: ci.humedad ?? null,
            garantia_excepcion_manual: ci.garantia_excepcion_manual ?? null,
          })
          .select('id, numero_orden')
          .single();
        if (repErr) {
          alert(`⚠️ La orden se guardó, pero no pudimos derivar "${der.modelo.trim()}" a Servicio Técnico: ${repErr.message}`);
        } else {
          await registrarAuditoria(supabase, {
            accion: `derivó a Servicio Técnico un equipo al crear una orden (${der.modelo.trim()}${der.prioritario ? ', prioritario' : ''})`,
            entidad: 'reparacion',
            entidadId: repNueva?.id,
            valorNuevo: { modelo: der.modelo.trim(), motivo: der.motivo.trim() || null, prioridad: der.prioritario ? 'urgente' : 'normal' },
          });
        }
      }

      // Comisiones: el servidor genera los movimientos si el módulo está activo
      // (idempotente). No rompe la venta si falla. Si el módulo está activo pero
      // no se generó comisión por un motivo ACCIONABLE (falta vendedor, plan o
      // reglas), avisamos — para no dejar al usuario a ciegas.
      if (comisionesActivas) {
        try {
          const rc = await generarComisionesAccion(orden.id);
          const motivosSilenciosos = [
            'Comisiones desactivadas',
            'Esta venta no genera comisión',
            'La venta todavía no está cobrada',
            'La comisión de esta venta ya estaba generada',
          ];
          if (rc.error) {
            alert('⚠️ No se pudo generar la comisión: ' + rc.error);
          } else if (rc.generadas === 0 && rc.motivo && !motivosSilenciosos.includes(rc.motivo)) {
            alert('⚠️ Esta venta no generó comisión: ' + rc.motivo + '.');
          }
        } catch {}
      }

      router.push(`/ordenes/${orden.id}/boleta`);
    } catch (err: any) {
      if (dispositivosReservados) {
        await supabase.from('dispositivos').update({ en_stock: true }).in('id', dispositivoIds);
      }
      // Si la orden llegó a crearse pero algo después falló (canjes o
      // ítems), no puede quedar dando vueltas una orden fantasma con un
      // total que no corresponde a nada — se borra. Si ya se había
      // alcanzado a insertar algún canje, canjes.orden_id tiene "on
      // delete set null": el canje no se pierde (el equipo sí se
      // recibió), solo queda sin orden asociada.
      if (ordenCreadaId) {
        await supabase.from('ordenes').delete().eq('id', ordenCreadaId);
      }
      setError('No pudimos crear la orden: ' + (err?.message || 'error desconocido'));
      setGuardando(false);
    }
  };

  if (step === 'cliente') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <Link href="/ordenes" className="text-2xl leading-none">
            &larr;
          </Link>
          <span className="text-lg font-medium">Nueva orden · Cliente</span>
        </header>

        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setModoCliente('existente')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'existente' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            Cliente existente
          </button>
          <button
            onClick={() => setModoCliente('nuevo')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'nuevo' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            Cargar nuevo
          </button>
        </div>

        {modoCliente === 'existente' ? (
          <>
            <input
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              placeholder="Buscar por nombre o teléfono..."
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex flex-col gap-2">
              {clientesFiltrados.length === 0 && (
                <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">No encontramos clientes con esa búsqueda.</p>
              )}
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => elegirCliente(c)}
                  className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between text-left"
                >
                  <p className="text-sm font-medium">
                    {c.nombre} {c.apellido || ''}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary">{c.telefono || ''}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Campo label="Nombre" valor={nuevoNombre} onChange={setNuevoNombre} />
            <Campo label="Apellido" valor={nuevoApellido} onChange={setNuevoApellido} />
            <Campo label="Teléfono" valor={nuevoTelefono} onChange={setNuevoTelefono} />
            <Campo label="Domicilio" valor={nuevoDomicilio} onChange={setNuevoDomicilio} />
            <Campo label="DNI" valor={nuevoDni} onChange={setNuevoDni} />
            <button
              disabled={!nuevoNombre.trim()}
              onClick={confirmarClienteNuevo}
              className="mt-2 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        )}
      </main>
    );
  }

  if (step === 'carrito') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <button onClick={() => setStep('cliente')} className="text-2xl leading-none">
            &larr;
          </button>
          <span className="text-lg font-medium">Nueva orden · Ítems</span>
        </header>

        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'dispositivo' ? null : 'dispositivo')}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-3 text-sm font-medium"
          >
            + Dispositivo
          </button>
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'producto' ? null : 'producto')}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-3 text-sm font-medium"
          >
            + Accesorio / producto
          </button>
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'trabajo' ? null : 'trabajo')}
            className="flex-1 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/50 py-3 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            🔧 Servicio técnico
          </button>
        </div>

        {panelAbierto === 'dispositivo' && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setModoDispositivo('stock')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoDispositivo === 'stock' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Del stock
              </button>
              <button
                onClick={() => setModoDispositivo('nuevo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoDispositivo === 'nuevo' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Cargar nuevo
              </button>
            </div>

            {modoDispositivo === 'stock' ? (
              <>
                <input
                  value={buscarDispositivo}
                  onChange={(e) => setBuscarDispositivo(e.target.value)}
                  placeholder="Buscar por modelo o IMEI..."
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {dispositivosFiltrados.length === 0 && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">No hay dispositivos disponibles.</p>
                  )}
                  {dispositivosFiltrados.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => agregarDispositivoDelStock(d)}
                      className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 flex items-center justify-between text-left text-sm gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                      <MiniaturaDispositivo src={imagenPorNombreExacto(d.modelo, imagenesCarpetas)} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {d.modelo} {d.capacidad_gb ? `· ${d.capacidad_gb}GB` : ''} {d.color ? `· ${d.color}` : ''}
                        </span>
                        {d.imei && (
                          <span className="block text-xs font-bold font-mono text-ink dark:text-dark-text truncate">
                            {d.imei}
                          </span>
                        )}
                      </span>
                      </span>
                      {d.precio != null && (
                        <span className="font-medium shrink-0">{moneda}{d.precio.toLocaleString('es-AR')}</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={nuevoModelo}
                  onChange={(e) => setNuevoModelo(e.target.value)}
                  placeholder="Modelo (ej. iPhone 13)"
                  list="carpetas-stock"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <datalist id="carpetas-stock">
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
                <SelectorColorAuto label="Color" modelo={nuevoModelo} value={nuevoColor} onChange={setNuevoColor} />
                <input
                  value={nuevoImeiDispositivo}
                  onChange={(e) => setNuevoImeiDispositivo(e.target.value)}
                  placeholder="IMEI"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <input
                  value={nuevoPrecioDispositivo}
                  onChange={(e) => setNuevoPrecioDispositivo(sanitizarDecimal(e.target.value))}
                  placeholder="Precio"
                  inputMode="decimal"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={!nuevoModelo.trim() || cargandoDispositivo}
                  onClick={agregarDispositivoNuevo}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {cargandoDispositivo ? 'Agregando...' : 'Agregar al carrito'}
                </button>
              </div>
            )}
          </div>
        )}

        {panelAbierto === 'producto' && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setModoProducto('catalogo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoProducto === 'catalogo' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Del catálogo
              </button>
              <button
                onClick={() => setModoProducto('manual')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoProducto === 'manual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Cargar a mano
              </button>
            </div>

            {modoProducto === 'catalogo' ? (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {productos.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">
                    Todavía no cargaste productos en Stock &gt; Accesorios.
                  </p>
                )}
                {productos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => agregarProductoDelCatalogo(p)}
                    className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 flex items-center justify-between text-left text-sm"
                  >
                    <span>{p.nombre}</span>
                    {p.precio != null && <span className="font-medium">{moneda}{p.precio.toLocaleString('es-AR')}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={productoManualNombre}
                  onChange={(e) => setProductoManualNombre(e.target.value)}
                  placeholder="Nombre del ítem"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <input
                    value={productoManualCantidad}
                    onChange={(e) => setProductoManualCantidad(e.target.value)}
                    placeholder="Cantidad"
                    inputMode="numeric"
                    className="w-1/3 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={productoManualPrecio}
                    onChange={(e) => setProductoManualPrecio(sanitizarDecimal(e.target.value))}
                    placeholder="Precio unitario"
                    inputMode="decimal"
                    className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  disabled={!productoManualNombre.trim()}
                  onClick={agregarProductoManual}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Agregar al carrito
                </button>
              </div>
            )}
          </div>
        )}

        {panelAbierto === 'trabajo' && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setModoTrabajo('catalogo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoTrabajo === 'catalogo' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Del catálogo
              </button>
              <button
                onClick={() => setModoTrabajo('manual')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoTrabajo === 'manual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                Cargar a mano
              </button>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
                Modelo del equipo (opcional, ej. iPhone 13)
              </label>
              <input
                value={trabajoModelo}
                onChange={(e) => setTrabajoModelo(e.target.value)}
                placeholder="¿A qué iPhone se le hace el arreglo?"
                list="carpetas-stock-trabajo"
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <datalist id="carpetas-stock-trabajo">
                {carpetasStock.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">IMEI del equipo (opcional)</label>
              <input
                value={trabajoImei}
                onChange={(e) => setTrabajoImei(e.target.value)}
                placeholder="IMEI"
                inputMode="numeric"
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <SelectorColorAuto label="Color del equipo (opcional)" modelo={trabajoModelo} value={trabajoColor} onChange={setTrabajoColor} />

            <div className="flex flex-col gap-2 border-t border-border dark:border-dark-border pt-3">
              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">
                ¿Cómo entra el equipo? (para saber qué se garantiza al entregarlo)
              </p>
              <CheckTri label="Enciende" valor={trabajoEnciende} onChange={setTrabajoEnciende} />
              {ITEMS_CHECKLIST_INGRESO.map((item) => {
                const deshabilitado = CAMPOS_DEPENDEN_MODULO.includes(item.campo) && trabajoChecklist.modulo_ok === false;
                return (
                  <CheckTri
                    key={item.campo}
                    label={item.label}
                    disabled={deshabilitado}
                    valor={deshabilitado ? null : trabajoChecklist[item.campo] ?? null}
                    onChange={(v) => setTrabajoChecklist((p) => ({ ...p, [item.campo]: v }))}
                  />
                );
              })}
              <CheckTri label="Humedad / manipulación" valor={trabajoHumedad} onChange={setTrabajoHumedad} invertido />
              <textarea
                value={trabajoExcepcionGarantia}
                onChange={(e) => setTrabajoExcepcionGarantia(e.target.value)}
                placeholder='Excepción adicional a la garantía (opcional, ej. "por golpe fuerte, no garantizamos Face ID")'
                rows={2}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <TextoCondicionGenerado datos={datosChecklistTrabajo()} />
              <p className="text-[10px] text-muted dark:text-dark-text-secondary -mt-1">
                Al agregar el trabajo al carrito, este texto se suma solo a la nota de la boleta — la garantía general
                que ya configuraste en Configuración &gt; Datos del negocio sigue apareciendo igual, esto es aparte.
              </p>
            </div>

            {modoTrabajo === 'catalogo' ? (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {trabajos.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">
                    Todavía no cargaste trabajos en Servicio Técnico.
                  </p>
                )}
                {trabajos.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => agregarTrabajoDelCatalogo(t)}
                    className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 flex items-center justify-between text-left text-sm gap-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MiniaturaDispositivo src={t.imagen_url} size={28} />
                      <span className="truncate">{t.nombre}</span>
                    </span>
                    {t.precio != null && <span className="font-medium shrink-0">{moneda}{t.precio.toLocaleString('es-AR')}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={trabajoManualNombre}
                  onChange={(e) => setTrabajoManualNombre(e.target.value)}
                  placeholder="Nombre del arreglo"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={trabajoManualPrecio}
                  onChange={(e) => setTrabajoManualPrecio(sanitizarDecimal(e.target.value))}
                  placeholder="Precio"
                  inputMode="decimal"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={!trabajoManualNombre.trim()}
                  onClick={agregarTrabajoManual}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Agregar al carrito
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {carrito.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">El carrito está vacío. Agregá al menos un ítem.</p>
          )}
          {carrito.map((i) => (
            <div
              key={i.tempId}
              className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{i.descripcion}</p>
                <div className="flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary mt-0.5">
                  <input
                    value={i.cantidad}
                    onChange={(e) => actualizarCantidadItem(i.tempId, e.target.value)}
                    disabled={i.tipo === 'dispositivo'}
                    title={i.tipo === 'dispositivo' ? 'Un dispositivo del stock siempre se vende de a uno' : undefined}
                    inputMode="numeric"
                    className="w-12 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-1 py-0.5 text-xs text-center disabled:opacity-50"
                  />
                  <span>×</span>
                  <span>{moneda}</span>
                  <InputDecimal
                    value={i.precioUnitario}
                    onChange={(n) => actualizarPrecioItem(i.tempId, n)}
                    className="w-20 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-1 py-0.5 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium">{moneda}{(i.cantidad * i.precioUnitario).toLocaleString('es-AR')}</p>
                <button onClick={() => quitarDelCarrito(i.tempId)} className="text-xs text-bad underline">
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>

        {carrito.length > 0 && (
          <div className="flex items-center justify-between text-sm font-medium border-t border-border dark:border-dark-border pt-3">
            <span>Subtotal</span>
            <span>{moneda}{subtotal.toLocaleString('es-AR')}</span>
          </div>
        )}

        <button
          disabled={carrito.length === 0}
          onClick={() => {
            setAnticipo('');
            setImpuesto('');
            setStep('confirmar');
          }}
          className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          Continuar
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <button onClick={() => setStep('carrito')} className="text-2xl leading-none">
          &larr;
        </button>
        <span className="text-lg font-medium">Nueva orden · Confirmar</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted dark:text-dark-text-secondary">Cliente:</span>{' '}
          {modoCliente === 'existente' ? `${clienteElegido?.nombre} ${clienteElegido?.apellido || ''}` : nuevoNombre}
        </p>
        <p>
          <span className="text-muted dark:text-dark-text-secondary">Ítems:</span> {carrito.length}
        </p>
      </div>

      {monedasDisponibles.length > 1 && (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <span className="text-sm font-medium">¿En qué moneda mostrar el monto en la boleta?</span>
          <div className="flex gap-2">
            {([
              { v: 'principal', t: `Solo ${simboloMoneda(monedasDisponibles[0])}` },
              { v: 'secundaria', t: `Solo ${simboloMoneda(monedasDisponibles[1])}` },
              { v: 'ambas', t: 'Ambas' },
            ] as const).map((op) => (
              <button
                key={op.v}
                type="button"
                onClick={() => {
                  setBoletaMoneda(op.v);
                  setMontoSecundarioTocado(false);
                }}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  boletaMoneda === op.v
                    ? 'bg-accent dark:bg-dark-accent text-white'
                    : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {op.t}
              </button>
            ))}
          </div>
          {muestraSecundaria && (
            <>
              <label className="text-xs text-muted dark:text-dark-text-secondary mt-1">
                Monto en {monedasDisponibles[1]} (calculado con tu tipo de cambio, lo podés corregir)
              </label>
              <input
                value={montoSecundario}
                onChange={(e) => {
                  setMontoSecundario(e.target.value);
                  setMontoSecundarioTocado(true);
                }}
                inputMode="decimal"
                placeholder={`Monto en ${monedasDisponibles[1]}`}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                Las Estadísticas siempre se calculan en {monedasDisponibles[0]} (tu moneda principal). Esto solo cambia
                cómo se ve la boleta del cliente.
              </p>
            </>
          )}
        </div>
      )}

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Vendedor</label>
        <select
          value={vendedorId}
          onChange={(e) => setVendedorId(e.target.value)}
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        >
          <option value="" disabled>
            Elegí quién atendió esta venta...
          </option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
            </option>
          ))}
        </select>
        {!vendedorId && vendedores.length > 0 && (
          <p className="text-[10px] text-warn mt-1">
            Es obligatorio para poder confirmar la orden — así no queda como "Sin asignar" en Estadísticas.
          </p>
        )}
        {vendedores.length === 0 && (
          <p className="text-[10px] text-muted dark:text-dark-text-secondary mt-1">
            Todavía no cargaste vendedores en Configuración — podés confirmar sin elegir uno, pero después no vas a
            poder saber quién hizo esta venta en Estadísticas.
          </p>
        )}
      </div>

      {planes.length > 0 && subtotal > 0 && (
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Plan de pago</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCuotasElegidas(0)}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                cuotasElegidas === 0 ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              Contado
              <span className="block text-[10px] opacity-80 font-normal">ahora · sin recargo</span>
            </button>
            {planes.map((p) => (
              <button
                key={p.cuotas}
                onClick={() => setCuotasElegidas(p.cuotas)}
                className={`rounded-xl px-3 py-2 text-sm font-medium text-center ${
                  cuotasElegidas === p.cuotas ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {etiquetaCuotas(p.cuotas)}
                <span className="block text-[10px] opacity-80 font-normal">
                  de {moneda}{Math.round(valorCuota(subtotal, p.cuotas, p.interes)).toLocaleString('es-AR')}
                </span>
              </button>
            ))}
          </div>
          {cuotasElegidas >= 1 && (
            <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">
              {cuotasElegidas === 1 ? 'Paga a ~1 mes: ' : ''}
              {etiquetaCuotas(cuotasElegidas)} de {moneda}
              {Math.round(valorCuota(subtotal, cuotasElegidas, interesPlan)).toLocaleString('es-AR')} · total financiado{' '}
              {moneda}{Math.round(subtotalFinanciado).toLocaleString('es-AR')} (interés {interesPlan}%)
            </p>
          )}
        </div>
      )}

      {comisionesActivas && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-muted dark:text-dark-text-secondary">Tipo de venta</label>
          <div className="inline-flex items-center gap-1 rounded-xl bg-canvas dark:bg-dark-bg p-0.5">
            {(['minorista', 'mayorista'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipoVenta(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  tipoVenta === t
                    ? 'bg-white dark:bg-dark-surface-elevated text-ink dark:text-dark-text shadow-card'
                    : 'text-muted dark:text-dark-text-secondary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted dark:text-dark-text-secondary">Cómo se paga</label>
          <button
            onClick={() => {
              const nuevo = !pagoMixto;
              setPagoMixto(nuevo);
              if (nuevo && lineasPago.length === 0) {
                setLineasPago([{ tempId: idTemporal(), medio: 'efectivo', monto: total > 0 ? String(Math.round(total)) : '' }]);
              }
            }}
            className="text-xs text-accent dark:text-dark-accent underline"
          >
            {pagoMixto ? 'Un solo medio' : 'Dividir en varios (mixto)'}
          </button>
        </div>

        {!pagoMixto ? (
          <div className="flex flex-wrap gap-2">
            {MEDIOS_PAGO.map((m) => (
              <button
                key={m.codigo}
                onClick={() => setMedioSimple(m.codigo)}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  medioSimple === m.codigo ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {m.icono} {m.label}
              </button>
            ))}
            {ctaCteDisponible && (
              <button
                onClick={() => setMedioSimple(CUENTA_CORRIENTE)}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  medioSimple === CUENTA_CORRIENTE ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                📒 Cuenta corriente
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {lineasPago.map((l) => (
              <div key={l.tempId} className="flex gap-2 items-center">
                <select
                  value={l.medio}
                  onChange={(e) => actualizarLineaPago(l.tempId, 'medio', e.target.value)}
                  className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-2 text-sm"
                >
                  {MEDIOS_PAGO.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.label}
                    </option>
                  ))}
                  {ctaCteDisponible && <option value={CUENTA_CORRIENTE}>Cuenta corriente</option>}
                </select>
                <input
                  value={l.monto}
                  onChange={(e) => actualizarLineaPago(l.tempId, 'monto', sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  placeholder="Monto"
                  className="w-28 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button onClick={() => quitarLineaPago(l.tempId)} className="text-bad text-xs font-medium shrink-0">
                  Quitar
                </button>
              </div>
            ))}
            <button
              onClick={agregarLineaPago}
              className="rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
            >
              + Agregar medio
            </button>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted dark:text-dark-text-secondary">Asignado</span>
              <span className={asignacionOk ? 'text-good font-medium' : 'text-warn font-medium'}>
                {moneda}{Math.round(montoAsignado).toLocaleString('es-AR')} / {moneda}{Math.round(total).toLocaleString('es-AR')}
                {asignacionOk ? ' ✓' : ''}
              </span>
            </div>
            {!asignacionOk && restantePorAsignar > 0 && ctaCteDisponible && (
              <button
                onClick={() =>
                  setLineasPago((ls) => [
                    ...ls,
                    { tempId: idTemporal(), medio: CUENTA_CORRIENTE, monto: String(Math.round(restantePorAsignar)) },
                  ])
                }
                className="text-xs text-accent dark:text-dark-accent underline self-start"
              >
                Poner el resto ({moneda}{Math.round(restantePorAsignar).toLocaleString('es-AR')}) en cuenta corriente
              </button>
            )}
            {!asignacionOk && (
              <p className="text-[10px] text-warn">
                La suma de los medios tiene que dar el total.{' '}
                {restantePorAsignar > 0
                  ? `Falta asignar ${moneda}${Math.round(restantePorAsignar).toLocaleString('es-AR')}.`
                  : `Te pasaste por ${moneda}${Math.round(-restantePorAsignar).toLocaleString('es-AR')}.`}
              </p>
            )}
          </div>
        )}

        {ctaCteDisponible && montoCuentaCorriente > 0 && (
          <div className="rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border px-3 py-2 text-xs flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-muted dark:text-dark-text-secondary">📒 Queda debiendo</span>
              <span className="font-medium">{moneda}{Math.round(montoCuentaCorriente).toLocaleString('es-AR')}</span>
            </div>
            {saldoCliente > 0 && (
              <div className="flex justify-between">
                <span className="text-muted dark:text-dark-text-secondary">Saldo anterior</span>
                <span>{moneda}{Math.round(saldoCliente).toLocaleString('es-AR')}</span>
              </div>
            )}
            {clienteElegido?.limite_credito != null && (
              <div className="flex justify-between">
                <span className="text-muted dark:text-dark-text-secondary">Límite de crédito</span>
                <span>{moneda}{Math.round(clienteElegido.limite_credito).toLocaleString('es-AR')}</span>
              </div>
            )}
            {excedeLimite && (
              <p className="text-bad">
                Supera el límite de crédito (disponible {moneda}
                {Math.round(Math.max(0, creditoDisponible)).toLocaleString('es-AR')}). No se puede confirmar hasta
                cobrarle o subirle el límite.
              </p>
            )}
          </div>
        )}

        {clienteElegido && !ctaCteDisponible && (
          <p className="text-[10px] text-muted dark:text-dark-text-secondary">
            {clienteElegido.suspendido
              ? 'Este cliente está suspendido para cuenta corriente.'
              : 'Para venderle a cuenta corriente (fiado), primero habilitá su cuenta corriente desde la ficha del cliente.'}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Anticipo</label>
          <input
            value={anticipo}
            onChange={(e) => setAnticipo(sanitizarDecimal(e.target.value))}
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Impuesto %</label>
          <input
            value={impuesto}
            onChange={(e) => setImpuesto(sanitizarDecimal(e.target.value))}
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
          Nota para la boleta (opcional)
        </label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Ej. el equipo tiene un detalle en la pantalla, se vende igual con este descuento"
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex items-center justify-between gap-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={incluirGarantia}
            onChange={(e) => setIncluirGarantia(e.target.checked)}
            className="h-5 w-5 accent-ink"
          />
          <span className="text-sm font-medium">Incluir el texto de garantía en la boleta</span>
        </label>
        <Link
          href="/configuracion/negocio"
          target="_blank"
          className="text-xs text-accent dark:text-dark-accent underline shrink-0"
        >
          Editar texto
        </Link>
      </div>

      <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={canjeActivo}
            onChange={(e) => setCanjeActivo(e.target.checked)}
            className="h-5 w-5 accent-ink"
          />
          <span className="text-sm font-medium">Plan canje: recibo uno o más dispositivos como parte de pago</span>
        </label>

        {canjesCarrito.length > 0 && (
          <div className="flex flex-col gap-2">
            {canjesCarrito.map((c, idx) => (
              <div
                key={c.tempId}
                className="rounded-lg border border-border dark:border-dark-border px-3 py-2 flex items-center justify-between gap-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {canjesCarrito.length > 1 ? `${idx + 1}. ` : ''}
                    {c.modelo}
                    {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                    {c.color ? ` · ${c.color}` : ''}
                  </p>
                  {c.imei && <p className="text-xs text-muted dark:text-dark-text-secondary font-mono">IMEI: {c.imei}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted dark:text-dark-text-secondary">{moneda}</span>
                  <input
                    value={c.monto}
                    onChange={(e) => actualizarMontoCanje(c.tempId, sanitizarDecimal(e.target.value))}
                    inputMode="decimal"
                    placeholder="Monto"
                    className="w-24 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded px-2 py-1 text-sm"
                  />
                  <button onClick={() => quitarCanje(c.tempId)} className="text-bad text-xs font-medium">
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {canjeActivo && (
          <div className="flex flex-col gap-2">
            <input
              value={canjeModelo}
              onChange={(e) => setCanjeModelo(e.target.value)}
              placeholder="Modelo del dispositivo entregado"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
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
            <input
              value={canjeBateria}
              onChange={(e) => setCanjeBateria(e.target.value)}
              placeholder="Batería %"
              inputMode="numeric"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={canjeImei}
              onChange={(e) => setCanjeImei(e.target.value)}
              placeholder="IMEI"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <input
              value={canjeMonto}
              onChange={(e) => setCanjeMonto(sanitizarDecimal(e.target.value))}
              placeholder="Monto reconocido"
              inputMode="decimal"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              value={canjeDetalles}
              onChange={(e) => setCanjeDetalles(e.target.value)}
              placeholder="Detalles del dispositivo (ej. no anda el parlante, módulo con detalle)"
              rows={3}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={agregarCanje}
              disabled={!canjeModelo.trim()}
              className="rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
            >
              + Agregar este dispositivo
            </button>
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              El monto reconocido ya se descuenta del total y el dispositivo se guarda en Plan Canje al confirmar la orden (no entra directo al stock). Usá <span className="font-medium">+ Agregar este dispositivo</span> solo si vas a cargar más de uno.
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Estado</label>
        <div className="flex gap-2">
          {ESTADOS_ORDEN.map((e) => (
            <button
              key={e}
              onClick={() => setEstadoOrden(e)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize ${
                estadoOrden === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-lg font-medium border-t border-border dark:border-dark-border pt-3">
        <span>Total</span>
        <span>{moneda}{total.toLocaleString('es-AR')}</span>
      </div>

      {puedeRecibirServicioTecnico && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-400/10 dark:border-amber-400/50 p-4 flex flex-col gap-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={derivarActivo}
              onChange={toggleDerivar}
              className="h-5 w-5 accent-amber-500 mt-0.5 shrink-0"
            />
            <span>
              <span className="font-semibold text-amber-900 dark:text-amber-300">🔧 Derivar a Servicio Técnico al confirmar</span>
              <span className="block text-xs text-amber-800/90 dark:text-amber-300/70 mt-0.5">
                El equipo pasa directo a reparación al hacer la boleta. Recomendado para celulares que se venden con
                batería baja (ej.: subir batería de un equipo que el cliente ya compró y está esperando).
              </span>
            </span>
          </label>

          {derivarActivo && (
            <div className="flex flex-col gap-2 mt-1">
              {derivaciones.length > 1 && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Tildá los equipos que van a Servicio Técnico. Podés derivar varios de una misma boleta.
                </p>
              )}
              {derivaciones.map((der) => {
                const resumen = `${der.modelo}${der.capacidad ? ` · ${der.capacidad}GB` : ''}${der.color ? ` · ${der.color}` : ''}${
                  der.imei.trim() ? ` · IMEI ${der.imei.trim()}` : ''
                }`;
                return (
                  <div
                    key={der.key}
                    className={`rounded-lg border p-3 flex flex-col gap-2 ${
                      der.incluir
                        ? 'bg-white/70 dark:bg-white/5 border-amber-300/70 dark:border-amber-400/30'
                        : 'bg-transparent border-amber-200/60 dark:border-amber-400/15 opacity-70'
                    }`}
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={der.incluir}
                        onChange={(e) => actualizarDerivacion(der.key, { incluir: e.target.checked })}
                        className="h-4 w-4 accent-amber-500 mt-0.5 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-amber-950 dark:text-amber-100 break-words">
                          {der.modelo.trim() ? resumen : 'Equipo a cargar'}
                        </span>
                        {der.desdeTrabajo && (
                          <span className="block text-[11px] text-amber-700/80 dark:text-amber-300/70">Equipo de la ficha técnica (lleva su checklist)</span>
                        )}
                      </span>
                      {der.incluir && der.modelo.trim() && !der.editar && (
                        <button
                          type="button"
                          onClick={() => actualizarDerivacion(der.key, { editar: true })}
                          className="shrink-0 text-xs text-amber-800 dark:text-amber-300 underline"
                        >
                          Cambiar
                        </button>
                      )}
                    </label>

                    {der.incluir && (
                      <div className="flex flex-col gap-2 pl-6">
                        {(der.editar || !der.modelo.trim()) && (
                          <>
                            <input
                              value={der.modelo}
                              onChange={(e) => actualizarDerivacion(der.key, { modelo: e.target.value })}
                              placeholder="Modelo del equipo (ej. iPhone 14)"
                              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                            />
                            <div className="flex gap-2">
                              {STORAGE_OPTIONS.map((gb) => (
                                <button
                                  key={gb}
                                  type="button"
                                  onClick={() => actualizarDerivacion(der.key, { capacidad: gb })}
                                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                                    der.capacidad === gb ? 'bg-amber-400 text-amber-950' : 'border border-border dark:border-dark-border'
                                  }`}
                                >
                                  {gb}GB
                                </button>
                              ))}
                            </div>
                            <SelectorColorAuto modelo={der.modelo} value={der.color} onChange={(v) => actualizarDerivacion(der.key, { color: v })} />
                            <input
                              value={der.imei}
                              onChange={(e) => actualizarDerivacion(der.key, { imei: e.target.value })}
                              placeholder="IMEI (opcional)"
                              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                            />
                          </>
                        )}
                        <input
                          value={der.motivo}
                          onChange={(e) => actualizarDerivacion(der.key, { motivo: e.target.value })}
                          placeholder="¿Qué se le hace? (ej. subir batería, cambiar módulo)"
                          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                        />
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={der.prioritario}
                            onChange={(e) => actualizarDerivacion(der.key, { prioritario: e.target.checked })}
                            className="h-4 w-4 accent-amber-500"
                          />
                          <span className="text-amber-900 dark:text-amber-200">Prioritario — el cliente está esperando</span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!puedeVender && (
        <p className="text-xs text-bad text-center">No tenés permiso para crear órdenes.</p>
      )}
      <button
        disabled={!puedeConfirmar || guardando}
        onClick={handleConfirmar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? 'Creando orden...' : 'Confirmar orden'}
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
