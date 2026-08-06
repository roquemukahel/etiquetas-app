'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import { registrarAuditoria } from '../../lib/auditoria';

// Configuración rápida: enciende el módulo y crea/actualiza un plan general con
// dos reglas (minorista %, mayorista %). Usa el MISMO motor de reglas que el
// modo avanzado — no hay dos sistemas. La configuración avanzada (más planes y
// reglas por producto/tipo) vive en la sección Comisiones → Planes.
export default function ConfiguracionComisiones() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puede = tienePermiso(actor, 'gestionar_comisiones');

  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [activas, setActivas] = useState(false);
  const [desde, setDesde] = useState<string>('');
  const [minorista, setMinorista] = useState('2');
  const [mayorista, setMayorista] = useState('0.5');
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocio_id, negocios ( comisiones_activas, comisiones_desde, comision_plan_default_id )')
        .eq('id', user.id)
        .single();
      const neg = (perfil as any)?.negocios;
      setNegocioId((perfil as any)?.negocio_id ?? null);
      setActivas(!!neg?.comisiones_activas);
      setDesde(neg?.comisiones_desde ?? new Date().toISOString().slice(0, 10));
      const pid = neg?.comision_plan_default_id ?? null;
      setPlanId(pid);
      if (pid) {
        const { data: reglas } = await supabase
          .from('comision_reglas')
          .select('alcance, valor, tipo_calculo')
          .eq('plan_id', pid);
        const min = (reglas ?? []).find((r) => r.alcance === 'minorista');
        const may = (reglas ?? []).find((r) => r.alcance === 'mayorista');
        if (min) setMinorista(String(min.valor));
        if (may) setMayorista(String(may.valor));
      }
      setLoading(false);
    })();
  }, []);

  const pct = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '');

  const guardar = async (encender: boolean) => {
    if (!negocioId || !puede) return;
    setGuardando(true);
    setError(null);
    setOk(false);
    try {
      const nMin = Number(pct(minorista)) || 0;
      const nMay = Number(pct(mayorista)) || 0;

      // 1. Plan general (reutiliza el default si existe; si no, lo crea).
      let pid = planId;
      if (!pid) {
        const { data: plan, error: ePlan } = await supabase
          .from('comision_planes')
          .insert({ nombre: 'Plan general', descripcion: 'Comisiones minorista y mayorista', es_default: true, vigencia_desde: desde, creado_por: actor?.nombre ?? null })
          .select('id')
          .single();
        if (ePlan || !plan) throw new Error(ePlan?.message || 'No se pudo crear el plan');
        pid = plan.id;
      } else {
        await supabase.from('comision_planes').update({ es_default: true, updated_at: new Date().toISOString() }).eq('id', pid);
      }

      // 2. Reglas minorista/mayorista: se reemplazan (borrar + insertar) para que
      //    queden exactamente las dos del asistente rápido.
      await supabase.from('comision_reglas').delete().eq('plan_id', pid).in('alcance', ['minorista', 'mayorista']);
      const { error: eReglas } = await supabase.from('comision_reglas').insert([
        { plan_id: pid, tipo_calculo: 'porcentaje_venta', valor: nMin, alcance: 'minorista' },
        { plan_id: pid, tipo_calculo: 'porcentaje_venta', valor: nMay, alcance: 'mayorista' },
      ]);
      if (eReglas) throw new Error(eReglas.message);

      // Subir la versión del plan: las comisiones YA generadas conservan la
      // versión anterior (histórico intacto); las nuevas usan la nueva.
      const { data: pl } = await supabase.from('comision_planes').select('version').eq('id', pid).single();
      await supabase.from('comision_planes').update({ version: ((pl?.version as number) || 1) + 1 }).eq('id', pid);

      // 3. Config del negocio.
      const { error: eNeg } = await supabase
        .from('negocios')
        .update({ comisiones_activas: encender, comisiones_desde: desde || null, comision_plan_default_id: pid })
        .eq('id', negocioId);
      if (eNeg) throw new Error(eNeg.message);

      await registrarAuditoria(supabase, {
        accion: encender
          ? `activó/actualizó las comisiones (minorista ${nMin}%, mayorista ${nMay}%, desde ${desde})`
          : 'desactivó el sistema de comisiones',
        entidad: 'negocio',
        entidadId: negocioId,
        valorNuevo: { comisiones_activas: encender, minorista: nMin, mayorista: nMay, desde },
      });

      setActivas(encender);
      setPlanId(pid);
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e: any) {
      setError(e?.message || 'No pudimos guardar.');
    } finally {
      setGuardando(false);
    }
  };

  if (!loading && !puede) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para configurar comisiones.</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">Volver</Link>
      </main>
    );
  }

  const previewMin = Math.round(100000 * (Number(pct(minorista)) || 0) / 100);

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">&larr;</Link>
        <span className="text-lg font-medium mr-auto">Comisiones</span>
        {!loading && (
          <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${activas ? 'bg-good/15 text-good' : 'bg-muted/15 text-muted'}`}>
            {activas ? 'Activo' : 'Desactivado'}
          </span>
        )}
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted dark:text-dark-text-secondary">
            Poné el <strong>porcentaje de comisión</strong> del vendedor sobre la venta, según sea minorista o mayorista.
            Se aplica a las ventas confirmadas <strong>desde la fecha de activación</strong> (las anteriores no generan comisión).
          </p>

          <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 flex flex-col gap-3">
            <Fila label="Comisión en ventas minoristas" valor={minorista} onChange={setMinorista} />
            <Fila label="Comisión en ventas mayoristas" valor={mayorista} onChange={setMayorista} />
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium">Empieza a regir</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-xl bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border px-4 py-3 text-xs text-muted dark:text-dark-text-secondary">
            Ejemplo: una venta minorista neta de <strong>$100.000</strong> con {Number(pct(minorista)) || 0}% →
            comisión de <strong>${previewMin.toLocaleString('es-AR')}</strong> para el vendedor.
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              disabled={guardando}
              onClick={() => guardar(true)}
              className="flex-1 rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-3.5 text-center text-sm font-medium text-white disabled:opacity-40"
            >
              {guardando ? 'Guardando...' : ok ? '✓ Guardado' : activas ? 'Guardar cambios' : 'Activar comisiones'}
            </button>
            {activas && (
              <button
                disabled={guardando}
                onClick={() => guardar(false)}
                className="rounded-2xl border border-border dark:border-dark-border py-3.5 px-5 text-center text-sm font-medium disabled:opacity-40"
              >
                Desactivar
              </button>
            )}
          </div>

          {activas && (
            <Link href="/comisiones" className="text-sm text-accent dark:text-dark-accent underline text-center">
              Ir al panel de comisiones →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}

function Fila({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm font-medium flex-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
          inputMode="decimal"
          className="w-24 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm text-right"
        />
        <span className="text-sm text-muted dark:text-dark-text-secondary">%</span>
      </div>
    </div>
  );
}
