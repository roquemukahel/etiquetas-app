'use client';

import Link from 'next/link';

export type SeccionServicioTecnico = 'reparaciones' | 'mibanco' | 'tecnicos' | 'repuestos' | 'servicios' | 'proveedores' | 'metricas';

// Navegación interna unificada de Servicio Técnico, para reemplazar los
// links sueltos y subrayados que había antes arriba a la derecha.
//
// "Reparaciones", "Mi banco" y "Técnicos" son botones (no <Link>) SOLO
// cuando se usan dentro de la propia página /servicio-tecnico: ahí comparten
// estado y datos ya cargados (misma lista de reparaciones/técnicos, mismos
// handlers de asignar/cambiar estado/WhatsApp), así que cambiar de uno a
// otro es instantáneo y no duplica la carga. Si no se pasa el handler
// correspondiente, esos mismos ítems se comportan como <Link> normal hacia
// /servicio-tecnico (para navegar ahí desde Repuestos, Servicios o
// Proveedores).
const ITEMS: { key: SeccionServicioTecnico; icono: string; label: string; href: string }[] = [
  { key: 'reparaciones', icono: '🛠️', label: 'Reparaciones', href: '/servicio-tecnico' },
  { key: 'mibanco', icono: '🎯', label: 'Mi banco', href: '/servicio-tecnico?tab=mibanco' },
  { key: 'tecnicos', icono: '👥', label: 'Técnicos', href: '/servicio-tecnico?tab=tecnicos' },
  { key: 'repuestos', icono: '🔩', label: 'Repuestos', href: '/servicio-tecnico/stock' },
  { key: 'servicios', icono: '🗂️', label: 'Servicios', href: '/servicio-tecnico/trabajos' },
  { key: 'proveedores', icono: '🏷️', label: 'Proveedores', href: '/servicio-tecnico/repuestos' },
  { key: 'metricas', icono: '📊', label: 'Métricas', href: '/servicio-tecnico/metricas' },
];

export default function ServicioTecnicoTabs({
  active,
  mostrarMiBanco = true,
  onSelectReparaciones,
  onSelectMiBanco,
  onSelectTecnicos,
}: {
  active: SeccionServicioTecnico;
  // "Mi banco" es personal del técnico conectado — no tiene sentido para un
  // actor vendedor (no le corresponden reparaciones asignadas), así que se
  // oculta cuando no hay un técnico elegido en "Cambiar".
  mostrarMiBanco?: boolean;
  onSelectReparaciones?: () => void;
  onSelectMiBanco?: () => void;
  onSelectTecnicos?: () => void;
}) {
  const handlers: Partial<Record<SeccionServicioTecnico, () => void>> = {
    reparaciones: onSelectReparaciones,
    mibanco: onSelectMiBanco,
    tecnicos: onSelectTecnicos,
  };
  return (
    <nav
      aria-label="Secciones de Servicio Técnico"
      className="flex gap-1 overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0 border-b border-border dark:border-dark-border"
    >
      {ITEMS.filter((t) => t.key !== 'mibanco' || mostrarMiBanco).map((t) => {
        const activo = t.key === active;
        const claseComun = `shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-dark-accent rounded-t-md ${
          activo
            ? 'border-accent dark:border-dark-accent text-accent dark:text-dark-accent'
            : 'border-transparent text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text hover:border-border dark:hover:border-dark-border'
        }`;
        const handler = handlers[t.key];
        const contenido = (
          <>
            <span aria-hidden="true">{t.icono}</span>
            {t.label}
          </>
        );
        if (handler) {
          return (
            <button key={t.key} type="button" aria-current={activo ? 'page' : undefined} onClick={handler} className={claseComun}>
              {contenido}
            </button>
          );
        }
        return (
          <Link key={t.key} href={t.href} aria-current={activo ? 'page' : undefined} className={claseComun}>
            {contenido}
          </Link>
        );
      })}
    </nav>
  );
}
