import Link from 'next/link';
import LandingContacto from './LandingContacto';
import { ESLOGAN } from './lib/eslogan';

const FUNCIONES = [
  { titulo: 'Boletas con QR', desc: 'El cliente escanea y guarda su comprobante en el celular, sin cuenta.' },
  { titulo: 'Stock con fotos y colores', desc: 'Cada modelo con su foto y cada equipo con su color a simple vista.' },
  { titulo: 'Plan Canje', desc: 'Recibí un equipo como parte de pago y seguile la pista hasta que se vende.' },
  { titulo: 'Servicio Técnico', desc: 'Derivá, asigná técnico y avisale al cliente por WhatsApp cuando esté listo.' },
  { titulo: 'Auditoría real', desc: 'Quién cambió qué precio, cuándo, y con qué valor — sin poder borrarse.' },
  { titulo: 'Estadísticas', desc: 'Ranking de vendedores y técnicos, evolución de ventas, todo en gráficos.' },
];

const CARACTERISTICAS = [
  {
    grupo: 'Ventas',
    items: ['Boleta con QR y garantía configurable', 'Plan canje integrado a la venta', 'Multi-moneda', 'Notas y descripción de garantía por orden'],
  },
  {
    grupo: 'Stock',
    items: ['Carpetas por modelo con imagen propia', 'Paleta de colores de iPhone', 'Alertas de batería baja y poco stock', 'Accesorios con foto y precio'],
  },
  {
    grupo: 'Servicio Técnico',
    items: ['Seguimiento público por link para el cliente', 'Aviso automático por WhatsApp al terminar', 'Catálogo de trabajos con foto', 'Etiquetas imprimibles por equipo'],
  },
  {
    grupo: 'Seguridad',
    items: ['Cada negocio ve solo sus propios datos', 'Registro de auditoría sin poder borrarse', 'Selector de quién trabaja, sin contraseñas', 'Alertas de errores en tiempo real'],
  },
];

export default function LandingPublica() {
  return (
    <main className="flex flex-col min-h-screen bg-canvas dark:bg-dark-bg text-ink dark:text-dark-text">
      <header className="sticky top-0 z-30 bg-canvas/90 dark:bg-dark-bg/90 backdrop-blur border-b border-border dark:border-dark-border">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="Qovento" className="h-7 w-7 object-contain" />
            <span className="font-display font-semibold text-lg">Qovento</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-muted dark:text-dark-text-secondary">
            <a href="#inicio" className="hover:text-ink dark:hover:text-dark-text transition-colors">Inicio</a>
            <a href="#caracteristicas" className="hover:text-ink dark:hover:text-dark-text transition-colors">Características</a>
            <a href="#planes" className="hover:text-ink dark:hover:text-dark-text transition-colors">Planes</a>
            <a href="#contacto" className="hover:text-ink dark:hover:text-dark-text transition-colors">Contacto</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm font-medium px-3 py-2 rounded-xl hover:bg-white dark:hover:bg-dark-surface transition-colors">
              Iniciar sesión
            </Link>
            <Link
              href="/registro"
              className="text-sm font-medium px-4 py-2 rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover text-white transition-colors"
            >
              Empezá gratis
            </Link>
          </div>
        </div>
      </header>

      <section id="inicio" className="max-w-5xl mx-auto px-6 pt-16 pb-20 flex flex-col items-center text-center gap-6">
        <span className="text-xs font-semibold uppercase tracking-wide text-accent dark:text-dark-accent bg-accent-soft dark:bg-dark-accent-soft rounded-full px-3 py-1">
          Para casas de celulares usados
        </span>
        <h1 className="font-display font-semibold text-4xl sm:text-5xl leading-tight max-w-3xl">
          Recibí, documentá, etiquetá y vendé celulares sin perder ni un dato
        </h1>
        <p className="text-base sm:text-lg text-muted dark:text-dark-text-secondary max-w-xl">{ESLOGAN}</p>
        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          <Link
            href="/registro"
            className="rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors text-white px-6 py-3.5 text-sm font-medium shadow-elevated"
          >
            Empezá gratis
          </Link>
          <a
            href="#caracteristicas"
            className="rounded-2xl border border-border dark:border-dark-border px-6 py-3.5 text-sm font-medium hover:bg-white dark:hover:bg-dark-surface transition-colors"
          >
            Ver qué incluye
          </a>
        </div>
        <p className="text-xs text-muted dark:text-dark-text-secondary">Sin tarjeta de crédito · Andá probándolo en minutos</p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20 w-full">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FUNCIONES.map((f) => (
            <div key={f.titulo} className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-5">
              <p className="text-sm font-semibold">{f.titulo}</p>
              <p className="text-xs text-muted dark:text-dark-text-secondary mt-1 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20 w-full">
        <div className="rounded-3xl bg-ink dark:bg-dark-surface-elevated text-white p-8 sm:p-12 flex flex-col lg:flex-row items-center gap-10">
          <div className="flex-1 flex flex-col gap-3">
            <h2 className="font-display font-semibold text-2xl sm:text-3xl">Todo tu local, en un solo lugar</h2>
            <p className="text-sm text-white/70 leading-relaxed">
              Órdenes, stock, clientes, plan canje y servicio técnico desde el mismo menú — sin planillas sueltas ni cuadernos.
            </p>
            <p className="text-sm text-white/70 leading-relaxed">
              Y cuando algo se te complica, un solo tap te lleva directo a arreglarlo, sin perder lo que ya cargaste.
            </p>
          </div>
          <div className="flex-1 w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3">
            <div className="rounded-xl bg-white/10 h-20 flex items-center px-4">
              <div>
                <p className="text-[10px] text-white/50">Ingresos este mes</p>
                <p className="text-lg font-display font-semibold">$24.322</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/10 h-14 flex flex-col items-center justify-center">
                <p className="text-base font-semibold">20</p>
                <p className="text-[10px] text-white/50">Ventas</p>
              </div>
              <div className="rounded-xl bg-white/10 h-14 flex flex-col items-center justify-center">
                <p className="text-base font-semibold">14</p>
                <p className="text-[10px] text-white/50">En stock</p>
              </div>
            </div>
            <div className="rounded-xl bg-white/10 h-8 w-2/3" />
            <div className="rounded-xl bg-white/10 h-8 w-1/2" />
          </div>
        </div>
      </section>

      <section id="caracteristicas" className="max-w-5xl mx-auto px-6 pb-20 w-full scroll-mt-20">
        <h2 className="font-display font-semibold text-2xl sm:text-3xl text-center mb-10">Todo lo que ya trae Qovento</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {CARACTERISTICAS.map((c) => (
            <div key={c.grupo}>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent dark:text-dark-accent mb-3">{c.grupo}</p>
              <ul className="flex flex-col gap-2">
                {c.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted dark:text-dark-text-secondary">
                    <span className="text-good mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="planes" className="max-w-5xl mx-auto px-6 pb-20 w-full scroll-mt-20">
        <h2 className="font-display font-semibold text-2xl sm:text-3xl text-center mb-3">Planes</h2>
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mb-10">
          Por ahora, un solo plan simple. Planes Pro y anual, muy pronto.
        </p>
        <div className="max-w-sm mx-auto rounded-3xl bg-white dark:bg-dark-surface border-2 border-accent dark:border-dark-accent shadow-elevated p-8 flex flex-col gap-4 items-center text-center">
          <p className="text-sm font-semibold text-accent dark:text-dark-accent uppercase tracking-wide">Prueba gratuita</p>
          <p className="text-sm text-muted dark:text-dark-text-secondary">Probá Qovento con tu propio local, sin ingresar tarjeta.</p>
          <Link
            href="/registro"
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors text-white py-3.5 text-sm font-medium"
          >
            Empezá gratis
          </Link>
        </div>
      </section>

      <section id="contacto" className="max-w-5xl mx-auto px-6 pb-24 w-full scroll-mt-20 flex flex-col items-center gap-8">
        <div className="text-center">
          <h2 className="font-display font-semibold text-2xl sm:text-3xl mb-2">¿Tenés dudas?</h2>
          <p className="text-sm text-muted dark:text-dark-text-secondary">Escribinos y te respondemos a la brevedad.</p>
        </div>
        <LandingContacto />
      </section>

      <footer className="border-t border-border dark:border-dark-border mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-5 w-5 object-contain" />
            <span className="text-sm font-medium">Qovento</span>
          </div>
          <p className="text-xs text-muted dark:text-dark-text-secondary text-center">{ESLOGAN}</p>
          <div className="flex items-center gap-4 text-xs text-muted dark:text-dark-text-secondary">
            <Link href="/terminos" className="underline">Términos</Link>
            <Link href="/privacidad" className="underline">Privacidad</Link>
            <Link href="/login" className="underline">Iniciar sesión</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
