'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { asegurarModelo } from '../lib/modelos';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { registrarAuditoria } from '../lib/auditoria';
import { infoEstado } from '../lib/reparaciones';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import Avatar from '../Avatar';

type Canje = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  salud_bateria: number | null;
  detalles: string | null;
  monto: number | null;
  estado: string;
  agregado_a_stock: boolean;
  oculto_en_canje: boolean;
  vendedores: { nombre: string; foto_url: string | null } | null;
};

type ReparacionDerivada = {
  id: string;
  numero_orden: string | null;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  estado: string;
  fecha_ingreso_servicio: string;
};

type Vista = 'en_canje' | 'derivados' | 'historial';

export default function PlanCanje() {
  const supabase = crearClienteNavegador();
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [derivados, setDerivados] = useState<ReparacionDerivada[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('en_canje');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());

  const cargar = async () => {
    const [{ data: c }, { data: r }] = await Promise.all([
      supabase.from('canjes').select('*, vendedores ( nombre, foto_url )').order('created_at', { ascending: false }),
      supabase
        .from('reparaciones')
        .select('id, numero_orden, modelo, capacidad_gb, color, imei, estado, fecha_ingreso_servicio')
        .not('canje_origen_id', 'is', null)
        .order('fecha_ingreso_servicio', { ascending: false }),
    ]);
    setCanjes((c as any) ?? []);
    setDerivados((r as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
  }, []);

  const filtrados = useMemo(() => {
    if (vista === 'historial') return canjes.filter((c) => c.agregado_a_stock);
    return canjes.filter((c) => c.estado === 'en_canje' && !c.agregado_a_stock && !c.oculto_en_canje);
  }, [canjes, vista]);

  // Ya no cambia el estado del canje: crea una reparación nueva en
  // Servicio Técnico (vinculada por canje_origen_id) y solo oculta el
  // canje de Plan Canje, sin tocarlo — preserva vendedor_id/monto del
  // canje original para las estadísticas de Plan Canje.
  const derivar = async (c: Canje) => {
    if (!confirm('¿Derivar este dispositivo a Servicio Técnico?')) return;
    setProcesando(c.id);
    const { data: nueva } = await supabase
      .from('reparaciones')
      .insert({
        modelo: c.modelo,
        capacidad_gb: c.capacidad_gb,
        color: c.color,
        imei: c.imei,
        falla_declarada: c.detalles,
        estado: 'recibido',
        canje_origen_id: c.id,
      })
      .select('id, numero_orden')
      .single();
    await supabase.from('canjes').update({ oculto_en_canje: true }).eq('id', c.id);
    await registrarAuditoria(supabase, {
      accion: `derivó a Servicio Técnico un dispositivo de Plan Canje (${nueva?.numero_orden || ''}, ${c.modelo || 'sin modelo'}${c.imei ? `, IMEI ${c.imei}` : ''})`,
      entidad: 'reparacion',
      entidadId: nueva?.id,
    });
    setProcesando(null);
    cargar();
  };

  const agregarAlStock = async (c: Canje) => {
    if (procesando) return;
    if (c.imei) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', c.imei).maybeSingle();
      if (existente && !confirm(`Ya hay un dispositivo en Stock con el IMEI ${c.imei}. ¿Agregarlo igual?`)) return;
    }
    if (!confirm('¿Agregar este dispositivo al Stock para venderlo?')) return;
    setProcesando(c.id);
    await supabase.from('dispositivos').insert({
      modelo: c.modelo,
      capacidad_gb: c.capacidad_gb,
      color: c.color,
      imei: c.imei,
      salud_bateria: c.salud_bateria,
      estado: 'usado',
      en_stock: true,
    });
    await asegurarModelo(supabase, c.modelo);
    // No se borra: queda con agregado_a_stock=true, así aparece en
    // "Historial" en vez de desaparecer sin dejar rastro.
    await supabase.from('canjes').update({ agregado_a_stock: true }).eq('id', c.id);
    setProcesando(null);
    cargar();
  };

  const eliminar = async (c: Canje) => {
    if (!confirm('¿Eliminar este dispositivo de Plan Canje? Esta acción no se puede deshacer.')) return;
    setProcesando(c.id);
    await supabase.from('canjes').delete().eq('id', c.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó de Plan Canje un dispositivo (${c.modelo || 'sin modelo'}${c.imei ? `, IMEI ${c.imei}` : ''})`,
      entidad: 'canje',
      entidadId: c.id,
      valorAnterior: { modelo: c.modelo, capacidad_gb: c.capacidad_gb, color: c.color, imei: c.imei, monto: c.monto },
    });
    setProcesando(null);
    cargar();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Plan Canje</span>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setVista('en_canje')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'en_canje' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          En canje
        </button>
        <button
          onClick={() => setVista('derivados')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'derivados' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Derivados
        </button>
        <button
          onClick={() => setVista('historial')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'historial' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Historial
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}

      {vista === 'derivados' ? (
        <>
          {!loading && derivados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              Todavía no derivaste ningún canje a Servicio Técnico.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {derivados.map((r) => {
              const est = infoEstado(r.estado);
              return (
                <Link
                  key={r.id}
                  href={`/servicio-tecnico/${r.id}`}
                  className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MiniaturaDispositivo src={imagenPorNombreExacto(r.modelo, imagenesCarpetas)} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.numero_orden} · {r.modelo}
                        {r.capacidad_gb ? ` · ${r.capacidad_gb}GB` : ''}
                        {r.color ? ` · ${r.color}` : ''}
                      </p>
                      {r.imei && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">
                          IMEI: <span className="font-bold font-mono">{r.imei}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${est.color}`}>{est.label}</span>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {!loading && filtrados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {vista === 'historial' ? 'Todavía no agregaste ningún canje al stock.' : 'No hay dispositivos para mostrar acá.'}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {filtrados.map((c) => (
              <div key={c.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <MiniaturaDispositivo src={imagenPorNombreExacto(c.modelo, imagenesCarpetas)} />
                    <div>
                      <p className="text-sm font-medium">
                        {c.modelo}
                        {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                        {c.color ? ` · ${c.color}` : ''}
                      </p>
                      {c.imei && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">
                          IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{c.imei}</span>
                        </p>
                      )}
                      {c.salud_bateria != null && <p className="text-xs text-muted dark:text-dark-text-secondary">Batería: {c.salud_bateria}%</p>}
                    </div>
                  </div>
                  {c.monto != null && <p className="text-sm font-medium">${c.monto.toLocaleString('es-AR')}</p>}
                </div>
                <div className="text-xs text-muted dark:text-dark-text-secondary flex flex-col gap-0.5">
                  {c.detalles && <p>Detalles: {c.detalles}</p>}
                  {c.vendedores?.nombre && (
                    <p className="flex items-center gap-1.5">
                      Recibido por: <Avatar src={c.vendedores.foto_url} nombre={c.vendedores.nombre} size={34} /> {c.vendedores.nombre}
                    </p>
                  )}
                </div>
                {vista === 'en_canje' && (
                  <div className="flex gap-2 mt-1">
                    <button
                      disabled={procesando === c.id}
                      onClick={() => agregarAlStock(c)}
                      className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {procesando === c.id ? 'Agregando...' : 'Agregar al Stock'}
                    </button>
                    <button
                      disabled={procesando === c.id}
                      onClick={() => derivar(c)}
                      className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-xs font-medium disabled:opacity-40"
                    >
                      Derivar a Servicio Técnico
                    </button>
                  </div>
                )}
                {vista === 'en_canje' && (
                  <button
                    disabled={procesando === c.id}
                    onClick={() => eliminar(c)}
                    className="rounded-lg border border-bad/30 py-2 text-xs font-medium text-bad disabled:opacity-40"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
