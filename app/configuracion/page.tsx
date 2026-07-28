import Link from 'next/link';

const SECCIONES = [
  { href: '/configuracion/negocio', titulo: 'Datos del negocio', desc: 'Nombre, logo, contacto y garantía' },
  { href: '/configuracion/vendedores', titulo: 'Vendedores', desc: 'Quién atiende cada venta' },
  { href: '/configuracion/productos', titulo: 'Productos y accesorios', desc: 'Fundas, AirPods, y lo que vendas' },
  { href: '/configuracion/tecnicos', titulo: 'Técnicos', desc: 'Quién repara los equipos de Servicio Técnico' },
];

export default function Configuracion() {
  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Configuración</span>
      </header>

      <div className="flex flex-col gap-3">
        {SECCIONES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-2xl bg-white border border-border shadow-card p-5 flex flex-col hover:border-accent/40 hover:shadow-elevated transition-all active:scale-[0.98]"
          >
            <span className="text-base font-medium">{s.titulo}</span>
            <span className="text-xs text-muted">{s.desc}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
