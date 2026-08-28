'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import { obtenerSucursales, type Sucursal } from '../../lib/sucursales';
import { asegurarCajasPredeterminadas, obtenerCajas, renombrarCaja, type Caja } from '../../lib/caja/servicio';
import { NOMBRE_CAJA } from '../../lib/caja/motor';
import { Boton, BotonIcono } from '../../Boton';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';

// null representa "sin sucursal" (negocio sin multisucursal activada) —
// mismo criterio que el resto de la app (pagos.sucursal_id, etc.).
type Grupo = { sucursal: Sucursal | null; cajas: Caja[] };

export default function ConfiguracionCajas() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puede = tienePermiso(actor, 'gestionar_egresos');

  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    let sucursales: Sucursal[] = [];
    try {
      sucursales = await obtenerSucursales(supabase, false);
    } catch {
      // Tabla sucursales todavía no existe en este negocio — un solo grupo sin sucursal.
    }
    const listaSucursales: (Sucursal | null)[] = sucursales.length > 0 ? sucursales : [null];
    await Promise.all(listaSucursales.map((s) => asegurarCajasPredeterminadas(supabase, s?.id ?? null)));
    const nuevosGrupos = await Promise.all(
      listaSucursales.map(async (s) => ({ sucursal: s, cajas: await obtenerCajas(supabase, s?.id ?? null) }))
    );
    setGrupos(nuevosGrupos);
    setLoading(false);
  };

  useEffect(() => {
    if (puede) cargar();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede]);

  const guardarNombre = async (c: Caja) => {
    if (!nombreEdit.trim() || nombreEdit.trim() === c.nombre) {
      setEditandoId(null);
      return;
    }
    setProcesando(c.id);
    setError(null);
    const { error: err } = await renombrarCaja(supabase, c.id, nombreEdit);
    setProcesando(null);
    if (err) {
      setError(err);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `renombró la caja "${c.nombre}" a "${nombreEdit.trim()}"`,
      entidad: 'caja',
      entidadId: c.id,
      valorAnterior: { nombre: c.nombre },
    });
    setEditandoId(null);
    await cargar();
  };

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para gestionar las cajas.')}</p>
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
        <span className="text-lg font-medium">{t('Cajas')}</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        {t('Cada sucursal trabaja con 2 cajas simultáneas: Venta diaria (ventas de productos y pagos de reparaciones) y Financiamiento (anticipos de crédito nuevo, cuotas y cobranzas de cuenta corriente). Podés renombrarlas, no eliminarlas ni agregar más por ahora.')}
      </p>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {grupos.map((g) => (
            <div key={g.sucursal?.id ?? 'sin-sucursal'} className="flex flex-col gap-2">
              {g.sucursal && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary flex items-center gap-1">
                  🏬 {g.sucursal.nombre}
                </p>
              )}
              {g.cajas.map((c) => (
                <div key={c.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted dark:text-dark-text-secondary uppercase tracking-wide">{t(NOMBRE_CAJA[c.tipo])}</p>
                    {editandoId === c.id ? (
                      <input
                        value={nombreEdit}
                        onChange={(e) => setNombreEdit(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && guardarNombre(c)}
                        autoFocus
                        className="w-full bg-white dark:bg-dark-surface border border-accent dark:border-dark-accent rounded-lg px-2 py-1 text-sm mt-0.5"
                      />
                    ) : (
                      <button onClick={() => { setEditandoId(c.id); setNombreEdit(c.nombre); }} className="text-sm font-medium text-left">
                        {c.nombre}
                      </button>
                    )}
                  </div>
                  {editandoId === c.id ? (
                    <BotonIcono icono={ICONOS.check} ariaLabel={t('Guardar nombre')} variante="ghost" tamano="sm" disabled={procesando === c.id} onClick={() => guardarNombre(c)} />
                  ) : (
                    <BotonIcono icono={ICONOS.editar} ariaLabel={t('Renombrar')} variante="ghost" tamano="sm" onClick={() => { setEditandoId(c.id); setNombreEdit(c.nombre); }} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-border dark:border-dark-border p-4 flex items-center justify-between gap-3 opacity-60 mt-2">
        <div>
          <p className="text-sm font-medium">{t('Caja única (sin separar Venta diaria/Financiamiento)')}</p>
          <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Próximamente — hoy la operación siempre usa las 2 cajas separadas.')}</p>
        </div>
        <Boton variante="secundario" tamano="sm" disabled>
          {t('Próximamente')}
        </Boton>
      </div>
    </main>
  );
}
