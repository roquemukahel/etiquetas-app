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

// Datos de DEMOSTRACIÓN para la vista previa de estadísticas del landing (no
// son de ningún negocio real; es una maqueta para mostrar cómo se ve el panel).
const DEMO_VENDEDORES = [
  { nombre: 'Nico', valor: 9840 },
  { nombre: 'Sofi', valor: 6320 },
  { nombre: 'Ale', valor: 4110 },
];
const DEMO_PRODUCTOS = [
  { nombre: 'iPhone 13 128GB', valor: '14 vendidos', ancho: 100 },
  { nombre: 'iPhone 15 128GB', valor: '11 vendidos', ancho: 78 },
  { nombre: 'Batería iPhone 12', valor: '9 cambios', ancho: 64 },
];
const DEMO_PAGOS = [
  { nombre: 'Efectivo', pct: 64, color: '#3b82f6' },
  { nombre: 'Transferencia', pct: 27, color: '#f97316' },
  { nombre: 'Tarjeta', pct: 9, color: '#22c55e' },
];

function MedallaLanding({ pos }: { pos: number }) {
  const medalla = pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉';
  return <span className="w-5 shrink-0 text-center text-base leading-none">{medalla}</span>;
}

function FilaRankingLanding({ pos, nombre, valor, ancho }: { pos: number; nombre: string; valor: string; ancho: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <MedallaLanding pos={pos} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-white truncate">{nombre}</span>
          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{valor}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 mt-1 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500" style={{ width: `${ancho}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function LandingPublica() {
  return (
    <main className="flex flex-col min-h-screen bg-[#070B18] text-white">
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qovento-hero-qovi.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="hidden xl:block absolute inset-0 h-full w-full object-cover object-right select-none pointer-events-none"
        />
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
          {/* En celular/tablet no se muestra imagen del hero (quedaba como una
             foto chica pegada, poco estética). En escritorio (xl) sigue el
             fondo con la interfaz + Qovi, igual que antes. */}
          <div className="xl:hidden pb-4" />
        </div>
      </section>

      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-20 w-full xl:-mt-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FUNCIONES.map((f) => (
            <div key={f.titulo} className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 backdrop-blur-sm">
              <p className="text-sm font-semibold text-white">{f.titulo}</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20 w-full">
        <div className="text-center mb-8">
          <h2 className="font-display font-semibold text-2xl sm:text-3xl text-white">Todo tu local, de un vistazo</h2>
          <p className="text-sm text-slate-400 mt-2">
            Así se ven tus estadísticas en vivo.{' '}
            <span className="text-slate-500">Datos de demostración.</span>
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Ingresos */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <p className="text-xs text-slate-400">Ingresos este mes</p>
              <p className="text-3xl font-display font-semibold text-white mt-1">US$18.740</p>
              <p className="text-xs text-emerald-400 font-medium mt-1">↑ 76% vs. el mes anterior</p>
              <div className="flex gap-6 mt-4">
                <div>
                  <p className="text-lg font-semibold text-white">42</p>
                  <p className="text-[11px] text-slate-400">Ventas</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">US$446</p>
                  <p className="text-[11px] text-slate-400">Ticket promedio</p>
                </div>
              </div>
            </div>

            {/* Ranking de vendedores */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <p className="text-sm font-semibold text-white mb-3">Ranking de vendedores</p>
              <div className="flex flex-col gap-3">
                {DEMO_VENDEDORES.map((v, i) => (
                  <FilaRankingLanding
                    key={v.nombre}
                    pos={i + 1}
                    nombre={v.nombre}
                    valor={`US$${v.valor.toLocaleString('es-AR')}`}
                    ancho={Math.round((v.valor / DEMO_VENDEDORES[0].valor) * 100)}
                  />
                ))}
              </div>
            </div>

            {/* Producto más vendido */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <p className="text-sm font-semibold text-white mb-3">Productos más vendidos</p>
              <div className="flex flex-col gap-3">
                {DEMO_PRODUCTOS.map((p, i) => (
                  <FilaRankingLanding key={p.nombre} pos={i + 1} nombre={p.nombre} valor={p.valor} ancho={p.ancho} />
                ))}
              </div>
            </div>

            {/* Formas de pago */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
              <p className="text-sm font-semibold text-white mb-3">Formas de pago</p>
              <div className="h-2.5 w-full rounded-full overflow-hidden flex">
                {DEMO_PAGOS.map((p) => (
                  <div key={p.nombre} style={{ width: `${p.pct}%`, backgroundColor: p.color }} />
                ))}
              </div>
              <div className="flex flex-col gap-2 mt-3">
                {DEMO_PAGOS.map((p) => (
                  <div key={p.nombre} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.nombre}
                    </span>
                    <span className="text-slate-400 tabular-nums">{p.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="caracteristicas" className="max-w-5xl mx-auto px-6 pb-20 w-full scroll-mt-20">
        <h2 className="font-display font-semibold text-2xl sm:text-3xl text-center mb-10 text-white">Todo lo que ya trae Qovento</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {CARACTERISTICAS.map((c) => (
            <div key={c.grupo} className="rounded-2xl bg-white/[0.03] border border-white/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-400 mb-3">{c.grupo}</p>
              <ul className="flex flex-col gap-2">
                {c.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="planes" className="max-w-5xl mx-auto px-6 pb-20 w-full scroll-mt-20">
        <h2 className="font-display font-semibold text-2xl sm:text-3xl text-center mb-3 text-white">Planes</h2>
        <p className="text-sm text-slate-400 text-center mb-10">
          Empezá con 14 días gratis, sin ingresar tarjeta. Estos son los precios cuando termine la prueba.
        </p>
        <div className="grid sm:grid-cols-3 gap-5 items-stretch">
          <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-7 flex flex-col gap-3 text-center">
            <p className="text-sm font-semibold text-sky-400 uppercase tracking-wide">Mensual</p>
            <p className="font-display font-semibold text-3xl text-white">US$9.99<span className="text-sm font-normal text-slate-400">/mes</span></p>
            <p className="text-xs text-slate-400">Precio de lanzamiento, por tiempo limitado.</p>
            <Link
              href="/registro"
              className="mt-auto w-full rounded-2xl bg-gradient-to-r from-[#2F6BFF] to-[#7C3AED] hover:brightness-110 transition text-white py-3.5 text-sm font-semibold"
            >
              Empezá gratis
            </Link>
          </div>

          <div className="rounded-3xl bg-white/[0.06] border-2 border-sky-400/60 shadow-[0_0_50px_-12px_rgba(56,189,248,0.35)] p-7 flex flex-col gap-3 text-center relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#2F6BFF] to-[#7C3AED] text-white text-[10px] font-semibold uppercase tracking-wide px-3 py-1">
              Recomendado
            </span>
            <p className="text-sm font-semibold text-sky-400 uppercase tracking-wide">Anual</p>
            <p className="font-display font-semibold text-3xl text-white">US$100<span className="text-sm font-normal text-slate-400">/año</span></p>
            <p className="text-xs text-slate-400">Casi 2 meses gratis frente al plan mensual.</p>
            <Link
              href="/registro"
              className="mt-auto w-full rounded-2xl bg-gradient-to-r from-[#2F6BFF] to-[#7C3AED] hover:brightness-110 transition text-white py-3.5 text-sm font-semibold"
            >
              Empezá gratis
            </Link>
          </div>

          <div className="rounded-3xl bg-white/[0.02] border border-dashed border-white/15 p-7 flex flex-col gap-3 text-center opacity-80">
            <p className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Pro</p>
            <p className="font-display font-semibold text-3xl text-slate-400">Próximamente</p>
            <p className="text-xs text-slate-500">Funciones avanzadas para negocios en expansión.</p>
            <span className="mt-auto w-full rounded-2xl border border-white/15 py-3.5 text-sm font-medium text-slate-400">
              En trabajo
            </span>
          </div>
        </div>
      </section>

      <section id="contacto" className="max-w-5xl mx-auto px-6 pb-24 w-full scroll-mt-20 flex flex-col items-center gap-8">
        <div className="text-center">
          <h2 className="font-display font-semibold text-2xl sm:text-3xl mb-2 text-white">¿Tenés dudas?</h2>
          <p className="text-sm text-slate-400">Escribinos y te respondemos a la brevedad.</p>
        </div>
        <LandingContacto />
      </section>

      <footer className="border-t border-white/10 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-5 w-5 object-contain" />
            <span className="text-sm font-medium text-white">Qovento</span>
          </div>
          <p className="text-xs text-slate-400 text-center">{ESLOGAN}</p>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <Link href="/terminos" className="underline hover:text-white transition-colors">Términos</Link>
            <Link href="/privacidad" className="underline hover:text-white transition-colors">Privacidad</Link>
            <Link href="/login" className="underline hover:text-white transition-colors">Iniciar sesión</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
