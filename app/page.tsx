import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { crearClienteServidor } from './lib/supabase/server';
import QMark from './QMark';
import BuscadorUniversal from './BuscadorUniversal';
import LandingPublica from './LandingPublica';
import { simboloMoneda } from './lib/monedas';
import PanelInicio from './inicio/PanelInicio';
import PanelInicioSkeleton from './inicio/PanelInicioSkeleton';
import AvisoPruebaPorVencer from './AvisoPruebaPorVencer';
import NovedadesModal from './NovedadesModal';
import { obtenerIdiomaServidor, traducir } from './lib/idiomaServidor';
import { obtenerSucursalServidor } from './lib/sucursalServidor';

// Home() solo hace lo estrictamente necesario para pintar el header y el
// buscador YA (una consulta rápida a "perfiles" + el RPC de admin, en
// paralelo) — todo lo demás (notificaciones, resumen financiero, más
// vendidos, actividad reciente, accesos rápidos) vive en PanelInicio, que
// hace sus ~19 consultas propias y queda envuelto en <Suspense>. Antes,
// TODA la pantalla esperaba a que las ~20 consultas terminaran juntas
// (~2s en la práctica) para mostrar cualquier cosa; ahora el header y el
// buscador aparecen al toque, y el resto se streamea apenas está listo.
export default async function Home() {
  const idioma = obtenerIdiomaServidor();
  const t = (texto: string) => traducir(idioma, texto);
  const sucursalId = obtenerSucursalServidor();
  const supabase = crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <LandingPublica />;
  }

  const [{ data: perfil }, { data: esAdminData }] = await Promise.all([
    supabase
      .from('perfiles')
      .select('negocio_id, negocios ( nombre, logo_url, moneda, estado_suscripcion, fecha_fin_prueba )')
      .eq('id', user.id)
      .single(),
    supabase.rpc('es_admin'),
  ]);
  const esAdmin = !!esAdminData;

  // Puede pasar si el registro se cortó justo entre crear la cuenta y
  // crear el negocio (ver app/registro): sin esto, esta pantalla se
  // queda mostrando un panel vacío para siempre, sin forma de arreglarlo.
  // No aplica a un super_admin sin negocio propio (usa /admin, no esta
  // pantalla) — se lo deja pasar para no bloquearlo a él por error.
  if (!perfil && !esAdmin) {
    redirect('/registro');
  }

  const negocio = (perfil as any)?.negocios;
  const nombreNegocio = negocio?.nombre || 'Qovento';
  const logoUrl: string | null = negocio?.logo_url || null;
  const moneda = negocio?.moneda ? simboloMoneda(negocio.moneda) : '$';
  let diasDePrueba: number | null = null;
  if (negocio?.estado_suscripcion === 'trialing' && negocio?.fecha_fin_prueba) {
    diasDePrueba = Math.max(
      0,
      Math.ceil((new Date(negocio.fecha_fin_prueba).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    );
  }
  const suscripcionActiva = negocio?.estado_suscripcion === 'active';

  return (
    <main className="flex min-h-screen flex-col px-6 py-8 gap-6 max-w-2xl lg:max-w-[1180px] mx-auto w-full">
      <NovedadesModal />
      <AvisoPruebaPorVencer diasDePrueba={diasDePrueba} />

      {diasDePrueba != null && (
        <Link
          href="/configuracion/suscripcion"
          className="fixed top-3 right-3 z-30 flex items-center gap-1.5 rounded-full bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors text-white text-xs font-medium pl-3 pr-2.5 py-1.5 shadow-elevated"
        >
          <span>
            {diasDePrueba > 0
              ? `${diasDePrueba} ${diasDePrueba === 1 ? t('día') : t('días')} ${t('de prueba')}`
              : t('Prueba vencida')}
          </span>
          <span className="text-white/70">&rarr;</span>
        </Link>
      )}

      <header className="flex items-center justify-between animate-fade-in-up">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-20 w-20 rounded-2xl object-contain bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card" />
          ) : (
            <div className="h-20 w-20 rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card flex items-center justify-center">
              <QMark size={48} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <p className="text-2xl font-display font-semibold leading-tight tracking-tight">{nombreNegocio}</p>
            {suscripcionActiva && (
              <span className="text-[10px] font-bold tracking-wide bg-gradient-to-r from-accent to-accent-hover dark:from-dark-accent dark:to-dark-accent-hover text-white rounded-full px-2 py-0.5">
                PRO
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {esAdmin && (
            <Link href="/admin" className="text-xs text-accent dark:text-dark-accent font-medium hover:text-accent-hover dark:hover:text-dark-accent-hover transition-colors">
              {t('Panel Admin')}
            </Link>
          )}
          <Link href="/configuracion" className="text-xs text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text transition-colors">
            {t('Configuración')}
          </Link>
        </div>
      </header>

      {/* relative z-30: la animación de entrada (transform) crea sin querer
         un contexto de apilamiento nuevo en este div — sin este z-index
         explícito, el resultado del buscador queda atrapado detrás de las
         secciones siguientes (ej. centro de notificaciones) sin importar el
         z-index interno del dropdown. */}
      <div className="relative z-30 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        <BuscadorUniversal />
      </div>

      <Suspense fallback={<PanelInicioSkeleton />}>
        <PanelInicio userId={user.id} sucursalId={sucursalId} idioma={idioma} moneda={moneda} />
      </Suspense>

      <div className="text-center mt-auto pt-6 pb-2 flex flex-col items-center gap-1.5">
        <p className="flex items-center justify-center gap-2 text-sm font-display font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qovento-icon.png" alt="" className="h-5 w-5 object-contain" />
          Qovento
        </p>
        <p className="text-xs text-muted dark:text-dark-text-secondary max-w-xs leading-snug">
          {t('El sistema más rápido para vender, reparar y gestionar comercios de tecnología.')}
        </p>
      </div>
    </main>
  );
}
