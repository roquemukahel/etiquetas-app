import { forwardRef } from 'react';

type Props = {
  logo: string | null;
  modelo: string | null;
  identificador: string;
  detalle: string | null;
};

// Mismo tamaño físico que la etiqueta de stock (5cm x 3cm a 300dpi),
// para que se pueda imprimir con la misma impresora/config.
const EtiquetaServicio = forwardRef<HTMLDivElement, Props>(function EtiquetaServicio(
  { logo, modelo, identificador, detalle },
  ref
) {
  return (
    <div
      ref={ref}
      style={{
        width: '591px',
        height: '354px',
        background: '#ffffff',
        borderRadius: '16px',
        padding: '28px 32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        fontFamily: 'Inter, sans-serif',
        color: '#1C1B19',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ height: '52px', display: 'flex', alignItems: 'center' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="logo" style={{ height: '52px', maxWidth: '220px', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: '13px', color: '#8A8780' }}>tu logo</span>
          )}
        </div>
        <div
          style={{
            background: '#FAECE7',
            color: '#4A1B0C',
            fontSize: '14px',
            fontWeight: 600,
            padding: '4px 14px',
            borderRadius: '20px',
            letterSpacing: '0.02em',
          }}
        >
          SERVICIO TÉCNICO
        </div>
      </div>

      <div>
        <p style={{ fontSize: '28px', fontWeight: 500, margin: 0, lineHeight: 1.2 }}>{modelo || 'Modelo'}</p>
        <p style={{ fontSize: '16px', color: '#5F5E5A', margin: '4px 0 0', fontFamily: 'monospace' }}>{identificador}</p>
      </div>

      <div style={{ borderTop: '1px solid #E5E3DB', paddingTop: '10px' }}>
        <p style={{ fontSize: '11px', color: '#8A8780', margin: '0 0 2px', letterSpacing: '0.02em' }}>Detalle</p>
        <p
          style={{
            fontSize: '15px',
            margin: 0,
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {detalle || 'Sin detalle registrado'}
        </p>
      </div>
    </div>
  );
});

export default EtiquetaServicio;
