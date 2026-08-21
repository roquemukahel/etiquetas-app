'use client';

import { useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { obtenerTodasLasFilas } from '../../lib/db';
import { descargarCSV } from '../../lib/csv';
import { eliminarEnBloque } from '../../lib/eliminarEnBloque';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';

type Entidad = 'clientes' | 'dispositivos';

const CONFIG: Record<
  Entidad,
  { titulo: string; archivo: string; columnas: string[]; orden: { columna: string; ascending?: boolean }[] }
> = {
  clientes: {
    titulo: 'Clientes',
    archivo: 'clientes-qovento.csv',
    columnas: ['nombre', 'apellido', 'email', 'telefono', 'dni', 'domicilio'],
    orden: [{ columna: 'nombre' }],
  },
  dispositivos: {
    titulo: 'Dispositivos (Stock)',
    archivo: 'stock-celulares-qovento.csv',
    columnas: [
      'modelo',
      'capacidad_gb',
      'color',
      'imei',
      'numero_serie',
      'salud_bateria',
      'precio',
      'costo',
      'proveedor',
      'estado',
      'en_stock',
      'created_at',
    ],
    orden: [{ columna: 'modelo' }, { columna: 'created_at', ascending: false }],
  },
};

const COLUMNAS_SELECT: Record<Entidad, string> = {
  clientes: 'id, nombre, apellido, domicilio, email, telefono, dni',
  dispositivos:
    'id, modelo, capacidad_gb, imei, numero_serie, salud_bateria, color, precio, costo, proveedor, estado, en_stock, created_at',
};

export default function ExportarDatos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeAcceder = tienePermiso(actor, 'exportar_eliminar_datos');

  const [exportando, setExportando] = useState<Entidad | null>(null);
  const [confirmando, setConfirmando] = useState<Entidad | null>(null);
  const [textoConfirmacion, setTextoConfirmacion] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const exportarSolo = async (entidad: Entidad) => {
    setExportando(entidad);
    const cfg = CONFIG[entidad];
    const filas = await obtenerTodasLasFilas<Record<string, unknown>>(supabase, entidad, COLUMNAS_SELECT[entidad], cfg.orden);
    descargarCSV(cfg.archivo, cfg.columnas, filas);
    setExportando(null);
  };

  const abrirConfirmacion = (entidad: Entidad) => {
    setConfirmando(entidad);
    setTextoConfirmacion('');
    setResultado(null);
  };

  const exportarYEliminar = async () => {
    if (!confirmando || textoConfirmacion.trim().toUpperCase() !== 'ELIMINAR') return;
    const entidad = confirmando;
    const cfg = CONFIG[entidad];
    setEliminando(true);

    const filas = await obtenerTodasLasFilas<{ id: string } & Record<string, unknown>>(
      supabase,
      entidad,
      COLUMNAS_SELECT[entidad],
      cfg.orden
    );
    if (filas.length === 0) {
      setEliminando(false);
      setConfirmando(null);
      setResultado(`${t('No había')} ${t(cfg.titulo).toLowerCase()} ${t('para eliminar.')}`);
      return;
    }

    // Se descarga el CSV ANTES de borrar nada — así siempre queda una copia
    // de respaldo del momento exacto del borrado, sin depender de que se
    // haya exportado antes por separado.
    descargarCSV(cfg.archivo, cfg.columnas, filas);

    const ids = filas.map((f) => f.id);
    const { eliminados, bloqueados } = await eliminarEnBloque(supabase, entidad, ids);

    // Un resumen único (no uno por fila) — acá estamos hablando de
    // potencialmente miles de filas, y un registro de auditoría por cada
    // una sería lentísimo para nada más que un detalle que ya queda en el
    // CSV descargado.
    await registrarAuditoria(supabase, {
      accion: `exportó y eliminó en bloque ${eliminados.length} ${cfg.titulo.toLowerCase()}${
        bloqueados.length > 0 ? ` (${bloqueados.length} no se pudieron eliminar por tener historial vinculado)` : ''
      }`,
      entidad: entidad === 'clientes' ? 'cliente' : 'dispositivo',
    });

    setEliminando(false);
    setConfirmando(null);
    setResultado(
      `${t('Se descargó el CSV y se eliminaron')} ${eliminados.length} ${t('de')} ${filas.length} ${t(cfg.titulo).toLowerCase()}.` +
        (bloqueados.length > 0
          ? ` ${bloqueados.length} ${t('no se pudieron eliminar porque tienen ventas u otro historial vinculado (quedaron intactos).')}`
          : '')
    );
  };

  if (!puedeAcceder) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para ver esta sección.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Exportar y eliminar datos')}</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
        {t('Descargá un CSV de respaldo, o borrá en bloque para limpiar la base. Un cliente o dispositivo con ventas, órdenes u otro historial vinculado NO se puede eliminar (queda protegido automáticamente) — solo se borran los que no tienen nada enganchado.')}
      </p>

      {resultado && <p className="text-sm bg-canvas dark:bg-dark-bg rounded-lg px-3 py-2">{resultado}</p>}

      {(Object.keys(CONFIG) as Entidad[]).map((entidad) => (
        <section
          key={entidad}
          className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 flex flex-col gap-3"
        >
          <p className="text-sm font-medium">{t(CONFIG[entidad].titulo)}</p>
          <div className="flex gap-2">
            <button
              onClick={() => exportarSolo(entidad)}
              disabled={exportando === entidad}
              className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-center text-xs font-medium disabled:opacity-40"
            >
              {exportando === entidad ? (
                t('Exportando...')
              ) : (
                <span className="inline-flex items-center justify-center gap-1">
                  <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">{ICONOS.descargar}</span>
                  {t('Exportar únicamente')}
                </span>
              )}
            </button>
            <button
              onClick={() => abrirConfirmacion(entidad)}
              className="flex-1 rounded-xl border border-bad/40 text-bad py-2.5 text-center text-xs font-medium"
            >
              <span className="inline-flex items-center justify-center gap-1">
                <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">{ICONOS.alerta}</span>
                {t('Exportar y eliminar')}
              </span>
            </button>
          </div>
        </section>
      ))}

      {confirmando && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={() => !eliminando && setConfirmando(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm rounded-2xl bg-white dark:bg-dark-surface shadow-elevated p-5 flex flex-col gap-3"
          >
            <p className="text-base font-semibold text-bad">{t('¿Eliminar TODOS los')} {t(CONFIG[confirmando].titulo).toLowerCase()}?</p>
            <p className="text-sm text-muted dark:text-dark-text-secondary">
              {t('Se descarga primero el CSV de respaldo y después se borran del sistema. No hay retorno atrás. Los que tengan ventas u otro historial vinculado quedan protegidos y no se tocan.')}
            </p>
            <p className="text-xs font-medium">
              {t('Para confirmar, escribí')} <span className="font-mono">ELIMINAR</span>:
            </p>
            <input
              value={textoConfirmacion}
              onChange={(e) => setTextoConfirmacion(e.target.value)}
              placeholder="ELIMINAR"
              autoFocus
              className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <div className="flex gap-2 mt-1">
              <button
                disabled={eliminando}
                onClick={() => setConfirmando(null)}
                className="flex-1 rounded-xl border border-border dark:border-dark-border py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {t('Cancelar')}
              </button>
              <button
                disabled={eliminando || textoConfirmacion.trim().toUpperCase() !== 'ELIMINAR'}
                onClick={exportarYEliminar}
                className="flex-1 rounded-xl bg-bad text-white py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {eliminando ? t('Eliminando...') : t('Exportar y eliminar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
