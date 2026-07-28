'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Etiqueta from './Etiqueta';
import { getLogo, setLogo as guardarLogo } from '../lib/logo';
import { crearClienteNavegador } from '../lib/supabase/client';

type ExtractedData = {
  modelo: string | null;
  capacidad_gb: number | null;
  imei: string | null;
  numero_serie: string | null;
  version_ios: string | null;
};

const STORAGE_OPTIONS = [64, 128, 256, 512];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function NuevaEtiqueta() {
  const supabase = crearClienteNavegador();
  const [step, setStep] = useState<'captura' | 'revision' | 'etiqueta'>('captura');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [bateria, setBateria] = useState('');
  const [almacenamiento, setAlmacenamiento] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<ExtractedData | null>(null);
  const [logo, setLogoState] = useState<string | null>(null);
  const etiquetaRef = useRef<HTMLDivElement>(null);
  const [descargando, setDescargando] = useState(false);
  const [agregarAlStock, setAgregarAlStock] = useState(false);
  const [color, setColor] = useState('');
  const [precio, setPrecio] = useState('');
  const [guardandoStock, setGuardandoStock] = useState(false);

  useEffect(() => {
    setLogoState(getLogo());
  }, []);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      guardarLogo(dataUrl);
      setLogoState(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  // En el celular (sobre todo iPhone), la descarga automática de un archivo
  // recién generado suele fallar en silencio. El menú nativo de "compartir"
  // (el mismo que se usa para mandar fotos) es mucho más confiable: desde
  // ahí se puede guardar en Fotos, mandar por WhatsApp o abrir con la app
  // de la impresora. Si el navegador no soporta compartir archivos (algunas
  // compus viejas), caemos a la descarga clásica como respaldo.
  const compartirOdescargar = async (blob: Blob, nombreArchivo: string, tipo: string) => {
    const file = new File([blob], nombreArchivo, { type: tipo });
    const puedeCompartir =
      typeof navigator !== 'undefined' &&
      'canShare' in navigator &&
      navigator.canShare({ files: [file] });

    if (puedeCompartir) {
      try {
        await navigator.share({ files: [file], title: 'Etiqueta' });
        return;
      } catch {
        // si cancela el share, no hacemos nada más
        return;
      }
    }

    // respaldo: descarga clásica
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = nombreArchivo;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const descargarPNG = async () => {
    if (!etiquetaRef.current) return;
    setDescargando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(etiquetaRef.current, { scale: 2 });
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        await compartirOdescargar(blob, `etiqueta-${datos?.imei || 'sin-imei'}.png`, 'image/png');
      }
    } finally {
      setDescargando(false);
    }
  };

  const descargarPDF = async () => {
    if (!etiquetaRef.current) return;
    setDescargando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(etiquetaRef.current, { scale: 2 });
      const img = canvas.toDataURL('image/png');
      // 5cm x 3cm en el PDF, tamaño real de impresión
      const pdf = new jsPDF({ unit: 'cm', format: [5, 3] });
      pdf.addImage(img, 'PNG', 0, 0, 5, 3);
      const blob = pdf.output('blob');
      await compartirOdescargar(blob, `etiqueta-${datos?.imei || 'sin-imei'}.pdf`, 'application/pdf');
    } finally {
      setDescargando(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const puedeContinuar = photoFile && bateria && almacenamiento;

  const handleContinuarAEtiqueta = async () => {
    if (agregarAlStock && datos) {
      setGuardandoStock(true);
      await supabase.from('dispositivos').insert({
        modelo: datos.modelo,
        capacidad_gb: datos.capacidad_gb,
        imei: datos.imei,
        numero_serie: datos.numero_serie,
        salud_bateria: bateria ? Number(bateria) : null,
        color: color.trim() || null,
        precio: precio ? Number(precio) : null,
        estado: 'usado',
        en_stock: true,
      });
      setGuardandoStock(false);
    }
    setStep('etiqueta');
  };

  const handleContinuar = async () => {
    if (!photoFile) return;
    setLoading(true);
    setError(null);
    try {
      const base64 = await fileToBase64(photoFile);
      const res = await fetch('/api/extract-device-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: photoFile.type,
        }),
      });
      if (!res.ok) throw new Error('fallo la extraccion');
      const { data } = await res.json();
      if (!data.capacidad_gb) data.capacidad_gb = almacenamiento;
      setDatos(data);
      setStep('revision');
    } catch (err) {
      setError('No pudimos leer la foto. Podés cargar los datos a mano.');
      setDatos({
        modelo: null,
        capacidad_gb: almacenamiento,
        imei: null,
        numero_serie: null,
        version_ios: null,
      });
      setStep('revision');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'revision' && datos) {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-5">
        <header className="flex items-center gap-3">
          <button onClick={() => setStep('captura')} className="text-2xl leading-none">
            &larr;
          </button>
          <span className="text-lg font-medium">Revisá los datos</span>
        </header>

        {error && (
          <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex flex-col gap-3">
          <Campo label="Modelo" valor={datos.modelo ?? ''} onChange={(v) => setDatos({ ...datos, modelo: v })} />
          <Campo
            label="Capacidad (GB)"
            valor={datos.capacidad_gb?.toString() ?? ''}
            onChange={(v) => setDatos({ ...datos, capacidad_gb: Number(v) || null })}
          />
          <Campo label="IMEI" valor={datos.imei ?? ''} onChange={(v) => setDatos({ ...datos, imei: v })} mono />
          <Campo
            label="N° de serie"
            valor={datos.numero_serie ?? ''}
            onChange={(v) => setDatos({ ...datos, numero_serie: v })}
            mono
          />
          <Campo label="Salud de batería (%)" valor={bateria} onChange={setBateria} />
        </div>

        <label className="flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agregarAlStock}
            onChange={(e) => setAgregarAlStock(e.target.checked)}
            className="h-5 w-5 accent-ink"
          />
          <span className="text-sm font-medium">Agregar este dispositivo al stock</span>
        </label>

        {agregarAlStock && (
          <div className="flex flex-col gap-3">
            <Campo label="Color" valor={color} onChange={setColor} />
            <Campo label="Precio" valor={precio} onChange={setPrecio} />
          </div>
        )}

        <button
          disabled={guardandoStock}
          onClick={handleContinuarAEtiqueta}
          className="mt-auto w-full rounded-2xl bg-accent hover:bg-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {guardandoStock ? 'Guardando en stock...' : 'Continuar al diseño de la etiqueta'}
        </button>
      </main>
    );
  }

  if (step === 'etiqueta' && datos) {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-5 items-center">
        <header className="w-full flex items-center gap-3">
          <button onClick={() => setStep('revision')} className="text-2xl leading-none">
            &larr;
          </button>
          <span className="text-lg font-medium">Tu etiqueta</span>
        </header>

        <div style={{ transform: 'scale(0.5)', transformOrigin: 'top center', height: '177px' }}>
          <Etiqueta
            ref={etiquetaRef}
            logo={logo}
            modelo={datos.modelo}
            capacidadGb={datos.capacidad_gb}
            imei={datos.imei}
            bateria={bateria}
          />
        </div>

        {!logo && (
          <label className="text-sm text-accent underline cursor-pointer -mt-6">
            Subir el logo de tu negocio
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          </label>
        )}

        <div className="w-full flex flex-col gap-3 mt-auto">
          <button
            onClick={descargarPNG}
            disabled={descargando}
            className="w-full rounded-2xl bg-accent hover:bg-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
          >
            Guardar / compartir PNG
          </button>
          <button
            onClick={descargarPDF}
            disabled={descargando}
            className="w-full rounded-2xl border border-border py-4 text-center text-base font-medium"
          >
            Guardar / compartir PDF
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Nueva etiqueta</span>
      </header>

      <label className="flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3 cursor-pointer">
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${photoPreview ? 'bg-good/15' : 'bg-black/5'}`}>
          {photoPreview ? '✓' : '📷'}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Info del dispositivo</p>
          <p className="text-xs text-muted">{photoPreview ? 'foto cargada' : 'tocá para sacar foto'}</p>
        </div>
      </label>

      <div>
        <label className="text-xs text-muted block mb-1">Salud de batería (%)</label>
        <input
          type="number"
          inputMode="numeric"
          value={bateria}
          onChange={(e) => setBateria(e.target.value)}
          placeholder="92"
          className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">Almacenamiento</label>
        <div className="flex gap-2">
          {STORAGE_OPTIONS.map((gb) => (
            <button
              key={gb}
              onClick={() => setAlmacenamiento(gb)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                almacenamiento === gb ? 'bg-accent text-white' : 'bg-white border border-border text-ink'
              }`}
            >
              {gb} GB
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={!puedeContinuar || loading}
        onClick={handleContinuar}
        className="mt-auto w-full rounded-2xl bg-accent hover:bg-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {loading ? 'Leyendo la foto...' : 'Continuar'}
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
  mono,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-white border border-border rounded-xl px-4 py-3 text-sm ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
