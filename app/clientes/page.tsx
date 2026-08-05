'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { leerCSV, valorDe, descargarCSV, insertarEnTandas } from '../lib/csv';
import { obtenerTodasLasFilas } from '../lib/db';
import { registrarAuditoria } from '../lib/auditoria';
import { getActor, useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { simboloMoneda } from '../lib/monedas';

type Cliente = {
  id: string;
  nombre: string;
  apellido: string | null;
  domicilio: string | null;
  email: string | null;
  telefono: string | null;
  dni: string | null;
};

export default function Clientes() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState<{ hechas: number; total: number } | null>(null);
  const [resultadoImport, setResultadoImport] = useState<string | null>(null);
  const inputImportRef = useRef<HTMLInputElement>(null);

  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [eliminandoSeleccion, setEliminandoSeleccion] = useState(false);

  const [saldos, setSaldos] = useState<Map<string, { saldo: number; vencido: number }>>(new Map());
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  const moneda = useMemo(() => simboloMoneda(monedaCodigo), [monedaCodigo]);

  const cargar = async () => {
    const data = await obtenerTodasLasFilas<Cliente>(supabase, 'clientes', '*', [{ columna: 'nombre' }]);
    setClientes(data);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  // Saldos de cuenta corriente de todos los clientes en un solo llamado. Si
  // el SQL todavía no se corrió, la función no existe y esto falla en
  // silencio: el mapa queda vacío y simplemente no se muestran saldos.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('saldos_cuenta_corriente');
      const m = new Map<string, { saldo: number; vencido: number }>();
      for (const r of (data as { cliente_id: string; saldo: number; vencido: number }[]) ?? []) {
        m.set(r.cliente_id, { saldo: Number(r.saldo) || 0, vencido: Number(r.vencido) || 0 });
      }
      setSaldos(m);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: perfil } = await supabase.from('perfiles').select('negocios ( moneda )').eq('id', user.id).single();
        const cod = (perfil as any)?.negocios?.moneda;
        if (cod) setMonedaCodigo(cod);
      }
    })();
  }, []);

  const exportar = () => {
    descargarCSV(
      'clientes-qovento.csv',
      ['nombre', 'apellido', 'email', 'telefono', 'dni', 'domicilio'],
      clientes
    );
  };

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setImportando(true);
    setResultadoImport(null);
    setProgresoImport(null);

    try {
      const filas = await leerCSV(archivo);
      const dnisExistentes = new Set(clientes.map((c) => c.dni).filter(Boolean));
      const actor = getActor();

      const nuevos = filas
        .map((fila) => {
          const nombre = valorDe(fila, 'nombre', 'fullname', 'name');
          if (!nombre) return null;
          return {
            nombre,
            apellido: valorDe(fila, 'apellido', 'lastname') || null,
            email: valorDe(fila, 'email') || null,
            telefono: valorDe(fila, 'telefono', 'phone') || null,
            dni: valorDe(fila, 'dni') || null,
            domicilio: valorDe(fila, 'domicilio', 'direccion', 'address', 'contactdescription') || null,
            agregado_por_nombre: actor?.nombre ?? null,
            agregado_por_foto_url: actor?.fotoUrl ?? null,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .filter((c) => !c.dni || !dnisExistentes.has(c.dni));

      const { guardadas, error } = await insertarEnTandas(
        (tanda) => supabase.from('clientes').insert(tanda),
        nuevos,
        500,
        (hechas, total) => setProgresoImport({ hechas, total })
      );

      const omitidos = filas.length - nuevos.length;
      setResultadoImport(
        error
          ? `Se guardaron ${guardadas} de ${nuevos.length} antes de un error: ${error}`
          : `Listo: se importaron ${guardadas} clientes.${omitidos > 0 ? ` Se omitieron ${omitidos} filas sin nombre o con un DNI ya cargado.` : ''}`
      );
      cargar();
    } catch (err: any) {
      setResultadoImport('No pudimos leer el archivo: ' + (err?.message ?? 'error desconocido'));
    }

    setImportando(false);
    setProgresoImport(null);
    if (inputImportRef.current) inputImportRef.current.value = '';
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const salirDeSeleccion = () => {
    setModoSeleccion(false);
    setSeleccionados(new Set());
  };

  const eliminarSeleccionados = async () => {
    if (!puedeEliminar) return;
    const ids = Array.from(seleccionados);
    if (ids.length === 0) return;
    if (!confirm(`¿Eliminar ${ids.length} cliente${ids.length === 1 ? '' : 's'}? No se puede deshacer.`)) return;

    setEliminandoSeleccion(true);
    const aEliminar = clientes.filter((c) => seleccionados.has(c.id));

    const { error } = await supabase.from('clientes').delete().in('id', ids);
    if (!error) {
      for (const c of aEliminar) {
        await registrarAuditoria(supabase, {
          accion: `eliminó al cliente ${c.nombre} ${c.apellido || ''}`.trim().replace(/\s+/g, ' '),
          entidad: 'cliente',
          entidadId: c.id,
        });
      }
    }

    setEliminandoSeleccion(false);
    salirDeSeleccion();
    cargar();
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.apellido, c.email, c.telefono, c.dni]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(q))
    );
  }, [clientes, busqueda]);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Clientes</span>
      </header>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, email, teléfono, DNI..."
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />

      <Link
        href="/clientes/nuevo"
        className="w-full rounded-2xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
      >
        + Cargar cliente
      </Link>

      <div className="flex gap-2">
        <label className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium cursor-pointer">
          {importando
            ? progresoImport
              ? `Importando... ${progresoImport.hechas}/${progresoImport.total}`
              : 'Leyendo archivo...'
            : '⬆ Importar CSV'}
          <input ref={inputImportRef} type="file" accept=".csv" className="hidden" disabled={importando} onChange={importar} />
        </label>
        <button
          onClick={exportar}
          disabled={clientes.length === 0}
          className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium disabled:opacity-40"
        >
          ⬇ Exportar CSV
        </button>
      </div>

      {resultadoImport && (
        <p className="text-xs bg-canvas dark:bg-dark-bg rounded-lg px-3 py-2 text-muted dark:text-dark-text-secondary">
          {resultadoImport}
        </p>
      )}

      {modoSeleccion ? (
        <div className="sticky top-0 z-10 rounded-xl border border-accent/30 dark:border-dark-accent/30 bg-accent-soft dark:bg-dark-accent-soft px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{seleccionados.size} seleccionado{seleccionados.size === 1 ? '' : 's'}</p>
          <div className="flex items-center gap-2">
            <button onClick={salirDeSeleccion} className="text-xs text-muted dark:text-dark-text-secondary underline">
              Cancelar
            </button>
            <button
              onClick={eliminarSeleccionados}
              disabled={seleccionados.size === 0 || eliminandoSeleccion}
              className="rounded-lg bg-bad text-white text-xs font-medium px-3 py-1.5 disabled:opacity-40"
            >
              {eliminandoSeleccion ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      ) : (
        puedeEliminar && (
          <button onClick={() => setModoSeleccion(true)} className="self-start text-xs text-accent dark:text-dark-accent underline">
            Seleccionar varios
          </button>
        )
      )}

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          {busqueda ? 'No encontramos nada con esa búsqueda.' : 'Todavía no tenés clientes cargados.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((c) => {
          const seleccionado = seleccionados.has(c.id);
          const s = saldos.get(c.id);
          const saldoChip =
            s && Math.abs(s.saldo) > 0.009 ? (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                  s.saldo > 0 ? (s.vencido > 0 ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn') : 'bg-good/10 text-good'
                }`}
                title={s.saldo > 0 ? 'Te debe' : 'Saldo a favor'}
              >
                {s.saldo < 0 ? '+' : ''}
                {moneda}
                {Math.round(Math.abs(s.saldo)).toLocaleString('es-AR')}
              </span>
            ) : null;
          const clases = `rounded-xl border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-3 w-full text-left ${
            seleccionado ? 'ring-2 ring-accent dark:ring-dark-accent border-transparent' : 'border-border dark:border-dark-border'
          }`;
          const contenido = (
            <>
              {modoSeleccion && (
                <span
                  className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    seleccionado
                      ? 'bg-accent dark:bg-dark-accent border-accent dark:border-dark-accent'
                      : 'border-border dark:border-dark-border'
                  }`}
                >
                  {seleccionado && <span className="text-white text-[10px]">✓</span>}
                </span>
              )}
              <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.nombre} {c.apellido || ''}
                  </p>
                  <p className="text-xs text-muted dark:text-dark-text-secondary truncate">{c.telefono || c.email || 'sin contacto'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {saldoChip}
                  {c.dni && <p className="text-xs text-muted dark:text-dark-text-secondary font-mono">{c.dni}</p>}
                </div>
              </div>
            </>
          );

          return modoSeleccion ? (
            <button key={c.id} onClick={() => toggleSeleccion(c.id)} className={clases}>
              {contenido}
            </button>
          ) : (
            <Link key={c.id} href={`/clientes/${c.id}`} className={clases}>
              {contenido}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
