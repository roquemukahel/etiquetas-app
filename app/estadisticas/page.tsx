import Dashboard from './Dashboard';

// El dashboard de Analítica depende 100% de la sesión y de datos que solo
// existen en el navegador. Marcamos la ruta como dinámica para que Next NO la
// pre-genere en el build (la generación estática se colgaba, timeout de 60s).
// A diferencia de next/dynamic({ssr:false}), acá el dashboard viaja en el
// bundle normal de la ruta (no como chunk perezoso aparte), así no hay un
// "chunk" que pueda quedar colgado al cargar.
export const dynamic = 'force-dynamic';

export default function EstadisticasPage() {
  return <Dashboard />;
}
