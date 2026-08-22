'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Etiqueta, { TAMANOS, type FormatoEtiqueta } from './Etiqueta';
import { crearClienteNavegador } from '../lib/supabase/client';
import { asegurarModelo, normalizarNombreModelo } from '../lib/modelos';
import { limpiarImei } from '../lib/imei';
import { getActor, MENSAJE_ACTOR_REQUERIDO } from '../lib/actor';
import SelectorColorAuto from '../SelectorColorAuto';
import { useT } from '../lib/idioma';
import { useSucursalActual } from '../lib/sucursal';

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
  const t = useT();
  const sucursalActual = useSucursalActual();
  const supabase = crearClienteNavegador();
  const [step, setStep] = useState<'captura' | 'revision' | 'etiqueta'>('captura');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [bateria, setBateria] = useState('');
  const [imeiManual, setImeiManual] = useState('');
  const [almacenamiento, setAlmacenamiento] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<ExtractedData | null>(null);
  const [logo, setLogoState] = useState<string | null>(null);
  const etiquetaRef = useRef<HTMLDivElement>(null);
  const [descargando, setDescargando] = useState(false);
  const [formato, setFormato] = useState<FormatoEtiqueta>('estandar');
  const [agregarAlStock, setAgregarAlStock] = useState(false);
  const [color, setColor] = useState('');
  const [precio, setPrecio] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [guardandoStock, setGuardandoStock] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( logo_url )')
        .eq('id', user.id)
        .single();
      setLogoState((perfil as any)?.negocios?.logo_url ?? null);
    })();
  }, []);

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
        await navigator.share({ files: [file], title: t('Etiqueta') });
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

  // La captura se hace desde una copia a tamaño real (591px / 685px) posicionada
  // fuera de pantalla, NUNCA desde la vista previa reducida. html2canvas rinde mal
  // el texto (letras encimadas) cuando el elemento capturado está dentro de un
  // `transform: scale(...)`, por eso el ref vive en un div sin transformar.
  const capturarLienzo = async () => {
    if (!etiquetaRef.current) return null;
    const html2canvas = (await import('html2canvas')).default;
    // Esperar a que las fuentes estén listas evita que html2canvas mida el ancho
    // de las letras con una tipografía distinta y las superponga.
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await (document as any).fonts.ready;
      } catch {
        /* sin soporte de Font Loading API: seguimos igual */
      }
    }
    return html2canvas(etiquetaRef.current, { scale: 3, backgroundColor: '#ffffff' });
  };

  const descargarPNG = async () => {
    if (!etiquetaRef.current) return;
    setDescargando(true);
    try {
      const canvas = await capturarLienzo();
      if (!canvas) return;
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
      const { jsPDF } = await import('jspdf');
      const canvas = await capturarLienzo();
      if (!canvas) return;
      const img = canvas.toDataURL('image/png');
      // Tamaño físico real según el formato elegido (sin escalar en el PDF, para
      // que la impresora imprima 1:1 y no deforme el texto).
      const { wCm, hCm } = TAMANOS[formato];
      const pdf = new jsPDF({ unit: 'cm', format: [wCm, hCm], orientation: wCm >= hCm ? 'landscape' : 'portrait' });
      pdf.addImage(img, 'PNG', 0, 0, wCm, hCm);
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

  const puedeContinuar = (photoFile || imeiManual.trim()) && bateria && almacenamiento;

  const handleContinuarAEtiqueta = async () => {
    if (agregarAlStock && datos) {
      const actor = getActor();
      if (!actor) {
        setError(t(MENSAJE_ACTOR_REQUERIDO));
        return;
      }
      setGuardandoStock(true);
      const modeloNormalizado = datos.modelo ? normalizarNombreModelo(datos.modelo.trim()) : datos.modelo;
      await supabase.from('dispositivos').insert({
        modelo: modeloNormalizado,
        capacidad_gb: datos.capacidad_gb,
        imei: limpiarImei(datos.imei),
        numero_serie: datos.numero_serie,
        salud_bateria: bateria ? Number(bateria) : null,
        color: color.trim() || null,
        precio: precio ? Number(precio) : null,
        proveedor: proveedor.trim() || null,
        estado: 'usado',
        en_stock: true,
        agregado_por_nombre: actor?.nombre ?? null,
        agregado_por_foto_url: actor?.fotoUrl ?? null,
        ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
      });
      await asegurarModelo(supabase, modeloNormalizado);
      setGuardandoStock(false);
    }
    setStep('etiqueta');
  };

  const handleContinuar = async () => {
    if (!photoFile) {
      setDatos({
        modelo: null,
        capacidad_gb: almacenamiento,
        imei: limpiarImei(imeiManual),
        numero_serie: null,
        version_ios: null,
      });
      setStep('revision');
      return;
    }
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
      setError(t('No pudimos leer la foto. Podés cargar los datos a mano.'));
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
          <span className="text-lg font-medium">{t('Revisá los datos')}</span>
        </header>

        {error && (
          <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex flex-col gap-3">
          <Campo label={t('Modelo')} valor={datos.modelo ?? ''} onChange={(v) => setDatos({ ...datos, modelo: v })} />
          <Campo
            label={t('Capacidad (GB)')}
            valor={datos.capacidad_gb?.toString() ?? ''}
            onChange={(v) => setDatos({ ...datos, capacidad_gb: Number(v) || null })}
          />
          <Campo label="IMEI" valor={datos.imei ?? ''} onChange={(v) => setDatos({ ...datos, imei: v })} mono />
          <Campo
            label={t('N° de serie')}
            valor={datos.numero_serie ?? ''}
            onChange={(v) => setDatos({ ...datos, numero_serie: v })}
            mono
          />
          <Campo label={t('Salud de batería (%)')} valor={bateria} onChange={setBateria} />
        </div>

        <label className="flex items-center gap-3 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agregarAlStock}
            onChange={(e) => setAgregarAlStock(e.target.checked)}
            className="h-5 w-5 accent-ink"
          />
          <span className="text-sm font-medium">{t('Agregar este dispositivo al stock')}</span>
        </label>

        {agregarAlStock && (
          <div className="flex flex-col gap-3">
            <SelectorColorAuto label={t('Color')} modelo={datos.modelo} value={color} onChange={setColor} />
            <Campo label={t('Precio')} valor={precio} onChange={setPrecio} />
            <Campo label={t('Proveedor (opcional)')} valor={proveedor} onChange={setProveedor} />
          </div>
        )}

        <button
          disabled={guardandoStock}
          onClick={handleContinuarAEtiqueta}
          className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
        >
          {guardandoStock ? t('Guardando en stock...') : t('Continuar al diseño de la etiqueta')}
        </button>
      </main>
    );
  }

  if (step === 'etiqueta' && datos) {
    const tam = TAMANOS[formato];
    const previewScale = 288 / tam.wPx;
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-5 items-center">
        <header className="w-full flex items-center gap-3">
          <button onClick={() => setStep('revision')} className="text-2xl leading-none">
            &larr;
          </button>
          <span className="text-lg font-medium">{t('Tu etiqueta')}</span>
        </header>

        <div className="w-full">
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Tamaño de la etiqueta')}</label>
          <div className="flex gap-2">
            {(Object.keys(TAMANOS) as FormatoEtiqueta[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormato(f)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  formato === f
                    ? 'bg-accent dark:bg-dark-accent text-white'
                    : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {t(TAMANOS[f].label)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted dark:text-dark-text-secondary mt-1">{t(tam.ayuda)}</p>
        </div>

        {/* Vista previa reducida (solo para mostrar; NO se captura desde acá) */}
        <div
          style={{
            width: `${tam.wPx * previewScale}px`,
            height: `${tam.hPx * previewScale}px`,
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
            borderRadius: formato === 'estandar' ? '8px' : '2px',
            overflow: 'hidden',
          }}
        >
          <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: `${tam.wPx}px`, height: `${tam.hPx}px` }}>
            <Etiqueta
              logo={logo}
              modelo={datos.modelo}
              capacidadGb={datos.capacidad_gb}
              imei={datos.imei}
              bateria={bateria}
              formato={formato}
            />
          </div>
        </div>

        {/* Copia a tamaño real fuera de pantalla: esta es la que captura html2canvas */}
        <div aria-hidden style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }}>
          <Etiqueta
            ref={etiquetaRef}
            logo={logo}
            modelo={datos.modelo}
            capacidadGb={datos.capacidad_gb}
            imei={datos.imei}
            bateria={bateria}
            formato={formato}
          />
        </div>

        {!logo && (
          <Link href="/configuracion/negocio" className="text-sm text-accent dark:text-dark-accent underline -mt-6">
            {t('Subir el logo de tu negocio en Configuración')}
          </Link>
        )}

        <div className="w-full flex flex-col gap-3 mt-auto">
          <button
            onClick={descargarPNG}
            disabled={descargando}
            className="w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
          >
            {t('Guardar / compartir PNG')}
          </button>
          <button
            onClick={descargarPDF}
            disabled={descargando}
            className="w-full rounded-2xl border border-border dark:border-dark-border py-4 text-center text-base font-medium"
          >
            {t('Guardar / compartir PDF')}
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
        <span className="text-lg font-medium">{t('Nueva etiqueta')}</span>
      </header>

      <label className="flex items-center gap-3 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 cursor-pointer">
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${photoPreview ? 'bg-good/15' : 'bg-black/5'}`}>
          {photoPreview ? '✓' : '📷'}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{t('Info del dispositivo')}</p>
          <p className="text-xs text-muted dark:text-dark-text-secondary">{photoPreview ? t('foto cargada') : t('tocá para sacar foto')}</p>
        </div>
      </label>

      {!photoFile && (
        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('O escribí el IMEI a mano')}</label>
          <input
            value={imeiManual}
            onChange={(e) => setImeiManual(e.target.value)}
            placeholder="IMEI"
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm font-mono"
          />
        </div>
      )}

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Salud de batería (%)')}</label>
        <input
          type="number"
          inputMode="numeric"
          value={bateria}
          onChange={(e) => setBateria(e.target.value)}
          placeholder="92"
          className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Almacenamiento')}</label>
        <div className="flex gap-2">
          {STORAGE_OPTIONS.map((gb) => (
            <button
              key={gb}
              onClick={() => setAlmacenamiento(gb)}
              className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                almacenamiento === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
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
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {loading ? t('Leyendo la foto...') : t('Continuar')}
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
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
