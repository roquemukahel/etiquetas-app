'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { simboloMoneda } from '../lib/monedas';
import { obtenerTodasLasFilas } from '../lib/db';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { RankingBarras, RankingTorta, EvolucionBarras, Dato } from './graficos';

type Periodo = 'hoy' | 'semana' | 'mes' | 'anio';
type VistaRanking = 'barras' | 'torta';

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'anio', label: 'Año' },
];

const ESTADOS_COBRADOS = ['pagado', 'entregado'];

function inicioDePeriodo(periodo: Periodo): Date {
  const ahora = new Date();
  if (periodo === 'hoy') {
    const d = new Date(ahora);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periodo === 'semana') {
    const d = new Date(ahora);
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (periodo === 'mes') {
    const d = new Date(ahora);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(ahora.getFullYear(), 0, 1);
}

type Orden = {
  id: string;
  vendedor_id: string | null;
  cliente_id: string | null;
  total: number | null;
  // total = subtotal (con impuesto) − anticipo − canje (ver
  // app/ordenes/nueva/page.tsx). Es lo que queda por cobrar, NO el valor
  // vendido. Para Estadísticas queremos el valor real de la venta, así
  // que sumamos de vuelta el anticipo y el canje (ver montoVenta).
  anticipo: number | null;
  monto_canje: number | null;
  estado: string;
  forma_pago: string | null;
  created_at: string;
};

// Valor real de la venta. El "total" de la orden ya viene con el anticipo
// y el canje descontados (es el saldo a cobrar), pero una venta con un
// equipo entregado en canje o con seña sigue valiendo lo mismo: el equipo
// que entró por canje es mercadería que después se revende, y la seña es
// plata que igual entró. Antes Estadísticas sumaba solo "total", así que
// toda venta con canje quedaba subvaluada — este es el arreglo.
function montoVenta(o: Orden): number {
  return (o.total || 0) + (o.anticipo || 0) + (o.monto_canje || 0);
}
type OrdenItem = { orden_id: string; cantidad: number };
type Reparacion = { tecnico_id: string | null; fecha_reparado: string };
type IngresoServicio = { cliente_id: string | null; fecha_ingreso_servicio: string };
type Persona = { id: string; nombre: string; foto_url: string | null };
type Cliente = { id: string; nombre: string; apellido: string | null };
type Proveedor = { id: string; nombre: string };
type DispositivoCompra = { proveedor_id: string | null; costo: number | null; created_at: string };
type CompraManual = { proveedor_id: string; cantidad: number; precio_unitario: number | null; created_at: string };

export default function Estadisticas() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeVerEstadisticas = tienePermiso(actor, 'ver_estadisticas');

  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [vistaVendedores, setVistaVendedores] = useState<VistaRanking>('barras');
  const [vistaTecnicos, setVistaTecnicos] = useState<VistaRanking>('barras');
  const [vistaFormaPago, setVistaFormaPago] = useState<VistaRanking>('torta');
  const [vistaCompradores, setVistaCompradores] = useState<VistaRanking>('barras');
  const [vistaClientesServicio, setVistaClientesServicio] = useState<VistaRanking>('barras');
  const [vistaProveedores, setVistaProveedores] = useState<VistaRanking>('barras');

  const [vendedores, setVendedores] = useState<Persona[]>([]);
  const [tecnicos, setTecnicos] = useState<Persona[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [ordenItems, setOrdenItems] = useState<OrdenItem[]>([]);
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
  const [ingresosServicio, setIngresosServicio] = useState<IngresoServicio[]>([]);
  const [comprasProveedor, setComprasProveedor] = useState<DispositivoCompra[]>([]);
  const [comprasManuales, setComprasManuales] = useState<CompraManual[]>([]);
  const [moneda, setMoneda] = useState('$');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const desde = new Date();
      desde.setFullYear(desde.getFullYear() - 1);

      const [
        { data: perfil },
        { data: vend },
        { data: tec },
        cli,
        { data: prov },
        { data: ord },
        { data: items },
        { data: rep },
        { data: ing },
        { data: compras },
        { data: comprasManual },
      ] = await Promise.all([
        supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single(),
        supabase.from('vendedores').select('id, nombre, foto_url').order('nombre'),
        supabase.from('tecnicos').select('id, nombre, foto_url').order('nombre'),
        obtenerTodasLasFilas<Cliente>(supabase, 'clientes', 'id, nombre, apellido', [{ columna: 'nombre' }]),
        supabase.from('proveedores').select('id, nombre').order('nombre'),
        supabase
          .from('ordenes')
          .select('id, vendedor_id, cliente_id, total, anticipo, monto_canje, estado, forma_pago, created_at')
          .gte('created_at', desde.toISOString()),
        supabase.from('orden_items').select('orden_id, cantidad').gte('created_at', desde.toISOString()),
        supabase
          .from('reparaciones')
          .select('tecnico_id, fecha_reparado')
          .not('fecha_reparado', 'is', null)
          .gte('fecha_reparado', desde.toISOString()),
        supabase
          .from('reparaciones')
          .select('cliente_id, fecha_ingreso_servicio')
          .not('cliente_id', 'is', null)
          .not('fecha_ingreso_servicio', 'is', null)
          .gte('fecha_ingreso_servicio', desde.toISOString()),
        supabase
          .from('dispositivos')
          .select('proveedor_id, costo, created_at')
          .not('proveedor_id', 'is', null)
          .gte('created_at', desde.toISOString()),
        supabase
          .from('compras_proveedor')
          .select('proveedor_id, cantidad, precio_unitario, created_at')
          .gte('created_at', desde.toISOString()),
      ]);

      const negocio = (perfil as any)?.negocios;
      if (negocio?.moneda) setMoneda(simboloMoneda(negocio.moneda));
      setVendedores(vend ?? []);
      setTecnicos(tec ?? []);
      setClientes(cli);
      setProveedores((prov as Proveedor[]) ?? []);
      setOrdenes((ord as Orden[]) ?? []);
      setOrdenItems((items as OrdenItem[]) ?? []);
      setReparaciones((rep as Reparacion[]) ?? []);
      setIngresosServicio((ing as IngresoServicio[]) ?? []);
      setComprasProveedor((compras as DispositivoCompra[]) ?? []);
      setComprasManuales((comprasManual as CompraManual[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const inicio = useMemo(() => inicioDePeriodo(periodo), [periodo]);

  const ordenesPeriodo = useMemo(
    () => ordenes.filter((o) => ESTADOS_COBRADOS.includes(o.estado) && new Date(o.created_at) >= inicio),
    [ordenes, inicio]
  );

  const ingresos = ordenesPeriodo.reduce((acc, o) => acc + montoVenta(o), 0);

  // "Ventas" cuenta cada DISPOSITIVO vendido, no cada boleta: una orden con
  // dos celulares suma dos. Sumamos las cantidades de los orden_items de
  // cada orden cobrada del período. Fallback a 1 si una orden no trajo sus
  // ítems (no debería pasar), para no volverla invisible.
  const unidadesPorOrden = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const it of ordenItems) {
      mapa.set(it.orden_id, (mapa.get(it.orden_id) ?? 0) + (it.cantidad || 0));
    }
    return mapa;
  }, [ordenItems]);

  const cantidadVentas = ordenesPeriodo.reduce((acc, o) => acc + (unidadesPorOrden.get(o.id) || 1), 0);
  const ticketPromedio = cantidadVentas > 0 ? ingresos / cantidadVentas : 0;

  const nombreDe = (lista: Persona[], id: string | null, tipo: string) => {
    if (!id) return 'Sin asignar';
    return lista.find((p) => p.id === id)?.nombre ?? `${tipo} eliminado`;
  };

  const fotoDe = (lista: Persona[], id: string | null) => {
    if (!id) return null;
    return lista.find((p) => p.id === id)?.foto_url ?? null;
  };

  const rankingVendedores: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of ordenesPeriodo) {
      const key = o.vendedor_id ?? '-';
      mapa.set(key, (mapa.get(key) ?? 0) + montoVenta(o));
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({
        nombre: nombreDe(vendedores, id === '-' ? null : id, 'Vendedor'),
        fotoUrl: fotoDe(vendedores, id === '-' ? null : id),
        valor,
      }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [ordenesPeriodo, vendedores]);

  const reparacionesPeriodo = useMemo(
    () => reparaciones.filter((r) => new Date(r.fecha_reparado) >= inicio),
    [reparaciones, inicio]
  );

  const rankingTecnicos: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of reparacionesPeriodo) {
      const key = r.tecnico_id ?? '-';
      mapa.set(key, (mapa.get(key) ?? 0) + 1);
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({
        nombre: nombreDe(tecnicos, id === '-' ? null : id, 'Técnico'),
        fotoUrl: fotoDe(tecnicos, id === '-' ? null : id),
        valor,
      }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [reparacionesPeriodo, tecnicos]);

  const nombreClienteDe = (id: string | null) => {
    if (!id) return 'Sin cliente';
    const c = clientes.find((c) => c.id === id);
    return c ? `${c.nombre} ${c.apellido || ''}`.trim() : 'Cliente eliminado';
  };

  const rankingCompradores: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of ordenesPeriodo) {
      if (!o.cliente_id) continue;
      mapa.set(o.cliente_id, (mapa.get(o.cliente_id) ?? 0) + montoVenta(o));
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: nombreClienteDe(id), valor }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [ordenesPeriodo, clientes]);

  const ingresosServicioPeriodo = useMemo(
    () => ingresosServicio.filter((i) => new Date(i.fecha_ingreso_servicio) >= inicio),
    [ingresosServicio, inicio]
  );

  const rankingClientesServicio: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of ingresosServicioPeriodo) {
      if (!i.cliente_id) continue;
      mapa.set(i.cliente_id, (mapa.get(i.cliente_id) ?? 0) + 1);
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: nombreClienteDe(id), valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [ingresosServicioPeriodo, clientes]);

  const rankingFormaPago: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of ordenesPeriodo) {
      const key = o.forma_pago || 'Sin especificar';
      mapa.set(key, (mapa.get(key) ?? 0) + montoVenta(o));
    }
    return Array.from(mapa.entries())
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [ordenesPeriodo]);

  const comprasProveedorPeriodo = useMemo(
    () => comprasProveedor.filter((d) => new Date(d.created_at) >= inicio),
    [comprasProveedor, inicio]
  );
  const comprasManualesPeriodo = useMemo(
    () => comprasManuales.filter((c) => new Date(c.created_at) >= inicio),
    [comprasManuales, inicio]
  );

  const rankingProveedores: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    // Se suman las dos fuentes: lo que quedó vinculado solo al cargar un
    // dispositivo al stock con costo (dispositivos.costo) y lo cargado a
    // mano en la ficha de cada proveedor (compras_proveedor) — ver
    // /proveedores/[id].
    for (const d of comprasProveedorPeriodo) {
      if (!d.proveedor_id) continue;
      mapa.set(d.proveedor_id, (mapa.get(d.proveedor_id) ?? 0) + (d.costo || 0));
    }
    for (const c of comprasManualesPeriodo) {
      mapa.set(c.proveedor_id, (mapa.get(c.proveedor_id) ?? 0) + (c.precio_unitario || 0) * c.cantidad);
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: proveedores.find((p) => p.id === id)?.nombre ?? 'Proveedor eliminado', valor }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [comprasProveedorPeriodo, comprasManualesPeriodo, proveedores]);

  const evolucion = useMemo(() => {
    if (periodo === 'hoy') return [];
    if (periodo === 'anio') {
      const meses = Array.from({ length: new Date().getMonth() + 1 }, (_, i) => ({
        label: new Date(2000, i, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''),
        valor: 0,
        mes: i,
      }));
      for (const o of ordenesPeriodo) {
        const m = new Date(o.created_at).getMonth();
        const item = meses.find((x) => x.mes === m);
        if (item) item.valor += montoVenta(o);
      }
      return meses.map(({ label, valor }) => ({ label, valor }));
    }
    const dias: { label: string; valor: number; fecha: Date }[] = [];
    const cursor = new Date(inicio);
    const hoyFin = new Date();
    hoyFin.setHours(23, 59, 59, 999);
    while (cursor <= hoyFin) {
      dias.push({
        label: cursor.toLocaleDateString('es-AR', { day: 'numeric', month: periodo === 'semana' ? 'short' : undefined }),
        valor: 0,
        fecha: new Date(cursor),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const o of ordenesPeriodo) {
      const fechaO = new Date(o.created_at);
      const dia = dias.find((d) => d.fecha.toDateString() === fechaO.toDateString());
      if (dia) dia.valor += montoVenta(o);
    }
    return dias.map(({ label, valor }) => ({ label, valor }));
  }, [ordenesPeriodo, periodo, inicio]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!puedeVerEstadisticas) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para ver Estadísticas.</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-5 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Estadísticas</span>
      </header>

      <div className="flex items-center gap-2 text-sm">
        {PERIODOS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriodo(p.key)}
            className={`flex-1 rounded-xl py-2 font-medium ${
              periodo === p.key
                ? 'bg-accent dark:bg-dark-accent text-white'
                : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile valor={`${moneda}${Math.round(ingresos).toLocaleString('es-AR')}`} etiqueta="Ingresos" />
        <StatTile valor={cantidadVentas.toString()} etiqueta="Ventas" />
        <StatTile valor={`${moneda}${Math.round(ticketPromedio).toLocaleString('es-AR')}`} etiqueta="Ticket promedio" />
      </div>

      {evolucion.length > 0 && (
        <Seccion titulo="Evolución de ingresos">
          <EvolucionBarras datos={evolucion} moneda={moneda} />
        </Seccion>
      )}

      <Seccion
        titulo="Ranking de vendedores"
        vista={vistaVendedores}
        onVista={setVistaVendedores}
      >
        {vistaVendedores === 'barras' ? (
          <RankingBarras datos={rankingVendedores} moneda={moneda} />
        ) : (
          <RankingTorta datos={rankingVendedores} moneda={moneda} />
        )}
      </Seccion>

      <Seccion titulo="Ranking de técnicos" vista={vistaTecnicos} onVista={setVistaTecnicos}>
        {vistaTecnicos === 'barras' ? (
          <RankingBarras datos={rankingTecnicos} sufijo=" arreglo(s)" />
        ) : (
          <RankingTorta datos={rankingTecnicos} sufijo=" arreglo(s)" />
        )}
      </Seccion>

      <Seccion titulo="Ranking de compradores" vista={vistaCompradores} onVista={setVistaCompradores}>
        {vistaCompradores === 'barras' ? (
          <RankingBarras datos={rankingCompradores} moneda={moneda} />
        ) : (
          <RankingTorta datos={rankingCompradores} moneda={moneda} />
        )}
      </Seccion>

      <Seccion titulo="Ranking de clientes de servicio técnico" vista={vistaClientesServicio} onVista={setVistaClientesServicio}>
        {vistaClientesServicio === 'barras' ? (
          <RankingBarras datos={rankingClientesServicio} sufijo=" equipo(s)" />
        ) : (
          <RankingTorta datos={rankingClientesServicio} sufijo=" equipo(s)" />
        )}
      </Seccion>

      <Seccion titulo="Formas de pago" vista={vistaFormaPago} onVista={setVistaFormaPago}>
        {vistaFormaPago === 'barras' ? (
          <RankingBarras datos={rankingFormaPago} moneda={moneda} />
        ) : (
          <RankingTorta datos={rankingFormaPago} moneda={moneda} />
        )}
      </Seccion>

      {rankingProveedores.length > 0 && (
        <Seccion titulo="Compras a proveedores" vista={vistaProveedores} onVista={setVistaProveedores}>
          {vistaProveedores === 'barras' ? (
            <RankingBarras datos={rankingProveedores} moneda={moneda} />
          ) : (
            <RankingTorta datos={rankingProveedores} moneda={moneda} />
          )}
        </Seccion>
      )}
    </main>
  );
}

function StatTile({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5 flex flex-col gap-0.5">
      <p className="text-xl font-display font-semibold leading-none truncate">{valor}</p>
      <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight mt-1">{etiqueta}</p>
    </div>
  );
}

function Seccion({
  titulo,
  vista,
  onVista,
  children,
}: {
  titulo: string;
  vista?: VistaRanking;
  onVista?: (v: VistaRanking) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{titulo}</p>
        {vista && onVista && (
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => onVista('barras')}
              className={`rounded-lg px-2.5 py-1 font-medium ${
                vista === 'barras' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-canvas dark:bg-dark-bg text-muted dark:text-dark-text-secondary'
              }`}
            >
              Barras
            </button>
            <button
              onClick={() => onVista('torta')}
              className={`rounded-lg px-2.5 py-1 font-medium ${
                vista === 'torta' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-canvas dark:bg-dark-bg text-muted dark:text-dark-text-secondary'
              }`}
            >
              Torta
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
