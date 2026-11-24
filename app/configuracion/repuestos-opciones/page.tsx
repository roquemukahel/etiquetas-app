'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { obtenerTodasLasFilas } from '../../lib/db';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import {
  CALIDADES_PREDETERMINADAS,
  borrarOpcionRepuesto,
  contarUsos,
  crearOpcionRepuesto,
  importarOpcionesRepuestos,
  obtenerOpcionesRepuestos,
  opcionesFaltantes,
  renombrarOpcionRepuesto,
  type OpcionRepuesto,
  type TipoOpcionRepuesto,
} from '../../lib/repuestosOpciones';
import { Boton, BotonIcono } from '../../Boton';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';

type UsoRepuesto = { categoria: string | null; calidad: string | null };

export default function OpcionesRepuestos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puede = tienePermiso(actor, 'agregar_stock');

  const [usos, setUsos] = useState<UsoRepuesto[]>([]);
  const [cargandoUsos, setCargandoUsos] = useState(true);

  useEffect(() => {
    if (!puede) {
      setCargandoUsos(false);
      return;
    }
    (async () => {
      // Solo las dos columnas de texto (sin fotos ni nada pesado) y paginado:
      // sirve para contar cuántos repuestos usa cada opción.
      setUsos(await obtenerTodasLasFilas<UsoRepuesto>(supabase, 'repuestos', 'categoria, calidad', []));
      setCargandoUsos(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede]);

  if (!puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para administrar los repuestos.')}</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          {t('Volver')}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-5 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Calidades y categorías de repuestos')}</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {t('Usá los nombres que manejás con tus proveedores. Si renombrás una, cambia en todos los repuestos que ya la tienen; si la borrás, esos repuestos quedan sin especificar (no se borran).')}
      </p>

      <SeccionOpciones
        tipo="calidad"
        titulo={t('Calidades')}
        ejemplo={t('Ej. Premium')}
        valoresPorDefecto={CALIDADES_PREDETERMINADAS}
        usos={usos.map((u) => u.calidad)}
        cargandoUsos={cargandoUsos}
        alCambiar={async () => setUsos(await obtenerTodasLasFilas<UsoRepuesto>(supabase, 'repuestos', 'categoria, calidad', []))}
      />
      <SeccionOpciones
        tipo="categoria"
        titulo={t('Categorías')}
        ejemplo={t('Ej. Pantalla')}
        valoresPorDefecto={[]}
        usos={usos.map((u) => u.categoria)}
        cargandoUsos={cargandoUsos}
        alCambiar={async () => setUsos(await obtenerTodasLasFilas<UsoRepuesto>(supabase, 'repuestos', 'categoria, calidad', []))}
      />
    </main>
  );
}

function SeccionOpciones({
  tipo,
  titulo,
  ejemplo,
  valoresPorDefecto,
  usos,
  cargandoUsos,
  alCambiar,
}: {
  tipo: TipoOpcionRepuesto;
  titulo: string;
  ejemplo: string;
  valoresPorDefecto: string[];
  usos: (string | null)[];
  cargandoUsos: boolean;
  alCambiar: () => Promise<void>;
}) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [opciones, setOpciones] = useState<OpcionRepuesto[]>([]);
  const [disponible, setDisponible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nombreNueva, setNombreNueva] = useState('');
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  const cargar = async () => {
    const r = await obtenerOpcionesRepuestos(supabase, tipo);
    setOpciones(r.opciones);
    setDisponible(r.disponible);
    setLoading(false);
  };
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conteo = useMemo(() => contarUsos(usos), [usos]);
  const usosDe = (nombre: string) => conteo.get(nombre.trim().toLowerCase()) ?? 0;
  const faltantes = useMemo(() => opcionesFaltantes(opciones.map((o) => o.nombre), usos), [opciones, usos]);
  const siguienteOrden = opciones.reduce((max, o) => Math.max(max, o.orden), -1) + 1;
  const etiquetaTipo = tipo === 'calidad' ? 'calidad' : 'categoría';

  const crear = async () => {
    if (!nombreNueva.trim()) return;
    setCreando(true);
    setError(null);
    setAviso(null);
    const resultado = await crearOpcionRepuesto(supabase, tipo, nombreNueva, siguienteOrden);
    setCreando(false);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `creó la ${etiquetaTipo} de repuestos "${nombreNueva.trim()}"`, entidad: 'repuesto_opcion', entidadId: resultado.id });
    setNombreNueva('');
    await cargar();
  };

  const guardarNombre = async (o: OpcionRepuesto) => {
    const nuevo = nombreEdit.trim();
    if (!nuevo || nuevo === o.nombre) {
      setEditandoId(null);
      return;
    }
    const otra = opciones.find((x) => x.id !== o.id && x.nombre.trim().toLowerCase() === nuevo.toLowerCase());
    // "Pantalla" → "pantalla" (solo cambia el uso de mayúsculas) no es unificar.
    if (otra && !confirm(`"${otra.nombre}" ${t('ya existe. ¿Unificarlas? Los repuestos de')} "${o.nombre}" ${t('pasan a')} "${nuevo}".`)) return;
    setProcesando(o.id);
    setError(null);
    setAviso(null);
    const resultado = await renombrarOpcionRepuesto(supabase, o.id, nuevo);
    setProcesando(null);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `${otra ? 'unificó' : 'renombró'} la ${etiquetaTipo} de repuestos "${o.nombre}" a "${nuevo}" (${resultado.actualizados} repuestos)`,
      entidad: 'repuesto_opcion',
      entidadId: o.id,
      valorAnterior: { nombre: o.nombre },
    });
    setAviso(`${t('Listo. Se actualizaron')} ${resultado.actualizados} ${t('repuestos.')}`);
    setEditandoId(null);
    await Promise.all([cargar(), alCambiar()]);
  };

  const borrar = async (o: OpcionRepuesto) => {
    const enUso = usosDe(o.nombre);
    const detalle = enUso > 0 ? ` ${enUso} ${t('repuesto(s) la usan: van a quedar sin especificar (no se borran).')}` : '';
    if (!confirm(`${t('¿Borrar')} "${o.nombre}"?${detalle}`)) return;
    setProcesando(o.id);
    setError(null);
    setAviso(null);
    const resultado = await borrarOpcionRepuesto(supabase, o.id);
    setProcesando(null);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `borró la ${etiquetaTipo} de repuestos "${o.nombre}" (${resultado.actualizados} repuestos quedaron sin ${etiquetaTipo})`,
      entidad: 'repuesto_opcion',
      entidadId: o.id,
      valorAnterior: { nombre: o.nombre },
    });
    await Promise.all([cargar(), alCambiar()]);
  };

  const importar = async (nombres: string[]) => {
    setImportando(true);
    setError(null);
    setAviso(null);
    const { error: err } = await importarOpcionesRepuestos(supabase, tipo, nombres, siguienteOrden);
    setImportando(false);
    if (err) {
      setError(err);
      return;
    }
    await cargar();
  };

  if (!loading && !disponible) {
    return (
      <section className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted dark:text-dark-text-secondary mt-1">
          {t('Esta función todavía se está activando en tu cuenta. Mientras tanto se usan las opciones de siempre.')}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
      {aviso && <p className="text-sm text-good bg-good/10 rounded-lg px-3 py-2">{aviso}</p>}

      <div className="flex gap-2">
        <input
          value={nombreNueva}
          onChange={(e) => setNombreNueva(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && crear()}
          placeholder={ejemplo}
          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
        />
        <Boton variante="primario" tamano="sm" cargando={creando} disabled={!nombreNueva.trim()} onClick={crear}>
          + {t('Agregar')}
        </Boton>
      </div>

      {!cargandoUsos && faltantes.length > 0 && (
        <div className="rounded-xl border border-dashed border-accent/50 dark:border-dark-accent/50 px-3 py-2.5 flex flex-col gap-2">
          <p className="text-xs">
            {t('Tus repuestos ya usan')} {faltantes.length} {t('que no están en la lista:')} <span className="font-medium">{faltantes.join(', ')}</span>
          </p>
          <Boton variante="secundario" tamano="sm" cargando={importando} onClick={() => importar(faltantes)}>
            {t('Agregarlas a la lista')}
          </Boton>
        </div>
      )}

      {!loading && opciones.length === 0 && valoresPorDefecto.length > 0 && (
        <div className="rounded-xl border border-dashed border-border dark:border-dark-border px-3 py-2.5 flex flex-col gap-2">
          <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Todavía no cargaste ninguna. Podés empezar con las de siempre:')} {valoresPorDefecto.join(', ')}</p>
          <Boton variante="secundario" tamano="sm" cargando={importando} onClick={() => importar(valoresPorDefecto)}>
            {t('Cargar las de siempre')}
          </Boton>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center">{t('Cargando...')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {opciones.map((o) => (
            <div key={o.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                {editandoId === o.id ? (
                  <input
                    value={nombreEdit}
                    onChange={(e) => setNombreEdit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') guardarNombre(o);
                      if (e.key === 'Escape') setEditandoId(null);
                    }}
                    autoFocus
                    className="w-full bg-white dark:bg-dark-surface border border-accent dark:border-dark-accent rounded-lg px-2 py-1 text-sm"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditandoId(o.id);
                      setNombreEdit(o.nombre);
                    }}
                    className="text-sm font-medium text-left"
                  >
                    {o.nombre}
                  </button>
                )}
                <p className="text-[11px] text-muted dark:text-dark-text-secondary">
                  {cargandoUsos ? '…' : `${usosDe(o.nombre)} ${t('repuestos')}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editandoId === o.id ? (
                  <BotonIcono icono={ICONOS.check} ariaLabel={t('Guardar nombre')} variante="ghost" tamano="sm" disabled={procesando === o.id} onClick={() => guardarNombre(o)} />
                ) : (
                  <BotonIcono
                    icono={ICONOS.editar}
                    ariaLabel={t('Renombrar')}
                    variante="ghost"
                    tamano="sm"
                    onClick={() => {
                      setEditandoId(o.id);
                      setNombreEdit(o.nombre);
                    }}
                  />
                )}
                <BotonIcono icono={ICONOS.papelera} ariaLabel={`${t('Borrar')} ${o.nombre}`} variante="peligro" tamano="sm" disabled={procesando === o.id} onClick={() => borrar(o)} />
              </div>
            </div>
          ))}
          {opciones.length === 0 && valoresPorDefecto.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center">{t('Todavía no creaste ninguna.')}</p>
          )}
        </div>
      )}
    </section>
  );
}
