// Fallback de <Suspense> mientras PanelInicio resuelve sus ~19 consultas.
// Mismas proporciones/alturas que el contenido real para que no salte el
// layout cuando el panel de verdad aparece (mismo patrón de bloque gris
// pulsante que ya usa app/estadisticas/ui.tsx).
function Bloque({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-canvas dark:bg-dark-bg ${className}`} />;
}

export default function PanelInicioSkeleton() {
  return (
    <>
      <Bloque className="h-[92px]" />
      <div className="h-3 w-32 rounded bg-canvas dark:bg-dark-bg animate-pulse -mb-1" />
      <div className="lg:grid lg:grid-cols-3 lg:gap-6 flex flex-col gap-6">
        <Bloque className="h-[236px] lg:col-span-2" />
        <Bloque className="h-[236px]" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Bloque className="h-[110px]" />
        <Bloque className="h-[110px]" />
        <Bloque className="h-[110px]" />
      </div>
      <Bloque className="h-[220px]" />
      <Bloque className="h-[300px]" />
    </>
  );
}
