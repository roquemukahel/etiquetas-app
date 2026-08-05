'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { limpiarImei } from '../../lib/imei';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { simboloMoneda } from '../../lib/monedas';
import Avatar from '../../Avatar';
import SelectorColor from '../../SelectorColor';

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
  tipo: string;
};

type Vendedor = { id: string; nombre: string };

type Orden = {
  id: string;
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
  estado: string;
  created_at: string;
  nota: string | null;
  incluir_garantia: boolean;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
  vendedores: { nombre: string; foto_url: string | null } | null;
  orden_items: Item[];
};

type ItemEditable = { id: string; descripcion: string; cantidad: string; precioUnitario: string; tipo: string };

type Canje = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  salud_bateria: number | null;
  detalles: string | null;
  monto: number | null;
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
};

export default function DetalleOrden() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeEliminar = tienePermiso(actor, 'eliminar');

  const [orden, setOrden] = useState<Orden | null>(null);
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [formaPagoEdit, setFormaPagoEdit] = useState('Efectivo');
  const [notaEdit, setNotaEdit] = useState('');
  const [incluirGarantiaEdit, setIncluirGarantiaEdit] = useState(true);
  const [anticipoEdit, setAnticipoEdit] = useState('');
  const [impuestoEdit, setImpuestoEdit] = useState('');
  const [itemsEdit, setItemsEdit] = useState<ItemEditable[]>([]);
  const [vendedorEdit, setVendedorEdit] = useState('');
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [monedasDisponibles, setMonedasDisponibles] = useState<string[]>([]);
  const [tipoCambio, setTipoCambio] = useState<number | null>(null);
  const [mostrarSecundariaEdit, setMostrarSecundariaEdit] = useState(false);
  const [montoSecundarioEdit, setMontoSecundarioEdit] = useState('');

  // --- canjes (Plan canje) de esta orden ---
  const [canjesEdit, setCanjesEdit] = useState<CanjeEditable[]>([]);
  const [canjeModelo, setCanjeModelo] = useState('');
  const [canjeCapacidad, setCanjeCapacidad] = useState<number | null>(null);
  const [canjeColor, setCanjeColor] = useState('');
  const [canjeImei, setCanjeImei] = useState('');
  const [canjeBateria, setCanjeBateria] = useState('');
  const [canjeMonto, setCanjeMonto] = useState('');
  const [canjeDetalles, setCanjeDetalles] = useState('');
  const [agregandoCanje, setAgregandoCanje] = useState(false);

  const [yaDerivado, setYaDerivado] = useState(false);
  const [derivarAbierto, setDerivarAbierto] = useState(false);
  const [derivarModelo, setDerivarModelo] = useState('');
  const [derivarCapacidad, setDerivarCapacidad] = useState<number | null>(null);
  const [derivarColor, setDerivarColor] = useState('');
  const [derivarImei, setDerivarImei] = useState('');
  const [derivarDetalles, setDerivarDetalles] = useState('');
  const [derivando, setDerivando] = useState(false);

  const cargar = async () => {
    const { data } = await supabase
      .from('ordenes')
      .select(
        '*, clientes ( nombre, apellido, telefono ), vendedores ( nombre, foto_url ), orden_items ( id, descripcion, cantidad, precio_unitario, dispositivo_id, tipo )'
      )
      .eq('id', id)
      .single();
    setOrden(data as any);
    setLoading(false);
    const { data: reparacionExistente } = await supabase.from('reparaciones').select('id').eq('orden_origen_id', id).maybeSingle();
    setYaDerivado(!!reparacionExistente);
    const { data: canjesData } = await supabase
      .from('canjes')
      .select('id, modelo, capacidad_gb, color, imei, salud_bateria, detalles, monto')
      .eq('orden_id', id)
      .eq('estado', 'en_canje')
      .order('created_at');
    setCanjes((canjesData as Canje[]) ?? []);
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
    const descripciones = orden.orden_items.filter((i) => i.tipo === 'trabajo').map((i) => i.descripcion);
    setDerivarModelo('');
    setDerivarCapacidad(null);
    setDerivarColor('');
    setDerivarImei('');
    setDerivarDetalles(descripciones.join(', '));
    setDerivarAbierto(true);
  };

  const derivarAServicioTecnico = async () => {
    if (!orden || !derivarModelo.trim()) return;
    setDerivando(true);
    const nombreCliente = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : 'sin cliente';
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
    setDerivarAbierto(false);
    setDerivando(false);
  };

  const empezarEdicion = () => {
    if (!orden) return;
    setFormaPagoEdit(orden.forma_pago || 'Efectivo');
    setNotaEdit(orden.nota || '');
    setIncluirGarantiaEdit(orden.incluir_garantia);
    setAnticipoEdit(orden.anticipo != null ? String(orden.anticipo) : '');
    setImpuestoEdit(orden.impuesto_porcentaje != null ? String(orden.impuesto_porcentaje) : '');
    setVendedorEdit(orden.vendedor_id || '');
    setMostrarSecundariaEdit(orden.monto_secundario != null);
    setMontoSecundarioEdit(orden.monto_secundario != null ? String(orden.monto_secundario) : '');
    setItemsEdit(
      orden.orden_items.map((i) => ({
        id: i.id,
        descripcion: i.descripcion,
        cantidad: String(i.cantidad),
        precioUnitario: String(i.precio_unitario),
        tipo: i.tipo,
      }))
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
    setError(null);
    setEditando(true);
  };

  // Al llegar desde la boleta con "Editar boleta" (?editar=1), abre
  // directo el formulario de edición en vez de mostrar primero el
  // detalle de solo lectura.
  const abrioEdicionDesdeQuery = useRef(false);
  useEffect(() => {
    if (orden && !abrioEdicionDesdeQuery.current && new URLSearchParams(window.location.search).get('editar') === '1') {
      abrioEdicionDesdeQuery.current = true;
      empezarEdicion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden]);

  const actualizarItemEdit = (itemId: string, campo: 'descripcion' | 'cantidad' | 'precioUnitario', valor: string) =>
    setItemsEdit((items) => items.map((i) => (i.id === itemId ? { ...i, [campo]: valor } : i)));

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
      },
    ]);
    setCanjeModelo('');
    setCanjeCapacidad(null);
    setCanjeColor('');
    setCanjeImei('');
    setCanjeBateria('');
    setCanjeMonto('');
    setCanjeDetalles('');
    setAgregandoCanje(false);
  };

  const quitarCanjeEdit = (tempId: string) => setCanjesEdit((c) => c.filter((x) => x.tempId !== tempId));

  const actualizarCanjeEdit = (tempId: string, monto: string) =>
    setCanjesEdit((c) => c.map((x) => (x.tempId === tempId ? { ...x, monto } : x)));

  const subtotalEdit = itemsEdit.reduce((acc, i) => acc + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0), 0);
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
    const montoSecundarioNuevo = mostrarSecundariaEdit && montoSecundarioEdit ? Number(montoSecundarioEdit) : null;
    const monedaSecundariaNueva = mostrarSecundariaEdit ? monedasDisponibles[1] || orden.moneda_secundaria || null : null;
    if ((orden.monto_secundario ?? null) !== montoSecundarioNuevo) {
      cambios.monto_secundario = { antes: orden.monto_secundario, despues: montoSecundarioNuevo };
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
        const original = orden.orden_items.find((i) => i.id === edit.id);
        if (!original) return null;
        const cantidad = Math.max(1, Number(edit.cantidad) || 1);
        const precio = Number(edit.precioUnitario) || 0;
        const descripcion = edit.descripcion.trim() || original.descripcion;
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

    if (
      Object.keys(cambios).length === 0 &&
      itemsCambiados.length === 0 &&
      canjesNuevos.length === 0 &&
      canjesEliminados.length === 0 &&
      canjesModificados.length === 0
    ) {
      setEditando(false);
      setGuardando(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('ordenes')
      .update({
        forma_pago: formaPagoEdit,
        nota: notaEdit.trim() || null,
        incluir_garantia: incluirGarantiaEdit,
        anticipo: anticipoNuevo,
        impuesto_porcentaje: impuestoNuevo,
        total: totalEdit,
        monto_canje: montoCanjeEdit,
        vendedor_id: vendedorNuevo,
        monto_secundario: montoSecundarioNuevo,
        moneda_secundaria: monedaSecundariaNueva,
      })
      .eq('id', id);
    if (updateError) {
      setError('No pudimos guardar los cambios: ' + updateError.message);
      setGuardando(false);
      return;
    }

    for (const cambio of itemsCambiados) {
      const despues = cambio.despues as { descripcion: string; cantidad: number; precio_unitario: number };
      await supabase
        .from('orden_items')
        .update({ descripcion: despues.descripcion, cantidad: despues.cantidad, precio_unitario: despues.precio_unitario })
        .eq('id', cambio.id);
    }

    if (canjesEliminados.length > 0) {
      const { error: canjesDelError } = await supabase
        .from('canjes')
        .delete()
        .in('id', canjesEliminados.map((c) => c.id));
      if (canjesDelError) {
        setError('No pudimos quitar algún canje: ' + canjesDelError.message);
        setGuardando(false);
        return;
      }
    }

    for (const c of canjesModificados) {
      const { error: canjeUpdError } = await supabase
        .from('canjes')
        .update({ monto: c.monto ? Number(c.monto) : null })
        .eq('id', c.id);
      if (canjeUpdError) {
        setError('No pudimos actualizar un canje: ' + canjeUpdError.message);
        setGuardando(false);
        return;
      }
    }

    if (canjesNuevos.length > 0) {
      const { error: canjesInsError } = await supabase.from('canjes').insert(
        canjesNuevos.map((c) => ({
          orden_id: id,
          modelo: c.modelo.trim() || null,
          capacidad_gb: c.capacidad_gb,
          color: c.color.trim() || null,
          imei: c.imei.trim() || null,
          salud_bateria: c.salud_bateria ? Number(c.salud_bateria) : null,
          detalles: c.detalles.trim() || null,
          monto: c.monto ? Number(c.monto) : null,
          vendedor_id: vendedorNuevo,
        }))
      );
      if (canjesInsError) {
        setError('No pudimos agregar algún canje nuevo: ' + canjesInsError.message);
        setGuardando(false);
        return;
      }
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
      setError('No pudimos actualizar el estado: ' + updateError.message);
      setGuardando(false);
      return;
    }
    setOrden({ ...orden, estado: nuevoEstado });
    setGuardando(false);
  };

  const handleCancelar = async () => {
    if (!orden || !puedeEliminar) return;
    if (!confirm('¿Cancelar esta orden? Los dispositivos vuelven a aparecer en stock.')) return;
    setGuardando(true);
    setError(null);

    const dispositivoIds = orden.orden_items.map((i) => i.dispositivo_id).filter(Boolean) as string[];
    if (dispositivoIds.length > 0) {
      await supabase
        .from('dispositivos')
        .update({ en_stock: true, en_stock_desde: new Date().toISOString(), alerta_stock_enviada: false })
        .in('id', dispositivoIds);
    }
    // Se borran antes de eliminar la orden: canjes.orden_id queda en null
    // automáticamente al borrar la orden (on delete set null), así que
    // después ya no se los podría encontrar por ese filtro.
    await supabase.from('canjes').delete().eq('orden_id', id).eq('estado', 'en_canje');
    const { error: deleteError } = await supabase.from('ordenes').delete().eq('id', id);
    if (deleteError) {
      setError('No pudimos cancelar la orden: ' + deleteError.message);
      setGuardando(false);
      return;
    }
    const nombreCliente = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : 'sin cliente';
    await registrarAuditoria(supabase, {
      accion: `eliminó/canceló una orden (${nombreCliente}, total $${orden.total?.toLocaleString('es-AR') ?? 0})`,
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
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!orden) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No encontramos esa orden.</p>
        <Link href="/ordenes" className="text-sm text-accent dark:text-dark-accent underline">
          Volver a órdenes
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
          <span className="text-lg font-medium">Editar orden</span>
        </header>

        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Forma de pago</label>
          <div className="flex gap-2">
            {FORMAS_PAGO.map((f) => (
              <button
                key={f}
                onClick={() => setFormaPagoEdit(f)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  formaPagoEdit === f ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Vendedor</label>
          <select
            value={vendedorEdit}
            onChange={(e) => setVendedorEdit(e.target.value)}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          >
            <option value="">Sin asignar</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        </div>

        {monedasDisponibles.length > 1 && (
          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={mostrarSecundariaEdit}
                onChange={(e) => {
                  setMostrarSecundariaEdit(e.target.checked);
                  if (e.target.checked && !montoSecundarioEdit && tipoCambio) {
                    setMontoSecundarioEdit(Math.round(totalEdit * tipoCambio).toString());
                  }
                }}
                className="h-5 w-5 accent-ink"
              />
              <span className="text-sm font-medium">
                Mostrar también el precio en {monedasDisponibles[1]} ({simboloMoneda(monedasDisponibles[1])})
              </span>
            </label>
            {mostrarSecundariaEdit && (
              <>
                <input
                  value={montoSecundarioEdit}
                  onChange={(e) => setMontoSecundarioEdit(e.target.value)}
                  inputMode="numeric"
                  placeholder={`Monto en ${monedasDisponibles[1]}`}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                />
                <p className="text-xs text-muted dark:text-dark-text-secondary">
                  Valor informativo, no afecta las Estadísticas.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {itemsEdit.map((i) => (
            <div key={i.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
              <input
                value={i.descripcion}
                onChange={(e) => actualizarItemEdit(i.id, 'descripcion', e.target.value)}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-2 text-xs">
                <input
                  value={i.cantidad}
                  onChange={(e) => actualizarItemEdit(i.id, 'cantidad', e.target.value)}
                  disabled={i.tipo === 'dispositivo'}
                  title={i.tipo === 'dispositivo' ? 'Un dispositivo del stock siempre se vende de a uno' : undefined}
                  inputMode="numeric"
                  className="w-16 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-2 py-1 text-center disabled:opacity-50"
                />
                <span>×</span>
                <span>$</span>
                <input
                  value={i.precioUnitario}
                  onChange={(e) => actualizarItemEdit(i.id, 'precioUnitario', e.target.value)}
                  inputMode="numeric"
                  className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-2 py-1"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Plan canje</p>

          {canjesEdit.length > 0 && (
            <div className="flex flex-col gap-2">
              {canjesEdit.map((c, idx) => (
                <div key={c.tempId} className="rounded-lg bg-canvas dark:bg-dark-bg p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {canjesEdit.length > 1 ? `${idx + 1}. ` : ''}
                      {c.modelo || 'Sin modelo'}
                      {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                      {c.color ? ` · ${c.color}` : ''}
                    </p>
                    {c.imei && <p className="text-xs text-muted dark:text-dark-text-secondary">IMEI: {c.imei}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs">$</span>
                    <input
                      value={c.monto}
                      onChange={(e) => actualizarCanjeEdit(c.tempId, e.target.value)}
                      inputMode="numeric"
                      className="w-20 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-2 py-1 text-sm"
                    />
                    <button onClick={() => quitarCanjeEdit(c.tempId)} className="text-xs text-bad underline">
                      Quitar
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
                placeholder="Modelo (ej. iPhone 11)"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
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
              <SelectorColor value={canjeColor} onChange={setCanjeColor} />
              <div className="flex gap-2">
                <input
                  value={canjeImei}
                  onChange={(e) => setCanjeImei(e.target.value)}
                  placeholder="IMEI"
                  className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                />
                <input
                  value={canjeBateria}
                  onChange={(e) => setCanjeBateria(e.target.value)}
                  placeholder="Batería %"
                  inputMode="numeric"
                  className="w-24 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <input
                value={canjeMonto}
                onChange={(e) => setCanjeMonto(e.target.value)}
                placeholder="Monto que se le reconoce"
                inputMode="numeric"
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={canjeDetalles}
                onChange={(e) => setCanjeDetalles(e.target.value)}
                placeholder="Detalles (opcional)"
                rows={2}
                className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setAgregandoCanje(false)}
                  className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  disabled={!canjeModelo.trim()}
                  onClick={agregarCanjeEdit}
                  className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Agregar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAgregandoCanje(true)}
              className="self-start text-xs text-accent dark:text-dark-accent underline"
            >
              + Agregar equipo de canje
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Anticipo</label>
            <input
              value={anticipoEdit}
              onChange={(e) => setAnticipoEdit(e.target.value)}
              inputMode="numeric"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Impuesto %</label>
            <input
              value={impuestoEdit}
              onChange={(e) => setImpuestoEdit(e.target.value)}
              inputMode="numeric"
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Nota para la boleta</label>
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
          <span className="text-sm font-medium">Incluir el texto de garantía en la boleta</span>
        </label>

        <div className="flex items-center justify-between text-lg font-medium border-t border-border dark:border-dark-border pt-3">
          <span>Total</span>
          <span>${totalEdit.toLocaleString('es-AR')}</span>
        </div>

        <button
          disabled={guardando}
          onClick={guardarEdicion}
          className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {guardando ? 'Guardando...' : 'Guardar cambios'}
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
        <span className="text-lg font-medium mr-auto">Orden</span>
        <button onClick={empezarEdicion} className="text-xs text-accent dark:text-dark-accent underline">
          Editar
        </button>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-4 py-3 text-sm flex flex-col gap-1">
        <p>
          <span className="text-muted dark:text-dark-text-secondary">Cliente:</span>{' '}
          {orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}` : 'Sin cliente'}
        </p>
        {orden.clientes?.telefono && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">Teléfono:</span> {orden.clientes.telefono}
          </p>
        )}
        {orden.vendedores?.nombre && (
          <p className="flex items-center gap-1.5">
            <span className="text-muted dark:text-dark-text-secondary">Vendedor:</span>
            <Avatar src={orden.vendedores.foto_url} nombre={orden.vendedores.nombre} size={34} /> {orden.vendedores.nombre}
          </p>
        )}
        <p>
          <span className="text-muted dark:text-dark-text-secondary">Forma de pago:</span> {orden.forma_pago}
        </p>
        {orden.total != null && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">Total:</span> ${orden.total.toLocaleString('es-AR')}
          </p>
        )}
        {orden.nota && (
          <p>
            <span className="text-muted dark:text-dark-text-secondary">Nota:</span> {orden.nota}
          </p>
        )}
      </div>

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
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Plan canje</p>
          {canjes.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between text-sm"
            >
              <span>
                {c.modelo || 'Sin modelo'}
                {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                {c.color ? ` · ${c.color}` : ''}
                {c.imei ? ` · IMEI ${c.imei}` : ''}
              </span>
              {c.monto != null && <span className="font-medium">${c.monto.toLocaleString('es-AR')}</span>}
            </div>
          ))}
        </div>
      )}

      <Link
        href={`/ordenes/${orden.id}/boleta`}
        className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        Ver boleta
      </Link>

      {tieneTrabajo && yaDerivado && (
        <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
          Este equipo ya fue derivado a{' '}
          <Link href="/servicio-tecnico" className="text-accent dark:text-dark-accent underline">
            Servicio Técnico
          </Link>
          .
        </p>
      )}

      {tieneTrabajo && !yaDerivado && !derivarAbierto && (
        <button
          onClick={abrirDerivar}
          className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
        >
          Derivar a Servicio Técnico
        </button>
      )}

      {derivarAbierto && (
        <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Datos del equipo a derivar</p>
          <input
            value={derivarModelo}
            onChange={(e) => setDerivarModelo(e.target.value)}
            placeholder="Modelo (ej. iPhone 13)"
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
          <SelectorColor value={derivarColor} onChange={setDerivarColor} />
          <input
            value={derivarImei}
            onChange={(e) => setDerivarImei(e.target.value)}
            placeholder="IMEI"
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
          />
          <textarea
            value={derivarDetalles}
            onChange={(e) => setDerivarDetalles(e.target.value)}
            placeholder="Detalles (ej. no enciende, pantalla rota)"
            rows={2}
            className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setDerivarAbierto(false)}
              className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              disabled={!derivarModelo.trim() || derivando}
              onClick={derivarAServicioTecnico}
              className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {derivando ? 'Derivando...' : 'Derivar a Servicio Técnico'}
            </button>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Estado</label>
        <div className="flex gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e}
              disabled={guardando}
              onClick={() => cambiarEstado(e)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize disabled:opacity-40 ${
                orden.estado === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {puedeEliminar && (
        <button
          disabled={guardando}
          onClick={handleCancelar}
          className="mt-auto w-full rounded-2xl border border-bad/30 py-3 text-center text-sm font-medium text-bad disabled:opacity-40"
        >
          Cancelar orden
        </button>
      )}
    </main>
  );
}
