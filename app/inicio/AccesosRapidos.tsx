import Link from 'next/link';
import IlustracionModulo from './IlustracionesModulos';

// Centro operativo ilustrado del Inicio. Server component (las
// microinteracciones son CSS puro, respetan prefers-reduced-motion, no hace
// falta JS). Recibe las métricas ya calculadas en app/page.tsx — no consulta
// nada ni cambia lógica de negocio; solo presenta.

export type MetricasAccesos = {
  ordenesPendientes: number;
  ultimaVentaTexto: string | null;
  enStock: number;
  porAgotarse: number;
  sinPrecio: number;
  clientes: number;
  comprasPendientes: number;
  enCanje: number;
  listosEntregar: number;
  atrasadosServicio: number;
};

type Tono = 'info' | 'good' | 'warn' | 'bad' | 'create';

type Modulo = {
  href: string;
  titulo: string;
  desc: string;
  ilustracion: string;
};

const OPERACION: Modulo[] = [
  { href: '/ordenes', titulo: 'Órdenes', desc: 'Ventas, boletas y canjes', ilustracion: 'ordenes' },
  { href: '/stock', titulo: 'Stock', desc: 'Dispositivos disponibles en tu local', ilustracion: 'stock' },
  { href: '/servicio-tecnico', titulo: 'Servicio Técnico', desc: 'Equipos derivados a reparación', ilustracion: 'servicio' },
  { href: '/clientes', titulo: 'Clientes', desc: 'Tu base de clientes', ilustracion: 'clientes' },
  { href: '/productos', titulo: 'Productos', desc: 'Catálogo completo, cruzado entre sucursales', ilustracion: 'productos' },
];

const FINANZAS: Modulo[] = [
  { href: '/compras', titulo: 'Compra de dispositivos', desc: 'Cuando le comprás un celular a alguien', ilustracion: 'compra' },
  { href: '/proveedores', titulo: 'Proveedores', desc: 'A quién le comprás stock en lote', ilustracion: 'proveedores' },
  { href: '/cuentas-por-cobrar', titulo: 'Cuentas por cobrar', desc: 'Quién te debe y cuánto', ilustracion: 'cobrar' },
  { href: '/canje', titulo: 'Plan Canje', desc: 'Dispositivos recibidos como parte de pago', ilustracion: 'canje' },
  { href: '/comisiones', titulo: 'Comisiones', desc: 'Lo que le corresponde a cada vendedor', ilustracion: 'comisiones' },
  { href: '/egresos', titulo: 'Egresos', desc: 'Gastos y retiros del negocio', ilustracion: 'egresos' },
  { href: '/plan-ahorro', titulo: 'Plan de ahorro', desc: 'Señas y equipos reservados', ilustracion: 'ahorro' },
];

const ADMINISTRACION: Modulo[] = [
  { href: '/estadisticas', titulo: 'Estadísticas', desc: 'Cómo viene el negocio', ilustracion: 'estadisticas' },
  { href: '/configuracion/sucursales', titulo: 'Sucursales', desc: 'Tus locales y qué hay en cada uno', ilustracion: 'sucursales' },
  { href: '/configuracion', titulo: 'Configuración', desc: 'Ajustes del negocio y del equipo', ilustracion: 'configuracion' },
  { href: '/configuracion/soporte', titulo: 'Soporte', desc: 'Ayuda y contacto', ilustracion: 'soporte' },
];

const ACCIONES: Modulo[] = [
  { href: '/nueva-etiqueta', titulo: 'Nueva etiqueta', desc: 'Fotografiá el IMEI y generá la etiqueta', ilustracion: 'etiqueta' },
  { href: '/stock/foto', titulo: 'Agregar al stock', desc: 'Fotografiá el IMEI y cargalo directo', ilustracion: 'camara' },
];

const TONO_BADGE: Record<Tono, string> = {
  info: 'bg-accent-soft text-accent dark:bg-dark-accent-soft dark:text-dark-accent',
  good: 'bg-good/10 text-good dark:text-green-400',
  warn: 'bg-warn/10 text-warn dark:text-amber-400',
  bad: 'bg-bad/10 text-bad dark:text-red-400',
  create: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
};

const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);
type T = (texto: string) => string;

// Badges (pills con estado) y una nota opcional en gris por módulo.
function datosDe(href: string, m: MetricasAccesos, t: T, locale: string): { badges: { texto: string; tono: Tono }[]; nota?: string } {
  switch (href) {
    case '/ordenes':
      return {
        badges: [{ texto: `${m.ordenesPendientes} ${t(plural(m.ordenesPendientes, 'pendiente', 'pendientes'))}`, tono: m.ordenesPendientes > 0 ? 'warn' : 'info' }],
        nota: m.ultimaVentaTexto ?? undefined,
      };
    case '/stock':
      return {
        badges: [
          { texto: `${m.enStock} ${t('en stock')}`, tono: 'info' },
          ...(m.porAgotarse > 0 ? [{ texto: `${m.porAgotarse} ${t('por agotarse')}`, tono: 'warn' as Tono }] : []),
          ...(m.sinPrecio > 0 ? [{ texto: `${m.sinPrecio} ${t('sin precio')}`, tono: 'warn' as Tono }] : []),
        ],
      };
    case '/servicio-tecnico':
      return {
        badges: [
          { texto: `${m.listosEntregar} ${t(plural(m.listosEntregar, 'listo', 'listos'))} ${t('para entregar')}`, tono: m.listosEntregar > 0 ? 'good' : 'info' },
          ...(m.atrasadosServicio > 0 ? [{ texto: `${m.atrasadosServicio} ${t(plural(m.atrasadosServicio, 'atrasado', 'atrasados'))}`, tono: 'bad' as Tono }] : []),
        ],
      };
    case '/clientes':
      return { badges: [{ texto: `${m.clientes.toLocaleString(locale)} ${t(plural(m.clientes, 'cliente', 'clientes'))}`, tono: 'info' }] };
    case '/compras':
      return { badges: m.comprasPendientes > 0 ? [{ texto: `${m.comprasPendientes} ${t(plural(m.comprasPendientes, 'pendiente', 'pendientes'))}`, tono: 'warn' }] : [] };
    case '/canje':
      return { badges: m.enCanje > 0 ? [{ texto: `${m.enCanje} ${t('en canje')}`, tono: 'info' }] : [] };
    default:
      return { badges: [] };
  }
}

function Badge({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${TONO_BADGE[tono]}`}>
      {tono !== 'info' && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

const CARD_BASE =
  'qv-card group relative flex rounded-2xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card transition-[transform,box-shadow] duration-200 ' +
  'hover:-translate-y-1 hover:shadow-elevated hover:border-accent/30 dark:hover:border-dark-accent/40 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas dark:focus-visible:ring-offset-dark-bg ' +
  'active:translate-y-0 active:scale-[0.995] motion-reduce:transition-none motion-reduce:hover:translate-y-0';

const ILUS_ANIM = 'transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-[1.05] motion-reduce:transform-none motion-reduce:transition-none';

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Tarjeta principal (Operación diaria): mayor presencia, ilustración grande.
function TarjetaPrincipal({ mod, m, t, locale }: { mod: Modulo; m: MetricasAccesos; t: T; locale: string }) {
  const { badges, nota } = datosDe(mod.href, m, t, locale);
  return (
    <Link href={mod.href} aria-label={t(mod.titulo)} className={`${CARD_BASE} min-h-[132px] flex-col justify-between overflow-hidden p-4 sm:p-5`}>
      <span className="pointer-events-none absolute -right-3 -top-3 h-24 w-24 rounded-full bg-accent-soft/60 dark:bg-dark-accent-soft opacity-70" aria-hidden="true" />
      <div className="relative flex items-start gap-3">
        <IlustracionModulo nombre={mod.ilustracion} className={`h-16 w-16 shrink-0 sm:h-[76px] sm:w-[76px] ${ILUS_ANIM}`} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-display text-[15px] font-semibold leading-tight tracking-tight sm:text-base">{t(mod.titulo)}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted dark:text-dark-text-secondary">{t(mod.desc)}</p>
        </div>
        <span className="mt-0.5 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent dark:text-dark-text-secondary dark:group-hover:text-dark-accent">
          <Chevron />
        </span>
      </div>
      <div className="relative mt-2 flex flex-wrap items-center gap-1.5">
        {badges.map((b, i) => (
          <Badge key={i} tono={b.tono}>
            {b.texto}
          </Badge>
        ))}
        {nota && <span className="text-[11px] text-muted dark:text-dark-text-secondary">{nota}</span>}
      </div>
    </Link>
  );
}

// Tarjeta secundaria (Compras y finanzas): más compacta, misma ilustración.
function TarjetaSecundaria({ mod, m, t, locale }: { mod: Modulo; m: MetricasAccesos; t: T; locale: string }) {
  const { badges } = datosDe(mod.href, m, t, locale);
  return (
    <Link href={mod.href} aria-label={t(mod.titulo)} className={`${CARD_BASE} items-center gap-3 p-3.5`}>
      <IlustracionModulo nombre={mod.ilustracion} className={`h-12 w-12 shrink-0 ${ILUS_ANIM}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight tracking-tight">{t(mod.titulo)}</p>
        <p className="mt-0.5 truncate text-[11px] leading-snug text-muted dark:text-dark-text-secondary">{t(mod.desc)}</p>
        {badges.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {badges.map((b, i) => (
              <Badge key={i} tono={b.tono}>
                {b.texto}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <span className="shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-accent dark:text-dark-text-secondary dark:group-hover:text-dark-accent">
        <Chevron />
      </span>
    </Link>
  );
}

// Tarjeta de acción rápida: se siente ejecutable (acento violeta + "botón").
function TarjetaAccion({ mod, t }: { mod: Modulo; t: T }) {
  return (
    <Link
      href={mod.href}
      aria-label={t(mod.titulo)}
      className={`${CARD_BASE} items-center gap-3.5 border-l-[3px] border-l-violet-500 bg-gradient-to-r from-violet-500/[0.06] to-transparent p-3.5 dark:from-violet-500/10`}
    >
      <IlustracionModulo nombre={mod.ilustracion} className={`h-14 w-14 shrink-0 ${ILUS_ANIM}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight tracking-tight">{t(mod.titulo)}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted dark:text-dark-text-secondary">{t(mod.desc)}</p>
      </div>
      <span className="shrink-0 rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
        {t('Abrir')}
      </span>
    </Link>
  );
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary">{children}</p>;
}

export default function AccesosRapidos({ metricas, t, locale }: { metricas: MetricasAccesos; t: T; locale: string }) {
  return (
    <section aria-labelledby="accesos-titulo" className="flex flex-col gap-4 animate-fade-in-up" style={{ animationDelay: '240ms' }}>
      {/* Encabezado: solo título, con Qovi acompañando (no es clickeable) */}
      <div className="flex items-center gap-2.5">
        <span className="relative shrink-0" aria-hidden="true">
          <span className="absolute inset-0 -z-10 m-auto h-10 w-10 rounded-full bg-accent-soft dark:bg-dark-accent-soft" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qobi.webp" alt="" className="h-12 w-12 object-contain drop-shadow-sm" />
        </span>
        <h2 id="accesos-titulo" className="font-display text-base font-semibold tracking-tight">
          {t('Accesos rápidos')}
        </h2>
      </div>

      {/* Operación diaria — tarjetas principales */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPERACION.map((mod) => (
          <TarjetaPrincipal key={mod.href} mod={mod} m={metricas} t={t} locale={locale} />
        ))}
      </div>

      {/* Compras y finanzas — accesos secundarios */}
      <Subtitulo>{t('Compras y finanzas')}</Subtitulo>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {FINANZAS.map((mod) => (
          <TarjetaSecundaria key={mod.href} mod={mod} m={metricas} t={t} locale={locale} />
        ))}
      </div>

      {/* Administración — configuración y análisis, se visitan menos seguido */}
      <Subtitulo>{t('Administración')}</Subtitulo>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ADMINISTRACION.map((mod) => (
          <TarjetaSecundaria key={mod.href} mod={mod} m={metricas} t={t} locale={locale} />
        ))}
      </div>

      {/* Acciones rápidas — ejecutables */}
      <Subtitulo>{t('Acciones rápidas')}</Subtitulo>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ACCIONES.map((mod) => (
          <TarjetaAccion key={mod.href} mod={mod} t={t} />
        ))}
      </div>
    </section>
  );
}
