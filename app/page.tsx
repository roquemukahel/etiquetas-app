import Link from 'next/link';
import { crearClienteServidor } from './lib/supabase/server';
import BotonSalir from './BotonSalir';
import QMark from './QMark';
import BuscadorUniversal from './BuscadorUniversal';
import { simboloMoneda } from './lib/monedas';
import { imagenParaDescripcion } from './lib/carpetas';

function IconoBase({ children }: { children: React.ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const ICONOS: Record<string, React.ReactNode> = {
  etiqueta: (
    <IconoBase>
      <path d="M12.5 3H6a3 3 0 0 0-3 3v6.5a2 2 0 0 0 .59 1.41l8 8a2 2 0 0 0 2.82 0l6.5-6.5a2 2 0 0 0 0-2.82l-8-8A2 2 0 0 0 12.5 3Z" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </IconoBase>
  ),
  stock: (
    <IconoBase>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </IconoBase>
  ),
  clientes: (
    <IconoBase>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" />
      <path d="M16.5 5.2a3.2 3.2 0 0 1 0 6.2" />
      <path d="M20 20c0-2.8-1.8-5-4.3-5.8" />
    </IconoBase>
  ),
  ordenes: (
    <IconoBase>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </IconoBase>
  ),
  canje: (
    <IconoBase>
      <path d="M17 3 21 7l-4 4" />
      <path d="M21 7H8a4 4 0 0 0-4 4" />
      <path d="M7 21 3 17l4-4" />
      <path d="M3 17h13a4 4 0 0 0 4-4" />
    </IconoBase>
  ),
  servicio: (
    <IconoBase>
      <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L14.7 6.3Z" />
    </IconoBase>
  ),
  compra: (
    <IconoBase>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M5 6l1 14h12l1-14" />
      <path d="M12 10v6M9.5 12.5h5" />
    </IconoBase>
  ),
  camara: (
    <IconoBase>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </IconoBase>
  ),
};

const SECCIONES = [
  { href: '/ordenes', titulo: 'Órdenes', desc: 'Ventas, boletas y canjes', icono: 'ordenes', activo: true },
  { href: '/compras', titulo: 'Compra de dispositivos', desc: 'Cuando le comprás un celular a alguien', icono: 'compra', activo: true },
  { href: '/stock', titulo: 'Stock', desc: 'Dispositivos disponibles en tu local', icono: 'stock', activo: true },
  { href: '/clientes', titulo: 'Clientes', desc: 'Tu base de clientes', icono: 'clientes', activo: true },
  { href: '/canje', titulo: 'Plan Canje', desc: 'Dispositivos recibidos como parte de pago', icono: 'canje', activo: true },
  { href: '/servicio-tecnico', titulo: 'Servicio Técnico', desc: 'Equipos derivados a reparación', icono: 'servicio', activo: true },
  { href: '/nueva-etiqueta', titulo: 'Nueva etiqueta', desc: 'Fotografiá el IMEI y generá la etiqueta', icono: 'etiqueta', activo: true },
  { href: '/stock/foto', titulo: 'Agregar al stock', desc: 'Fotografiá el IMEI y cargalo directo, sin etiqueta', icono: 'camara', activo: true },
];

export default async function Home() {
  const supabase = crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let nombreNegocio = 'Qovento';
  let logoUrl: string | null = null;
  let enStock = 0;
  let pendientes = 0;
  let totalClientes = 0;
  let esAdmin = false;
  let moneda = '$';
  let ingresosMes = 0;
  let ventasMes = 0;
  let deltaPct: number | null = null;
  let dias: { label: string; valor: number }[] = [];
  let masVendidos: { nombre: string; cantidad: number; imagenUrl: string | null }[] = [];
  let deltaVentasPct: number | null = null;
  let ticketPromedio = 0;
  let deltaTicketPct: number | null = null;
  let serieVentas: number[] = [];
  let serieTicket: number[] = [];

  if (user) {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('negocio_id, negocios ( nombre, logo_url, moneda )')
      .eq('id', user.id)
      .single();
    const negocio = (perfil as any)?.negocios;
    if (negocio?.nombre) nombreNegocio = negocio.nombre;
    if (negocio?.logo_url) logoUrl = negocio.logo_url;
    if (negocio?.moneda) moneda = simboloMoneda(negocio.moneda);

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const inicioMesPasado = new Date(inicioMes);
    inicioMesPasado.setMonth(inicioMesPasado.getMonth() - 1);

    const [
      { count: countStock },
      { count: countPendientes },
      { count: countClientes },
      { data: esAdminData },
      { data: ordenesRecientes },
      { data: carpetasStock },
      { data: catalogoProductos },
    ] = await Promise.all([
      supabase.from('dispositivos').select('id', { count: 'exact', head: true }).eq('en_stock', true),
      supabase.from('ordenes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('clientes').select('id', { count: 'exact', head: true }),
      supabase.rpc('es_admin'),
      supabase
        .from('ordenes')
        .select('total, estado, created_at, orden_items ( descripcion, cantidad, tipo )')
        .gte('created_at', inicioMesPasado.toISOString()),
      supabase.from('modelos_stock').select('nombre, imagen_url'),
      supabase.from('productos').select('nombre, imagen_url'),
    ]);
    enStock = countStock ?? 0;
    pendientes = countPendientes ?? 0;
    totalClientes = countClientes ?? 0;
    esAdmin = !!esAdminData;

    const cobradas = (ordenesRecientes ?? []).filter((o) => o.estado === 'pagado' || o.estado === 'entregado');
    ingresosMes = cobradas
      .filter((o) => new Date(o.created_at) >= inicioMes)
      .reduce((acc, o) => acc + (o.total || 0), 0);
    const ingresosMesPasado = cobradas
      .filter((o) => new Date(o.created_at) >= inicioMesPasado && new Date(o.created_at) < inicioMes)
      .reduce((acc, o) => acc + (o.total || 0), 0);
    ventasMes = (ordenesRecientes ?? []).filter((o) => new Date(o.created_at) >= inicioMes).length;
    deltaPct = ingresosMesPasado > 0 ? Math.round(((ingresosMes - ingresosMesPasado) / ingresosMesPasado) * 100) : null;

    const ventasMesPasado = cobradas.filter(
      (o) => new Date(o.created_at) >= inicioMesPasado && new Date(o.created_at) < inicioMes
    ).length;
    deltaVentasPct = ventasMesPasado > 0 ? Math.round(((ventasMes - ventasMesPasado) / ventasMesPasado) * 100) : null;

    ticketPromedio = ventasMes > 0 ? ingresosMes / ventasMes : 0;
    const ticketPromedioMesPasado = ventasMesPasado > 0 ? ingresosMesPasado / ventasMesPasado : 0;
    deltaTicketPct =
      ticketPromedioMesPasado > 0
        ? Math.round(((ticketPromedio - ticketPromedioMesPasado) / ticketPromedioMesPasado) * 100)
        : null;

    const mapaImagenesCarpetas = new Map<string, string>();
    for (const c of (carpetasStock as { nombre: string; imagen_url: string | null }[]) ?? []) {
      if (c.imagen_url) mapaImagenesCarpetas.set(c.nombre, c.imagen_url);
    }
    const mapaImagenesProductos = new Map<string, string>();
    for (const p of (catalogoProductos as { nombre: string; imagen_url: string | null }[]) ?? []) {
      if (p.imagen_url) mapaImagenesProductos.set(p.nombre, p.imagen_url);
    }
    const conteoItems = new Map<string, number>();
    for (const o of cobradas.filter((o: any) => new Date(o.created_at) >= inicioMes)) {
      for (const item of (o as any).orden_items ?? []) {
        // El IMEI hace única a cada descripción de dispositivo — lo sacamos
        // para agrupar por modelo/capacidad/color, no por unidad individual.
        const clave = item.tipo === 'dispositivo' ? item.descripcion.split(' · IMEI')[0] : item.descripcion;
        conteoItems.set(clave, (conteoItems.get(clave) ?? 0) + item.cantidad);
      }
    }
    masVendidos = Array.from(conteoItems.entries())
      .map(([nombre, cantidad]) => ({
        nombre,
        cantidad,
        imagenUrl: mapaImagenesProductos.get(nombre) ?? imagenParaDescripcion(nombre, mapaImagenesCarpetas),
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    for (let i = 6; i >= 0; i--) {
      const dia = new Date();
      dia.setDate(dia.getDate() - i);
      dia.setHours(0, 0, 0, 0);
      const diaFin = new Date(dia);
      diaFin.setDate(diaFin.getDate() + 1);
      const ordenesDia = cobradas.filter((o) => {
        const d = new Date(o.created_at);
        return d >= dia && d < diaFin;
      });
      const valor = ordenesDia.reduce((acc, o) => acc + (o.total || 0), 0);
      dias.push({ label: dia.toLocaleDateString('es-AR', { weekday: 'short' }).slice(0, 1).toUpperCase(), valor });
      serieVentas.push(ordenesDia.length);
      serieTicket.push(ordenesDia.length > 0 ? valor / ordenesDia.length : 0);
    }
  }

  const maxDia = Math.max(1, ...dias.map((d) => d.valor));

  return (
    <main className="flex min-h-screen flex-col px-6 py-8 gap-6 max-w-2xl lg:max-w-5xl mx-auto w-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-20 w-20 rounded-2xl object-contain bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card" />
          ) : (
            <div className="h-20 w-20 rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card flex items-center justify-center">
              <QMark size={48} />
            </div>
          )}
          <p className="text-xl font-display font-semibold leading-tight">{nombreNegocio}</p>
        </div>
        <div className="flex items-center gap-4">
          {esAdmin && (
            <Link href="/admin" className="text-xs text-accent dark:text-dark-accent font-medium hover:text-accent-hover dark:hover:text-dark-accent-hover transition-colors">
              Panel Admin
            </Link>
          )}
          <Link href="/configuracion" className="text-xs text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text transition-colors">
            Configuración
          </Link>
          <BotonSalir />
        </div>
      </header>

      <BuscadorUniversal />

      <div className="lg:grid lg:grid-cols-3 lg:gap-6 flex flex-col gap-6">
        <Link
          href="/estadisticas"
          className="group lg:col-span-2 rounded-2xl bg-ink text-white p-5 flex flex-col gap-4 hover:opacity-95 transition-opacity active:scale-[0.99]"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-white/60 mb-1">Ingresos este mes</p>
              <p className="text-3xl font-display font-semibold">
                {moneda}
                {ingresosMes.toLocaleString('es-AR')}
              </p>
              <p className="text-xs text-white/60 mt-1">
                {ventasMes} venta{ventasMes === 1 ? '' : 's'} este mes
                {deltaPct != null && (
                  <span className={deltaPct >= 0 ? 'text-good' : 'text-bad'}>
                    {' '}
                    · {deltaPct >= 0 ? '+' : ''}
                    {deltaPct}% vs. mes anterior
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-end gap-1.5 h-14">
              {dias.map((d, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1 w-5">
                  <div
                    className="w-full rounded-full bg-white/25"
                    style={{ height: `${Math.max(6, (d.valor / maxDia) * 40)}px` }}
                  />
                  <span className="text-[9px] text-white/40">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/10">
            <MiniStatTrend etiqueta="Ventas" valor={ventasMes.toString()} deltaPct={deltaVentasPct} serie={serieVentas} />
            <MiniStatTrend
              etiqueta="Ticket promedio"
              valor={`${moneda}${Math.round(ticketPromedio).toLocaleString('es-AR')}`}
              deltaPct={deltaTicketPct}
              serie={serieTicket}
            />
          </div>

          <span className="text-xs text-white/50 group-hover:text-white/70">Ver estadísticas completas &rarr;</span>
        </Link>

        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold">Productos más vendidos</p>
          {masVendidos.length === 0 ? (
            <p className="text-xs text-muted dark:text-dark-text-secondary">Todavía no hay ventas este mes.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {masVendidos.map((p) => (
                <div key={p.nombre} className="flex items-center gap-3">
                  {p.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imagenUrl}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover shrink-0 border border-border dark:border-dark-border"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-base shrink-0">
                      📦
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.nombre}</p>
                    <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                      {p.cantidad} unidad{p.cantidad === 1 ? '' : 'es'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile valor={enStock} etiqueta="En stock" />
        <StatTile valor={pendientes} etiqueta="Pendientes" />
        <StatTile valor={totalClientes} etiqueta="Clientes" />
      </div>

      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
        {SECCIONES.map((s) =>
          s.activo ? (
            <Link
              key={s.titulo}
              href={s.href}
              className="group rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 flex items-center gap-4 hover:border-accent/40 dark:hover:border-dark-accent/40 hover:shadow-elevated transition-all active:scale-[0.99]"
            >
              <div className="h-11 w-11 shrink-0 rounded-xl bg-accent-soft dark:bg-dark-accent-soft text-accent dark:text-dark-accent flex items-center justify-center group-hover:bg-accent dark:group-hover:bg-dark-accent group-hover:text-white transition-colors">
                {ICONOS[s.icono]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">{s.titulo}</p>
                <p className="text-xs text-muted dark:text-dark-text-secondary leading-tight mt-0.5">{s.desc}</p>
              </div>
              <span className="text-muted dark:text-dark-text-secondary group-hover:text-accent dark:group-hover:text-dark-accent transition-colors">&rarr;</span>
            </Link>
          ) : (
            <div
              key={s.titulo}
              className="rounded-2xl bg-canvas dark:bg-dark-surface-elevated border border-border dark:border-dark-border p-4 flex items-center gap-4 opacity-60"
            >
              <div className="h-11 w-11 shrink-0 rounded-xl bg-white dark:bg-dark-surface text-muted dark:text-dark-text-secondary flex items-center justify-center">
                {ICONOS[s.icono]}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{s.titulo}</p>
                <p className="text-xs text-muted dark:text-dark-text-secondary leading-tight mt-0.5">Próximamente</p>
              </div>
            </div>
          )
        )}
      </div>

      <div className="text-center mt-auto pt-4">
        <p className="text-xs text-muted dark:text-dark-text-secondary">con Qovento</p>
        <p className="text-[10px] text-muted dark:text-dark-text-secondary mt-0.5">
          El sistema móvil más rápido para recibir, documentar, etiquetar y comercializar celulares.
        </p>
      </div>
    </main>
  );
}

function StatTile({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-3.5 flex flex-col gap-0.5">
      <p className="text-2xl font-display font-semibold leading-none">{valor}</p>
      <p className="text-[11px] text-muted dark:text-dark-text-secondary leading-tight">{etiqueta}</p>
    </div>
  );
}

function Sparkline({ serie }: { serie: number[] }) {
  const w = 64;
  const h = 24;
  const max = Math.max(...serie, 0);
  const min = Math.min(...serie, 0);
  const rango = Math.max(1, max - min);
  const puntos = serie
    .map((v, i) => {
      const x = serie.length > 1 ? (i / (serie.length - 1)) * w : w / 2;
      const y = h - ((v - min) / rango) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline points={puntos} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

function MiniStatTrend({
  etiqueta,
  valor,
  deltaPct,
  serie,
}: {
  etiqueta: string;
  valor: string;
  deltaPct: number | null;
  serie: number[];
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-[11px] text-white/60">{etiqueta}</p>
        <p className="text-base font-display font-semibold">{valor}</p>
        {deltaPct != null && (
          <p className={`text-[11px] ${deltaPct >= 0 ? 'text-good' : 'text-bad'}`}>
            {deltaPct >= 0 ? '+' : ''}
            {deltaPct}% vs. mes anterior
          </p>
        )}
      </div>
      <Sparkline serie={serie} />
    </div>
  );
}
