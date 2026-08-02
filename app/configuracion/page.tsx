import Link from 'next/link';
import ThemeToggle from '../ThemeToggle';
import { crearClienteServidor } from '../lib/supabase/server';

const SECCIONES_BASE = [
  { href: '/configuracion/negocio', titulo: 'Datos del negocio', desc: 'Nombre, logo, contacto y garantía' },
  { href: '/configuracion/vendedores', titulo: 'Vendedores', desc: 'Quién atiende cada venta' },
  { href: '/configuracion/tecnicos', titulo: 'Técnicos', desc: 'Quién repara los equipos de Servicio Técnico' },
];
// Suscripción (billing) solo la ve el dueño del negocio.
const SECCION_SUSCRIPCION = { href: '/configuracion/suscripcion', titulo: 'Suscripción', desc: 'Estado del pago y plan de Qovento' };
const SECCIONES_RESTO = [
  { href: '/configuracion/soporte', titulo: 'Soporte', desc: 'Reportá un problema o dejanos un mensaje' },
  { href: '/configuracion/auditoria', titulo: 'Auditoría', desc: 'Quién hizo qué y cuándo' },
];

export default async function Configuracion() {
  const supabase = crearClienteServidor();
  const { data: esDueno } = await supabase.rpc('es_dueno_actual');
  const secciones = esDueno
    ? [...SECCIONES_BASE, SECCION_SUSCRIPCION, ...SECCIONES_RESTO]
    : [...SECCIONES_BASE, ...SECCIONES_RESTO];

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Configuración</span>
      </header>

      <div className="flex flex-col gap-3">
        <ThemeToggle />
        {secciones.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-5 flex flex-col hover:border-accent/40 dark:hover:border-dark-accent/40 hover:shadow-elevated transition-all active:scale-[0.98]"
          >
            <span className="text-base font-medium">{s.titulo}</span>
            <span className="text-xs text-muted dark:text-dark-text-secondary">{s.desc}</span>
          </Link>
        ))}
      </div>

      <p className="text-xs text-muted dark:text-dark-text-secondary text-center mt-auto pt-4">
        <Link href="/terminos" className="underline">
          Términos y Condiciones
        </Link>
        {' · '}
        <Link href="/privacidad" className="underline">
          Política de Privacidad
        </Link>
      </p>
    </main>
  );
}
