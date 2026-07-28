import Link from 'next/link';
import { crearClienteServidor } from './lib/supabase/server';
import BotonSalir from './BotonSalir';

function QMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="34" stroke="#1C1B19" strokeWidth="9" />
      <line x1="67" y1="67" x2="86" y2="86" stroke="#1C1B19" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

const SECCIONES = [
  { href: '/nueva-etiqueta', titulo: 'Nueva etiqueta', desc: 'Fotografiá el IMEI y generá la etiqueta', activo: true },
  { href: '/stock', titulo: 'Stock', desc: 'Dispositivos disponibles en tu local', activo: true },
  { href: '/clientes', titulo: 'Clientes', desc: 'Tu base de clientes', activo: true },
  { href: '/ordenes', titulo: 'Órdenes', desc: 'Ventas, boletas y canjes', activo: true },
  { href: '/canje', titulo: 'Plan Canje', desc: 'Dispositivos recibidos como parte de pago', activo: true },
  { href: '/servicio-tecnico', titulo: 'Servicio Técnico', desc: 'Equipos derivados a reparación', activo: true },
];

export default async function Home() {
  const supabase = crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let nombreNegocio = 'Qovento';
  let logoUrl: string | null = null;
  if (user) {
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('negocio_id, negocios ( nombre, logo_url )')
      .eq('id', user.id)
      .single();
    const negocio = (perfil as any)?.negocios;
    if (negocio?.nombre) nombreNegocio = negocio.nombre;
    if (negocio?.logo_url) logoUrl = negocio.logo_url;
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-8 gap-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-lg object-contain bg-white/60 border border-black/10" />
          ) : (
            <QMark size={32} />
          )}
          <p className="text-base font-medium leading-tight">{nombreNegocio}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/configuracion" className="text-xs text-muted underline">
            Configuración
          </Link>
          <BotonSalir />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {SECCIONES.map((s) =>
          s.activo ? (
            <Link
              key={s.titulo}
              href={s.href}
              className="rounded-2xl bg-ink text-base p-5 flex flex-col justify-between h-32 active:scale-[0.98] transition-transform"
            >
              <span className="text-base font-medium">{s.titulo}</span>
              <span className="text-xs opacity-70">{s.desc}</span>
            </Link>
          ) : (
            <div
              key={s.titulo}
              className="rounded-2xl bg-white/50 border border-black/10 p-5 flex flex-col justify-between h-32 opacity-60"
            >
              <span className="text-base font-medium">{s.titulo}</span>
              <span className="text-xs text-muted">Próximamente</span>
            </div>
          )
        )}
      </div>

      <p className="text-center text-xs text-muted mt-auto pt-4">con Qovento</p>
    </main>
  );
}
