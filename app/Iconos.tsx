export function IconoBase({ children, size = 24 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
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
  eliminacion: 'from-rose-500 to-rose-600',
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
  productos: (
    <IconoBase>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
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
  ahorro: (
    <IconoBase>
      <path d="M4 12c0-3.5 3.1-6 7-6 2.2 0 4.1.8 5.4 2H19l2 2-2 1.5v2L17 15l-1.5 2H10c-3.9 0-6-2.5-6-5Z" />
      <circle cx="15" cy="10.3" r="0.6" fill="currentColor" stroke="none" />
      <path d="M7 18v1.5M11 18v1.5" />
    </IconoBase>
  ),
  soporte: (
    <IconoBase>
      <path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.2-3.5A7.96 7.96 0 0 1 4 12Z" />
      <path d="M12 8.5a2 2 0 0 1 2 2c0 1.3-2 1.6-2 3" />
      <circle cx="12" cy="15.8" r="0.6" fill="currentColor" stroke="none" />
    </IconoBase>
  ),

  // ---- Set adicional: reemplazan emojis usados como íconos funcionales
  // (pestañas, métricas, estados, navegación) en Servicio Técnico, Plan
  // Canje y el selector de tema — mismo trazo/tamaño que los de arriba.
  herramienta: (
    <IconoBase>
      <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L14.7 6.3Z" />
    </IconoBase>
  ),
  lupa: (
    <IconoBase>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </IconoBase>
  ),
  reloj: (
    <IconoBase>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </IconoBase>
  ),
  campana: (
    <IconoBase>
      <path d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </IconoBase>
  ),
  chequeado: (
    <IconoBase>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5" />
    </IconoBase>
  ),
  ubicacion: (
    <IconoBase>
      <path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </IconoBase>
  ),
  local: (
    <IconoBase>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />
    </IconoBase>
  ),
  enviar: (
    <IconoBase>
      <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" />
      <path d="M12.5 13.5 21 3" />
    </IconoBase>
  ),
  cerrar: (
    <IconoBase>
      <path d="M6 6l12 12M18 6 6 18" />
    </IconoBase>
  ),
  sol: (
    <IconoBase>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </IconoBase>
  ),
  luna: (
    <IconoBase>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </IconoBase>
  ),
  diamante: (
    <IconoBase>
      <path d="M4 9 8 3h8l4 6-10 12L4 9Z" />
      <path d="M4 9h16M9.5 3 8 9l4 12 4-12-1.5-6" />
    </IconoBase>
  ),
  recibido: (
    <IconoBase>
      <path d="M3 12h5l2 3h4l2-3h5" />
      <path d="M6 12 6.5 6a1.5 1.5 0 0 1 1.5-1.4h8a1.5 1.5 0 0 1 1.5 1.4l.5 6" />
      <path d="M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
    </IconoBase>
  ),
  documento: (
    <IconoBase>
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </IconoBase>
  ),
  entregado: (
    <IconoBase>
      <path d="M3 9 12 4l9 5-9 5-9-5Z" />
      <path d="M6 11.5v5L12 20l6-3.5v-5" />
    </IconoBase>
  ),
  tablero: (
    <IconoBase>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16M6 9h.01M12 9h.01M6 13h.01M18 13h.01" />
    </IconoBase>
  ),
  repuesto: (
    <IconoBase>
      <path d="M14.7 3.3 12 6l-2.7-2.7a1 1 0 0 0-1.4 0L5.3 5.9a1 1 0 0 0 0 1.4L8 10l-6 6v2h2l6-6 2.7 2.7a1 1 0 0 0 1.4 0l2.6-2.6a1 1 0 0 0 0-1.4L14 8l2.7-2.7a1 1 0 0 0 0-1.4l-.6-.6a1 1 0 0 0-1.4 0Z" />
    </IconoBase>
  ),
  papelera: (
    <IconoBase>
      <path d="M4 7h16M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </IconoBase>
  ),
  check: (
    <IconoBase>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </IconoBase>
  ),
  editar: (
    <IconoBase>
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15v5Z" />
      <path d="M13.5 6.5l3 3" />
    </IconoBase>
  ),
  alerta: (
    <IconoBase>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </IconoBase>
  ),
  escudo: (
    <IconoBase>
      <path d="M12 3 20 6.2v5.3c0 5-3.4 8.3-8 9.5-4.6-1.2-8-4.5-8-9.5V6.2L12 3Z" />
      <path d="m8.7 12 2.3 2.3 4.3-4.6" />
    </IconoBase>
  ),
  duplicar: (
    <IconoBase>
      <rect x="8.5" y="8.5" width="12" height="12" rx="1.5" />
      <path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
    </IconoBase>
  ),
  deshacer: (
    <IconoBase>
      <path d="M7 8H4V5" />
      <path d="M4 8a8 8 0 1 1-1.7 5" />
    </IconoBase>
  ),
  telefono: (
    <IconoBase>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18h2" />
    </IconoBase>
  ),
  noAplica: (
    <IconoBase>
      <path d="M5 12h14" />
    </IconoBase>
  ),
  enlace: (
    <IconoBase>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 13 4.5a3.5 3.5 0 0 1 5 5l-2 2" />
      <path d="M13 17.5 11 19.5a3.5 3.5 0 0 1-5-5l2-2" />
    </IconoBase>
  ),
  descargar: (
    <IconoBase>
      <path d="M12 3.5v11.5" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 18v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V18" />
    </IconoBase>
  ),
};
