'use client';

import dynamic from 'next/dynamic';

// El dashboard de Analítica es 100% cliente (trae los datos con la sesión del
// usuario, no en el build). Lo cargamos con ssr:false para que Next NO intente
// pre-generarlo en el build — si lo hiciera, el render sin datos/sesión cuelga
// la generación estática y tumba todo el build (timeout de 60s).
const Dashboard = dynamic(() => import('./Dashboard'), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando analítica...</p>
    </main>
  ),
});

export default function EstadisticasPage() {
  return <Dashboard />;
}
