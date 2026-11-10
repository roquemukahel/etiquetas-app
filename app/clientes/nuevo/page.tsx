'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { getActor } from '../../lib/actor';
import { useT } from '../../lib/idioma';
import { useSucursalActual } from '../../lib/sucursal';
import SelectorLocalidad from '../../SelectorLocalidad';
import { buscarClientesDuplicados, textoDuplicados } from '../../lib/clientesDuplicados';
import { soportaMigracion } from '../../lib/migraciones';
import { obtenerSucursales, type Sucursal } from '../../lib/sucursales';
import { CALIFICACIONES, FUENTES_INGRESO, RANGOS_PAGO } from '../../lib/clienteCobro';

export default function NuevoCliente() {
  const router = useRouter();
  const supabase = crearClienteNavegador();
  const t = useT();
  const sucursalActual = useSucursalActual();

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [apodo, setApodo] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [dni, setDni] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Sucursal de origen (por defecto la elegida en el menú lateral) y datos de cobro, si el negocio corrió esos SQL.
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [conOrigenSql, setConOrigenSql] = useState(false);
  const [conDatosCobro, setConDatosCobro] = useState(false);
  const [sucursalOrigen, setSucursalOrigen] = useState(sucursalActual.id ?? '');
  const [fuente, setFuente] = useState('');
  const [diaCobro, setDiaCobro] = useState('');
  const [rango, setRango] = useState('');
  const [calificacion, setCalificacion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  useEffect(() => {
    obtenerSucursales(supabase).then(setSucursales);
    soportaMigracion(supabase, 'clienteSucursalOrigen').then(setConOrigenSql);
    soportaMigracion(supabase, 'clienteCobro').then(setConDatosCobro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setSucursalOrigen(sucursalActual.id ?? ''), [sucursalActual.id]);

  const puedeGuardar = nombre.trim().length > 0;

  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);

    // Aviso (no bloquea) si ya hay un cliente con el mismo DNI o teléfono.
    const duplicados = await buscarClientesDuplicados(supabase, { dni, telefono });
    if (duplicados.length > 0 && !confirm(`${t('Ya hay un cliente con el mismo DNI o teléfono:')}
${textoDuplicados(duplicados)}

${t('¿Cargarlo igual?')}`)) {
      setGuardando(false);
      return;
    }

    const conOrigen = await soportaMigracion(supabase, 'clienteSucursalOrigen');
    const actor = getActor();
    const { error: insertError } = await supabase.from('clientes').insert({
      nombre: nombre.trim(),
      apellido: apellido.trim() || null,
      apodo: apodo.trim() || null,
      domicilio: domicilio.trim() || null,
      localidad: localidad.trim() || null,
      email: email.trim() || null,
      telefono: telefono.trim() || null,
      dni: dni.trim() || null,
      // Sucursal de origen: la elegida acá (por defecto la del menú lateral). La cartera sigue siendo única.
      ...(sucursalOrigen && conOrigen ? { sucursal_origen_id: sucursalOrigen } : {}),
      ...(conDatosCobro
        ? {
            fuente_ingreso: fuente || null,
            dia_cobro: diaCobro && Number(diaCobro) >= 1 && Number(diaCobro) <= 31 ? Number(diaCobro) : null,
            rango_pago: rango || null,
            calificacion: calificacion || null,
            observaciones_cobro: observaciones.trim() || null,
          }
        : {}),
      agregado_por_nombre: actor?.nombre ?? null,
      agregado_por_foto_url: actor?.fotoUrl ?? null,
    });

    if (insertError) {
      setError(`${t('No pudimos guardar el cliente:')} ` + insertError.message);
      setGuardando(false);
      return;
    }

    router.push('/clientes');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/clientes" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Cargar cliente')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-3">
        <Campo label={t('Nombre')} valor={nombre} onChange={setNombre} />
        <Campo label={t('Apellido')} valor={apellido} onChange={setApellido} />
        <Campo label={t('Apodo (opcional)')} valor={apodo} onChange={setApodo} />
        <Campo label={t('Domicilio')} valor={domicilio} onChange={setDomicilio} />
        <SelectorLocalidad label={t('Localidad / zona')} value={localidad} onChange={setLocalidad} />
        <Campo label={t('Email')} valor={email} onChange={setEmail} />
        <Campo label={t('Teléfono')} valor={telefono} onChange={setTelefono} />
        <Campo label={t('DNI')} valor={dni} onChange={setDni} />
        {conOrigenSql && sucursales.length > 0 && (
          <Selector label={t('Sucursal de origen')} valor={sucursalOrigen} onChange={setSucursalOrigen} vacio={t('Sin sucursal asignada')} opciones={sucursales.map((s) => ({ valor: s.id, etiqueta: `🏬 ${s.nombre}` }))} />
        )}
        {conDatosCobro && (
          <>
            <Selector label={t('Fuente de ingreso')} valor={fuente} onChange={setFuente} vacio={t('Sin definir')} opciones={FUENTES_INGRESO.map((f) => ({ valor: f.clave, etiqueta: t(f.etiqueta) }))} />
            <Campo
              label={t('Día de cobro del cliente (1 a 31)')}
              valor={diaCobro}
              onChange={(v) => setDiaCobro(v.replace(/\D/g, '').slice(0, 2))}
            />
            {diaCobro !== '' && (parseInt(diaCobro, 10) < 1 || parseInt(diaCobro, 10) > 31) && (
              <p className="text-xs text-bad -mt-2">{t('Poné un día del 1 al 31 (si lo dejás así no se guarda).')}</p>
            )}
            <Selector label={t('Rango de pago pactado')} valor={rango} onChange={setRango} vacio={t('Sin definir')} opciones={RANGOS_PAGO.map((r) => ({ valor: r, etiqueta: `${t('Del')} ${r.replace('-', ` ${t('al')} `)}` }))} />
            <Selector label={t('Calidad del cliente')} valor={calificacion} onChange={setCalificacion} vacio={t('Sin calificar')} opciones={CALIFICACIONES.map((q) => ({ valor: q.clave, etiqueta: t(q.etiqueta) }))} />
            <Campo label={t('Observaciones')} valor={observaciones} onChange={setObservaciones} />
          </>
        )}
      </div>

      <button
        disabled={!puedeGuardar || guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? t('Guardando...') : t('Guardar cliente')}
      </button>
    </main>
  );
}

function Selector({
  label,
  valor,
  onChange,
  vacio,
  opciones,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  vacio: string;
  opciones: { valor: string; etiqueta: string }[];
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      >
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}

function Campo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
