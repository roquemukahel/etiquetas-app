'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';
import {
  obtenerSucursales,
  crearSucursal,
  renombrarSucursal,
  activarSucursal,
  archivarSucursal,
  restaurarSucursal,
  contarEnSucursal,
  type Sucursal,
} from '../../lib/sucursales';
import { Boton, BotonIcono } from '../../Boton';
import { ICONOS } from '../../Iconos';
import { useT } from '../../lib/idioma';

// Fase 1 de multisucursal: activar el módulo (siembra "Sucursal principal"
// y vuelca ahí todo lo que ya existe, vía RPC activar_multisucursal — ver
// sucursales_supabase.sql), CRUD de sucursales, y desde acá también se
// entiende por qué Stock ya tiene un filtro por sucursal. Asignar sucursal
// a cada vendedor/técnico se hace en Configuración > Vendedores/Técnicos,
// no acá (mismo lugar donde ya se editan sus otros permisos).
export default function ConfiguracionSucursales() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puede = tienePermiso(actor, 'gestionar_usuarios');

  const [activo, setActivo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activando, setActivando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [archivadas, setArchivadas] = useState<Sucursal[]>([]);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const [nombreNueva, setNombreNueva] = useState('');
  const [creando, setCreando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEdit, setNombreEdit] = useState('');
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setLoading(false);
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('negocios ( multisucursal_activo )')
      .eq('id', user.id)
      .single();
    setActivo(!!(perfil as any)?.negocios?.multisucursal_activo);
    const [activasData, archivadasData] = await Promise.all([obtenerSucursales(supabase, false), obtenerSucursales(supabase, true)]);
    setSucursales(activasData);
    setArchivadas(archivadasData.filter((s) => s.archivada));
    setLoading(false);
  };

  useEffect(() => {
    if (puede) cargar();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puede]);

  const activar = async () => {
    setActivando(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('activar_multisucursal');
    setActivando(false);
    if (rpcError) {
      setError(`${t('No pudimos activar sucursales:')} ` + rpcError.message);
      return;
    }
    await registrarAuditoria(supabase, { accion: 'activó el módulo de sucursales', entidad: 'negocio' });
    await cargar();
  };

  const crear = async () => {
    if (!nombreNueva.trim()) return;
    setCreando(true);
    setError(null);
    const resultado = await crearSucursal(supabase, nombreNueva);
    setCreando(false);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `creó la sucursal "${nombreNueva.trim()}"`, entidad: 'sucursal', entidadId: resultado.id });
    setNombreNueva('');
    await cargar();
  };

  const guardarNombre = async (s: Sucursal) => {
    if (!nombreEdit.trim() || nombreEdit.trim() === s.nombre) {
      setEditandoId(null);
      return;
    }
    setProcesando(s.id);
    setError(null);
    const resultado = await renombrarSucursal(supabase, s.id, nombreEdit);
    setProcesando(null);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `renombró la sucursal "${s.nombre}" a "${nombreEdit.trim()}"`, entidad: 'sucursal', entidadId: s.id, valorAnterior: { nombre: s.nombre } });
    setEditandoId(null);
    await cargar();
  };

  const toggleActiva = async (s: Sucursal) => {
    setProcesando(s.id);
    await activarSucursal(supabase, s.id, !s.activa);
    setProcesando(null);
    await cargar();
  };

  const archivar = async (s: Sucursal) => {
    const conteo = await contarEnSucursal(supabase, s.id);
    const detalle =
      conteo.dispositivos + conteo.productos + conteo.personal > 0
        ? ` ${t('Tiene')} ${conteo.dispositivos} ${t('dispositivo(s),')} ${conteo.productos} ${t('producto(s) y')} ${conteo.personal} ${t('persona(s) asignada(s) — se conservan intactos, solo deja de ofrecerse para elegir.')}`
        : '';
    if (!confirm(`${t('¿Archivar la sucursal')} "${s.nombre}"?${detalle}`)) return;
    setProcesando(s.id);
    setError(null);
    const resultado = await archivarSucursal(supabase, s.id);
    setProcesando(null);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `archivó la sucursal "${s.nombre}"`, entidad: 'sucursal', entidadId: s.id });
    await cargar();
  };

  const restaurar = async (s: Sucursal) => {
    setProcesando(s.id);
    setError(null);
    const resultado = await restaurarSucursal(supabase, s.id, s.nombre);
    setProcesando(null);
    if ('error' in resultado) {
      setError(t(resultado.error));
      return;
    }
    await registrarAuditoria(supabase, { accion: `restauró la sucursal "${s.nombre}"`, entidad: 'sucursal', entidadId: s.id });
    await cargar();
  };

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para gestionar sucursales.')}</p>
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
        <span className="text-lg font-medium mr-auto">{t('Sucursales')}</span>
        {!loading && (
          <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${activo ? 'bg-good/15 text-good' : 'bg-muted/15 text-muted'}`}>
            {activo ? t('Activo') : t('Desactivado')}
          </span>
        )}
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>
      ) : !activo ? (
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-5 flex flex-col gap-3">
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            {t('Si tu negocio tiene más de un local, activá sucursales para que el stock, las ventas, el personal y el servicio técnico queden identificados por dónde pasaron. Todo lo que ya tenés cargado se agrupa automáticamente en una "Sucursal principal" — no se pierde ni se mueve nada.')}
          </p>
          <Boton variante="primario" cargando={activando} onClick={activar} className="self-start">
            {t('Activar sucursales')}
          </Boton>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted dark:text-dark-text-secondary">
            {t('Asigná a cada vendedor/técnico su sucursal desde Configuración → Vendedores/Técnicos. Quien no tenga una asignada (ej. el dueño) puede elegir en qué sucursal está trabajando desde el botón 🏬 que aparece abajo a la izquierda.')}
          </p>

          {/* Re-sincronizar: activar() es idempotente (activar_multisucursal
             solo toca filas con sucursal_id null) — si algún alta vieja quedó
             sin etiquetar (ej. antes de conectar un flujo nuevo al filtrado),
             este botón la agrupa en la Sucursal principal sin tocar nada ya
             etiquetado. Se deja visible siempre (no solo antes de activar)
             para que el dueño lo pueda volver a correr él mismo si algo
             aparece "vacío" donde no debería, sin necesitar SQL. */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border dark:border-dark-border bg-canvas dark:bg-dark-bg px-4 py-3">
            <p className="text-xs text-muted dark:text-dark-text-secondary">
              {t('¿Algo aparece vacío en una sucursal donde no debería? Volvé a sincronizar: agrupa en la Sucursal principal todo lo que haya quedado sin asignar.')}
            </p>
            <Boton variante="secundario" tamano="sm" cargando={activando} onClick={activar} className="shrink-0">
              {t('Volver a sincronizar')}
            </Boton>
          </div>

          <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-4 flex flex-col gap-3">
            <p className="text-sm font-medium">{t('Nueva sucursal')}</p>
            <input
              value={nombreNueva}
              onChange={(e) => setNombreNueva(e.target.value)}
              placeholder={t('Ej. Sucursal Centro')}
              className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
            />
            <Boton variante="primario" tamano="sm" cargando={creando} disabled={!nombreNueva.trim()} onClick={crear} className="self-start">
              + {t('Crear sucursal')}
            </Boton>
          </div>

          <div className="flex flex-col gap-2">
            {sucursales.map((s) => (
              <div key={s.id} className={`rounded-xl border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center gap-2 ${s.activa ? 'border-border dark:border-dark-border' : 'border-border dark:border-dark-border opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  {editandoId === s.id ? (
                    <input
                      value={nombreEdit}
                      onChange={(e) => setNombreEdit(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && guardarNombre(s)}
                      autoFocus
                      className="w-full bg-white dark:bg-dark-surface border border-accent dark:border-dark-accent rounded-lg px-2 py-1 text-sm"
                    />
                  ) : (
                    <button onClick={() => { setEditandoId(s.id); setNombreEdit(s.nombre); }} className="text-sm font-medium text-left">
                      {s.nombre}
                    </button>
                  )}
                  {!s.activa && <p className="text-[11px] text-muted dark:text-dark-text-secondary">{t('Inactiva')}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editandoId === s.id ? (
                    <BotonIcono icono={ICONOS.check} ariaLabel={t('Guardar nombre')} variante="ghost" tamano="sm" disabled={procesando === s.id} onClick={() => guardarNombre(s)} />
                  ) : (
                    <BotonIcono icono={ICONOS.editar} ariaLabel={t('Renombrar')} variante="ghost" tamano="sm" onClick={() => { setEditandoId(s.id); setNombreEdit(s.nombre); }} />
                  )}
                  <label className="flex items-center gap-1 text-[11px] text-muted dark:text-dark-text-secondary px-1 cursor-pointer">
                    <input type="checkbox" checked={s.activa} disabled={procesando === s.id} onChange={() => toggleActiva(s)} className="h-3.5 w-3.5 accent-ink" />
                    {t('Activa')}
                  </label>
                  <BotonIcono icono={ICONOS.papelera} ariaLabel={`${t('Archivar')} ${s.nombre}`} variante="peligro" tamano="sm" disabled={procesando === s.id} onClick={() => archivar(s)} />
                </div>
              </div>
            ))}
            {sucursales.length === 0 && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-2">{t('No quedan sucursales activas.')}</p>}
          </div>

          {archivadas.length > 0 && (
            <div className="flex flex-col gap-2">
              <button onClick={() => setVerArchivadas((v) => !v)} className="text-xs text-accent dark:text-dark-accent underline self-start">
                {verArchivadas ? t('Ocultar') : t('Ver')} {t('archivadas')} ({archivadas.length})
              </button>
              {verArchivadas &&
                archivadas.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface px-4 py-3 flex items-center justify-between gap-2 opacity-70">
                    <p className="text-sm">{s.nombre}</p>
                    <Boton variante="secundario" tamano="sm" disabled={procesando === s.id} onClick={() => restaurar(s)}>
                      {t('Restaurar')}
                    </Boton>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
