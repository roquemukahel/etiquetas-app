'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { obtenerTodasLasFilas } from '../lib/db';
import { asegurarModelo, normalizarNombreModelo } from '../lib/modelos';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { registrarAuditoria } from '../lib/auditoria';
import { getActor, useActor, MENSAJE_ACTOR_REQUERIDO } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { infoEstado } from '../lib/reparaciones';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import Avatar from '../Avatar';
import { ICONOS } from '../Iconos';
import { Boton, BotonIcono } from '../Boton';
import { useT } from '../lib/idioma';
import { useSucursalActual } from '../lib/sucursal';

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
  condicion: string | null;
  ubicacion_fisica: string | null;
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
  const actor = useActor();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const puedeEliminar = tienePermiso(actor, 'eliminar');
  const puedeRecibirServicioTecnico = tienePermiso(actor, 'recibir_servicio_tecnico');
  const puedeAgregarStock = tienePermiso(actor, 'agregar_stock');
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [derivados, setDerivados] = useState<ReparacionDerivada[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<Vista>('en_canje');
  const [procesando, setProcesando] = useState<string | null>(null);
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [editandoUbicacionId, setEditandoUbicacionId] = useState<string | null>(null);
  const [ubicacionInput, setUbicacionInput] = useState('');

  const cargar = async () => {
    const [c, r] = await Promise.all([
      obtenerTodasLasFilas<Canje>(supabase, 'canjes', '*, vendedores ( nombre, foto_url )', [{ columna: 'created_at', ascending: false }]),
      obtenerTodasLasFilas<ReparacionDerivada>(
        supabase,
        'reparaciones',
        'id, numero_orden, modelo, capacidad_gb, color, imei, estado, fecha_ingreso_servicio',
        [{ columna: 'fecha_ingreso_servicio', ascending: false }],
        (q) => q.not('canje_origen_id', 'is', null)
      ),
    ]);
    setCanjes(c);
    setDerivados(r);
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
    if (!puedeRecibirServicioTecnico) return;
    if (!confirm(t('¿Derivar este dispositivo a Servicio Técnico?'))) return;
    setProcesando(c.id);
    const { data: nueva } = await supabase
      .from('reparaciones')
      .insert({
        modelo: c.modelo,
        capacidad_gb: c.capacidad_gb,
        color: c.color,
        imei: c.imei,
        falla_declarada: c.detalles,
        ubicacion_fisica: c.ubicacion_fisica,
        estado: 'recibido',
        canje_origen_id: c.id,
        ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
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
    if (procesando || !puedeAgregarStock) return;
    if (!getActor()) {
      alert(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    if (c.imei) {
      const { data: existente } = await supabase.from('dispositivos').select('id').eq('imei', c.imei).maybeSingle();
      if (existente && !confirm(`${t('Ya hay un dispositivo en Stock con el IMEI')} ${c.imei}. ${t('¿Agregarlo igual?')}`)) return;
    }
    if (!confirm(t('¿Agregar este dispositivo al Stock para venderlo?'))) return;
    setProcesando(c.id);

    // Igual que en Compras: se reserva el canje ANTES de crear el
    // dispositivo, y solo si seguía con agregado_a_stock=false en ese
    // momento (condición evaluada en la base). Evita duplicar el
    // dispositivo si el mismo canje se procesa desde dos pestañas.
    const { data: actualizado, error: estadoErr } = await supabase
      .from('canjes')
      .update({ agregado_a_stock: true })
      .eq('id', c.id)
      .eq('agregado_a_stock', false)
      .select('id');
    if (estadoErr) {
      alert(`${t('No pudimos agregar al stock:')} ` + estadoErr.message);
      setProcesando(null);
      return;
    }
    if (!actualizado || actualizado.length === 0) {
      alert(t('Este canje ya había sido agregado al stock (quizás desde otra pestaña).'));
      setProcesando(null);
      cargar();
      return;
    }

    const actor = getActor();
    const modeloNormalizado = c.modelo ? normalizarNombreModelo(c.modelo) : c.modelo;
    const { error: insertError } = await supabase.from('dispositivos').insert({
      modelo: modeloNormalizado,
      capacidad_gb: c.capacidad_gb,
      color: c.color,
      imei: c.imei,
      salud_bateria: c.salud_bateria,
      estado: c.condicion || 'usado',
      en_stock: true,
      agregado_por_nombre: actor?.nombre ?? null,
      agregado_por_foto_url: actor?.fotoUrl ?? null,
      ...(sucursalActual.id ? { sucursal_id: sucursalActual.id } : {}),
    });
    if (insertError) {
      await supabase.from('canjes').update({ agregado_a_stock: false }).eq('id', c.id);
      alert(`${t('No pudimos agregar al stock:')} ` + insertError.message);
      setProcesando(null);
      return;
    }
    await asegurarModelo(supabase, modeloNormalizado);
    setProcesando(null);
    cargar();
  };

  const eliminar = async (c: Canje) => {
    if (!puedeEliminar) return;
    if (!confirm(t('¿Eliminar este dispositivo de Plan Canje? Esta acción no se puede deshacer.'))) return;
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

  const abrirEdicionUbicacion = (c: Canje) => {
    setEditandoUbicacionId(c.id);
    setUbicacionInput(c.ubicacion_fisica || '');
  };

  const guardarUbicacion = async (c: Canje) => {
    setProcesando(c.id);
    await supabase.from('canjes').update({ ubicacion_fisica: ubicacionInput.trim() || null }).eq('id', c.id);
    setEditandoUbicacionId(null);
    setProcesando(null);
    cargar();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">{t('Plan Canje')}</span>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setVista('en_canje')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'en_canje' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          {t('En canje')}
        </button>
        <button
          onClick={() => setVista('derivados')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'derivados' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          {t('Derivados')}
        </button>
        <button
          onClick={() => setVista('historial')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            vista === 'historial' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          {t('Historial')}
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}

      {vista === 'derivados' ? (
        <>
          {!loading && derivados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {t('Todavía no derivaste ningún canje a Servicio Técnico.')}
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
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${est.color}`}>{t(est.label)}</span>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {!loading && filtrados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {vista === 'historial' ? t('Todavía no agregaste ningún canje al stock.') : t('No hay dispositivos para mostrar acá.')}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {filtrados.map((c) => (
              <div key={c.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <MiniaturaDispositivo src={imagenPorNombreExacto(c.modelo, imagenesCarpetas)} />
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                        {c.modelo}
                        {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                        {c.color ? ` · ${c.color}` : ''}
                        {c.condicion === 'sellado' && (
                          <span className="text-[10px] font-bold text-black bg-gradient-to-b from-amber-300 to-amber-500 border border-black/40 rounded-full px-2 py-0.5">
                            ✦ {t('SELLADO')}
                          </span>
                        )}
                      </p>
                      {c.imei && (
                        <p className="text-xs text-muted dark:text-dark-text-secondary">
                          IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{c.imei}</span>
                        </p>
                      )}
                      {c.salud_bateria != null && <p className="text-xs text-muted dark:text-dark-text-secondary">{t('Batería:')} {c.salud_bateria}%</p>}
                    </div>
                  </div>
                  {c.monto != null && <p className="text-sm font-medium">${c.monto.toLocaleString('es-AR')}</p>}
                </div>
                <div className="text-xs text-muted dark:text-dark-text-secondary flex flex-col gap-0.5">
                  {c.detalles && <p>{t('Detalles:')} {c.detalles}</p>}
                  {c.vendedores?.nombre && (
                    <p className="flex items-center gap-1.5">
                      {t('Recibido por:')} <Avatar src={c.vendedores.foto_url} nombre={c.vendedores.nombre} size={34} /> {c.vendedores.nombre}
                    </p>
                  )}
                </div>

                {editandoUbicacionId === c.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={ubicacionInput}
                      onChange={(e) => setUbicacionInput(e.target.value)}
                      placeholder={t('Ej. Estante A-3, Tribuna')}
                      className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => guardarUbicacion(c)}
                      disabled={procesando === c.id}
                      className="text-xs font-medium text-accent dark:text-dark-accent shrink-0"
                    >
                      {t('Guardar')}
                    </button>
                    <button onClick={() => setEditandoUbicacionId(null)} className="text-xs text-muted dark:text-dark-text-secondary shrink-0">
                      {t('Cancelar')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => abrirEdicionUbicacion(c)}
                    className="self-start flex items-center gap-1 text-xs text-muted dark:text-dark-text-secondary hover:text-ink dark:hover:text-dark-text"
                  >
                    <span aria-hidden="true" className="[&_svg]:h-3.5 [&_svg]:w-3.5 inline-flex shrink-0">
                      {ICONOS.ubicacion}
                    </span>
                    {c.ubicacion_fisica || t('Agregar ubicación')}
                  </button>
                )}

                {vista === 'en_canje' && (
                  <div className="flex items-center gap-2 mt-1">
                    {puedeAgregarStock && (
                      <Boton
                        variante="primario"
                        tamano="sm"
                        cargando={procesando === c.id}
                        onClick={() => agregarAlStock(c)}
                        className="flex-1"
                      >
                        {t('Agregar al Stock')}
                      </Boton>
                    )}
                    {puedeRecibirServicioTecnico && (
                      <Boton
                        variante="secundario"
                        tamano="sm"
                        disabled={procesando === c.id}
                        onClick={() => derivar(c)}
                        className="flex-1"
                      >
                        {t('Derivar a Servicio Técnico')}
                      </Boton>
                    )}
                    {puedeEliminar && (
                      <BotonIcono
                        variante="peligro"
                        tamano="sm"
                        icono={ICONOS.papelera}
                        ariaLabel={t('Eliminar de Plan Canje')}
                        disabled={procesando === c.id}
                        onClick={() => eliminar(c)}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
