'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor, getActor, MENSAJE_ACTOR_REQUERIDO } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { sanitizarDecimal, formatearMonto } from '../../lib/numeros';
import { medioLabel } from '../../lib/cuentaCorriente';
import { asegurarModelo, normalizarNombreModelo } from '../../lib/modelos';
import { limpiarImei } from '../../lib/imei';
import { obtenerCategorias } from '../../lib/categorias';
import { obtenerDispositivosSenados } from '../../lib/planAhorro';
import SelectorColorAuto from '../../SelectorColorAuto';
import SelectorEstadoDispositivo from '../../SelectorEstadoDispositivo';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';
import { useSucursalActual } from '../../lib/sucursal';
import { falla } from '../../lib/escritura';
import { obtenerTodasLasFilas } from '../../lib/db';

const STORAGE_OPTIONS = [64, 128, 256, 512];

function idTemporal() {
  return Math.random().toString(36).slice(2);
}

type CanjeCarritoItem = {
  tempId: string;
  modelo: string;
  capacidad_gb: number | null;
  color: string;
  imei: string;
  salud_bateria: string;
  monto: string;
  detalles: string;
  condicion: string;
  ubicacion_fisica: string;
};

type Plan = {
  id: string;
  cliente_id: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  monto_objetivo: number;
  detalles: string | null;
  estado: string;
  dispositivo_id: string | null;
  orden_id: string | null;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

type Movimiento = {
  id: string;
  monto: number;
  medio: string | null;
  observacion: string | null;
  fecha: string;
};

type DispositivoStock = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  precio: number | null;
};

export default function DetallePlanAhorro() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const puedeVer = tienePermiso(actor, 'ver_plan_ahorro');
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');

  const [plan, setPlan] = useState<Plan | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movimientosError, setMovimientosError] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const [registrandoPago, setRegistrandoPago] = useState(false);
  const [montoPago, setMontoPago] = useState('');
  const [medioPago, setMedioPago] = useState('efectivo');
  const [obsPago, setObsPago] = useState('');
  const [guardandoPago, setGuardandoPago] = useState(false);

  // Plan canje: el cliente entrega uno o más equipos usados como parte de
  // pago del plan de ahorro — mismo carrito que Nueva Orden, cada equipo
  // entra a la cola de Plan Canje (tabla canjes) igual que si viniera de
  // una venta. canjesCarrito son los ya agregados con "+ Agregar"; los
  // campos sueltos de abajo son el que se está por agregar (o el único,
  // si nunca se toca "+ Agregar" — igual criterio que Nueva Orden).
  const [canjesCarrito, setCanjesCarrito] = useState<CanjeCarritoItem[]>([]);
  const [canjeModelo, setCanjeModelo] = useState('');
  const [canjeCapacidad, setCanjeCapacidad] = useState<number | null>(null);
  const [canjeColor, setCanjeColor] = useState('');
  const [canjeImei, setCanjeImei] = useState('');
  const [canjeBateria, setCanjeBateria] = useState('');
  const [canjeMonto, setCanjeMonto] = useState('');
  const [canjeDetalles, setCanjeDetalles] = useState('');
  const [canjeCondicion, setCanjeCondicion] = useState('usado');
  const [canjeUbicacion, setCanjeUbicacion] = useState('');

  const [editando, setEditando] = useState(false);
  const [editModelo, setEditModelo] = useState('');
  const [editCapacidad, setEditCapacidad] = useState<number | null>(null);
  const [editColor, setEditColor] = useState('');
  const [editMontoObjetivo, setEditMontoObjetivo] = useState('');
  const [editDetalles, setEditDetalles] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Al completar un plan SIN equipo puntual señado (el caso más común: "algún
  // día un iPhone 13"), plan_ahorro_completar generaba la boleta con una
  // línea de texto suelta, sin ningún dispositivo real vinculado — el equipo
  // nunca salía de Stock. Este selector aparece justo antes de completar para
  // elegir CON qué equipo real se entrega (uno que ya está en Stock, o uno
  // nuevo cargado en el momento); una vez elegido, se lo "seña" al plan
  // (mismo campo dispositivo_id que ya usa el flujo de seña normal) y recién
  // ahí se llama a la misma función de siempre — así sale de Stock y queda
  // linkeado en la boleta igual que cualquier venta con equipo puntual.
  const [eligiendoEquipo, setEligiendoEquipo] = useState(false);
  const [modoNuevoEquipo, setModoNuevoEquipo] = useState(false);
  const [busquedaEquipo, setBusquedaEquipo] = useState('');
  const [equiposStockRaw, setEquiposStockRaw] = useState<DispositivoStock[]>([]);
  const [equiposSenados, setEquiposSenados] = useState<Set<string>>(new Set());
  const [buscandoEquipos, setBuscandoEquipos] = useState(false);
  const [categoriaEquipoId, setCategoriaEquipoId] = useState('');

  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevoCapacidad, setNuevoCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoImei, setNuevoImei] = useState('');
  const [nuevoBateria, setNuevoBateria] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [nuevoCosto, setNuevoCosto] = useState('');
  const [nuevoEstadoEquipo, setNuevoEstadoEquipo] = useState('usado');
  const [guardandoNuevoEquipo, setGuardandoNuevoEquipo] = useState(false);

  const nombreCliente = (p: Plan) => (p.clientes ? `${p.clientes.nombre} ${p.clientes.apellido || ''}`.trim() : t('sin cliente'));

  const cargar = async () => {
    // Ambas filtran solo por "id"/"plan_id" (ya conocidos) — son
    // independientes, así que se piden en paralelo en vez de una detrás
    // de la otra.
    const [{ data: planData }, { data: movData, error: movError }] = await Promise.all([
      supabase.from('planes_ahorro').select('*, clientes ( nombre, apellido, telefono )').eq('id', id).maybeSingle(),
      supabase
        .from('plan_ahorro_movimientos')
        .select('id, monto, medio, observacion, fecha')
        .eq('plan_id', id)
        .eq('anulado', false)
        .order('fecha', { ascending: false }),
    ]);
    setPlan((planData as Plan) ?? null);
    setMovimientosError(!!movError);
    setMovimientos(movError ? [] : ((movData as Movimiento[]) ?? []));
    setLoading(false);
  };

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, puedeVer]);

  useEffect(() => {
    (async () => {
      try {
        const data = await obtenerCategorias(supabase, false);
        const deDispositivo = data.filter((c) => c.perfil_default === 'dispositivo');
        const sugerida = deDispositivo.find((c) => c.nombre.toLowerCase() === 'celulares') ?? deDispositivo[0];
        if (sugerida) setCategoriaEquipoId(sugerida.id);
      } catch {
        // Tabla stock_categorias todavía no existe en este negocio.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Equipos EN STOCK para vincular al completar un plan sin dispositivo
  // puntual — se traen UNA sola vez al abrir el selector (no en cada letra
  // tipeada: mismo criterio que "Nuevo plan de ahorro", que ya resuelve esto
  // así) y de ahí en más el buscador filtra en el cliente. Se excluyen los
  // que ya están señados por OTRO plan activo (mismo chequeo que "Nuevo plan
  // de ahorro" al elegir equipo) — sin esto, se podía ofrecer acá un equipo
  // que otro cliente ya tiene reservado.
  useEffect(() => {
    if (!eligiendoEquipo || modoNuevoEquipo) return;
    (async () => {
      setBuscandoEquipos(true);
      const [{ data }, senados] = await Promise.all([
        obtenerTodasLasFilas<DispositivoStock>(supabase, 'dispositivos', 'id, modelo, capacidad_gb, color, imei, precio', [{ columna: 'modelo' }], (q) =>
          q.eq('en_stock', true)
        ).then((data) => ({ data })),
        obtenerDispositivosSenados(supabase),
      ]);
      setEquiposStockRaw((data as DispositivoStock[]) ?? []);
      setEquiposSenados(senados);
      setBuscandoEquipos(false);
    })();
  }, [eligiendoEquipo, modoNuevoEquipo, supabase]);

  const equiposDisponibles = useMemo(
    () => equiposStockRaw.filter((d) => !equiposSenados.has(d.id)),
    [equiposStockRaw, equiposSenados]
  );

  const equiposFiltrados = useMemo(() => {
    const q = busquedaEquipo.trim().toLowerCase();
    if (!q) return equiposDisponibles;
    return equiposDisponibles.filter((d) => [d.modelo, d.color, d.imei].filter(Boolean).some((x) => x!.toLowerCase().includes(q)));
  }, [equiposDisponibles, busquedaEquipo]);

  // Pagado = suma de abonos (nunca se guarda, se calcula siempre).
  const pagado = useMemo(() => movimientos.reduce((acc, m) => acc + m.monto, 0), [movimientos]);
  const falta = plan ? Math.max(0, plan.monto_objetivo - pagado) : 0;
  const pct = plan && plan.monto_objetivo > 0 ? Math.min(100, Math.round((pagado / plan.monto_objetivo) * 100)) : 0;
  const completo = plan ? pagado >= plan.monto_objetivo : false;

  // Los canjes que efectivamente cuentan: los ya agregados con el botón MÁS
  // el que se está tipeando ahora — si alguien completa un solo equipo y se
  // olvida de tocar "+ Agregar", igual se suma (mismo criterio que Nueva
  // Orden en agregarCanje/canjesEfectivos).
  const canjesEfectivos = useMemo<CanjeCarritoItem[]>(() => {
    const enProgreso: CanjeCarritoItem[] = canjeModelo.trim()
      ? [
          {
            tempId: '__actual__',
            modelo: canjeModelo.trim(),
            capacidad_gb: canjeCapacidad,
            color: canjeColor,
            imei: canjeImei,
            salud_bateria: canjeBateria,
            monto: canjeMonto,
            detalles: canjeDetalles,
            condicion: canjeCondicion,
            ubicacion_fisica: canjeUbicacion,
          },
        ]
      : [];
    return [...canjesCarrito, ...enProgreso];
  }, [canjesCarrito, canjeModelo, canjeCapacidad, canjeColor, canjeImei, canjeBateria, canjeMonto, canjeDetalles, canjeCondicion, canjeUbicacion]);

  const montoCanjeTotal = useMemo(() => canjesEfectivos.reduce((acc, c) => acc + (Number(c.monto) || 0), 0), [canjesEfectivos]);

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
  };

  const quitarCanje = (tempId: string) => setCanjesCarrito((c) => c.filter((x) => x.tempId !== tempId));

  const actualizarMontoCanje = (tempId: string, monto: string) =>
    setCanjesCarrito((c) => c.map((x) => (x.tempId === tempId ? { ...x, monto } : x)));

  const limpiarFormularioPago = () => {
    setMontoPago('');
    setObsPago('');
    setMedioPago('efectivo');
    setCanjesCarrito([]);
    setCanjeModelo('');
    setCanjeCapacidad(null);
    setCanjeColor('');
    setCanjeImei('');
    setCanjeBateria('');
    setCanjeMonto('');
    setCanjeDetalles('');
    setCanjeCondicion('usado');
    setCanjeUbicacion('');
  };

  const registrarPago = async () => {
    if (!plan) return;
    const esCanje = medioPago === 'canje';
    const monto = esCanje ? montoCanjeTotal : Number(montoPago);
    if (!monto || monto <= 0) {
      setError(esCanje ? t('Cargá al menos un equipo con un monto reconocido válido') : t('Poné un monto válido'));
      return;
    }
    if (esCanje && canjesEfectivos.some((c) => !c.modelo.trim())) {
      setError(t('Poné el modelo de cada equipo que recibís como parte de pago'));
      return;
    }
    setGuardandoPago(true);
    setError(null);

    let observacionFinal = obsPago.trim() || null;
    let canjeIds: string[] = [];
    if (esCanje) {
      const { data: nuevosCanjes, error: canjesError } = await supabase
        .from('canjes')
        .insert(
          canjesEfectivos.map((c) => ({
            cliente_id: plan.cliente_id,
            modelo: normalizarNombreModelo(c.modelo.trim()),
            capacidad_gb: c.capacidad_gb,
            color: c.color.trim() || null,
            imei: limpiarImei(c.imei),
            salud_bateria: c.salud_bateria ? Number(c.salud_bateria) : null,
            detalles: c.detalles.trim() || null,
            monto: Number(c.monto) || 0,
            condicion: c.condicion,
            ubicacion_fisica: c.ubicacion_fisica.trim() || null,
          }))
        )
        .select('id');
      if (canjesError || !nuevosCanjes) {
        setError(t('No pudimos cargar el/los equipo/s de canje:') + ' ' + (canjesError?.message || ''));
        setGuardandoPago(false);
        return;
      }
      canjeIds = nuevosCanjes.map((c) => c.id);
      const descripcionCanje = canjesEfectivos
        .map((c) => `${normalizarNombreModelo(c.modelo.trim())}${c.capacidad_gb ? ` ${c.capacidad_gb}GB` : ''}${c.color.trim() ? ` ${c.color.trim()}` : ''}`)
        .join(' + ');
      observacionFinal = observacionFinal ? `${descripcionCanje} · ${observacionFinal}` : descripcionCanje;
    }

    const { data: nuevoMov, error: dbError } = await supabase
      .from('plan_ahorro_movimientos')
      .insert({
        plan_id: plan.id,
        monto,
        medio: medioPago,
        observacion: observacionFinal,
        registrado_por_nombre: actor?.nombre ?? null,
        registrado_por_foto_url: actor?.fotoUrl ?? null,
      })
      .select('id')
      .single();
    if (dbError) {
      // Los canjes ya insertados arriba no se pierden aunque esto falle
      // (quedan sueltos en Plan Canje, igual que si una venta normal
      // falla después de cargar el canje) — se puede reconciliar a mano.
      setError(t('No pudimos guardar el pago:') + ' ' + dbError.message);
      setGuardandoPago(false);
      return;
    }
    // Best-effort: vincula los canjes con este abono para que la boleta
    // final (al completar el plan) pueda encontrarlos. Si esto falla, la
    // plata y los equipos ya quedaron registrados igual — no vale la pena
    // bloquear al usuario por un link que es solo para la boleta.
    if (canjeIds.length > 0 && nuevoMov?.id) {
      await supabase.from('canjes').update({ plan_ahorro_movimiento_id: nuevoMov.id }).in('id', canjeIds);
    }
    setGuardandoPago(false);
    setRegistrandoPago(false);
    limpiarFormularioPago();
    if (nuevoMov?.id) {
      router.push(`/plan-ahorro/${plan.id}/comprobante/${nuevoMov.id}`);
      return;
    }
    cargar();
  };

  const anularMovimiento = async (movId: string) => {
    if (!confirm(t('¿Anular este pago? Deja de contar para el total juntado (queda registrado como anulado, no se borra).'))) return;
    if (await falla(supabase.from('plan_ahorro_movimientos').update({ anulado: true }).eq('id', movId), t, 'anular pago del plan de ahorro')) return;
    // Si este pago era parte de lo que había completado el plan, anularlo
    // lo deja por debajo del objetivo otra vez, pero el plan sigue
    // figurando "completado" (y si era una seña, el equipo ya se entregó
    // y se vendió — no hay nada que "seguir juntando"). No lo reabrimos
    // solos: se lo avisamos a quien lo anuló para que decida con el botón
    // "Reactivar" si corresponde, en vez de cambiar el estado por su cuenta
    // sin saber si el equipo ya salió del local.
    if (plan?.estado === 'completado') {
      const anulado = movimientos.find((m) => m.id === movId);
      const pagadoNuevo = pagado - (anulado?.monto ?? 0);
      if (pagadoNuevo < plan.monto_objetivo) {
        alert(
          t(
            'Este plan ya estaba marcado como completado — al anular este pago queda con menos plata juntada de la que pactaron, pero el plan sigue figurando "completado" (no lo cambiamos solos, puede que el equipo ya se haya entregado). Si corresponde, reabrilo con el botón "Reactivar".'
          )
        );
      }
    }
    cargar();
  };

  const cambiarEstado = async (nuevoEstado: 'cancelado' | 'activo' | 'archivado') => {
    if (!plan || procesando) return;
    const mensajes: Record<string, string> = {
      cancelado: t('¿Cancelar este plan de ahorro?'),
      activo: t('¿Reactivar este plan?'),
      archivado: t(
        '¿Archivar este plan? Usalo cuando la venta ya se resolvió por fuera del sistema (ej. se hizo la boleta desde Órdenes) — deja de contar como activo, pero no se borra nada.'
      ),
    };
    if (!confirm(mensajes[nuevoEstado])) return;
    setProcesando(true);
    if (await falla(supabase.from('planes_ahorro').update({ estado: nuevoEstado }).eq('id', plan.id), t, 'cambiar el estado del plan')) {
      setProcesando(false);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `cambió el estado del plan de ahorro de ${nombreCliente(plan)} de "${plan.estado}" a "${nuevoEstado}"`,
      entidad: 'plan_ahorro',
      entidadId: plan.id,
      valorAnterior: { estado: plan.estado },
      valorNuevo: { estado: nuevoEstado },
    });
    setProcesando(false);
    cargar();
  };

  // Al completarse (con o sin seña), el plan pasa a ser una venta de
  // verdad: se genera la orden/boleta (misma tabla que usa el resto de
  // Órdenes) en una sola transacción — si tenía un equipo puntual
  // reservado, también sale de Stock ahí mismo. Todo vive en la función
  // plan_ahorro_completar (RPC) en vez de hacerse a mano acá, para que no
  // pueda quedar a mitad de camino (equipo fuera de stock sin ninguna
  // venta real detrás, por ejemplo).
  const avisoCompletar = () =>
    completo
      ? t('¿Confirmar la entrega y generar la venta?')
      : `${t('Todavía le faltan')} $${formatearMonto(falta)} ${t('para completar el objetivo.')} ${t('¿Generar la venta igual?')}`;

  // `yaConfirmado` lo pasa guardarNuevoEquipoYCompletar: ese flujo necesita
  // preguntar ANTES de crear el equipo nuevo (si se confirma acá con el
  // equipo ya insertado y la persona cancela el diálogo nativo, quedaba un
  // equipo real en Stock sin ninguna venta detrás, y un reintento creaba un
  // segundo equipo duplicado).
  const completarPlan = async (dispositivoIdElegido?: string, yaConfirmado = false) => {
    if (!plan || procesando) return;
    if (!yaConfirmado && !confirm(avisoCompletar())) return;

    setProcesando(true);
    setError(null);
    setEligiendoEquipo(false);
    setModoNuevoEquipo(false);

    // Si se eligió recién un equipo (del selector, para un plan que no tenía
    // uno puntual reservado), primero se lo "seña" al plan — mismo campo que
    // ya usa el flujo de seña normal — para que plan_ahorro_completar lo
    // saque de Stock y lo linkee en la boleta como cualquier venta con
    // equipo puntual, en vez de dejar solo una línea de texto suelta.
    if (dispositivoIdElegido) {
      // Chequeo de último momento (mismo criterio que "Nuevo plan de
      // ahorro" y Nueva Orden): el selector se armó con lo que se sabía al
      // abrirlo, pero alguien pudo haber señado este mismo equipo desde
      // otra pantalla mientras este quedaba abierto.
      const senadosAhora = await obtenerDispositivosSenados(supabase);
      if (senadosAhora.has(dispositivoIdElegido)) {
        setError(t('Este equipo ya lo señó otra persona en este mismo momento. Elegí otro.'));
        setProcesando(false);
        setEligiendoEquipo(true);
        return;
      }
      const { error: vincularError } = await supabase
        .from('planes_ahorro')
        .update({ dispositivo_id: dispositivoIdElegido })
        .eq('id', plan.id);
      if (vincularError) {
        setError(t('No pudimos vincular el equipo:') + ' ' + vincularError.message);
        setProcesando(false);
        return;
      }
    }

    const { data, error: rpcError } = await supabase.rpc('plan_ahorro_completar', {
      p_plan_id: plan.id,
      p_sucursal_id: sucursalActual.id || null,
    });
    if (rpcError || !data?.orden_id) {
      setError(t('No pudimos generar la venta:') + ' ' + (rpcError?.message || ''));
      setProcesando(false);
      // El equipo ya pudo haber quedado señado (paso de arriba) aunque la
      // venta en sí no se generó — se recarga para que la pantalla refleje
      // eso (no queda mostrando "sin equipo" cuando ya tiene uno linkeado).
      if (dispositivoIdElegido) cargar();
      return;
    }
    await registrarAuditoria(supabase, {
      accion: plan.dispositivo_id || dispositivoIdElegido
        ? `entregó el equipo señado a ${nombreCliente(plan)} y generó la venta`
        : `completó el plan de ahorro de ${nombreCliente(plan)} y generó la venta`,
      entidad: 'plan_ahorro',
      entidadId: plan.id,
      valorNuevo: { orden_id: data.orden_id },
    });
    setProcesando(false);
    router.push(`/ordenes/${data.orden_id}`);
  };

  const abrirEligiendoEquipo = () => {
    if (!plan) return;
    setBusquedaEquipo(plan.modelo || '');
    setModoNuevoEquipo(false);
    setEligiendoEquipo(true);
    setError(null);
  };

  const abrirNuevoEquipo = () => {
    if (!plan) return;
    setNuevoModelo(plan.modelo || '');
    setNuevoCapacidad(plan.capacidad_gb);
    setNuevoColor(plan.color || '');
    setNuevoImei('');
    setNuevoBateria('');
    setNuevoPrecio(String(plan.monto_objetivo || ''));
    setNuevoCosto('');
    setNuevoEstadoEquipo('usado');
    setModoNuevoEquipo(true);
  };

  const guardarNuevoEquipoYCompletar = async () => {
    if (!plan || !nuevoModelo.trim() || !puedeAgregarStock) return;
    const actorAlta = getActor();
    if (!actorAlta) {
      setError(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    const imeiLimpio = limpiarImei(nuevoImei);
    if (imeiLimpio) {
      // Mismo aviso que /stock/nuevo y /stock/foto: fácil escanear o tipear
      // dos veces el mismo IMEI sin querer.
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', imeiLimpio).maybeSingle();
      if (existente && !confirm(`${t('Ya hay un dispositivo en Stock con el IMEI')} ${imeiLimpio}. ${t('¿Agregarlo igual?')}`)) return;
    }
    // Se confirma ACÁ, antes de crear el equipo — completarPlan(id, true) se
    // llama ya confirmado (ver comentario en completarPlan).
    if (!confirm(avisoCompletar())) return;
    setGuardandoNuevoEquipo(true);
    setError(null);
    const modeloNormalizado = normalizarNombreModelo(nuevoModelo.trim());
    const { data: nuevoDisp, error: insError } = await supabase
      .from('dispositivos')
      .insert({
        modelo: modeloNormalizado,
        capacidad_gb: nuevoCapacidad,
        imei: imeiLimpio || null,
        salud_bateria: nuevoBateria ? Number(nuevoBateria) : null,
        color: nuevoColor.trim() || null,
        precio: nuevoPrecio ? Number(nuevoPrecio) : null,
        costo: nuevoCosto ? Number(nuevoCosto) : null,
        estado: nuevoEstadoEquipo,
        ...(categoriaEquipoId ? { categoria_id: categoriaEquipoId } : {}),
        ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
        en_stock: true,
        agregado_por_nombre: actorAlta.nombre ?? null,
        agregado_por_foto_url: actorAlta.fotoUrl ?? null,
      })
      .select('id')
      .single();
    if (insError || !nuevoDisp) {
      setError(t('No pudimos guardar el equipo:') + ' ' + (insError?.message || ''));
      setGuardandoNuevoEquipo(false);
      return;
    }
    await asegurarModelo(supabase, modeloNormalizado);
    setGuardandoNuevoEquipo(false);
    await completarPlan(nuevoDisp.id, true);
  };

  const abrirEdicion = () => {
    if (!plan) return;
    setEditModelo(plan.modelo || '');
    setEditCapacidad(plan.capacidad_gb);
    setEditColor(plan.color || '');
    setEditMontoObjetivo(String(plan.monto_objetivo));
    setEditDetalles(plan.detalles || '');
    setEditando(true);
  };

  const guardarEdicion = async () => {
    if (!plan || !editMontoObjetivo || Number(editMontoObjetivo) <= 0) {
      setError(t('Poné un monto objetivo válido'));
      return;
    }
    setGuardandoEdicion(true);
    const nuevoMontoObjetivo = Number(editMontoObjetivo);
    if (
      await falla(
        supabase
          .from('planes_ahorro')
          .update({
            modelo: editModelo.trim() || null,
            capacidad_gb: editCapacidad,
            color: editColor.trim() || null,
            monto_objetivo: nuevoMontoObjetivo,
            detalles: editDetalles.trim() || null,
          })
          .eq('id', plan.id),
        t,
        'guardar cambios del plan de ahorro'
      )
    ) {
      setGuardandoEdicion(false);
      return;
    }
    // El objetivo define cuándo el plan se considera completo (y se entrega
    // el equipo) — a diferencia del resto de los campos, un cambio acá
    // queda registrado para poder auditarlo después.
    if (plan.monto_objetivo !== nuevoMontoObjetivo) {
      await registrarAuditoria(supabase, {
        accion: `cambió el monto objetivo del plan de ahorro de ${nombreCliente(plan)} de $${plan.monto_objetivo} a $${nuevoMontoObjetivo}`,
        entidad: 'plan_ahorro',
        entidadId: plan.id,
        valorAnterior: { monto_objetivo: plan.monto_objetivo },
        valorNuevo: { monto_objetivo: nuevoMontoObjetivo },
      });
    }
    setPlan({
      ...plan,
      modelo: editModelo.trim() || null,
      capacidad_gb: editCapacidad,
      color: editColor.trim() || null,
      monto_objetivo: nuevoMontoObjetivo,
      detalles: editDetalles.trim() || null,
    });
    setGuardandoEdicion(false);
    setEditando(false);
  };

  const eliminarPlan = async () => {
    if (!plan || !puedeEliminar) return;
    if (!confirm(`${t('¿Eliminar este plan de ahorro de')} ${nombreCliente(plan)}? ${t('Se pierde el historial de pagos. No se puede deshacer.')}`)) return;
    if (await falla(supabase.from('planes_ahorro').delete().eq('id', plan.id), t, 'eliminar plan de ahorro')) return;
    await registrarAuditoria(supabase, {
      accion: `eliminó un plan de ahorro (${nombreCliente(plan)}${plan.modelo ? `, ${plan.modelo}` : ''})`,
      entidad: 'plan_ahorro',
      entidadId: plan.id,
      valorAnterior: { modelo: plan.modelo, monto_objetivo: plan.monto_objetivo },
    });
    router.push('/plan-ahorro');
  };

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver Plan de ahorro.')}</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver al inicio')}
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('Cargando...')}</p>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No encontramos ese plan.')}</p>
        <Link href="/plan-ahorro" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver a Plan de ahorro')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/plan-ahorro" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">{nombreCliente(plan)}</span>
        <button onClick={() => (editando ? setEditando(false) : abrirEdicion())} className="text-xs text-accent dark:text-dark-accent underline">
          {editando ? t('Cerrar') : t('Editar')}
        </button>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {movimientosError && (
        <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">
          {t('No pudimos cargar los pagos — el total de abajo puede no ser real. Recargá la página.')}
        </p>
      )}

      {plan.estado !== 'activo' && (
        <div className="flex items-center gap-2">
          <span
            className={`self-start text-xs font-semibold px-2.5 py-1 rounded-full ${
              plan.estado === 'completado'
                ? 'bg-good/15 text-good'
                : plan.estado === 'archivado'
                ? 'bg-muted/15 text-muted dark:text-dark-text-secondary'
                : 'bg-bad/15 text-bad'
            }`}
          >
            {plan.estado === 'completado' ? t('Completado y entregado') : plan.estado === 'archivado' ? t('Archivado') : t('Cancelado')}
          </span>
          {plan.estado === 'completado' && plan.orden_id && (
            <Link href={`/ordenes/${plan.orden_id}`} className="text-xs text-accent dark:text-dark-accent underline">
              {t('Ver boleta')}
            </Link>
          )}
        </div>
      )}

      {editando ? (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Modelo deseado')}</label>
            <input
              value={editModelo}
              onChange={(e) => setEditModelo(e.target.value)}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Almacenamiento')}</label>
            <div className="flex gap-2">
              {STORAGE_OPTIONS.map((gb) => (
                <button
                  key={gb}
                  onClick={() => setEditCapacidad(editCapacidad === gb ? null : gb)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                    editCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                  }`}
                >
                  {gb}GB
                </button>
              ))}
            </div>
          </div>
          <SelectorColorAuto label={t('Color')} modelo={editModelo} value={editColor} onChange={setEditColor} />
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Monto objetivo')}</label>
            <input
              value={editMontoObjetivo}
              onChange={(e) => setEditMontoObjetivo(sanitizarDecimal(e.target.value))}
              inputMode="decimal"
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={editDetalles}
            onChange={(e) => setEditDetalles(e.target.value)}
            placeholder={t('Detalles (opcional)')}
            rows={2}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <button
            disabled={guardandoEdicion}
            onClick={guardarEdicion}
            className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {t('Guardar')}
          </button>
          {plan.estado === 'activo' && (
            <button
              onClick={() => cambiarEstado('archivado')}
              disabled={procesando}
              className="rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
            >
              {t('Archivar (se resolvió por fuera del sistema)')}
            </button>
          )}
          {puedeEliminar && (
            <button onClick={eliminarPlan} className="rounded-lg border border-bad/30 py-2 text-sm font-medium text-bad">
              {t('Eliminar plan')}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
          {plan.dispositivo_id && (
            <span className="self-start inline-flex items-center gap-1 text-[10px] font-semibold text-accent dark:text-dark-accent bg-accent-soft dark:bg-dark-accent-soft rounded-full px-2 py-0.5">
              <span aria-hidden="true" className="[&_svg]:h-3 [&_svg]:w-3 inline-flex shrink-0">{ICONOS.telefono}</span>
              {t('SEÑA — equipo reservado')}
            </span>
          )}
          <p className="font-medium">
            {plan.modelo || t('Sin modelo')}
            {plan.capacidad_gb ? ` · ${plan.capacidad_gb}GB` : ''}
            {plan.color ? ` · ${plan.color}` : ''}
          </p>
          {plan.clientes?.telefono && <p className="text-muted dark:text-dark-text-secondary">{plan.clientes.telefono}</p>}
          {plan.detalles && <p className="text-muted dark:text-dark-text-secondary">{plan.detalles}</p>}
        </div>
      )}

      <div className="rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
        <div>
          <div className="flex items-end justify-between gap-3 mb-1.5">
            <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Juntado')}</p>
            <p className="text-[11px] text-muted dark:text-dark-text-secondary">
              ${formatearMonto(pagado)} / ${formatearMonto(plan.monto_objetivo)}
            </p>
          </div>
          <div className="h-2.5 w-full rounded-full bg-canvas dark:bg-dark-bg overflow-hidden">
            <div className={`h-full rounded-full ${completo ? 'bg-good' : 'bg-accent dark:bg-dark-accent'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`text-xs mt-1.5 ${completo ? 'text-good font-medium' : 'text-muted dark:text-dark-text-secondary'}`}>
            {completo ? t('¡Objetivo completado!') : `${t('Faltan')} $${formatearMonto(falta)}`}
          </p>
        </div>

        {plan.estado === 'activo' && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setRegistrandoPago((v) => !v);
                setEligiendoEquipo(false);
                limpiarFormularioPago();
                setError(null);
              }}
              className="flex-1 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white"
            >
              {registrandoPago ? t('Cancelar') : `+ ${t('Registrar pago')}`}
            </button>
            <button
              onClick={() => {
                if (plan.dispositivo_id) {
                  completarPlan();
                  return;
                }
                setRegistrandoPago(false);
                abrirEligiendoEquipo();
              }}
              disabled={procesando}
              className="flex-1 rounded-xl border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
            >
              {plan.dispositivo_id ? t('Entregar y generar venta') : t('Completar y generar venta')}
            </button>
          </div>
        )}
        {plan.estado !== 'activo' && (
          <button
            onClick={() => cambiarEstado('activo')}
            disabled={procesando}
            className="rounded-xl border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
          >
            {t('Reactivar plan')}
          </button>
        )}

        {eligiendoEquipo && (
          <div className="flex flex-col gap-2 border-t border-border dark:border-dark-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">{t('¿Qué equipo le vas a entregar?')}</p>
              <button onClick={() => setEligiendoEquipo(false)} className="text-xs text-muted dark:text-dark-text-secondary underline">
                {t('Cerrar')}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setModoNuevoEquipo(false)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                  !modoNuevoEquipo ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                }`}
              >
                {t('Buscar en Stock')}
              </button>
              {puedeAgregarStock && (
                <button
                  onClick={abrirNuevoEquipo}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                    modoNuevoEquipo ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                  }`}
                >
                  + {t('Cargar equipo nuevo')}
                </button>
              )}
            </div>

            {!modoNuevoEquipo ? (
              <div className="flex flex-col gap-2">
                <input
                  value={busquedaEquipo}
                  onChange={(e) => setBusquedaEquipo(e.target.value)}
                  autoFocus
                  placeholder={t('Buscar por modelo, color o IMEI...')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                {buscandoEquipos && <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Buscando...')}</p>}
                {!buscandoEquipos && equiposFiltrados.length === 0 && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary">{t('No hay equipos en Stock que matcheen esa búsqueda.')}</p>
                )}
                <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                  {equiposFiltrados.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-border dark:border-dark-border bg-canvas dark:bg-dark-bg px-3 py-2 flex items-center justify-between gap-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {d.modelo || t('Sin modelo')}
                          {d.capacidad_gb ? ` · ${d.capacidad_gb}GB` : ''}
                          {d.color ? ` · ${d.color}` : ''}
                        </p>
                        {(d.imei || d.precio != null) && (
                          <p className="text-[11px] text-muted dark:text-dark-text-secondary truncate">
                            {d.imei ? `IMEI ${d.imei}` : ''}
                            {d.imei && d.precio != null ? ' · ' : ''}
                            {d.precio != null ? `$${formatearMonto(d.precio)}` : ''}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => completarPlan(d.id)}
                        disabled={procesando}
                        className="shrink-0 rounded-lg bg-accent dark:bg-dark-accent text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                      >
                        {t('Usar este')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  value={nuevoModelo}
                  onChange={(e) => setNuevoModelo(e.target.value)}
                  placeholder={t('Modelo')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  {STORAGE_OPTIONS.map((gb) => (
                    <button
                      key={gb}
                      type="button"
                      onClick={() => setNuevoCapacidad(nuevoCapacidad === gb ? null : gb)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
                        nuevoCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
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
                  placeholder={t('IMEI (opcional)')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <input
                  value={nuevoBateria}
                  onChange={(e) => setNuevoBateria(sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  placeholder={t('Salud de batería % (opcional)')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <SelectorEstadoDispositivo value={nuevoEstadoEquipo} onChange={setNuevoEstadoEquipo} />
                <input
                  value={nuevoPrecio}
                  onChange={(e) => setNuevoPrecio(sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  placeholder={t('Precio')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={nuevoCosto}
                  onChange={(e) => setNuevoCosto(sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  placeholder={t('Costo (opcional)')}
                  className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  disabled={!nuevoModelo.trim() || guardandoNuevoEquipo || procesando}
                  onClick={guardarNuevoEquipoYCompletar}
                  className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {guardandoNuevoEquipo ? t('Guardando...') : t('Guardar y entregar')}
                </button>
              </div>
            )}
          </div>
        )}

        {registrandoPago && (
          <div className="flex flex-col gap-2 border-t border-border dark:border-dark-border pt-3">
            <select
              value={medioPago}
              onChange={(e) => setMedioPago(e.target.value)}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="efectivo">{t('Efectivo')}</option>
              <option value="transferencia">{t('Transferencia')}</option>
              <option value="débito">{t('Débito')}</option>
              <option value="crédito">{t('Crédito')}</option>
              <option value="usdt">USDT</option>
              <option value="canje">{t('Plan canje (dispositivo)')}</option>
            </select>

            {medioPago === 'canje' ? (
              <div className="flex flex-col gap-2 rounded-lg bg-canvas dark:bg-dark-bg p-2.5">
                <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                  {t('El monto reconocido de cada equipo se suma al plan de ahorro, y los equipos se guardan en Plan Canje para revisarlos después.')}
                </p>

                {canjesCarrito.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {canjesCarrito.map((c, idx) => (
                      <div
                        key={c.tempId}
                        className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 flex items-center justify-between gap-2 text-sm"
                      >
                        <p className="font-medium truncate">
                          {canjesCarrito.length > 1 ? `${idx + 1}. ` : ''}
                          {c.modelo}
                          {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                          {c.color ? ` · ${c.color}` : ''}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            value={c.monto}
                            onChange={(e) => actualizarMontoCanje(c.tempId, sanitizarDecimal(e.target.value))}
                            inputMode="decimal"
                            placeholder={t('Monto')}
                            className="w-20 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded px-2 py-1 text-sm"
                          />
                          <button type="button" onClick={() => quitarCanje(c.tempId)} className="text-bad text-xs font-medium">
                            {t('Quitar')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  value={canjeModelo}
                  onChange={(e) => setCanjeModelo(e.target.value)}
                  placeholder={t('Modelo del equipo que recibís')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <SelectorEstadoDispositivo value={canjeCondicion} onChange={setCanjeCondicion} label={t('Estado')} />
                <div className="flex gap-2">
                  {STORAGE_OPTIONS.map((gb) => (
                    <button
                      key={gb}
                      type="button"
                      onClick={() => setCanjeCapacidad(canjeCapacidad === gb ? null : gb)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
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
                  inputMode="numeric"
                  placeholder={t('Salud de batería % (opcional)')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={canjeImei}
                  onChange={(e) => setCanjeImei(e.target.value)}
                  placeholder={t('IMEI (opcional)')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={canjeUbicacion}
                  onChange={(e) => setCanjeUbicacion(e.target.value)}
                  placeholder={t('Ubicación física (opcional)')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={canjeMonto}
                  onChange={(e) => setCanjeMonto(sanitizarDecimal(e.target.value))}
                  inputMode="decimal"
                  placeholder={t('Monto reconocido')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={canjeDetalles}
                  onChange={(e) => setCanjeDetalles(e.target.value)}
                  placeholder={t('Detalles (opcional)')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={agregarCanje}
                  disabled={!canjeModelo.trim()}
                  className="rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium disabled:opacity-40"
                >
                  + {t('Agregar otro equipo')}
                </button>
                <p className="text-xs font-medium">
                  {t('Total a sumar al plan:')} ${formatearMonto(montoCanjeTotal)}
                </p>
              </div>
            ) : (
              <input
                value={montoPago}
                onChange={(e) => setMontoPago(sanitizarDecimal(e.target.value))}
                inputMode="decimal"
                autoFocus
                placeholder={t('Monto que paga hoy')}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            )}

            <input
              value={obsPago}
              onChange={(e) => setObsPago(e.target.value)}
              placeholder={t('Observación (opcional)')}
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              disabled={
                guardandoPago ||
                (medioPago === 'canje'
                  ? montoCanjeTotal <= 0 || canjesEfectivos.some((c) => !c.modelo.trim())
                  : !montoPago)
              }
              onClick={registrarPago}
              className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {guardandoPago ? t('Guardando...') : t('Guardar y ver comprobante')}
            </button>
          </div>
        )}

        {movimientos.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border dark:border-dark-border pt-3">
            <p className="text-[11px] uppercase tracking-wide text-muted dark:text-dark-text-secondary">{t('Pagos')}</p>
            {movimientos.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {m.medio ? medioLabel(m.medio, t) : t('Pago')}
                    {m.observacion ? ` · ${m.observacion}` : ''}
                  </p>
                  <p className="text-[11px] text-muted dark:text-dark-text-secondary">{new Date(m.fecha).toLocaleDateString('es-AR')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-medium text-good">+${formatearMonto(m.monto)}</p>
                  <Link href={`/plan-ahorro/${id}/comprobante/${m.id}`} className="text-[11px] text-accent dark:text-dark-accent underline">
                    {t('Comprobante')}
                  </Link>
                  <button onClick={() => anularMovimiento(m.id)} className="text-[11px] text-bad underline">
                    {t('Anular')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
