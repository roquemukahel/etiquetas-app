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
      <header className="sticky top-0 z-30 bg-[#070B18]/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-[1280px] mx-auto px-5 sm:px-8 lg:px-12 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="Qovento" className="h-7 w-7 object-contain" />
            <span className="font-display font-semibold text-lg text-white">Qovento</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-white/70">
            <a href="#inicio" className="hover:text-white transition-colors">Inicio</a>
            <a href="#caracteristicas" className="hover:text-white transition-colors">Características</a>
            <a href="#planes" className="hover:text-white transition-colors">Planes</a>
            <a href="#contacto" className="hover:text-white transition-colors">Contacto</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm font-medium px-3 py-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors">
              Iniciar sesión
            </Link>
            <Link
              href="/registro"
              className="text-sm font-medium px-4 py-2 rounded-xl bg-gradient-to-r from-[#2F6BFF] to-[#7C3AED] hover:brightness-110 text-white transition shadow-[0_6px_20px_-6px_rgba(47,107,255,0.7)]"
            >
              Empezá gratis
            </Link>
          </div>
        </div>
      </header>

      <section id="inicio" className="relative overflow-hidden bg-[#070B18] text-white">
        {/* Fondo en escritorio: la interfaz de Qovento + Qovi a la derecha; el
           lado izquierdo queda despejado para el texto. object-right para que
           Qovi nunca quede recortado; el degradado da contraste al texto. */}
        <picture aria-hidden="true" className="hidden xl:block absolute inset-0 h-full w-full select-none pointer-events-none">
          <source type="image/avif" srcSet="/qovento-hero-qovi.avif" />
          <source type="image/webp" srcSet="/qovento-hero-qovi.webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qovento-hero-qovi.webp" alt="" fetchPriority="high" className="h-full w-full object-cover object-right" />
        </picture>
        <div aria-hidden="true" className="hidden xl:block absolute inset-0 bg-gradient-to-r from-[#070B18] via-[#070B18]/80 to-transparent" />

        <div className="relative mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-12">
          <div className="xl:flex xl:items-center xl:min-h-[clamp(720px,88vh,850px)]">
            <div className="w-full xl:w-[42%] xl:max-w-[560px] flex flex-col items-start gap-5 pt-12 pb-8 xl:py-0">
              <span className="animate-fade-in-up text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300 bg-sky-400/10 border border-sky-400/25 rounded-full px-3 py-1.5">
                Gestión integral para locales de celulares
              </span>
              <h1
                className="animate-fade-in-up font-display font-semibold text-white leading-[1.08] text-[clamp(2.1rem,4.6vw,3.4rem)]"
                style={{ animationDelay: '60ms' }}
              >
                Todo tu negocio, organizado{' '}
                <span className="bg-gradient-to-r from-sky-400 to-violet-500 bg-clip-text text-transparent">
                  en un solo lugar
                </span>
                .
              </h1>
              <p
                className="animate-fade-in-up text-slate-300 leading-relaxed text-[clamp(1rem,1.4vw,1.2rem)] max-w-[560px]"
                style={{ animationDelay: '120ms' }}
              >
                Gestioná ventas, stock, reparaciones, clientes y estadísticas desde una plataforma simple, rápida y
                completamente conectada.
              </p>
              <div
                className="animate-fade-in-up flex flex-col sm:flex-row gap-3 mt-1 w-full sm:w-auto"
                style={{ animationDelay: '180ms' }}
              >
                <Link
                  href="/registro"
                  className="rounded-2xl bg-gradient-to-r from-[#2F6BFF] to-[#7C3AED] hover:brightness-110 hover:-translate-y-0.5 transition text-white px-6 py-3.5 text-sm font-semibold text-center shadow-[0_10px_30px_-8px_rgba(47,107,255,0.65)]"
                >
                  Empezá gratis
                </Link>
                <a
                  href="#caracteristicas"
                  className="rounded-2xl bg-white/5 border border-white/20 hover:bg-white/10 transition text-white px-6 py-3.5 text-sm font-semibold text-center"
                >
                  Ver cómo funciona
                </a>
              </div>
              <p className="animate-fade-in-up text-sm text-slate-200 font-medium mt-1" style={{ animationDelay: '240ms' }}>
                14 días gratis · Sin tarjeta de crédito · Configuración en minutos
              </p>
            </div>
          </div>

          {/* Móvil y tablet: la imagen como bloque visual independiente, debajo
             del texto (no como fondo, para no recortar a Qovi ni tapar el texto). */}
          <div className="xl:hidden pb-12">
            <picture>
              <source type="image/avif" srcSet="/qovento-hero-qovi-sm.avif" />
              <source type="image/webp" srcSet="/qovento-hero-qovi-sm.webp" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/qovento-hero-qovi-sm.webp"
                alt="Interfaz de Qovento con Qovi, la mascota del sistema"
                className="w-full rounded-2xl border border-white/10 object-cover aspect-[2/1] shadow-[0_0_60px_-15px_rgba(59,130,246,0.55)]"
              />
            </picture>
          </div>
        </div>
      </section>

      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-20 w-full xl:-mt-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FUNCIONES.map((f) => (
            <div key={f.titulo} className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated p-5">
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
          Empezá con 14 días gratis, sin ingresar tarjeta. Estos son los precios cuando termine la prueba.
        </p>
        <div className="grid sm:grid-cols-3 gap-5 items-stretch">
          <div className="rounded-3xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-7 flex flex-col gap-3 text-center">
            <p className="text-sm font-semibold text-accent dark:text-dark-accent uppercase tracking-wide">Mensual</p>
            <p className="font-display font-semibold text-3xl">US$9.99<span className="text-sm font-normal text-muted dark:text-dark-text-secondary">/mes</span></p>
            <p className="text-xs text-muted dark:text-dark-text-secondary">Precio de lanzamiento, por tiempo limitado.</p>
            <Link
              href="/registro"
              className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors text-white py-3.5 text-sm font-medium"
            >
              Empezá gratis
            </Link>
          </div>

          <div className="rounded-3xl bg-white dark:bg-dark-surface border-2 border-accent dark:border-dark-accent shadow-elevated p-7 flex flex-col gap-3 text-center relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent dark:bg-dark-accent text-white text-[10px] font-semibold uppercase tracking-wide px-3 py-1">
              Recomendado
            </span>
            <p className="text-sm font-semibold text-accent dark:text-dark-accent uppercase tracking-wide">Anual</p>
            <p className="font-display font-semibold text-3xl">US$100<span className="text-sm font-normal text-muted dark:text-dark-text-secondary">/año</span></p>
            <p className="text-xs text-muted dark:text-dark-text-secondary">Casi 2 meses gratis frente al plan mensual.</p>
            <Link
              href="/registro"
              className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors text-white py-3.5 text-sm font-medium"
            >
              Empezá gratis
            </Link>
          </div>

          <div className="rounded-3xl bg-white dark:bg-dark-surface border border-dashed border-border dark:border-dark-border p-7 flex flex-col gap-3 text-center opacity-70">
            <p className="text-sm font-semibold text-muted dark:text-dark-text-secondary uppercase tracking-wide">Pro</p>
            <p className="font-display font-semibold text-3xl text-muted dark:text-dark-text-secondary">Próximamente</p>
            <p className="text-xs text-muted dark:text-dark-text-secondary">Funciones avanzadas para negocios en expansión.</p>
            <span className="mt-auto w-full rounded-2xl border border-border dark:border-dark-border py-3.5 text-sm font-medium text-muted dark:text-dark-text-secondary">
              En trabajo
            </span>
          </div>
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
