'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo, sugerirCarpetas } from '../../lib/modelos';
import { asegurarProveedor } from '../../lib/proveedores';
import { limpiarImei } from '../../lib/imei';
import { getActor, useActor, MENSAJE_ACTOR_REQUERIDO } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { planesActivos, valorCuota, etiquetaCuotas } from '../../lib/cuotas';
import { simboloMoneda } from '../../lib/monedas';
import { sanitizarDecimal } from '../../lib/numeros';
import SelectorColorAuto from '../../SelectorColorAuto';
import SelectorEstadoDispositivo from '../../SelectorEstadoDispositivo';
import { useT } from '../../lib/idioma';

const STORAGE_OPTIONS = [64, 128, 256, 512];

export default function NuevoDispositivo() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const actorActual = useActor();
  const t = useT();
  const puedeAgregarStock = tienePermiso(actorActual, 'agregar_stock');

  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [proveedores, setProveedores] = useState<string[]>([]);
  const [interesCuotas, setInteresCuotas] = useState<Record<string, number> | null>(null);
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
    (async () => {
      const { data } = await supabase.from('proveedores').select('nombre').order('nombre');
      setProveedores((data ?? []).map((p) => p.nombre));
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( interes_cuotas, moneda )').eq('id', user.id).single();
      setInteresCuotas((perfil as any)?.negocios?.interes_cuotas ?? null);
      const cod = (perfil as any)?.negocios?.moneda;
      if (cod) setMonedaCodigo(cod);
    })();
  }, []);

  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState<number | null>(null);
  const [imei, setImei] = useState('');
  const [bateria, setBateria] = useState('');
  const [color, setColor] = useState('');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [detalles, setDetalles] = useState('');
  const [estado, setEstado] = useState('usado');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Si se llega desde una carpeta ("+ Agregar" en Stock), el modelo viene
  // pre-cargado por la URL (?modelo=iPhone 11) para que aparezca directo el
  // selector de colores correspondiente. Se lee de window para no depender de
  // useSearchParams (evita tener que envolver en Suspense).
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('modelo');
    if (m) setModelo(m);
  }, []);

  const puedeGuardar = modelo.trim().length > 0 && puedeAgregarStock;

  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    const actor = getActor();
    if (!actor) {
      setError(MENSAJE_ACTOR_REQUERIDO);
      return;
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
      detalles: detalles.trim() || null,
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

    router.push('/stock');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/stock" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Cargar dispositivo')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {!puedeAgregarStock && (
        <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{t('No tenés permiso para agregar dispositivos al stock.')}</p>
      )}

      <div className="flex flex-col gap-3">
        <Campo label={t('Modelo (carpeta)')} valor={modelo} onChange={setModelo} placeholder="iPhone 13" listaId="carpetas-stock" />
        <datalist id="carpetas-stock">
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
        <Campo label={t('Salud de batería (%)')} valor={bateria} onChange={setBateria} numerico />
        <SelectorColorAuto label={t('Color')} modelo={modelo} value={color} onChange={setColor} />
        <Campo label={t('Precio')} valor={precio} onChange={setPrecio} numerico />
        {(() => {
          const planes = planesActivos(interesCuotas);
          const base = Number(precio);
          if (!planes.length || !base) return null;
          const mon = simboloMoneda(monedaCodigo);
          return (
            <div className="rounded-xl bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border px-4 py-3 text-xs text-muted dark:text-dark-text-secondary flex flex-col gap-1">
              <span className="font-medium text-ink dark:text-dark-text">{t('Precio en cuotas (según tu financiación):')}</span>
              {planes.map((p) => (
                <span key={p.cuotas}>
                  {etiquetaCuotas(p.cuotas)} {t('de')} {mon}
                  {Math.round(valorCuota(base, p.cuotas, p.interes)).toLocaleString('es-AR')} · {t('total')} {mon}
                  {Math.round(base * (1 + p.interes / 100)).toLocaleString('es-AR')}
                </span>
              ))}
            </div>
          );
        })()}
        <Campo label={t('Costo (lo que le pagaste al proveedor, opcional)')} valor={costo} onChange={setCosto} numerico />
        <Campo label={t('Proveedor (opcional)')} valor={proveedor} onChange={setProveedor} listaId="proveedores-stock" />
        <datalist id="proveedores-stock">
          {proveedores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
            {t('Detalles del equipo (opcional)')}
          </label>
          <textarea
            value={detalles}
            onChange={(e) => setDetalles(e.target.value)}
            rows={2}
            placeholder={t('Ej. módulo con detalle, carcasa con un rayón, no anda el flash…')}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

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
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mono?: boolean;
  numerico?: boolean;
  placeholder?: string;
  listaId?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(numerico ? sanitizarDecimal(e.target.value) : e.target.value)}
        placeholder={placeholder}
        list={listaId}
        inputMode={numerico ? 'decimal' : undefined}
        className={`w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
