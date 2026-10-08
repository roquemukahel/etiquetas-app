'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import { falla } from '../../lib/escritura';
import { obtenerTodasLasFilas } from '../../lib/db';
import { crearLocalidad, claveLocalidad, obtenerLocalidades, type Localidad } from '../../lib/localidades';
import { useT } from '../../lib/idioma';

// Lista de localidades/zonas del negocio: se eligen de una lista en la ficha del
// cliente (así no se escriben distinto cada vez) y sirven para filtrar Clientes,
// Cuentas por cobrar y Mora al armar recorridos de cobranza.
export default function Localidades() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puede = tienePermiso(actor, 'gestionar_usuarios');

  const [lista, setLista] = useState<Localidad[] | null | undefined>(undefined);
  const [conteos, setConteos] = useState<Map<string, number>>(new Map());
  const [sinLista, setSinLista] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [procesando, setProcesando] = useState(false);

  const cargar = async () => {
    const l = await obtenerLocalidades(supabase);
    setLista(l);
    // Cuántos clientes tiene cada zona + las que ya están escritas a mano y no están en la lista.
    const clientes = await obtenerTodasLasFilas<{ localidad: string | null }>(supabase, 'clientes', 'localidad', [], (q) => q.not('localidad', 'is', null));
    const porClave = new Map<string, number>();
    const escritas = new Map<string, string>();
    for (const c of clientes) {
      const nombre = (c.localidad ?? '').trim();
      if (!nombre) continue;
      const k = claveLocalidad(nombre);
      porClave.set(k, (porClave.get(k) ?? 0) + 1);
      if (!escritas.has(k)) escritas.set(k, nombre);
    }
    setConteos(porClave);
    const enLista = new Set((l ?? []).map((x) => claveLocalidad(x.nombre)));
    setSinLista(
      Array.from(escritas.entries())
        .filter(([k]) => !enLista.has(k))
        .map(([, n]) => n)
        .sort((a, b) => a.localeCompare(b))
    );
  };

  useEffect(() => {
    if (puede) cargar();
    else setLista(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede]);

  const agregar = async () => {
    setError(null);
    const r = await crearLocalidad(supabase, nueva);
    if ('error' in r) return setError(t(r.error));
    await registrarAuditoria(supabase, { accion: `agregó la localidad "${r.nombre}"`, entidad: 'localidad', entidadId: r.id });
    setNueva('');
    await cargar();
  };

  const importar = async () => {
    setProcesando(true);
    setError(null);
    for (const nombre of sinLista) {
      const r = await crearLocalidad(supabase, nombre);
      if ('error' in r) {
        setError(t(r.error));
        break;
      }
    }
    await registrarAuditoria(supabase, { accion: `importó ${sinLista.length} localidades ya usadas en clientes`, entidad: 'localidad' });
    setProcesando(false);
    await cargar();
  };

  const renombrar = async (l: Localidad) => {
    const nuevoNombre = nombreEdit.trim().replace(/\s+/g, ' ');
    if (!nuevoNombre || nuevoNombre === l.nombre) return setEditandoId(null);
    if ((lista ?? []).some((x) => x.id !== l.id && claveLocalidad(x.nombre) === claveLocalidad(nuevoNombre))) {
      return setError(t('Ya existe una localidad con ese nombre.'));
    }
    setProcesando(true);
    setError(null);
    if (await falla(supabase.from('localidades').update({ nombre: nuevoNombre }).eq('id', l.id), t, 'renombrar localidad')) return setProcesando(false);
    // Los clientes guardan el nombre: se actualizan para que no queden con el viejo.
    await falla(supabase.from('clientes').update({ localidad: nuevoNombre }).eq('localidad', l.nombre), t, 'actualizar los clientes de la localidad');
    await registrarAuditoria(supabase, { accion: `renombró la localidad "${l.nombre}" a "${nuevoNombre}"`, entidad: 'localidad', entidadId: l.id });
    setEditandoId(null);
    setProcesando(false);
    await cargar();
  };

  const borrar = async (l: Localidad) => {
    const n = conteos.get(claveLocalidad(l.nombre)) ?? 0;
    const aviso = n > 0 ? ` ${t('Los')} ${n} ${t('clientes que la tienen conservan el nombre escrito, pero deja de ofrecerse para elegir.')}` : '';
    if (!confirm(`${t('¿Quitar la localidad')} "${l.nombre}"?${aviso}`)) return;
    setProcesando(true);
    if (await falla(supabase.from('localidades').delete().eq('id', l.id), t, 'quitar localidad')) return setProcesando(false);
    await registrarAuditoria(supabase, { accion: `quitó la localidad "${l.nombre}" de la lista`, entidad: 'localidad', entidadId: l.id, valorAnterior: { nombre: l.nombre } });
    setProcesando(false);
    await cargar();
  };

  if (!puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para gestionar localidades.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Localidades / zonas')}</span>
      </header>
      <p className="text-sm text-muted dark:text-dark-text-secondary">
        {t('La lista de zonas que se elige en la ficha de cada cliente. Sirve para filtrar Clientes, Cuentas por cobrar y Mora y armar recorridos de cobranza.')}
      </p>
      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {lista === undefined ? (
        <p className="text-sm text-muted">{t('Cargando...')}</p>
      ) : lista === null ? (
        <p className="text-sm text-warn bg-warn/10 rounded-lg px-3 py-2">
          {t('Esta función todavía no está activada en la base de datos (financiacion_guia_cartera_supabase.sql).')}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregar()}
              placeholder={t('Nombre de la localidad')}
              className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
            />
            <button onClick={agregar} className="rounded-xl bg-accent dark:bg-dark-accent text-white px-5 text-sm font-medium">
              {t('Agregar')}
            </button>
          </div>

          {sinLista.length > 0 && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-3 text-sm flex flex-col gap-2">
              <p>
                {sinLista.length} {t('localidades ya están escritas a mano en tus clientes y no están en la lista:')} {sinLista.slice(0, 8).join(', ')}
                {sinLista.length > 8 ? '…' : ''}
              </p>
              <button
                disabled={procesando}
                onClick={importar}
                className="self-start rounded-lg bg-accent dark:bg-dark-accent text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                {t('Agregarlas todas a la lista')}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {lista.length === 0 && <p className="text-sm text-muted">{t('Todavía no cargaste ninguna localidad.')}</p>}
            {lista.map((l) => (
              <div key={l.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 flex items-center gap-3">
                {editandoId === l.id ? (
                  <input
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && renombrar(l)}
                    autoFocus
                    className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-1.5 text-sm"
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium">{l.nombre}</span>
                )}
                <span className="text-xs text-muted dark:text-dark-text-secondary">
                  {conteos.get(claveLocalidad(l.nombre)) ?? 0} {t('clientes')}
                </span>
                {editandoId === l.id ? (
                  <button disabled={procesando} onClick={() => renombrar(l)} className="text-xs text-accent dark:text-dark-accent underline">
                    {t('Guardar')}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEditandoId(l.id);
                      setNombreEdit(l.nombre);
                    }}
                    className="text-xs text-accent dark:text-dark-accent underline"
                  >
                    {t('Renombrar')}
                  </button>
                )}
                <button disabled={procesando} onClick={() => borrar(l)} className="text-xs text-bad underline">
                  {t('Quitar')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
