import { forwardRef } from 'react';

export type FormatoEtiqueta = 'estandar' | 'termica';

// Tamaños físicos a 300dpi (~118.1 px/cm) para impresión nítida.
// - estandar: 5 x 3 cm, impresoras comunes / hoja A4, diseño a color.
// - termica: 58 mm de ancho (impresoras térmicas de ticket), alto alto y contrast
//   te en blanco y negro puro (el cabezal térmico es monocromático 1-bit: los
//   fondos de color salen como manchas, por eso va todo negro sobre blanco).
export const TAMANOS: Record<
  FormatoEtiqueta,
  { wPx: number; hPx: number; wCm: number; hCm: number; label: string; ayuda: string }
> = {
  estandar: {
    wPx: 591,
    hPx: 354,
    wCm: 5,
    hCm: 3,
    label: 'Estándar 5 × 3 cm',
    ayuda: 'Para impresoras comunes o etiquetas en hoja.',
  },
  termica: {
    wPx: 685,
    hPx: 472,
    wCm: 5.8,
    hCm: 4,
    label: 'Térmica 58 mm',
    ayuda: 'Para impresoras térmicas de ticket (rollo de 58 mm).',
  },
};

type Props = {
  logo: string | null;
  modelo: string | null;
  capacidadGb: number | null;
  imei: string | null;
  bateria: string;
  formato?: FormatoEtiqueta;
};

function bateriaColor(bateria: string) {
  const n = Number(bateria);
  if (!n) return { bg: '#EAF3DE', text: '#173404' };
  if (n >= 80) return { bg: '#EAF3DE', text: '#173404' };
  if (n >= 50) return { bg: '#FAEEDA', text: '#412402' };
  return { bg: '#FAECE7', text: '#4A1B0C' };
}

const Etiqueta = forwardRef<HTMLDivElement, Props>(function Etiqueta(
  { logo, modelo, capacidadGb, imei, bateria, formato = 'estandar' },
  ref
) {
  const t = TAMANOS[formato];

  if (formato === 'termica') {
    // Blanco y negro puro, texto grande y centrado, sin fondos de color.
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

        <div style={{ width: '100%' }}>
          <p
            style={{
              fontSize: '40px',
              fontWeight: 700,
              margin: 0,
              lineHeight: 1.15,
              wordBreak: 'break-word',
            }}
          >
            {modelo || 'Modelo'}
          </p>
          <p style={{ fontSize: '26px', fontWeight: 700, margin: '8px 0 0' }}>
            {capacidadGb ? `${capacidadGb} GB` : ''}
            {capacidadGb && bateria ? '   ·   ' : ''}
            {bateria ? `Batería ${bateria}%` : ''}
          </p>
        </div>

        <div style={{ width: '100%', borderTop: '3px solid #000000', paddingTop: '12px' }}>
          <p style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px', letterSpacing: '0.04em' }}>
            IMEI / N&deg; DE SERIE
          </p>
          <p style={{ fontSize: '30px', fontWeight: 700, margin: 0, fontFamily: 'monospace', letterSpacing: '0.02em' }}>
            {imei || '--'}
          </p>
        </div>
      </div>
    );
  }

  // Formato estándar (a color).
  const colores = bateriaColor(bateria);

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
            background: colores.bg,
            color: colores.text,
            fontSize: '15px',
            fontWeight: 500,
            padding: '4px 14px',
            borderRadius: '20px',
            whiteSpace: 'nowrap',
          }}
        >
          {bateria || '--'}%
        </div>
      </div>

      <div>
        <p style={{ fontSize: '30px', fontWeight: 600, margin: 0, lineHeight: 1.15, wordBreak: 'break-word' }}>
          {modelo || 'Modelo'}
        </p>
        <p style={{ fontSize: '18px', color: '#5F5E5A', margin: '4px 0 0' }}>{capacidadGb ? `${capacidadGb} GB` : ''}</p>
      </div>

      <div style={{ borderTop: '1px solid #E5E3DB', paddingTop: '10px' }}>
        <p style={{ fontSize: '11px', color: '#8A8780', margin: '0 0 2px', letterSpacing: '0.02em' }}>
          IMEI / N&deg; de serie
        </p>
        <p style={{ fontSize: '16px', margin: 0, fontFamily: 'monospace' }}>{imei || '--'}</p>
      </div>
    </div>
  );
});

export default Etiqueta;
