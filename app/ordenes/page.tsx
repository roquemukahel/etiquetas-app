'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { registrarAuditoria } from '../lib/auditoria';
import { generarOrdenDeReparacion } from '../lib/ordenesServicio';

type Orden = {
  id: string;
  forma_pago: string | null;
  total: number | null;
  estado: string;
  created_at: string;
  clientes: { nombre: string; apellido: string | null } | null;
  orden_items: { descripcion: string; tipo: string }[];
};

// Plan canje del dispositivo que el cliente entregó como parte de pago —
// vive en su propia tabla (no en orden_items), así que sin esto una orden
// solo se podía encontrar buscando el equipo que se LLEVÓ, nunca el que
// dejó a cambio.
type CanjeOrden = { orden_id: string | null; modelo: string | null; imei: string | null; color: string | null };

// Reparaciones que el técnico ya marcó "listo para entregar" y todavía no se
// cobraron: el vendedor genera la boleta desde acá. Traemos todos los campos
// (select *) porque son poquitas filas y el helper necesita el checklist para
// armar la nota de condición del equipo.
type ReparacionLista = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  imei: string | null;
  diagnostico: string | null;
  importe_total: number | null;
  presupuesto_mano_obra: number | null;
  presupuesto_repuestos: number | null;
  cliente_id: string | null;
  orden_cobro_id: string | null;
  fecha_reparado: string | null;
  clientes: { nombre: string; apellido: string | null } | null;
};

const ESTADOS = ['todas', 'pendiente', 'pagado', 'entregado'];
const TIPOS: { id: 'todas' | 'ventas' | 'servicio'; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'servicio', label: 'Servicio técnico' },
];

// Mismo criterio que ya se usaba solo para la etiqueta de cada tarjeta:
// una orden es "de servicio técnico" si todos sus ítems son trabajos
// (nunca hay un dispositivo/producto vendido junto), típicamente porque
// viene de recibir un equipo a reparar o de cobrar un arreglo.
function esServicioTecnico(o: Orden) {
  return o.orden_items.length > 0 && o.orden_items.every((i) => i.tipo === 'trabajo');
}

export default function Ordenes() {
  const supabase = crearClienteNavegador();
  const router = useRouter();
  const actor = useActor();
  const puedeVender = tienePermiso(actor, 'vender');
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [canjes, setCanjes] = useState<CanjeOrden[]>([]);
  const [reparacionesListas, setReparacionesListas] = useState<ReparacionLista[]>([]);
  const [reparacionesCanceladas, setReparacionesCanceladas] = useState<ReparacionLista[]>([]);
  const [generando, setGenerando] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [filtroTipo, setFiltroTipo] = useState<'todas' | 'ventas' | 'servicio'>('todas');
  const [busqueda, setBusqueda] = useState('');

  const cargar = async () => {
    const [{ data: ordenesData }, { data: listasData }, { data: canceladasData }, { data: canjesData }] = await Promise.all([
      supabase
        .from('ordenes')
        .select('*, clientes ( nombre, apellido ), orden_items ( descripcion, tipo )')
        .order('created_at', { ascending: false }),
      // Reparaciones terminadas por el técnico (con cliente) que faltan cobrar.
      supabase
        .from('reparaciones')
        .select('*, clientes ( nombre, apellido )')
        .eq('estado', 'listo_para_entregar')
        .not('cliente_id', 'is', null)
        .order('fecha_reparado', { ascending: true }),
      // Reparaciones de cliente canceladas/sin solución a las que todavía no
      // se les generó boleta (ej. para cobrar el diagnóstico, o solo dejar
      // constancia con $0) — dejan de aparecer acá apenas tienen boleta.
      supabase
        .from('reparaciones')
        .select('*, clientes ( nombre, apellido )')
        .eq('estado', 'cancelado')
        .not('cliente_id', 'is', null)
        .is('orden_cobro_id', null)
        .order('estado_actualizado_at', { ascending: false }),
      // Plan canje de cada orden, para poder buscar por el equipo que el
      // cliente entregó (no solo por el que se llevó).
      supabase.from('canjes').select('orden_id, modelo, imei, color').not('orden_id', 'is', null),
    ]);
    setOrdenes((ordenesData as any) ?? []);
    setReparacionesListas((listasData as any) ?? []);
    setReparacionesCanceladas((canceladasData as any) ?? []);
    setCanjes((canjesData as CanjeOrden[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const generarBoleta = async (r: ReparacionLista) => {
    if (!puedeVender || generando) return;
    if (!confirm(`¿Generar la boleta de ${r.modelo || 'este equipo'}? Se cobra el importe de la reparación.`)) return;
    setGenerando(r.id);
    const { ordenId, total, error } = await generarOrdenDeReparacion(supabase, r as any);
    if (error || !ordenId) {
      alert(error || 'No pudimos generar la boleta.');
      setGenerando(null);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `generó la boleta de una reparación lista (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'})`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorNuevo: { orden_id: ordenId, total },
    });
    router.push(`/ordenes/${ordenId}`);
  };

  const generarBoletaCancelada = async (r: ReparacionLista) => {
    if (!puedeVender || generando) return;
    if (
      !confirm(
        `¿Generar la boleta de ${r.modelo || 'este equipo'}? La reparación queda como cancelada/sin solución — esto es solo para cobrar el diagnóstico o dejar constancia, no cambia ese estado.`
      )
    )
      return;
    setGenerando(r.id);
    const { ordenId, total, error } = await generarOrdenDeReparacion(supabase, r as any, { marcarEntregado: false });
    if (error || !ordenId) {
      alert(error || 'No pudimos generar la boleta.');
      setGenerando(null);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `generó la boleta de una reparación cancelada/sin solución (${r.numero_orden || ''}, ${r.modelo || 'sin modelo'})`,
      entidad: 'reparacion',
      entidadId: r.id,
      valorNuevo: { orden_id: ordenId, total },
    });
    router.push(`/ordenes/${ordenId}`);
  };

  const canjesPorOrden = useMemo(() => {
    const mapa = new Map<string, CanjeOrden[]>();
    for (const c of canjes) {
      if (!c.orden_id) continue;
      const arr = mapa.get(c.orden_id) ?? [];
      arr.push(c);
      mapa.set(c.orden_id, arr);
    }
    return mapa;
  }, [canjes]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ordenes
      .filter((o) => filtroEstado === 'todas' || o.estado === filtroEstado)
      .filter((o) => {
        if (filtroTipo === 'todas') return true;
        return filtroTipo === 'servicio' ? esServicioTecnico(o) : !esServicioTecnico(o);
      })
      .filter((o) => {
        if (!q) return true;
        const nombreCliente = o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido || ''}`.trim().toLowerCase() : '';
        // Modelo/IMEI ya viven adentro de la descripción del ítem (ej. "iPhone
        // 15 128GB Verde · IMEI 359..."), así que buscar en la descripción
        // también busca por esos datos sin tener que parsearlos aparte.
        const itemsTexto = o.orden_items.map((i) => i.descripcion.toLowerCase()).join(' ');
        // El dispositivo que el cliente ENTREGÓ como plan canje vive aparte
        // (tabla canjes), no en orden_items — sin esto, una orden con canje
        // solo se podía encontrar buscando el equipo que se llevó, nunca el
        // que dejó a cambio.
        const canjesTexto = (canjesPorOrden.get(o.id) ?? [])
          .map((c) => [c.modelo, c.imei, c.color].filter(Boolean).join(' '))
          .join(' ')
          .toLowerCase();
        return nombreCliente.includes(q) || itemsTexto.includes(q) || canjesTexto.includes(q);
      });
  }, [ordenes, filtroEstado, filtroTipo, busqueda, canjesPorOrden]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Órdenes</span>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por cliente, modelo, IMEI o plan canje..."
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      <div className="flex items-center gap-2 text-xs overflow-x-auto">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFiltroTipo(t.id)}
            className={`shrink-0 rounded-xl px-3 py-2 font-medium ${
              filtroTipo === t.id ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs overflow-x-auto">
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            className={`shrink-0 rounded-xl px-3 py-2 font-medium capitalize ${
              filtroEstado === e ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {puedeVender ? (
        <Link
          href="/ordenes/nueva"
          className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
        >
          + Nueva orden
        </Link>
      ) : (
        <p className="text-xs text-muted dark:text-dark-text-secondary text-center">
          No tenés permiso para crear órdenes.
        </p>
      )}

      {puedeVender && reparacionesListas.length > 0 && (
        <section className="rounded-2xl border border-good/40 bg-good/5 p-3 flex flex-col gap-2">
          <p className="text-sm font-medium text-good">
            🔧 Reparados por el técnico · listos para cobrar ({reparacionesListas.length})
          </p>
          {reparacionesListas.map((r) => {
            const importe = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.modelo || 'Equipo'}
                    {r.numero_orden && <span className="text-xs text-muted dark:text-dark-text-secondary"> · {r.numero_orden}</span>}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                    {r.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim() : 'Sin cliente'}
                    {importe > 0 && ` · $${importe.toLocaleString('es-AR')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/servicio-tecnico/${r.id}`}
                    className="text-xs text-accent dark:text-dark-accent underline whitespace-nowrap"
                  >
                    Ver ficha
                  </Link>
                  <button
                    disabled={generando === r.id}
                    onClick={() => generarBoleta(r)}
                    className="rounded-lg bg-good hover:opacity-90 transition-opacity px-3 py-2 text-xs font-medium text-white disabled:opacity-40 whitespace-nowrap"
                  >
                    {generando === r.id ? 'Generando…' : 'Generar boleta'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {puedeVender && reparacionesCanceladas.length > 0 && (
        <section className="rounded-2xl border border-bad/40 bg-bad/5 p-3 flex flex-col gap-2">
          <p className="text-sm font-medium text-bad">
            🔴 Cancelados sin solución ({reparacionesCanceladas.length})
          </p>
          {reparacionesCanceladas.map((r) => {
            const importe = r.importe_total ?? (r.presupuesto_mano_obra || 0) + (r.presupuesto_repuestos || 0);
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.modelo || 'Equipo'}
                    {r.numero_orden && <span className="text-xs text-muted dark:text-dark-text-secondary"> · {r.numero_orden}</span>}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">
                    {r.clientes ? `${r.clientes.nombre} ${r.clientes.apellido || ''}`.trim() : 'Sin cliente'}
                    {importe > 0 && ` · $${importe.toLocaleString('es-AR')}`}
                    {r.diagnostico && ` · ${r.diagnostico}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/servicio-tecnico/${r.id}`}
                    className="text-xs text-accent dark:text-dark-accent underline whitespace-nowrap"
                  >
                    Ver ficha
                  </Link>
                  <button
                    disabled={generando === r.id}
                    onClick={() => generarBoletaCancelada(r)}
                    className="rounded-lg bg-bad hover:opacity-90 transition-opacity px-3 py-2 text-xs font-medium text-white disabled:opacity-40 whitespace-nowrap"
                  >
                    {generando === r.id ? 'Generando…' : 'Generar boleta'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

      {!loading && filtradas.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">No hay órdenes para mostrar.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtradas.map((o) => (
          <Link
            key={o.id}
            href={`/ordenes/${o.id}`}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {o.orden_items.length > 0
                  ? `${o.orden_items[0].descripcion}${o.orden_items.length > 1 ? ` +${o.orden_items.length - 1}` : ''}`
                  : 'Orden vacía'}
                {o.orden_items.length > 0 && (
                  <span className="text-xs font-bold text-accent dark:text-dark-accent">
                    {' '}
                    — {esServicioTecnico(o) ? 'Servicio técnico' : 'Venta'}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted dark:text-dark-text-secondary">
                {o.clientes ? `${o.clientes.nombre} ${o.clientes.apellido || ''}` : 'Sin cliente'}
              </p>
              {(canjesPorOrden.get(o.id) ?? []).length > 0 && (
                <p className="text-[11px] text-accent dark:text-dark-accent mt-0.5">
                  🔄 Canje: {(canjesPorOrden.get(o.id) ?? []).map((c) => c.modelo || 'equipo').join(', ')}
                </p>
              )}
            </div>
            <div className="text-right">
              {o.total != null && <p className="text-sm font-medium">${o.total.toLocaleString('es-AR')}</p>}
              <p className="text-xs text-muted dark:text-dark-text-secondary capitalize">{o.estado}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
