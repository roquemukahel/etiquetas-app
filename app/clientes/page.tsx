'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { leerCSV, valorDe, descargarCSV, insertarEnTandas } from '../lib/csv';
import { obtenerTodasLasFilas } from '../lib/db';

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
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState<{ hechas: number; total: number } | null>(null);
  const [resultadoImport, setResultadoImport] = useState<string | null>(null);
  const inputImportRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    const data = await obtenerTodasLasFilas<Cliente>(supabase, 'clientes', '*', [{ columna: 'nombre' }]);
    setClientes(data);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
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

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          {busqueda ? 'No encontramos nada con esa búsqueda.' : 'Todavía no tenés clientes cargados.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((c) => (
          <Link
            key={c.id}
            href={`/clientes/${c.id}`}
            className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-medium">
                {c.nombre} {c.apellido || ''}
              </p>
              <p className="text-xs text-muted dark:text-dark-text-secondary">{c.telefono || c.email || 'sin contacto'}</p>
            </div>
            {c.dni && <p className="text-xs text-muted dark:text-dark-text-secondary font-mono">{c.dni}</p>}
          </Link>
        ))}
      </div>
    </main>
  );
}
