'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo, sugerirCarpetas } from '../../lib/modelos';
import { asegurarProveedor } from '../../lib/proveedores';
import { limpiarImei } from '../../lib/imei';
import { useDictado } from '../../lib/dictado';
import { getActor, useActor, MENSAJE_ACTOR_REQUERIDO } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import SelectorColorAuto from '../../SelectorColorAuto';
import SelectorEstadoDispositivo from '../../SelectorEstadoDispositivo';
import { sanitizarDecimal } from '../../lib/numeros';
import { useT } from '../../lib/idioma';

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

export default function StockPorFoto() {
  const supabase = crearClienteNavegador();
  const actorActual = useActor();
  const t = useT();
  const puedeAgregarStock = tienePermiso(actorActual, 'agregar_stock');

  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [proveedores, setProveedores] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
    (async () => {
      const { data } = await supabase.from('proveedores').select('nombre').order('nombre');
      setProveedores((data ?? []).map((p) => p.nombre));
    })();
  }, []);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [leyendoFoto, setLeyendoFoto] = useState(false);
  const [fotosLeidas, setFotosLeidas] = useState(0);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState<number | null>(null);
  const [imei, setImei] = useState('');
  const [bateria, setBateria] = useState('');
  const [color, setColor] = useState('');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [estado, setEstado] = useState('usado');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const { dictar, soportado: dictadoSoportado } = useDictado();
  const [campoDictando, setCampoDictando] = useState<string | null>(null);

  const dictarCampo = (campo: string, onResultado: (texto: string) => void) => {
    if (!dictadoSoportado) return;
    setCampoDictando(campo);
    dictar(onResultado, () => setCampoDictando(null));
  };

  // Se puede llamar más de una vez (ej. una foto del frente de la caja y
  // después otra de atrás): cada resultado se COMBINA con lo ya cargado, sin
  // pisar un campo que la foto anterior ya completó con un valor mejor.
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setLeyendoFoto(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/extract-device-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
      });
      if (!res.ok) throw new Error('fallo la extraccion');
      const { data } = await res.json();
      if (data?.modelo) setModelo((prev) => prev || data.modelo);
      if (data?.capacidad_gb) setCapacidad((prev) => prev ?? data.capacidad_gb);
      if (data?.color) setColor((prev) => prev || data.color);
      if (data?.imei) setImei((prev) => prev || data.imei);
      if (data?.salud_bateria != null) setBateria((prev) => prev || String(data.salud_bateria));
      // Caja sellada (a estrenar): casi nunca trae % de batería impreso —
      // asumimos 100% y marcamos el estado como nuevo, para no obligar a
      // completarlo a mano en el caso más común.
      if (data?.sellado) {
        setBateria((prev) => prev || '100');
        setEstado((prev) => (prev === 'usado' ? 'sellado' : prev));
      }
      setFotosLeidas((n) => n + 1);
      if (!data?.modelo && !data?.capacidad_gb && !data?.imei && !data?.color && data?.salud_bateria == null) {
        setError(t('No pudimos leer datos de esta foto. Podés completar los campos a mano.'));
      }
    } catch {
      setError(t('No pudimos leer la foto. Podés completar los campos a mano.'));
    } finally {
      setLeyendoFoto(false);
    }
  };

  const puedeGuardar = modelo.trim().length > 0 && puedeAgregarStock;

  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    const actor = getActor();
    if (!actor) {
      setError(MENSAJE_ACTOR_REQUERIDO);
      return;
    }
    const imeiLimpio = limpiarImei(imei);
    if (imeiLimpio) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', imeiLimpio).maybeSingle();
      // Con carga por foto es fácil escanear el mismo equipo dos veces sin
      // querer (ej. sacarle otra foto pensando que era el siguiente) — se
      // avisa antes de duplicarlo en Stock, igual que en Servicio Técnico.
      if (existente && !confirm(`${t('Ya hay un dispositivo en Stock con el IMEI')} ${imeiLimpio}. ${t('¿Agregarlo igual?')}`)) return;
    }
    setGuardando(true);
    setError(null);

    const proveedorId = await asegurarProveedor(supabase, proveedor);
    const { error: insertError } = await supabase.from('dispositivos').insert({
      modelo: modelo.trim(),
      capacidad_gb: capacidad,
      imei: limpiarImei(imei),
      salud_bateria: bateria ? Number(bateria) : null,
      color: color.trim() || null,
      precio: precio ? Number(precio) : null,
      costo: costo ? Number(costo) : null,
      proveedor: proveedor.trim() || null,
      proveedor_id: proveedorId,
      estado,
      en_stock: true,
      agregado_por_nombre: actor?.nombre ?? null,
      agregado_por_foto_url: actor?.fotoUrl ?? null,
    });

    if (insertError) {
      setError(`${t('No pudimos guardar el dispositivo:')} ` + insertError.message);
      setGuardando(false);
      return;
    }

    await asegurarModelo(supabase, modelo);

    // Antes redirigía a Stock después de cada carga — con varios equipos
    // seguidos (que es el caso de uso de "Cargar con foto") obligaba a
    // volver a entrar a esta pantalla por cada uno. Ahora se limpia el
    // formulario y se queda acá, lista para sacarle la foto al siguiente.
    setPhotoFile(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFotosLeidas(0);
    setModelo('');
    setCapacidad(null);
    setImei('');
    setBateria('');
    setColor('');
    setPrecio('');
    setCosto('');
    setEstado('usado');
    setGuardando(false);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 3000);
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/stock" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">{t('Cargar con foto')}</span>
        <Link href="/stock" className="text-xs text-accent dark:text-dark-accent underline">
          {t('Ir al Stock')}
        </Link>
      </header>

      {guardadoOk && (
        <p className="text-sm text-good bg-good/10 rounded-lg px-3 py-2">✓ {t('Agregado al stock. Ya podés cargar el siguiente.')}</p>
      )}
      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {!puedeAgregarStock && (
        <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{t('No tenés permiso para agregar dispositivos al stock.')}</p>
      )}

      <label className="flex items-center gap-3 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 cursor-pointer shadow-card">
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${photoPreview ? 'bg-good/15' : 'bg-canvas dark:bg-dark-bg'}`}>
          {photoPreview ? '✓' : '📷'}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{t('Info del dispositivo')}</p>
          <p className="text-xs text-muted dark:text-dark-text-secondary">
            {leyendoFoto
              ? t('Leyendo la foto...')
              : fotosLeidas > 0
              ? `${fotosLeidas} ${fotosLeidas > 1 ? t('fotos leídas') : t('foto leída')} — ${t('tocá para sacar otra (ej. la parte de atrás)')}`
              : t('tocá para sacar foto de la etiqueta, pantalla o caja')}
          </p>
        </div>
      </label>

      <div className="flex flex-col gap-3">
        <Campo
          label={t('Modelo (carpeta)')}
          valor={modelo}
          onChange={setModelo}
          placeholder="iPhone 13"
          listaId="carpetas-stock-foto"
          onDictar={dictadoSoportado ? () => dictarCampo('modelo', setModelo) : undefined}
          dictando={campoDictando === 'modelo'}
        />
        <datalist id="carpetas-stock-foto">
          {carpetas.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {sugerirCarpetas(modelo, carpetas).length > 0 && (
          <div className="-mt-1 rounded-lg bg-warn/10 border border-warn/30 px-3 py-2 flex flex-col gap-1.5">
            <p className="text-xs text-ink dark:text-dark-text">
              {t('Ya existe una carpeta parecida. Para no crear una repetida, ¿usás una de estas?')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sugerirCarpetas(modelo, carpetas).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setModelo(c)}
                  className="rounded-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border px-3 py-1 text-xs font-medium"
                >
                  {t('Usar')} «{c}»
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Almacenamiento')}</label>
          <div className="flex gap-2">
            {STORAGE_OPTIONS.map((gb) => (
              <button
                key={gb}
                type="button"
                onClick={() => setCapacidad(gb)}
                className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                  capacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                }`}
              >
                {gb} GB
              </button>
            ))}
          </div>
        </div>

        <Campo label="IMEI" valor={imei} onChange={setImei} mono />
        <Campo
          label={t('Salud de batería (%)')}
          valor={bateria}
          onChange={setBateria}
          numerico
          onDictar={
            dictadoSoportado
              ? () =>
                  dictarCampo('bateria', (texto) => {
                    const match = texto.match(/\d+/);
                    setBateria(match ? match[0] : texto.trim());
                  })
              : undefined
          }
          dictando={campoDictando === 'bateria'}
        />
        <SelectorColorAuto label={t('Color')} modelo={modelo} value={color} onChange={setColor} />
        <Campo label={t('Precio (opcional)')} valor={precio} onChange={setPrecio} numerico />
        <Campo label={t('Costo (lo que le pagaste al proveedor, opcional)')} valor={costo} onChange={setCosto} numerico />
        <Campo label={t('Proveedor (opcional)')} valor={proveedor} onChange={setProveedor} listaId="proveedores-stock-foto" />
        <datalist id="proveedores-stock-foto">
          {proveedores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <SelectorEstadoDispositivo value={estado} onChange={setEstado} />
      </div>

      <button
        disabled={!puedeGuardar || guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? t('Guardando...') : t('Agregar al stock')}
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
  mono,
  numerico,
  placeholder,
  listaId,
  onDictar,
  dictando,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
  numerico?: boolean;
  placeholder?: string;
  listaId?: string;
  onDictar?: () => void;
  dictando?: boolean;
}) {
  const t = useT();
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <div className="flex items-stretch gap-2">
        <input
          value={valor}
          onChange={(e) => onChange(numerico ? sanitizarDecimal(e.target.value) : e.target.value)}
          placeholder={placeholder}
          inputMode={numerico ? 'decimal' : undefined}
          list={listaId}
          className={`flex-1 min-w-0 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm ${mono ? 'font-mono' : ''}`}
        />
        {onDictar && (
          <button
            type="button"
            onClick={onDictar}
            aria-label={`${t('Dictar')} ${label} ${t('por voz')}`}
            className={`shrink-0 w-11 rounded-xl border flex items-center justify-center text-lg transition-colors ${
              dictando
                ? 'bg-bad/10 border-bad text-bad animate-pulse'
                : 'bg-white dark:bg-dark-surface border-border dark:border-dark-border'
            }`}
          >
            🎤
          </button>
        )}
      </div>
    </div>
  );
}
