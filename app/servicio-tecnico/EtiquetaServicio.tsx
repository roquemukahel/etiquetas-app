import { forwardRef } from 'react';
import { TAMANOS, type FormatoEtiqueta } from '../nueva-etiqueta/Etiqueta';

type Props = {
  logo: string | null;
  modelo: string | null;
  identificador: string;
  detalle: string | null;
  formato?: FormatoEtiqueta;
};

const EtiquetaServicio = forwardRef<HTMLDivElement, Props>(function EtiquetaServicio(
  { logo, modelo, identificador, detalle, formato = 'estandar' },
  ref
) {
  const t = TAMANOS[formato];

  if (formato === 'termica') {
    // Blanco y negro puro, texto grande y centrado, para térmica 58 mm.
    return (
      <div
        ref={ref}
        style={{
          width: `${t.wPx}px`,
          height: `${t.hPx}px`,
          background: '#ffffff',
          padding: '34px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          fontFamily: 'Arial, Helvetica, sans-serif',
          color: '#000000',
          textAlign: 'center',
        }}
      >
        <div style={{ height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="logo" style={{ height: '96px', maxWidth: '520px', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: '20px', color: '#000000' }}>tu logo</span>
          )}
        </div>

        <p style={{ fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '0.06em' }}>SERVICIO TÉCNICO</p>

        <div style={{ width: '100%' }}>
          <p style={{ fontSize: '38px', fontWeight: 700, margin: 0, lineHeight: 1.15, wordBreak: 'break-word' }}>
            {modelo || 'Modelo'}
          </p>
          <p
            style={{
              fontSize: '24px',
              fontWeight: 700,
              margin: '6px 0 0',
              fontFamily: 'monospace',
              wordBreak: 'break-word',
            }}
          >
            {identificador}
          </p>
        </div>

        <div style={{ width: '100%', borderTop: '3px solid #000000', paddingTop: '10px' }}>
          <p
            style={{
              fontSize: '20px',
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.25,
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
  }

  // Formato estándar (a color).
  return (
    <div
      ref={ref}
      style={{
        width: `${t.wPx}px`,
        height: `${t.hPx}px`,
        background: '#ffffff',
        borderRadius: '16px',
        padding: '26px 32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#1C1B19',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ height: '84px', display: 'flex', alignItems: 'center' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="logo" style={{ height: '84px', maxWidth: '320px', objectFit: 'contain' }} />
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
            whiteSpace: 'nowrap',
          }}
        >
          SERVICIO TÉCNICO
        </div>
      </div>

      <div>
        <p style={{ fontSize: '28px', fontWeight: 600, margin: 0, lineHeight: 1.15, wordBreak: 'break-word' }}>
          {modelo || 'Modelo'}
        </p>
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
