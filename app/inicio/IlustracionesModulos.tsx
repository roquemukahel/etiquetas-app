// Miniilustraciones propias de Qovento para los "Accesos rápidos".
// Todas comparten el mismo lenguaje visual: lienzo 96×96, objetos blancos con
// volumen suave (una cara clara sobre una base azul más oscura = efecto 2.5D),
// azul de marca como color dominante y un único acento de color según el
// módulo. Sin dependencias externas, sin emojis. Son decorativas: el wrapper
// las marca aria-hidden y el nombre accesible lo pone la tarjeta.
//
// Paleta compartida (funciona sobre tarjeta clara y oscura porque cada
// ilustración es un "objeto" luminoso con su propia sombra de apoyo):
const AZUL = '#3A63E0'; // azul de marca (cara principal)
const AZUL_OSC = '#2A49B4'; // base / volumen
const AZUL_CLARO = '#9DB4F4'; // detalles secundarios
const CIELO = '#EAF0FE'; // pantallas / papel
const BLANCO = '#FFFFFF';
const LINEA = '#C9D6F7'; // contorno muy suave sobre blanco

type Props = { className?: string };

// Sombra de apoyo común: da el "posado" 2.5D sin recargar.
function Piso() {
  return <ellipse cx="48" cy="85" rx="29" ry="4.6" fill={AZUL} opacity="0.12" />;
}

function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

// Órdenes: comprobante saliendo de un dispositivo compacto.
function Ordenes({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      {/* comprobante */}
      <path d="M35 44V17a2 2 0 0 1 2-2h22a2 2 0 0 1 2 2v27l-4-2.6-4 2.6-4-2.6-4 2.6-4-2.6-4 2.6Z" fill={BLANCO} stroke={LINEA} strokeWidth="1.6" />
      <rect x="40" y="21" width="16" height="3.4" rx="1.7" fill={AZUL} />
      <rect x="40" y="27.5" width="16" height="2.8" rx="1.4" fill={AZUL_CLARO} />
      <rect x="40" y="33" width="11" height="2.8" rx="1.4" fill={AZUL_CLARO} />
      {/* dispositivo */}
      <rect x="30" y="44" width="37" height="38" rx="7" fill={AZUL_OSC} />
      <rect x="28" y="42" width="37" height="38" rx="7" fill={AZUL} />
      <rect x="33" y="47" width="27" height="15" rx="3" fill={CIELO} />
      <rect x="33" y="66" width="27" height="4" rx="2" fill={AZUL_CLARO} />
      <rect x="33" y="72.5" width="18" height="4" rx="2" fill={AZUL_CLARO} />
      {/* acento: check verde */}
      <circle cx="62" cy="69" r="8.5" fill="#16A34A" />
      <path d="M58.3 69.2l2.6 2.6 4.8-5" stroke={BLANCO} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Compra de dispositivos: una mano recibiendo un teléfono + indicación de pago.
function Compra({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      {/* teléfono */}
      <rect x="35" y="14" width="26" height="42" rx="6" fill={AZUL_OSC} />
      <rect x="33" y="12" width="26" height="42" rx="6" fill={AZUL} />
      <rect x="37" y="17" width="18" height="28" rx="3" fill={CIELO} />
      <circle cx="46" cy="49.5" r="2" fill={AZUL_CLARO} />
      {/* mano / palma */}
      <path d="M20 58c0-2 2-3 3.6-2.3l14 5.2c1.4-3 5-2.4 6.8-1.6l16 6.4c2.5 1 3.6 2.6 3.6 5.2V80H26c-3.5 0-6-2.6-6-6Z" fill={BLANCO} stroke={LINEA} strokeWidth="1.6" />
      <path d="M37.6 60.9c2-1 4-1 6 0" stroke={AZUL_CLARO} strokeWidth="1.6" strokeLinecap="round" />
      {/* acento: moneda $ */}
      <circle cx="64" cy="30" r="10" fill="#E8890C" />
      <path d="M64 24.5v11M61 27.2c0-1.4 1.3-2.2 3-2.2s3 .8 3 2.1-1 1.9-3 2.3-3 1-3 2.3 1.3 2.1 3 2.1 3-.8 3-2.1" stroke={BLANCO} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Proveedores: caja abierta con teléfonos adentro.
function Proveedores({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      {/* teléfonos que asoman */}
      <rect x="35" y="26" width="12" height="30" rx="2.5" fill={AZUL} />
      <rect x="37" y="29" width="8" height="18" rx="1.5" fill={CIELO} />
      <rect x="49" y="22" width="12" height="34" rx="2.5" fill={AZUL_OSC} />
      <rect x="51" y="25" width="8" height="20" rx="1.5" fill={AZUL_CLARO} />
      {/* solapas de la caja */}
      <path d="M24 46l14-6 3 6-14 6Z" fill={AZUL_CLARO} />
      <path d="M72 46l-14-6-3 6 14 6Z" fill={AZUL_CLARO} />
      {/* cuerpo de la caja */}
      <path d="M25 50h46l-4 26a3 3 0 0 1-3 2.6H32a3 3 0 0 1-3-2.6Z" fill={AZUL_OSC} />
      <path d="M25 50h46l-2 12H27Z" fill={AZUL} />
      <rect x="42" y="55" width="12" height="4" rx="2" fill={CIELO} opacity=".8" />
    </Svg>
  );
}

// Stock: varios teléfonos organizados y etiquetados.
function Stock({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${18 + i * 21} ${20 + (i === 1 ? -2 : 0)})`}>
          <rect x="2" y="2" width="18" height="52" rx="5" fill={AZUL_OSC} />
          <rect x="0" y="0" width="18" height="52" rx="5" fill={i === 1 ? AZUL : BLANCO} stroke={i === 1 ? 'none' : LINEA} strokeWidth="1.4" />
          <rect x="3.5" y="4" width="11" height="30" rx="2" fill={CIELO} />
          <rect x="4" y="47.5" width="10" height="2.6" rx="1.3" fill={AZUL_CLARO} />
        </g>
      ))}
      {/* etiqueta / tag */}
      <g transform="translate(56 50) rotate(12)">
        <path d="M0 3a3 3 0 0 1 3-3h9l7 7-7 7H3a3 3 0 0 1-3-3Z" fill="#16A34A" />
        <circle cx="5.5" cy="7" r="1.7" fill={BLANCO} />
      </g>
    </Svg>
  );
}

// Clientes: ficha de cliente con avatar e historial.
function Clientes({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      <rect x="20" y="22" width="56" height="40" rx="7" fill={AZUL_OSC} />
      <rect x="18" y="20" width="56" height="40" rx="7" fill={BLANCO} stroke={LINEA} strokeWidth="1.6" />
      {/* avatar */}
      <circle cx="33" cy="35" r="9" fill={AZUL} />
      <circle cx="33" cy="32.5" r="3.4" fill={BLANCO} />
      <path d="M27.5 42c0-3 2.4-4.6 5.5-4.6s5.5 1.6 5.5 4.6" fill={BLANCO} />
      {/* datos */}
      <rect x="47" y="29" width="20" height="3.4" rx="1.7" fill={AZUL} />
      <rect x="47" y="36" width="15" height="2.8" rx="1.4" fill={AZUL_CLARO} />
      {/* historial */}
      <circle cx="27" cy="52" r="2" fill="#16A34A" />
      <rect x="32" y="50.6" width="16" height="2.8" rx="1.4" fill={AZUL_CLARO} />
      <circle cx="53" cy="52" r="2" fill={AZUL_CLARO} />
      <rect x="58" y="50.6" width="9" height="2.8" rx="1.4" fill={AZUL_CLARO} />
    </Svg>
  );
}

// Cuentas por cobrar: billetera/comprobante + calendario.
function Cobrar({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      {/* billetera */}
      <path d="M22 40v26a4 4 0 0 0 4 4h34a3 3 0 0 0 3-3V45a3 3 0 0 0-3-3H26a4 4 0 0 1-4-4Z" fill={AZUL_OSC} />
      <path d="M22 38a4 4 0 0 1 4-4h30a3 3 0 0 1 3 3v8H26a4 4 0 0 1-4-4Z" fill={AZUL} />
      <path d="M63 52v10h-11a5 5 0 0 1 0-10Z" fill={BLANCO} />
      <circle cx="54" cy="57" r="2.4" fill={AZUL} />
      {/* calendario (acento naranja) */}
      <rect x="47" y="16" width="30" height="26" rx="4" fill={BLANCO} stroke={LINEA} strokeWidth="1.6" />
      <path d="M47 22a4 4 0 0 1 4-4h22a4 4 0 0 1 4 4v3H47Z" fill="#E8890C" />
      <rect x="53" y="14" width="3" height="7" rx="1.5" fill={AZUL_OSC} />
      <rect x="68" y="14" width="3" height="7" rx="1.5" fill={AZUL_OSC} />
      <g fill={AZUL_CLARO}>
        <rect x="51" y="29" width="4" height="4" rx="1" />
        <rect x="58" y="29" width="4" height="4" rx="1" />
        <rect x="65" y="29" width="4" height="4" rx="1" fill="#E8890C" />
        <rect x="51" y="35" width="4" height="4" rx="1" />
        <rect x="58" y="35" width="4" height="4" rx="1" />
      </g>
    </Svg>
  );
}

// Plan Canje: dos teléfonos intercambiándose con flechas.
function Canje({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      <g transform="rotate(-8 32 44)">
        <rect x="18" y="20" width="22" height="42" rx="6" fill={AZUL_OSC} />
        <rect x="16" y="18" width="22" height="42" rx="6" fill={AZUL} />
        <rect x="20" y="23" width="14" height="26" rx="2.5" fill={CIELO} />
      </g>
      <g transform="rotate(8 64 44)">
        <rect x="58" y="22" width="22" height="42" rx="6" fill={AZUL_OSC} />
        <rect x="56" y="20" width="22" height="42" rx="6" fill={BLANCO} stroke={LINEA} strokeWidth="1.5" />
        <rect x="60" y="25" width="14" height="26" rx="2.5" fill={CIELO} />
      </g>
      {/* flechas de intercambio (acento) */}
      <path d="M40 38h14l-3-3M40 38l3 3" stroke="#16A34A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M56 50H42l3 3M56 50l-3-3" stroke="#7C3AED" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// Servicio Técnico: teléfono abierto + herramienta + engranaje.
function Servicio({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      {/* teléfono */}
      <rect x="27" y="18" width="34" height="48" rx="7" fill={AZUL_OSC} />
      <rect x="25" y="16" width="34" height="48" rx="7" fill={AZUL} />
      <rect x="29.5" y="21" width="25" height="30" rx="3" fill={CIELO} />
      {/* placa / detalle interno */}
      <path d="M33 26h18M33 31h13M33 36h16M33 41h11" stroke={AZUL_CLARO} strokeWidth="1.6" strokeLinecap="round" />
      {/* destornillador */}
      <g transform="rotate(38 60 58)">
        <rect x="57" y="30" width="6" height="24" rx="2" fill={BLANCO} stroke={LINEA} strokeWidth="1.3" />
        <rect x="58.5" y="52" width="3" height="12" rx="1.5" fill={AZUL_CLARO} />
      </g>
      {/* engranaje (acento naranja) */}
      <g transform="translate(60 58)">
        <path d="M0-9 1.8-7.6 4-8.2 4.6-6 6.8-5.4 6.4-3.1 8-1.6 6.8 0 8 1.6 6.4 3.1 6.8 5.4 4.6 6 4 8.2 1.8 7.6 0 9-1.8 7.6-4 8.2-4.6 6-6.8 5.4-6.4 3.1-8 1.6-6.8 0-8-1.6-6.4-3.1-6.8-5.4-4.6-6-4-8.2-1.8-7.6Z" fill="#E8890C" />
        <circle cx="0" cy="0" r="3.4" fill={BLANCO} />
      </g>
    </Svg>
  );
}

// Nueva etiqueta: etiqueta térmica saliendo de una impresora.
function Etiqueta({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      {/* etiqueta que sale */}
      <rect x="30" y="12" width="36" height="30" rx="3" fill={BLANCO} stroke={LINEA} strokeWidth="1.6" />
      <rect x="35" y="17" width="20" height="3.2" rx="1.6" fill={AZUL} />
      <g fill={AZUL_OSC}>
        <rect x="35" y="24" width="2" height="12" /><rect x="38.5" y="24" width="1.4" height="12" />
        <rect x="41.5" y="24" width="2.6" height="12" /><rect x="45.5" y="24" width="1.4" height="12" />
        <rect x="48.5" y="24" width="2" height="12" /><rect x="52" y="24" width="2.6" height="12" />
        <rect x="56" y="24" width="1.4" height="12" /><rect x="59" y="24" width="2" height="12" />
      </g>
      {/* impresora */}
      <rect x="22" y="44" width="52" height="14" rx="4" fill={AZUL} />
      <rect x="22" y="52" width="52" height="20" rx="4" fill={AZUL_OSC} />
      <rect x="28" y="44" width="40" height="6" rx="2" fill={BLANCO} />
      <circle cx="66" cy="63" r="2.6" fill="#16A34A" />
      <rect x="28" y="60" width="20" height="3" rx="1.5" fill={AZUL_CLARO} />
    </Svg>
  );
}

// Agregar al stock: cámara/escáner leyendo el IMEI / código.
function Camara({ className }: Props) {
  return (
    <Svg className={className}>
      <Piso />
      {/* código de barras al fondo */}
      <rect x="30" y="30" width="36" height="26" rx="3" fill={BLANCO} stroke={LINEA} strokeWidth="1.5" />
      <g fill={AZUL_OSC}>
        <rect x="34" y="35" width="2" height="16" /><rect x="37.5" y="35" width="1.4" height="16" />
        <rect x="40.5" y="35" width="2.6" height="16" /><rect x="44.5" y="35" width="1.4" height="16" />
        <rect x="47.5" y="35" width="2" height="16" /><rect x="51" y="35" width="2.6" height="16" />
        <rect x="55" y="35" width="1.4" height="16" /><rect x="58" y="35" width="2.4" height="16" />
      </g>
      {/* marco del escáner */}
      <g stroke={AZUL} strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M24 34v-6a4 4 0 0 1 4-4h6" />
        <path d="M62 24h6a4 4 0 0 1 4 4v6" />
        <path d="M72 52v6a4 4 0 0 1-4 4h-6" />
        <path d="M34 62h-6a4 4 0 0 1-4-4v-6" />
      </g>
      {/* línea de escaneo (acento) */}
      <rect x="26" y="42" width="44" height="3" rx="1.5" fill="#DC2626" opacity="0.9" />
    </Svg>
  );
}

const MAPA: Record<string, (p: Props) => React.ReactElement> = {
  ordenes: Ordenes,
  compra: Compra,
  proveedores: Proveedores,
  stock: Stock,
  clientes: Clientes,
  cobrar: Cobrar,
  canje: Canje,
  servicio: Servicio,
  etiqueta: Etiqueta,
  camara: Camara,
};

export default function IlustracionModulo({ nombre, className }: { nombre: string; className?: string }) {
  const Comp = MAPA[nombre] ?? Stock;
  return <Comp className={className} />;
}
