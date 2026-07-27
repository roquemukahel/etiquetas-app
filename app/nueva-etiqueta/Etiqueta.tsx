import { forwardRef } from 'react';

type Props = {
  logo: string | null;
  modelo: string | null;
  capacidadGb: number | null;
  imei: string | null;
  bateria: string;
};

function bateriaColor(bateria: string) {
  const n = Number(bateria);
  if (!n) return { bg: '#EAF3DE', text: '#173404' };
  if (n >= 80) return { bg: '#EAF3DE', text: '#173404' };
  if (n >= 50) return { bg: '#FAEEDA', text: '#412402' };
  return { bg: '#FAECE7', text: '#4A1B0C' };
}

// Tamaño físico: 5cm x 3cm, a 300dpi (~591 x 354 px) para que se imprima nítido
const Etiqueta = forwardRef<HTMLDivElement, Props>(function Etiqueta(
  { logo, modelo, capacidadGb, imei, bateria },
  ref
) {
  const colores = bateriaColor(bateria);

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
        <div style={{ height: '32px', display: 'flex', alignItems: 'center' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="logo" style={{ height: '32px', maxWidth: '140px', objectFit: 'contain' }} />
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
          }}
        >
          {bateria || '--'}%
        </div>
      </div>

      <div>
        <p style={{ fontSize: '30px', fontWeight: 500, margin: 0, lineHeight: 1.2 }}>{modelo || 'Modelo'}</p>
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
