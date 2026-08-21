'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { obtenerTodasLasFilas } from '../../lib/db';
import { sanitizarDecimal } from '../../lib/numeros';
import SelectorColorAuto from '../../SelectorColorAuto';
import { useT } from '../../lib/idioma';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  telefono: string | null;
};

type DispositivoStock = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  precio: number | null;
};

export default function NuevoPlanAhorro() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const t = useT();

  const [step, setStep] = useState<'cliente' | 'plan'>('cliente');

  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente');
  const [buscarCliente, setBuscarCliente] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteElegido, setClienteElegido] = useState<Cliente | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');

  const [carpetas, setCarpetas] = useState<string[]>([]);
  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState<number | null>(null);
  const [color, setColor] = useState('');
  const [montoObjetivo, setMontoObjetivo] = useState('');
  const [detalles, setDetalles] = useState('');

  // Señar: en vez de ahorrar para "algún modelo, algún día", se reserva un
  // equipo PUNTUAL que ya está en Stock — mismo plan de ahorro por debajo,
  // solo que con dispositivo_id apuntando a ese equipo.
  const [esSena, setEsSena] = useState(false);
  const [dispositivosStock, setDispositivosStock] = useState<DispositivoStock[]>([]);
  const [reservados, setReservados] = useState<Set<string>>(new Set());
  const [buscarDispositivo, setBuscarDispositivo] = useState('');
  const [dispositivoElegido, setDispositivoElegido] = useState<DispositivoStock | null>(null);

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
    (async () => {
      const [{ data: disp }, { data: planes }] = await Promise.all([
        supabase.from('dispositivos').select('id, modelo, capacidad_gb, color, imei, precio').eq('en_stock', true).order('modelo'),
        // Un equipo ya señado por otro plan activo no debería poder volver a
        // señarse — si no, dos clientes podrían terminar reservando el mismo.
        supabase.from('planes_ahorro').select('dispositivo_id').not('dispositivo_id', 'is', null).not('estado', 'in', '(completado,cancelado)'),
      ]);
      setDispositivosStock((disp as DispositivoStock[]) ?? []);
      setReservados(new Set(((planes ?? []) as { dispositivo_id: string }[]).map((p) => p.dispositivo_id)));
    })();
  }, []);

  const dispositivosDisponibles = useMemo(
    () => dispositivosStock.filter((d) => !reservados.has(d.id)),
    [dispositivosStock, reservados]
  );

  const dispositivosFiltrados = useMemo(() => {
    const q = buscarDispositivo.trim().toLowerCase();
    if (!q) return dispositivosDisponibles;
    return dispositivosDisponibles.filter((d) =>
      [d.modelo, d.color, d.imei].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [dispositivosDisponibles, buscarDispositivo]);

  const elegirDispositivo = (d: DispositivoStock) => {
    setDispositivoElegido(d);
    setModelo(d.modelo || '');
    setCapacidad(d.capacidad_gb);
    setColor(d.color || '');
    if (d.precio != null) setMontoObjetivo(String(d.precio));
  };

  const clientesFiltrados = useMemo(() => {
    const q = buscarCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.apellido, c.telefono].filter(Boolean).some((x) => x!.toLowerCase().includes(q))
    );
  }, [clientes, buscarCliente]);

  const elegirCliente = (c: Cliente) => {
    setClienteElegido(c);
    setStep('plan');
  };

  const confirmarClienteNuevo = () => {
    if (!nuevoNombre.trim()) return;
    setStep('plan');
  };

  const puedeConfirmar =
    montoObjetivo.trim().length > 0 && Number(montoObjetivo) > 0 && (!esSena || !!dispositivoElegido);

  const handleConfirmar = async () => {
    if (!puedeConfirmar) return;
    setGuardando(true);
    setError(null);

    try {
      // Chequeo de último momento: alguien pudo haber señado este mismo
      // equipo (u otra persona lo pudo vender) mientras esta pantalla
      // estaba abierta.
      if (esSena && dispositivoElegido) {
        const { data: actual } = await supabase
          .from('dispositivos')
          .select('en_stock')
          .eq('id', dispositivoElegido.id)
          .single();
        if (!actual?.en_stock) {
          throw new Error(t('Este equipo ya no está disponible en Stock — puede que se haya vendido o señado recién. Elegí otro.'));
        }
      }

      let clienteId = clienteElegido?.id;
      if (modoCliente === 'nuevo') {
        const { data, error: cErr } = await supabase
          .from('clientes')
          .insert({
            nombre: nuevoNombre.trim(),
            apellido: nuevoApellido.trim() || null,
            telefono: nuevoTelefono.trim() || null,
          })
          .select()
          .single();
        if (cErr || !data) throw new Error(cErr?.message || t('no se pudo cargar el cliente'));
        clienteId = data.id;
      }

      const { data: plan, error: planErr } = await supabase
        .from('planes_ahorro')
        .insert({
          cliente_id: clienteId,
          modelo: modelo.trim() || null,
          capacidad_gb: capacidad,
          color: color.trim() || null,
          monto_objetivo: Number(montoObjetivo),
          detalles: detalles.trim() || null,
          dispositivo_id: esSena ? dispositivoElegido?.id ?? null : null,
        })
        .select()
        .single();
      if (planErr || !plan) throw new Error(planErr?.message || t('no se pudo crear el plan'));

      router.push(`/plan-ahorro/${plan.id}`);
    } catch (err: any) {
      setError(t('No pudimos guardar el plan:') + ' ' + (err?.message || t('error desconocido')));
      setGuardando(false);
    }
  };

  if (step === 'cliente') {
    return (
      <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
        <header className="flex items-center gap-3">
          <Link href="/plan-ahorro" className="text-2xl leading-none">
            &larr;
          </Link>
          <span className="text-lg font-medium">{t('Nuevo plan de ahorro')} · {t('Cliente')}</span>
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
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Nombre')}</label>
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Apellido')}</label>
              <input
                value={nuevoApellido}
                onChange={(e) => setNuevoApellido(e.target.value)}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Teléfono')}</label>
              <input
                value={nuevoTelefono}
                onChange={(e) => setNuevoTelefono(e.target.value)}
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
            </div>
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
        <span className="text-lg font-medium">{t('Nuevo plan de ahorro')} · {t('Objetivo')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card px-4 py-3 text-sm">
        <span className="text-muted dark:text-dark-text-secondary">{t('Cliente:')} </span>
        {modoCliente === 'existente' ? `${clienteElegido?.nombre} ${clienteElegido?.apellido || ''}` : nuevoNombre}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => {
            setEsSena(false);
            setDispositivoElegido(null);
          }}
          className={`flex-1 rounded-xl py-2 font-medium ${
            !esSena ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          {t('Ahorro (modelo a definir)')}
        </button>
        <button
          onClick={() => setEsSena(true)}
          className={`flex-1 rounded-xl py-2 font-medium ${
            esSena ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          {t('Señar un equipo del Stock')}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {esSena ? (
          <div>
            <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
              {t('Equipo a reservar (queda apartado hasta que se complete la venta)')}
            </label>
            {dispositivoElegido ? (
              <div className="rounded-xl border border-accent/40 dark:border-dark-accent/40 bg-accent-soft dark:bg-dark-accent-soft px-4 py-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {dispositivoElegido.modelo}
                  {dispositivoElegido.capacidad_gb ? ` · ${dispositivoElegido.capacidad_gb}GB` : ''}
                  {dispositivoElegido.color ? ` · ${dispositivoElegido.color}` : ''}
                  {dispositivoElegido.imei ? ` · IMEI ${dispositivoElegido.imei}` : ''}
                </p>
                <button onClick={() => setDispositivoElegido(null)} className="text-xs text-accent dark:text-dark-accent underline shrink-0">
                  {t('Cambiar')}
                </button>
              </div>
            ) : (
              <>
                <input
                  value={buscarDispositivo}
                  onChange={(e) => setBuscarDispositivo(e.target.value)}
                  placeholder={t('Buscar por modelo, color o IMEI...')}
                  className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
                />
                <div className="flex flex-col gap-2 mt-2 max-h-64 overflow-y-auto">
                  {dispositivosFiltrados.length === 0 && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary text-center py-2">
                      {t('No hay equipos en Stock disponibles con esa búsqueda.')}
                    </p>
                  )}
                  {dispositivosFiltrados.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => elegirDispositivo(d)}
                      className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2.5 text-left text-sm flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="block">
                          {d.modelo}
                          {d.capacidad_gb ? ` · ${d.capacidad_gb}GB` : ''}
                          {d.color ? ` · ${d.color}` : ''}
                        </span>
                        {/* Sin esto, dos unidades del mismo modelo/color eran
                            indistinguibles en la lista — no había forma de
                            saber cuál es cuál. */}
                        {d.imei && (
                          <span className="block text-xs text-muted dark:text-dark-text-secondary font-mono">IMEI {d.imei}</span>
                        )}
                      </span>
                      {d.precio != null && <span className="text-xs text-muted dark:text-dark-text-secondary shrink-0">${d.precio.toLocaleString('es-AR')}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Modelo deseado (opcional)')}</label>
              <input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="iPhone 13"
                list="carpetas-stock-plan-ahorro"
                className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
              />
              <datalist id="carpetas-stock-plan-ahorro">
                {carpetas.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Almacenamiento')}</label>
              <div className="flex gap-2">
                {STORAGE_OPTIONS.map((gb) => (
                  <button
                    key={gb}
                    onClick={() => setCapacidad(capacidad === gb ? null : gb)}
                    className={`flex-1 rounded-xl py-2 text-sm font-medium ${
                      capacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
                    }`}
                  >
                    {gb} GB
                  </button>
                ))}
              </div>
            </div>

            <SelectorColorAuto label={t('Color (opcional)')} modelo={modelo} value={color} onChange={setColor} />
          </>
        )}

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">
            {esSena ? t('Monto a cobrar por el equipo') : t('Monto objetivo')}
          </label>
          <input
            value={montoObjetivo}
            onChange={(e) => setMontoObjetivo(sanitizarDecimal(e.target.value))}
            inputMode="decimal"
            placeholder={t('Precio del equipo a juntar')}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Detalles (opcional)')}</label>
          <textarea
            value={detalles}
            onChange={(e) => setDetalles(e.target.value)}
            placeholder={t('Ej. condiciones acordadas con el cliente')}
            rows={3}
            className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
          />
        </div>
      </div>

      <button
        disabled={!puedeConfirmar || guardando}
        onClick={handleConfirmar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? t('Guardando...') : t('Crear plan')}
      </button>
    </main>
  );
}
