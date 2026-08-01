'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import Avatar from '../../Avatar';

const ESTADOS = ['pendiente', 'pagado', 'entregado'];
const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta'];

type Item = { id: string; descripcion: string; cantidad: number; precio_unitario: number; dispositivo_id: string | null };

type Orden = {
  id: string;
  forma_pago: string | null;
  total: number | null;
  anticipo: number | null;
  impuesto_porcentaje: number | null;
  monto_canje: number | null;
  canje_id: string | null;
  estado: string;
  created_at: string;
  nota: string | null;
  incluir_garantia: boolean;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
  vendedores: { nombre: string; foto_url: string | null } | null;
  orden_items: Item[];
};

type ItemEditable = { id: string; descripcion: string; cantidad: string; precioUnitario: string };

export default function DetalleOrden() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [orden, setOrden] = useState<Orden | null>(null);
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

  const cargar = async () => {
    const { data } = await supabase
      .from('ordenes')
      .select(
        '*, clientes ( nombre, apellido, telefono ), vendedores ( nombre, foto_url ), orden_items ( id, descripcion, cantidad, precio_unitario, dispositivo_id )'
      )
      .eq('id', id)
      .single();
    setOrden(data as any);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, [id]);

  const empezarEdicion = () => {
    if (!orden) return;
    setFormaPagoEdit(orden.forma_pago || 'Efectivo');
    setNotaEdit(orden.nota || '');
    setIncluirGarantiaEdit(orden.incluir_garantia);
    setAnticipoEdit(orden.anticipo != null ? String(orden.anticipo) : '');
    setImpuestoEdit(orden.impuesto_porcentaje != null ? String(orden.impuesto_porcentaje) : '');
    setItemsEdit(
      orden.orden_items.map((i) => ({
        id: i.id,
        descripcion: i.descripcion,
        cantidad: String(i.cantidad),
        precioUnitario: String(i.precio_unitario),
      }))
    );
    setError(null);
    setEditando(true);
  };

  const actualizarItemEdit = (itemId: string, campo: 'descripcion' | 'cantidad' | 'precioUnitario', valor: string) =>
    setItemsEdit((items) => items.map((i) => (i.id === itemId ? { ...i, [campo]: valor } : i)));

  const subtotalEdit = itemsEdit.reduce((acc, i) => acc + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0), 0);
  // Sin Math.max(0, ...) a propósito: un anticipo mayor al precio puede dejar
  // el total en negativo (saldo a favor del cliente), y eso es válido.
  const totalEdit =
    subtotalEdit * (1 + (Number(impuestoEdit) || 0) / 100) - (Number(anticipoEdit) || 0) - (orden?.monto_canje || 0);

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

    if (Object.keys(cambios).length === 0 && itemsCambiados.length === 0) {
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

    const nombreCliente = orden.clientes ? `${orden.clientes.nombre} ${orden.clientes.apellido || ''}`.trim() : 'sin cliente';
    await registrarAuditoria(supabase, {
      accion: `editó una orden (${nombreCliente})`,
      entidad: 'orden',
      entidadId: orden.id,
      valorAnterior: {
        ...Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.antes])),
        ...(itemsCambiados.length > 0 ? { items: itemsCambiados.map((c) => ({ id: c.id, ...(c.antes as object) })) } : {}),
      },
      valorNuevo: {
        ...Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, v.despues])),
        ...(itemsCambiados.length > 0 ? { items: itemsCambiados.map((c) => ({ id: c.id, ...(c.despues as object) })) } : {}),
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
    if (!orden) return;
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
    const { error: deleteError } = await supabase.from('ordenes').delete().eq('id', id);
    if (orden.canje_id) {
      await supabase.from('canjes').delete().eq('id', orden.canje_id);
    }
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
                  inputMode="numeric"
                  className="w-16 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded px-2 py-1 text-center"
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
            <Avatar src={orden.vendedores.foto_url} nombre={orden.vendedores.nombre} size={28} /> {orden.vendedores.nombre}
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

      <Link
        href={`/ordenes/${orden.id}/boleta`}
        className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        Ver boleta
      </Link>

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

      <button
        disabled={guardando}
        onClick={handleCancelar}
        className="mt-auto w-full rounded-2xl border border-bad/30 py-3 text-center text-sm font-medium text-bad disabled:opacity-40"
      >
        Cancelar orden
      </button>
    </main>
  );
}
