'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useT } from '../../lib/idioma';
import { asegurarModelo, normalizarNombreModelo } from '../../lib/modelos';
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
import { crearPlanFinanciacion } from '../../lib/financiacion/servicio';
import { generarCronograma, sumarMesConClamp, aFechaISO } from '../../lib/financiacion/motor';
import { decimalesMoneda } from '../../lib/monedas';
import { generarComisionesAccion } from '../../comisiones/acciones';
import CampoFecha from '../../CampoFecha';
import { ITEMS_CHECKLIST_INGRESO, CAMPOS_DEPENDEN_MODULO, generarTextoCondicionIngreso } from '../../lib/reparaciones';
import SelectorColorAuto from '../../SelectorColorAuto';
import SelectorEstadoDispositivo from '../../SelectorEstadoDispositivo';
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
type Producto = { id: string; nombre: string; precio: number | null; imagen_url: string | null };
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
  const puedeGestionarFinanciacion = tienePermiso(actorActual, 'gestionar_financiacion');
  const t = useT();

  const [step, setStep] = useState<'cliente' | 'carrito' | 'confirmar'>('cliente');

  // --- cliente ---
  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo' | 'consumidor_final'>('existente');
  const [buscarCliente, setBuscarCliente] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoDomicilio, setNuevoDomicilio] = useState('');
  const [nuevoDni, setNuevoDni] = useState('');
  // Habilitar cuenta corriente sin salir de la venta — antes había que ir a
  // la ficha del cliente, habilitarla ahí, y volver a Nueva Orden. Es la
  // financiación "propia" del local (a diferencia de las cuotas con interés
  // fijo de más abajo): un límite y un plazo que decide el vendedor.
  const [habilitandoCta, setHabilitandoCta] = useState(false);
  const [limiteCtaInline, setLimiteCtaInline] = useState('');
  const [plazoCtaInline, setPlazoCtaInline] = useState('30');
  const [guardandoCtaInline, setGuardandoCtaInline] = useState(false);

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
  const [nuevoEstadoDispositivo, setNuevoEstadoDispositivo] = useState('usado');
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
  // Si la consulta del saldo falla, NO hay que asumir saldo 0 — eso
  // habilitaría crédito de más a un cliente que en realidad está al límite
  // (o suspendido). Bloquea "Cuenta corriente" como medio hasta confirmarlo.
  const [saldoClienteError, setSaldoClienteError] = useState(false);
  const [anticipo, setAnticipo] = useState('');
  const [impuesto, setImpuesto] = useState('');
  const [estadoOrden, setEstadoOrden] = useState('pendiente');
  const [nota, setNota] = useState('');
  const [incluirGarantia, setIncluirGarantia] = useState(true);

  // Financiación propia en cuotas (con cronograma y vencimientos propios —
  // distinta del recargo fijo de "Plan de pago" de más arriba). Solo tiene
  // sentido si una parte de la venta queda en cuenta corriente: en vez de un
  // solo cargo grande, genera un cargo por cuota, cada uno con su vencimiento.
  const [financiarActivo, setFinanciarActivo] = useState(false);
  const [financiarCuotas, setFinanciarCuotas] = useState('3');
  const [financiarPrimeraFecha, setFinanciarPrimeraFecha] = useState('');

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
  // solo US$, 'ambas' = US$ + una línea de referencia en pesos. ("solo
  // pesos" existió y se sacó: convertía cada línea con un factor derivado
  // del total, y esa cuenta no cerraba bien apenas había anticipo/canje/
  // cuotas de por medio.)
  const [boletaMoneda, setBoletaMoneda] = useState<'principal' | 'ambas'>('principal');
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
      const data = await obtenerTodasLasFilas<Cliente>(
        supabase,
        'clientes',
        'id, nombre, apellido, telefono, cta_cte_habilitada, limite_credito, plazo_dias, suspendido'
      );
      setClientes(data);
      // Si se llega acá desde "Nueva venta" en la ficha de un cliente
      // (?clienteId=...), ese cliente ya viene elegido — no tiene sentido
      // hacerlo elegir de nuevo. Se lee de window (no useSearchParams) para
      // no depender de un Suspense boundary, mismo criterio ya usado en
      // stock/nuevo, servicio-tecnico y admin/negocios.
      const clienteIdPreseleccionado = new URLSearchParams(window.location.search).get('clienteId');
      if (clienteIdPreseleccionado) {
        const match = data.find((c) => c.id === clienteIdPreseleccionado);
        if (match) {
          setClienteElegido(match);
          setStep('carrito');
        }
      }
    })();
    (async () => {
      // OJO: antes esto era un select() sin paginar. PostgREST corta en
      // 1000 filas por defecto sin avisar — con más de 1000 dispositivos
      // en stock, los que quedaban afuera de esa primera página eran
      // directamente invisibles acá (no se podían vender). obtenerTodasLasFilas
      // pagina hasta traer todo.
      const data = await obtenerTodasLasFilas<Dispositivo>(
        supabase,
        'dispositivos',
        'id, modelo, capacidad_gb, color, precio, imei, salud_bateria',
        [],
        (q) => q.eq('en_stock', true)
      );
      setDispositivosStock(data);
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
      const { data } = await supabase.from('trabajos').select('*').eq('activo', true).order('nombre');
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
      setSaldoClienteError(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('cta_cte_movimientos')
        .select('tipo, monto')
        .eq('cliente_id', clienteElegido.id)
        .eq('anulado', false);
      if (error) {
        setSaldoClienteError(true);
        setSaldoCliente(0);
        return;
      }
      setSaldoClienteError(false);
      setSaldoCliente(calcularSaldo((data as { tipo: string; monto: number }[]) ?? []));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteElegido?.id]);

  const ctaCteDisponible = !!clienteElegido?.cta_cte_habilitada && !clienteElegido?.suspendido && !saldoClienteError;

  // Si el cliente no tiene cuenta corriente (o cambió a uno que no la
  // tiene), no dejar "Cuenta corriente" elegido en modo simple.
  useEffect(() => {
    if (!ctaCteDisponible && medioSimple === CUENTA_CORRIENTE) setMedioSimple('efectivo');
  }, [ctaCteDisponible, medioSimple]);

  const habilitarCtaCteInline = async () => {
    if (!clienteElegido || !puedeVender) return;
    setGuardandoCtaInline(true);
    const cambios = {
      cta_cte_habilitada: true,
      limite_credito: limiteCtaInline ? Number(limiteCtaInline) : null,
      plazo_dias: plazoCtaInline ? Number(plazoCtaInline) : null,
    };
    const { error } = await supabase.from('clientes').update(cambios).eq('id', clienteElegido.id);
    setGuardandoCtaInline(false);
    if (error) {
      alert(t('No pudimos habilitar la cuenta corriente:') + ' ' + error.message);
      return;
    }
    setClienteElegido((prev) => (prev ? { ...prev, ...cambios } : prev));
    setClientes((prev) => prev.map((c) => (c.id === clienteElegido.id ? { ...c, ...cambios } : c)));
    setHabilitandoCta(false);
    // La queda seleccionada de una — si no, había que habilitarla y ENCIMA
    // acordarse de tocar el botón que recién apareció.
    if (!pagoMixto) setMedioSimple(CUENTA_CORRIENTE);
  };

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

  const financiarCuotasNum = Math.max(1, Math.floor(Number(financiarCuotas) || 0));
  const financiarCronogramaValido = financiarActivo ? financiarCuotasNum > 0 && !!financiarPrimeraFecha : true;
  const previewFinanciacion = useMemo(() => {
    if (!financiarActivo || montoCuentaCorriente <= 0 || financiarCuotasNum <= 0 || !financiarPrimeraFecha) return null;
    try {
      return generarCronograma({
        importeFinanciado: montoCuentaCorriente,
        cantidadCuotas: financiarCuotasNum,
        primeraFecha: financiarPrimeraFecha,
        decimales: decimalesMoneda(monedaOrden),
      });
    } catch {
      return null;
    }
  }, [financiarActivo, montoCuentaCorriente, financiarCuotasNum, financiarPrimeraFecha, monedaOrden]);

  const elegirCliente = (c: Cliente) => {
    setModoCliente('existente');
    setClienteElegido(c);
    setStep('carrito');
  };

  const confirmarClienteNuevo = () => {
    if (!nuevoNombre.trim()) return;
    setStep('carrito');
  };

  // Venta rápida sin cargar datos de cliente (ej. un cargador o un chip
  // suelto) — no se le puede ofrecer cuenta corriente/financiación después
  // porque ctaCteDisponible y el resto de esa lógica dependen de
  // clienteElegido, que acá queda en null a propósito.
  const elegirConsumidorFinal = () => {
    setModoCliente('consumidor_final');
    setClienteElegido(null);
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
    const actorDispositivo = getActor();
    const modeloNormalizado = normalizarNombreModelo(nuevoModelo.trim());
    const { data, error: dErr } = await supabase
      .from('dispositivos')
      .insert({
        modelo: modeloNormalizado,
        capacidad_gb: nuevaCapacidad,
        color: nuevoColor.trim() || null,
        imei: limpiarImei(nuevoImeiDispositivo),
        precio: nuevoPrecioDispositivo ? Number(nuevoPrecioDispositivo) : null,
        estado: nuevoEstadoDispositivo,
        en_stock: true,
        agregado_por_nombre: actorDispositivo?.nombre ?? null,
        agregado_por_foto_url: actorDispositivo?.fotoUrl ?? null,
      })
      .select()
      .single();
    setCargandoDispositivo(false);
    if (dErr || !data) {
      setError(t('No pudimos cargar el dispositivo:') + ' ' + (dErr?.message || ''));
      return;
    }
    await asegurarModelo(supabase, modeloNormalizado);
    setDispositivosStock((s) => [...s, data as Dispositivo]);
    agregarDispositivoDelStock(data as Dispositivo);
    setNuevoModelo('');
    setNuevaCapacidad(null);
    setNuevoColor('');
    setNuevoEstadoDispositivo('usado');
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

  const agregarTrabajoDelCatalogo = (trab: Trabajo) => {
    setCarrito((c) => [
      ...c,
      { tempId: idTemporal(), descripcion: descripcionTrabajo(trab.nombre), cantidad: 1, precioUnitario: trab.precio ?? 0, tipo: 'trabajo' },
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
    (montoCuentaCorriente <= 0 || ctaCteDisponible) &&
    (montoCuentaCorriente <= 0 || !financiarActivo || (financiarCronogramaValido && !!previewFinanciacion));

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
            t('Uno o más de estos dispositivos ya se vendieron en otra orden. Volvé a la pantalla anterior y actualizá el carrito.')
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
        if (cErr || !data) throw new Error(cErr?.message || t('no se pudo cargar el cliente'));
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
      if (oErr || !orden) throw new Error(oErr?.message || t('no se pudo crear la orden'));
      ordenCreadaId = orden.id;

      if (canjesEfectivos.length > 0) {
        const { error: canjesErr } = await supabase.from('canjes').insert(
          canjesEfectivos.map((c) => ({
            orden_id: orden.id,
            modelo: c.modelo ? normalizarNombreModelo(c.modelo) : c.modelo,
            capacidad_gb: c.capacidad_gb,
            color: c.color.trim() || null,
            imei: limpiarImei(c.imei),
            salud_bateria: c.salud_bateria ? Number(c.salud_bateria) : null,
            detalles: c.detalles.trim() || null,
            monto: c.monto ? Number(c.monto) : null,
            vendedor_id: vendedorId || null,
          }))
        );
        if (canjesErr) throw new Error(canjesErr.message || t('no se pudieron cargar los dispositivos de canje'));
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
        if (financiarActivo && previewFinanciacion) {
          // Financiación propia en cuotas: en vez de un solo cargo, el plan
          // genera un cargo POR CUOTA en cta_cte_movimientos (cada uno con su
          // propio vencimiento) — ver financiacion_crear_plan() en la migración.
          const resultadoPlan = await crearPlanFinanciacion(supabase, {
            clienteId,
            ordenId: orden.id,
            moneda: monedaOrden,
            importeOriginal: montoCuentaCorriente,
            entregaInicial: 0,
            cantidadCuotas: financiarCuotasNum,
            primeraFecha: financiarPrimeraFecha,
            observaciones: 'Financiación generada al confirmar la orden.',
          });
          if ('error' in resultadoPlan) throw new Error(t('No pudimos crear el plan de financiación:') + ' ' + resultadoPlan.error);
        } else {
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
          alert(`⚠️ ${t('La orden se guardó, pero no pudimos derivar')} "${der.modelo.trim()}" ${t('a Servicio Técnico:')} ${repErr.message}`);
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
            alert(`⚠️ ${t('No se pudo generar la comisión:')} ` + rc.error);
          } else if (rc.generadas === 0 && rc.motivo && !motivosSilenciosos.includes(rc.motivo)) {
            alert(`⚠️ ${t('Esta venta no generó comisión:')} ` + rc.motivo + '.');
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
      setError(t('No pudimos crear la orden:') + ' ' + (err?.message || t('error desconocido')));
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
          <span className="text-lg font-medium">{t('Nueva orden')} · {t('Cliente')}</span>
        </header>

        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setModoCliente('existente')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'existente' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t('Cliente existente')}
          </button>
          <button
            onClick={() => setModoCliente('nuevo')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'nuevo' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t('Cargar nuevo')}
          </button>
        </div>

        <button
          onClick={elegirConsumidorFinal}
          className="w-full rounded-xl py-2 text-sm font-medium border border-dashed border-border dark:border-dark-border text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text hover:border-accent dark:hover:border-dark-accent transition-colors"
        >
          {t('Consumidor final (sin cargar datos)')}
        </button>

        {modoCliente === 'existente' ? (
          <>
            <input
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              placeholder={t('Buscar por nombre o teléfono...')}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex flex-col gap-2">
              {clientesFiltrados.length === 0 && (
                <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">{t('No encontramos clientes con esa búsqueda.')}</p>
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
            <Campo label={t('Nombre')} valor={nuevoNombre} onChange={setNuevoNombre} />
            <Campo label={t('Apellido')} valor={nuevoApellido} onChange={setNuevoApellido} />
            <Campo label={t('Teléfono')} valor={nuevoTelefono} onChange={setNuevoTelefono} />
            <Campo label={t('Domicilio')} valor={nuevoDomicilio} onChange={setNuevoDomicilio} />
            <Campo label={t('DNI')} valor={nuevoDni} onChange={setNuevoDni} />
            <button
              disabled={!nuevoNombre.trim()}
              onClick={confirmarClienteNuevo}
              className="mt-2 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
            >
              {t('Continuar')}
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
          <span className="text-lg font-medium">{t('Nueva orden')} · {t('Ítems')}</span>
        </header>

        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'dispositivo' ? null : 'dispositivo')}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-3 text-sm font-medium"
          >
            + {t('Dispositivo')}
          </button>
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'producto' ? null : 'producto')}
            className="flex-1 rounded-xl border border-border dark:border-dark-border py-3 text-sm font-medium"
          >
            + {t('Accesorio / producto')}
          </button>
          <button
            onClick={() => setPanelAbierto(panelAbierto === 'trabajo' ? null : 'trabajo')}
            className="flex-1 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/50 py-3 text-sm font-semibold flex items-center justify-center gap-1.5"
          >
            🔧 {t('Servicio técnico')}
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
                {t('Del stock')}
              </button>
              <button
                onClick={() => setModoDispositivo('nuevo')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoDispositivo === 'nuevo' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {t('Cargar nuevo')}
              </button>
            </div>

            {modoDispositivo === 'stock' ? (
              <>
                <input
                  value={buscarDispositivo}
                  onChange={(e) => setBuscarDispositivo(e.target.value)}
                  placeholder={t('Buscar por modelo o IMEI...')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {dispositivosFiltrados.length === 0 && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">{t('No hay dispositivos disponibles.')}</p>
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
                  placeholder={t('Modelo (ej. iPhone 13)')}
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
                <SelectorEstadoDispositivo value={nuevoEstadoDispositivo} onChange={setNuevoEstadoDispositivo} />
                <input
                  value={nuevoImeiDispositivo}
                  onChange={(e) => setNuevoImeiDispositivo(e.target.value)}
                  placeholder={t('IMEI')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <input
                  value={nuevoPrecioDispositivo}
                  onChange={(e) => setNuevoPrecioDispositivo(sanitizarDecimal(e.target.value))}
                  placeholder={t('Precio')}
                  inputMode="decimal"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={!nuevoModelo.trim() || cargandoDispositivo}
                  onClick={agregarDispositivoNuevo}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {cargandoDispositivo ? t('Agregando...') : t('Agregar al carrito')}
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
                {t('Del catálogo')}
              </button>
              <button
                onClick={() => setModoProducto('manual')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoProducto === 'manual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {t('Cargar a mano')}
              </button>
            </div>

            {modoProducto === 'catalogo' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {productos.length === 0 && (
                  <p className="col-span-full text-xs text-muted dark:text-dark-text-secondary text-center py-2">
                    {t('Todavía no cargaste productos en Stock > Accesorios.')}
                  </p>
                )}
                {productos.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => agregarProductoDelCatalogo(p)}
                    className="group rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-2.5 flex flex-col items-center gap-1 text-center"
                  >
                    <span className="block animate-flotar" style={{ animationDelay: `${(i % 3) * 0.4}s` }}>
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imagen_url}
                          alt=""
                          className="h-16 w-16 object-contain transition-transform duration-300 ease-out group-hover:animate-vaivenLateral"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-canvas dark:bg-dark-bg flex items-center justify-center text-2xl">📦</div>
                      )}
                    </span>
                    <span className="text-xs font-medium leading-tight line-clamp-2">{p.nombre}</span>
                    {p.precio != null && <span className="text-xs font-semibold">{moneda}{p.precio.toLocaleString('es-AR')}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={productoManualNombre}
                  onChange={(e) => setProductoManualNombre(e.target.value)}
                  placeholder={t('Nombre del ítem')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <input
                    value={productoManualCantidad}
                    onChange={(e) => setProductoManualCantidad(e.target.value)}
                    placeholder={t('Cantidad')}
                    inputMode="numeric"
                    className="w-1/3 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={productoManualPrecio}
                    onChange={(e) => setProductoManualPrecio(sanitizarDecimal(e.target.value))}
                    placeholder={t('Precio unitario')}
                    inputMode="decimal"
                    className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  disabled={!productoManualNombre.trim()}
                  onClick={agregarProductoManual}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {t('Agregar al carrito')}
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
                {t('Del catálogo')}
              </button>
              <button
                onClick={() => setModoTrabajo('manual')}
                className={`flex-1 rounded-lg py-2 font-medium ${
                  modoTrabajo === 'manual' ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {t('Cargar a mano')}
              </button>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
                {t('Modelo del equipo (opcional, ej. iPhone 13)')}
              </label>
              <input
                value={trabajoModelo}
                onChange={(e) => setTrabajoModelo(e.target.value)}
                placeholder={t('¿A qué iPhone se le hace el arreglo?')}
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
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('IMEI del equipo (opcional)')}</label>
              <input
                value={trabajoImei}
                onChange={(e) => setTrabajoImei(e.target.value)}
                placeholder={t('IMEI')}
                inputMode="numeric"
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <SelectorColorAuto label={t('Color del equipo (opcional)')} modelo={trabajoModelo} value={trabajoColor} onChange={setTrabajoColor} />

            <div className="flex flex-col gap-2 border-t border-border dark:border-dark-border pt-3">
              <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">
                {t('¿Cómo entra el equipo? (para saber qué se garantiza al entregarlo)')}
              </p>
              <CheckTri label={t('Enciende')} valor={trabajoEnciende} onChange={setTrabajoEnciende} />
              {ITEMS_CHECKLIST_INGRESO.map((item) => {
                const deshabilitado = CAMPOS_DEPENDEN_MODULO.includes(item.campo) && trabajoChecklist.modulo_ok === false;
                return (
                  <CheckTri
                    key={item.campo}
                    label={t(item.label)}
                    disabled={deshabilitado}
                    valor={deshabilitado ? null : trabajoChecklist[item.campo] ?? null}
                    onChange={(v) => setTrabajoChecklist((p) => ({ ...p, [item.campo]: v }))}
                  />
                );
              })}
              <CheckTri label={t('Humedad / manipulación')} valor={trabajoHumedad} onChange={setTrabajoHumedad} invertido />
              <textarea
                value={trabajoExcepcionGarantia}
                onChange={(e) => setTrabajoExcepcionGarantia(e.target.value)}
                placeholder={t('Excepción adicional a la garantía (opcional, ej. "por golpe fuerte, no garantizamos Face ID")')}
                rows={2}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <TextoCondicionGenerado datos={datosChecklistTrabajo()} />
              <p className="text-[10px] text-muted dark:text-dark-text-secondary -mt-1">
                {t('Al agregar el trabajo al carrito, este texto se suma solo a la nota de la boleta — la garantía general que ya configuraste en Configuración > Datos del negocio sigue apareciendo igual, esto es aparte.')}
              </p>
            </div>

            {modoTrabajo === 'catalogo' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {trabajos.length === 0 && (
                  <p className="col-span-full text-xs text-muted dark:text-dark-text-secondary text-center py-2">
                    {t('Todavía no cargaste trabajos en Servicio Técnico.')}
                  </p>
                )}
                {trabajos.map((trab, i) => (
                  <button
                    key={trab.id}
                    onClick={() => agregarTrabajoDelCatalogo(trab)}
                    className="group rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-2.5 flex flex-col items-center gap-1 text-center"
                  >
                    <span className="block animate-flotar" style={{ animationDelay: `${(i % 3) * 0.4}s` }}>
                      {trab.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={trab.imagen_url}
                          alt=""
                          className="h-16 w-16 object-contain transition-transform duration-300 ease-out group-hover:animate-vaivenLateral"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-canvas dark:bg-dark-bg flex items-center justify-center text-2xl">🔧</div>
                      )}
                    </span>
                    <span className="text-xs font-medium leading-tight line-clamp-2">{trab.nombre}</span>
                    {trab.precio != null && <span className="text-xs font-semibold">{moneda}{trab.precio.toLocaleString('es-AR')}</span>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={trabajoManualNombre}
                  onChange={(e) => setTrabajoManualNombre(e.target.value)}
                  placeholder={t('Nombre del arreglo')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={trabajoManualPrecio}
                  onChange={(e) => setTrabajoManualPrecio(sanitizarDecimal(e.target.value))}
                  placeholder={t('Precio')}
                  inputMode="decimal"
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={!trabajoManualNombre.trim()}
                  onClick={agregarTrabajoManual}
                  className="w-full rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {t('Agregar al carrito')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {carrito.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">{t('El carrito está vacío. Agregá al menos un ítem.')}</p>
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
                    title={i.tipo === 'dispositivo' ? t('Un dispositivo del stock siempre se vende de a uno') : undefined}
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
                  {t('Quitar')}
                </button>
              </div>
            </div>
          ))}
        </div>

        {carrito.length > 0 && (
          <div className="flex items-center justify-between text-sm font-medium border-t border-border dark:border-dark-border pt-3">
            <span>{t('Subtotal')}</span>
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
          {t('Continuar')}
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
        <span className="text-lg font-medium">{t('Nueva orden')} · {t('Confirmar')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted dark:text-dark-text-secondary">{t('Cliente:')}</span>{' '}
          {modoCliente === 'existente'
            ? `${clienteElegido?.nombre} ${clienteElegido?.apellido || ''}`
            : modoCliente === 'consumidor_final'
              ? t('Consumidor final')
              : nuevoNombre}
        </p>
        <p>
          <span className="text-muted dark:text-dark-text-secondary">{t('Ítems:')}</span> {carrito.length}
        </p>
      </div>

      {monedasDisponibles.length > 1 && (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <span className="text-sm font-medium">{t('¿En qué moneda mostrar el monto en la boleta?')}</span>
          <div className="flex gap-2">
            {([
              { v: 'principal', t: `${t('Solo')} ${simboloMoneda(monedasDisponibles[0])}` },
              { v: 'ambas', t: t('Ambas') },
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
                {t('Monto en')} {monedasDisponibles[1]} {t('(calculado con tu tipo de cambio, lo podés corregir)')}
              </label>
              <input
                value={montoSecundario}
                onChange={(e) => {
                  setMontoSecundario(sanitizarDecimal(e.target.value));
                  setMontoSecundarioTocado(true);
                }}
                inputMode="decimal"
                placeholder={`${t('Monto en')} ${monedasDisponibles[1]}`}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {t('Las Estadísticas siempre se calculan en')} {monedasDisponibles[0]} {t('(tu moneda principal). Esto solo cambia cómo se ve la boleta del cliente.')}
              </p>
            </>
          )}
        </div>
      )}

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Vendedor')}</label>
        <select
          value={vendedorId}
          onChange={(e) => setVendedorId(e.target.value)}
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        >
          <option value="" disabled>
            {t('Elegí quién atendió esta venta...')}
          </option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
            </option>
          ))}
        </select>
        {!vendedorId && vendedores.length > 0 && (
          <p className="text-[10px] text-warn mt-1">
            {t('Es obligatorio para poder confirmar la orden — así no queda como "Sin asignar" en Estadísticas.')}
          </p>
        )}
        {vendedores.length === 0 && (
          <p className="text-[10px] text-muted dark:text-dark-text-secondary mt-1">
            {t('Todavía no cargaste vendedores en Configuración — podés confirmar sin elegir uno, pero después no vas a poder saber quién hizo esta venta en Estadísticas.')}
          </p>
        )}
      </div>

      {planes.length > 0 && subtotal > 0 && (
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Plan de pago')}</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCuotasElegidas(0)}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                cuotasElegidas === 0 ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {t('Contado')}
              <span className="block text-[10px] opacity-80 font-normal">{t('ahora · sin recargo')}</span>
            </button>
            {planes.map((p) => (
              <button
                key={p.cuotas}
                onClick={() => setCuotasElegidas(p.cuotas)}
                className={`rounded-xl px-3 py-2 text-sm font-medium text-center ${
                  cuotasElegidas === p.cuotas ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {t(etiquetaCuotas(p.cuotas))}
                <span className="block text-[10px] opacity-80 font-normal">
                  {t('de')} {moneda}{Math.round(valorCuota(subtotal, p.cuotas, p.interes)).toLocaleString('es-AR')}
                </span>
              </button>
            ))}
          </div>
          {cuotasElegidas >= 1 && (
            <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">
              {cuotasElegidas === 1 ? `${t('Paga a ~1 mes:')} ` : ''}
              {t(etiquetaCuotas(cuotasElegidas))} {t('de')} {moneda}
              {Math.round(valorCuota(subtotal, cuotasElegidas, interesPlan)).toLocaleString('es-AR')} · {t('total financiado')}{' '}
              {moneda}{Math.round(subtotalFinanciado).toLocaleString('es-AR')} ({t('interés')} {interesPlan}%)
            </p>
          )}
        </div>
      )}

      {comisionesActivas && (
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-muted dark:text-dark-text-secondary">{t('Tipo de venta')}</label>
          <div className="inline-flex items-center gap-1 rounded-xl bg-canvas dark:bg-dark-bg p-0.5">
            {(['minorista', 'mayorista'] as const).map((tv) => (
              <button
                key={tv}
                type="button"
                onClick={() => setTipoVenta(tv)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  tipoVenta === tv
                    ? 'bg-white dark:bg-dark-surface-elevated text-ink dark:text-dark-text shadow-card'
                    : 'text-muted dark:text-dark-text-secondary'
                }`}
              >
                {t(tv)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted dark:text-dark-text-secondary">{t('Cómo se paga')}</label>
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
            {pagoMixto ? t('Un solo medio') : t('Dividir en varios (mixto)')}
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
                {m.icono} {t(m.label)}
              </button>
            ))}
            {ctaCteDisponible && (
              <button
                onClick={() => setMedioSimple(CUENTA_CORRIENTE)}
                className={`rounded-xl px-3 py-2 text-sm font-medium ${
                  medioSimple === CUENTA_CORRIENTE ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                📒 {t('Cuenta corriente')}
              </button>
            )}
            {/* Antes esto era solo un link de texto chico más abajo, separado
                de los demás medios de pago — quedaba invisible al lado de
                los botones grandes de arriba. Ahora es un botón más en la
                misma fila, aunque todavía no esté habilitada para este
                cliente (con otro estilo, para que se note la diferencia). */}
            {!ctaCteDisponible && clienteElegido && !clienteElegido.suspendido && !saldoClienteError && puedeVender && (
              <button
                onClick={() => setHabilitandoCta((v) => !v)}
                className={`rounded-xl px-3 py-2 text-sm font-medium border border-dashed ${
                  habilitandoCta
                    ? 'border-accent dark:border-dark-accent text-accent dark:text-dark-accent bg-accent-soft dark:bg-dark-accent-soft'
                    : 'border-border dark:border-dark-border text-muted dark:text-dark-text-secondary'
                }`}
              >
                📒 {t('Cuenta corriente (habilitar)')}
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
                      {t(m.label)}
                    </option>
                  ))}
                  {ctaCteDisponible && <option value={CUENTA_CORRIENTE}>{t('Cuenta corriente')}</option>}
                </select>
                <input
                  value={l.monto}
                  onChange={(e) => actualizarLineaPago(l.tempId, 'monto', sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  placeholder={t('Monto')}
                  className="w-28 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button onClick={() => quitarLineaPago(l.tempId)} className="text-bad text-xs font-medium shrink-0">
                  {t('Quitar')}
                </button>
              </div>
            ))}
            <button
              onClick={agregarLineaPago}
              className="rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
            >
              + {t('Agregar medio')}
            </button>
            {/* En modo mixto, cuenta corriente solo aparece en el <select> de
                cada línea si ya está habilitada — acá va el mismo disparador
                del modo simple para poder habilitarla sin cambiar de modo. */}
            {!ctaCteDisponible && clienteElegido && !clienteElegido.suspendido && !saldoClienteError && puedeVender && (
              <button
                onClick={() => setHabilitandoCta((v) => !v)}
                className="self-start text-xs text-accent dark:text-dark-accent underline"
              >
                📒 {t('Habilitar cuenta corriente para este cliente')}
              </button>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted dark:text-dark-text-secondary">{t('Asignado')}</span>
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
                {t('Poner el resto')} ({moneda}{Math.round(restantePorAsignar).toLocaleString('es-AR')}) {t('en cuenta corriente')}
              </button>
            )}
            {!asignacionOk && (
              <p className="text-[10px] text-warn">
                {t('La suma de los medios tiene que dar el total.')}{' '}
                {restantePorAsignar > 0
                  ? `${t('Falta asignar')} ${moneda}${Math.round(restantePorAsignar).toLocaleString('es-AR')}.`
                  : `${t('Te pasaste por')} ${moneda}${Math.round(-restantePorAsignar).toLocaleString('es-AR')}.`}
              </p>
            )}
          </div>
        )}

        {ctaCteDisponible && montoCuentaCorriente > 0 && (
          <div className="rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border px-3 py-2 text-xs flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-muted dark:text-dark-text-secondary">📒 {t('Queda debiendo')}</span>
              <span className="font-medium">{moneda}{Math.round(montoCuentaCorriente).toLocaleString('es-AR')}</span>
            </div>
            {saldoCliente > 0 && (
              <div className="flex justify-between">
                <span className="text-muted dark:text-dark-text-secondary">{t('Saldo anterior')}</span>
                <span>{moneda}{Math.round(saldoCliente).toLocaleString('es-AR')}</span>
              </div>
            )}
            {clienteElegido?.limite_credito != null && (
              <div className="flex justify-between">
                <span className="text-muted dark:text-dark-text-secondary">{t('Límite de crédito')}</span>
                <span>{moneda}{Math.round(clienteElegido.limite_credito).toLocaleString('es-AR')}</span>
              </div>
            )}
            {excedeLimite && (
              <p className="text-bad">
                {t('Supera el límite de crédito (disponible')} {moneda}
                {Math.round(Math.max(0, creditoDisponible)).toLocaleString('es-AR')}). {t('No se puede confirmar hasta cobrarle o subirle el límite.')}
              </p>
            )}
          </div>
        )}

        {ctaCteDisponible && montoCuentaCorriente > 0 && puedeGestionarFinanciacion && (
          <div className="rounded-lg border border-dashed border-border dark:border-dark-border p-2.5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                const nuevo = !financiarActivo;
                setFinanciarActivo(nuevo);
                if (nuevo && !financiarPrimeraFecha) {
                  setFinanciarPrimeraFecha(aFechaISO(sumarMesConClamp(new Date(), 1)));
                }
              }}
              className="flex items-center justify-between text-xs font-medium"
            >
              <span>🧾 {t('Financiar en cuotas propias (con vencimientos)')}</span>
              <span className={`rounded-full px-2 py-0.5 ${financiarActivo ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-canvas dark:bg-dark-bg text-muted dark:text-dark-text-secondary'}`}>
                {financiarActivo ? t('Activado') : t('Desactivado')}
              </span>
            </button>
            {!financiarActivo && (
              <p className="text-[10px] text-muted dark:text-dark-text-secondary">
                {t('Si no lo activás, lo que queda debiendo entra como un cargo único a cuenta corriente (como siempre). Activándolo, se arma un cronograma con una cuota y un vencimiento por mes.')}
              </p>
            )}
            {financiarActivo && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted dark:text-dark-text-secondary block mb-1">{t('Cantidad de cuotas')}</label>
                    <input
                      value={financiarCuotas}
                      inputMode="numeric"
                      onChange={(e) => setFinanciarCuotas(e.target.value.replace(/[^\d]/g, ''))}
                      className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted dark:text-dark-text-secondary block mb-1">{t('Fecha de la 1ª cuota')}</label>
                    <CampoFecha value={financiarPrimeraFecha} onChange={setFinanciarPrimeraFecha} ancho="completo" />
                  </div>
                </div>
                {previewFinanciacion ? (
                  <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                    {previewFinanciacion.map((c) => (
                      <div key={c.numero} className="flex items-center justify-between text-[11px] text-muted dark:text-dark-text-secondary">
                        <span>{t('Cuota')} {c.numero}/{financiarCuotasNum}</span>
                        <span>{new Date(c.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}</span>
                        <span className="font-medium text-ink dark:text-dark-text">{moneda}{Math.round(c.importe).toLocaleString('es-AR')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-warn">{t('Completá cantidad de cuotas y fecha de la 1ª para ver el cronograma.')}</p>
                )}
              </>
            )}
          </div>
        )}

        {clienteElegido && !ctaCteDisponible && (saldoClienteError || clienteElegido.suspendido) && (
          <p className="text-[10px] text-muted dark:text-dark-text-secondary">
            {saldoClienteError
              ? t('No pudimos confirmar el saldo de este cliente, así que por las dudas no se puede vender a cuenta corriente ahora. Probá de nuevo en un momento.')
              : t('Este cliente está suspendido para cuenta corriente.')}
          </p>
        )}

        {habilitandoCta && !ctaCteDisponible && (
          <div className="rounded-lg bg-canvas dark:bg-dark-bg p-2.5 flex flex-col gap-2">
            <p className="text-[10px] text-muted dark:text-dark-text-secondary">
              {t('Cuenta corriente = la financiación propia del local (fiado, sin interés fijo) — distinta de las cuotas de arriba. Se habilita para este cliente y queda usada en esta misma venta.')}
            </p>
            <div className="flex gap-2">
              <label className="flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] text-muted dark:text-dark-text-secondary">{t('Límite de crédito (opcional)')}</span>
                <input
                  value={limiteCtaInline}
                  onChange={(e) => setLimiteCtaInline(sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  placeholder={t('Sin límite')}
                  className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                />
              </label>
              <label className="flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] text-muted dark:text-dark-text-secondary">{t('Plazo (días)')}</span>
                <input
                  value={plazoCtaInline}
                  onChange={(e) => setPlazoCtaInline(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  className="bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                disabled={guardandoCtaInline}
                onClick={habilitarCtaCteInline}
                className="flex-1 rounded-lg bg-accent dark:bg-dark-accent text-white py-1.5 text-xs font-medium disabled:opacity-40"
              >
                {guardandoCtaInline ? t('Habilitando...') : t('Habilitar y usar en esta venta')}
              </button>
              <button
                onClick={() => setHabilitandoCta(false)}
                className="rounded-lg border border-border dark:border-dark-border px-3 py-1.5 text-xs font-medium"
              >
                {t('Cancelar')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Anticipo')}</label>
          <input
            value={anticipo}
            onChange={(e) => setAnticipo(sanitizarDecimal(e.target.value))}
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Impuesto %')}</label>
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
          {t('Nota para la boleta (opcional)')}
        </label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder={t('Ej. el equipo tiene un detalle en la pantalla, se vende igual con este descuento')}
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
          <span className="text-sm font-medium">{t('Incluir el texto de garantía en la boleta')}</span>
        </label>
        <Link
          href="/configuracion/negocio"
          target="_blank"
          className="text-xs text-accent dark:text-dark-accent underline shrink-0"
        >
          {t('Editar texto')}
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
          <span className="text-sm font-medium">{t('Plan canje: recibo uno o más dispositivos como parte de pago')}</span>
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
                  {c.imei && <p className="text-xs text-muted dark:text-dark-text-secondary font-mono">{t('IMEI:')} {c.imei}</p>}
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
                    {t('Quitar')}
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
              placeholder={t('Modelo del dispositivo entregado')}
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
              placeholder={t('Batería %')}
              inputMode="numeric"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <input
              value={canjeImei}
              onChange={(e) => setCanjeImei(e.target.value)}
              placeholder={t('IMEI')}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <input
              value={canjeMonto}
              onChange={(e) => setCanjeMonto(sanitizarDecimal(e.target.value))}
              placeholder={t('Monto reconocido')}
              inputMode="decimal"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <textarea
              value={canjeDetalles}
              onChange={(e) => setCanjeDetalles(e.target.value)}
              placeholder={t('Detalles del dispositivo (ej. no anda el parlante, módulo con detalle)')}
              rows={3}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={agregarCanje}
              disabled={!canjeModelo.trim()}
              className="rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
            >
              + {t('Agregar este dispositivo')}
            </button>
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              {t('El monto reconocido ya se descuenta del total y el dispositivo se guarda en Plan Canje al confirmar la orden (no entra directo al stock). Usá')} <span className="font-medium">+ {t('Agregar este dispositivo')}</span> {t('solo si vas a cargar más de uno.')}
            </p>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Estado')}</label>
        <div className="flex gap-2">
          {ESTADOS_ORDEN.map((e) => (
            <button
              key={e}
              onClick={() => setEstadoOrden(e)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize ${
                estadoOrden === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {t(e)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-lg font-medium border-t border-border dark:border-dark-border pt-3">
        <span>{t('Total')}</span>
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
              <span className="font-semibold text-amber-900 dark:text-amber-300">🔧 {t('Derivar a Servicio Técnico al confirmar')}</span>
              <span className="block text-xs text-amber-800/90 dark:text-amber-300/70 mt-0.5">
                {t('El equipo pasa directo a reparación al hacer la boleta. Recomendado para celulares que se venden con batería baja (ej.: subir batería de un equipo que el cliente ya compró y está esperando).')}
              </span>
            </span>
          </label>

          {derivarActivo && (
            <div className="flex flex-col gap-2 mt-1">
              {derivaciones.length > 1 && (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {t('Tildá los equipos que van a Servicio Técnico. Podés derivar varios de una misma boleta.')}
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
                          {der.modelo.trim() ? resumen : t('Equipo a cargar')}
                        </span>
                        {der.desdeTrabajo && (
                          <span className="block text-[11px] text-amber-700/80 dark:text-amber-300/70">{t('Equipo de la ficha técnica (lleva su checklist)')}</span>
                        )}
                      </span>
                      {der.incluir && der.modelo.trim() && !der.editar && (
                        <button
                          type="button"
                          onClick={() => actualizarDerivacion(der.key, { editar: true })}
                          className="shrink-0 text-xs text-amber-800 dark:text-amber-300 underline"
                        >
                          {t('Cambiar')}
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
                              placeholder={t('Modelo del equipo (ej. iPhone 14)')}
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
                              placeholder={t('IMEI (opcional)')}
                              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                            />
                          </>
                        )}
                        <input
                          value={der.motivo}
                          onChange={(e) => actualizarDerivacion(der.key, { motivo: e.target.value })}
                          placeholder={t('¿Qué se le hace? (ej. subir batería, cambiar módulo)')}
                          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                        />
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={der.prioritario}
                            onChange={(e) => actualizarDerivacion(der.key, { prioritario: e.target.checked })}
                            className="h-4 w-4 accent-amber-500"
                          />
                          <span className="text-amber-900 dark:text-amber-200">{t('Prioritario — el cliente está esperando')}</span>
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
        <p className="text-xs text-bad text-center">{t('No tenés permiso para crear órdenes.')}</p>
      )}
      <button
        disabled={!puedeConfirmar || guardando}
        onClick={handleConfirmar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? t('Creando orden...') : t('Confirmar orden')}
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
