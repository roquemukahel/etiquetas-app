'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { asegurarModelo, normalizarNombreModelo } from '../../lib/modelos';
import { obtenerTodasLasFilas } from '../../lib/db';
import { sanitizarDecimal } from '../../lib/numeros';
import { limpiarImei } from '../../lib/imei';
import SelectorColorAuto from '../../SelectorColorAuto';
import SelectorEstadoDispositivo from '../../SelectorEstadoDispositivo';
import { useT } from '../../lib/idioma';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
};

export default function NuevaCompra() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const t = useT();

  const [step, setStep] = useState<'cliente' | 'dispositivo'>('cliente');

  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente');
  const [buscarCliente, setBuscarCliente] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoDomicilio, setNuevoDomicilio] = useState('');
  const [nuevoDni, setNuevoDni] = useState('');

  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState<number | null>(null);
  const [color, setColor] = useState('');
  const [condicion, setCondicion] = useState('usado');
  const [imei, setImei] = useState('');
  const [detalles, setDetalles] = useState('');
  const [precio, setPrecio] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      setClientes(await obtenerTodasLasFilas<Cliente>(supabase, 'clientes', 'id, nombre, apellido, telefono'));
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetas((data ?? []).map((m) => m.nombre));
    })();
  }, []);

  const clientesFiltrados = useMemo(() => {
    const q = buscarCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.apellido, c.telefono].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [clientes, buscarCliente]);

  const elegirCliente = (c: Cliente) => {
    setClienteElegido(c);
    setStep('dispositivo');
  };

  const confirmarClienteNuevo = () => {
    if (!nuevoNombre.trim()) return;
    setStep('dispositivo');
  };

  const puedeConfirmar = modelo.trim().length > 0;

  const handleConfirmar = async () => {
    if (!puedeConfirmar) return;
    setGuardando(true);
    setError(null);

    try {
      let clienteId = clienteElegido?.id;
      if (modoCliente === 'nuevo') {
        const { data, error: cErr } = await supabase
          .from('clientes')
          .insert({
            nombre: nuevoNombre.trim(),
            apellido: nuevoApellido.trim() || null,
            telefono: nuevoTelefono.trim() || null,
            email: nuevoEmail.trim() || null,
            domicilio: nuevoDomicilio.trim() || null,
            dni: nuevoDni.trim() || null,
          })
          .select()
          .single();
        if (cErr || !data) throw new Error(cErr?.message || t('no se pudo cargar el cliente'));
        clienteId = data.id;
      }

      const modeloNormalizado = normalizarNombreModelo(modelo.trim());
      const { data: compra, error: compraErr } = await supabase
        .from('compras')
        .insert({
          cliente_id: clienteId,
          modelo: modeloNormalizado,
          capacidad_gb: capacidad,
          color: color.trim() || null,
          condicion,
          imei: limpiarImei(imei),
          detalles: detalles.trim() || null,
          precio: precio ? Number(precio) : null,
        })
        .select()
        .single();
      if (compraErr || !compra) throw new Error(compraErr?.message || t('no se pudo crear la compra'));

      await asegurarModelo(supabase, modeloNormalizado);

      router.push(`/compras/${compra.id}/boleta`);
    } catch (err: any) {
      setError(t('No pudimos guardar la compra:') + ' ' + (err?.message || t('error desconocido')));
      setGuardando(false);
    }
  };

  if (step === 'cliente') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <Link href="/compras" className="text-2xl leading-none">
            &larr;
          </Link>
          <span className="text-lg font-medium">{t('Nueva compra')} · {t('Cliente')}</span>
        </header>

        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setModoCliente('existente')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'existente' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t('Cliente existente')}
          </button>
          <button
            onClick={() => setModoCliente('nuevo')}
            className={`flex-1 rounded-xl py-2 font-medium ${
              modoCliente === 'nuevo' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
            }`}
          >
            {t('Cargar nuevo')}
          </button>
        </div>

        {modoCliente === 'existente' ? (
          <>
            <input
              value={buscarCliente}
              onChange={(e) => setBuscarCliente(e.target.value)}
              placeholder={t('Buscar por nombre o teléfono...')}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
            <div className="flex flex-col gap-2">
              {clientesFiltrados.length === 0 && (
                <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-4">{t('No encontramos clientes con esa búsqueda.')}</p>
              )}
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => elegirCliente(c)}
                  className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between text-left"
                >
                  <p className="text-sm font-medium">
                    {c.nombre} {c.apellido || ''}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary">{c.telefono || ''}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Campo label={t('Nombre')} valor={nuevoNombre} onChange={setNuevoNombre} />
            <Campo label={t('Apellido')} valor={nuevoApellido} onChange={setNuevoApellido} />
            <Campo label={t('Teléfono')} valor={nuevoTelefono} onChange={setNuevoTelefono} />
            <Campo label={t('Email')} valor={nuevoEmail} onChange={setNuevoEmail} />
            <Campo label={t('Domicilio')} valor={nuevoDomicilio} onChange={setNuevoDomicilio} />
            <Campo label={t('DNI')} valor={nuevoDni} onChange={setNuevoDni} />
            <button
              disabled={!nuevoNombre.trim()}
              onClick={confirmarClienteNuevo}
              className="mt-2 w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
            >
              {t('Continuar')}
            </button>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <button onClick={() => setStep('cliente')} className="text-2xl leading-none">
          &larr;
        </button>
        <span className="text-lg font-medium">{t('Nueva compra')} · {t('Dispositivo')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card px-4 py-3 text-sm">
        <span className="text-muted dark:text-dark-text-secondary">{t('Cliente:')} </span>
        {modoCliente === 'existente' ? `${clienteElegido?.nombre} ${clienteElegido?.apellido || ''}` : nuevoNombre}
      </div>

      <div className="flex flex-col gap-3">
        <Campo label={t('Modelo (carpeta)')} valor={modelo} onChange={setModelo} placeholder="iPhone 13" listaId="carpetas-stock-compra" />
        <datalist id="carpetas-stock-compra">
          {carpetas.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Almacenamiento')}</label>
          <div className="flex gap-2">
            {STORAGE_OPTIONS.map((gb) => (
              <button
                key={gb}
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

        <SelectorColorAuto label={t('Color')} modelo={modelo} value={color} onChange={setColor} />
        <SelectorEstadoDispositivo value={condicion} onChange={setCondicion} />

        <Campo label={t('IMEI')} valor={imei} onChange={setImei} placeholder={t('IMEI')} />

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Detalles (opcional)')}</label>
          <textarea
            value={detalles}
            onChange={(e) => setDetalles(e.target.value)}
            placeholder={t('¿Presenta algún detalle? Ej. pantalla con manchas, batería al 70%...')}
            rows={3}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <Campo label={t('Precio pagado')} valor={precio} onChange={setPrecio} numerico />
      </div>

      <button
        disabled={!puedeConfirmar || guardando}
        onClick={handleConfirmar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? t('Guardando...') : t('Confirmar compra')}
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
  placeholder,
  numerico,
  listaId,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numerico?: boolean;
  listaId?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(numerico ? sanitizarDecimal(e.target.value) : e.target.value)}
        placeholder={placeholder}
        inputMode={numerico ? 'decimal' : undefined}
        list={listaId}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
