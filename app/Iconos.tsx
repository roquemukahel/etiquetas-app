export function IconoBase({ children }: { children: React.ReactNode }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// Un acento de color por categoría (ventas, inventario, clientes, servicio,
// compras) para que los accesos rápidos y el sidebar se distingan de un
// vistazo, en vez de que todos pesen exactamente igual.
export const COLOR_ICONO: Record<string, string> = {
  ventas: 'from-accent to-accent-hover dark:from-dark-accent dark:to-dark-accent-hover',
  inventario: 'from-violet-500 to-violet-600',
  clientes: 'from-emerald-500 to-emerald-600',
  servicio: 'from-amber-500 to-amber-600',
  compras: 'from-teal-500 to-teal-600',
};

export const ICONOS: Record<string, React.ReactNode> = {
  etiqueta: (
    <IconoBase>
      <path d="M12.5 3H6a3 3 0 0 0-3 3v6.5a2 2 0 0 0 .59 1.41l8 8a2 2 0 0 0 2.82 0l6.5-6.5a2 2 0 0 0 0-2.82l-8-8A2 2 0 0 0 12.5 3Z" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </IconoBase>
  ),
  stock: (
    <IconoBase>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </IconoBase>
  ),
  clientes: (
    <IconoBase>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" />
      <path d="M16.5 5.2a3.2 3.2 0 0 1 0 6.2" />
      <path d="M20 20c0-2.8-1.8-5-4.3-5.8" />
    </IconoBase>
  ),
  ordenes: (
    <IconoBase>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6" />
    </IconoBase>
  ),
  canje: (
    <IconoBase>
      <path d="M17 3 21 7l-4 4" />
      <path d="M21 7H8a4 4 0 0 0-4 4" />
      <path d="M7 21 3 17l4-4" />
      <path d="M3 17h13a4 4 0 0 0 4-4" />
    </IconoBase>
  ),
  servicio: (
    <IconoBase>
      <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L14.7 6.3Z" />
    </IconoBase>
  ),
  compra: (
    <IconoBase>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M5 6l1 14h12l1-14" />
      <path d="M12 10v6M9.5 12.5h5" />
    </IconoBase>
  ),
  camara: (
    <IconoBase>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </IconoBase>
  ),
  inicio: (
    <IconoBase>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-6h4v6" />
    </IconoBase>
  ),
  estadisticas: (
    <IconoBase>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M2 20h20" />
    </IconoBase>
  ),
  configuracion: (
    <IconoBase>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M3 12h2.5M18.5 12H21M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </IconoBase>
  ),
  proveedores: (
    <IconoBase>
      <path d="M2 8h11v8H2Z" />
      <path d="M13 11h4l3 3v2h-7Z" />
      <circle cx="6.5" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </IconoBase>
  ),
  cobrar: (
    <IconoBase>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v6M18 9v6" />
    </IconoBase>
  ),
};
