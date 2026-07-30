'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { simboloMoneda } from '../lib/monedas';
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

type Orden = { vendedor_id: string | null; total: number | null; estado: string; forma_pago: string | null; created_at: string };
type Reparacion = { tecnico_id: string | null; fecha_reparado: string };
type Persona = { id: string; nombre: string };

export default function Estadisticas() {
  const supabase = crearClienteNavegador();

  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [vistaVendedores, setVistaVendedores] = useState<VistaRanking>('barras');
  const [vistaTecnicos, setVistaTecnicos] = useState<VistaRanking>('barras');
  const [vistaFormaPago, setVistaFormaPago] = useState<VistaRanking>('torta');

  const [vendedores, setVendedores] = useState<Persona[]>([]);
  const [tecnicos, setTecnicos] = useState<Persona[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [reparaciones, setReparaciones] = useState<Reparacion[]>([]);
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

      const [{ data: perfil }, { data: vend }, { data: tec }, { data: ord }, { data: rep }] = await Promise.all([
        supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single(),
        supabase.from('vendedores').select('id, nombre').order('nombre'),
        supabase.from('tecnicos').select('id, nombre').order('nombre'),
        supabase
          .from('ordenes')
          .select('vendedor_id, total, estado, forma_pago, created_at')
          .gte('created_at', desde.toISOString()),
        supabase
          .from('canjes')
          .select('tecnico_id, fecha_reparado')
          .eq('estado', 'reparado')
          .not('fecha_reparado', 'is', null)
          .gte('fecha_reparado', desde.toISOString()),
      ]);

      const negocio = (perfil as any)?.negocios;
      if (negocio?.moneda) setMoneda(simboloMoneda(negocio.moneda));
      setVendedores(vend ?? []);
      setTecnicos(tec ?? []);
      setOrdenes((ord as Orden[]) ?? []);
      setReparaciones((rep as Reparacion[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const inicio = useMemo(() => inicioDePeriodo(periodo), [periodo]);

  const ordenesPeriodo = useMemo(
    () => ordenes.filter((o) => ESTADOS_COBRADOS.includes(o.estado) && new Date(o.created_at) >= inicio),
    [ordenes, inicio]
  );

  const ingresos = ordenesPeriodo.reduce((acc, o) => acc + (o.total || 0), 0);
  const cantidadVentas = ordenesPeriodo.length;
  const ticketPromedio = cantidadVentas > 0 ? ingresos / cantidadVentas : 0;

  const nombreDe = (lista: Persona[], id: string | null, tipo: string) => {
    if (!id) return 'Sin asignar';
    return lista.find((p) => p.id === id)?.nombre ?? `${tipo} eliminado`;
  };

  const rankingVendedores: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of ordenesPeriodo) {
      const key = o.vendedor_id ?? '-';
      mapa.set(key, (mapa.get(key) ?? 0) + (o.total || 0));
    }
    return Array.from(mapa.entries())
      .map(([id, valor]) => ({ nombre: nombreDe(vendedores, id === '-' ? null : id, 'Vendedor'), valor }))
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
      .map(([id, valor]) => ({ nombre: nombreDe(tecnicos, id === '-' ? null : id, 'Técnico'), valor }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [reparacionesPeriodo, tecnicos]);

  const rankingFormaPago: Dato[] = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of ordenesPeriodo) {
      const key = o.forma_pago || 'Sin especificar';
      mapa.set(key, (mapa.get(key) ?? 0) + (o.total || 0));
    }
    return Array.from(mapa.entries())
      .map(([nombre, valor]) => ({ nombre, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [ordenesPeriodo]);

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
        if (item) item.valor += o.total || 0;
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
      if (dia) dia.valor += o.total || 0;
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

      <Seccion titulo="Formas de pago" vista={vistaFormaPago} onVista={setVistaFormaPago}>
        {vistaFormaPago === 'barras' ? (
          <RankingBarras datos={rankingFormaPago} moneda={moneda} />
        ) : (
          <RankingTorta datos={rankingFormaPago} moneda={moneda} />
        )}
      </Seccion>
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
