import Link from 'next/link';
import { crearClienteServidor } from './lib/supabase/server';
import BotonSalir from './BotonSalir';
import QMark from './QMark';

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
};

const SECCIONES = [
  { href: '/ordenes', titulo: 'Órdenes', desc: 'Ventas, boletas y canjes', icono: 'ordenes', activo: true },
  { href: '/compras', titulo: 'Compra de dispositivos', desc: 'Cuando le comprás un celular a alguien', icono: 'compra', activo: true },
  { href: '/stock', titulo: 'Stock', desc: 'Dispositivos disponibles en tu local', icono: 'stock', activo: true },
  { href: '/clientes', titulo: 'Clientes', desc: 'Tu base de clientes', icono: 'clientes', activo: true },
  { href: '/canje', titulo: 'Plan Canje', desc: 'Dispositivos recibidos como parte de pago', icono: 'canje', activo: true },
  { href: '/servicio-tecnico', titulo: 'Servicio Técnico', desc: 'Equipos derivados a reparación', icono: 'servicio', activo: true },
  { href: '/nueva-etiqueta', titulo: 'Nueva etiqueta', desc: 'Fotografiá el IMEI y generá la etiqueta', icono: 'etiqueta', activo: true },
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

  if (user) {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('negocio_id, negocios ( nombre, logo_url )')
      .eq('id', user.id)
      .single();
    const negocio = (perfil as any)?.negocios;
    if (negocio?.nombre) nombreNegocio = negocio.nombre;
    if (negocio?.logo_url) logoUrl = negocio.logo_url;

    const [{ count: countStock }, { count: countPendientes }, { count: countClientes }] = await Promise.all([
      supabase.from('dispositivos').select('id', { count: 'exact', head: true }).eq('en_stock', true),
      supabase.from('ordenes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      supabase.from('clientes').select('id', { count: 'exact', head: true }),
    ]);
    enStock = countStock ?? 0;
    pendientes = countPendientes ?? 0;
    totalClientes = countClientes ?? 0;
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-8 gap-6 max-w-2xl mx-auto w-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-lg object-contain bg-white border border-border" />
          ) : (
            <QMark size={32} />
          )}
          <p className="text-base font-display font-semibold leading-tight">{nombreNegocio}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/configuracion" className="text-xs text-muted hover:text-ink transition-colors">
            Configuración
          </Link>
          <BotonSalir />
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <StatTile valor={enStock} etiqueta="En stock" />
        <StatTile valor={pendientes} etiqueta="Pendientes" />
        <StatTile valor={totalClientes} etiqueta="Clientes" />
      </div>

      <div className="flex flex-col gap-2.5">
        {SECCIONES.map((s) =>
          s.activo ? (
            <Link
              key={s.titulo}
              href={s.href}
              className="group rounded-2xl bg-white border border-border shadow-card p-4 flex items-center gap-4 hover:border-accent/40 hover:shadow-elevated transition-all active:scale-[0.99]"
            >
              <div className="h-11 w-11 shrink-0 rounded-xl bg-accent-soft text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-colors">
                {ICONOS[s.icono]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">{s.titulo}</p>
                <p className="text-xs text-muted leading-tight mt-0.5">{s.desc}</p>
              </div>
              <span className="text-muted group-hover:text-accent transition-colors">&rarr;</span>
            </Link>
          ) : (
            <div
              key={s.titulo}
              className="rounded-2xl bg-canvas border border-border p-4 flex items-center gap-4 opacity-60"
            >
              <div className="h-11 w-11 shrink-0 rounded-xl bg-white text-muted flex items-center justify-center">
                {ICONOS[s.icono]}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{s.titulo}</p>
                <p className="text-xs text-muted leading-tight mt-0.5">Próximamente</p>
              </div>
            </div>
          )
        )}
      </div>

      <p className="text-center text-xs text-muted mt-auto pt-4">con Qovento</p>
    </main>
  );
}

function StatTile({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <div className="rounded-2xl bg-white border border-border shadow-card p-3.5 flex flex-col gap-0.5">
      <p className="text-2xl font-display font-semibold leading-none">{valor}</p>
      <p className="text-[11px] text-muted leading-tight">{etiqueta}</p>
    </div>
  );
}
