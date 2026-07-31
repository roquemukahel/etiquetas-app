'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { asegurarModelo } from '../lib/modelos';
import { limpiarImei } from '../lib/imei';
import { armarLinkWhatsApp, mensajeSeguimientoServicio, mensajeListoServicio } from '../lib/whatsapp';
import { codigoLlamada } from '../lib/paises';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { registrarAuditoria } from '../lib/auditoria';
import { obtenerTodasLasFilas } from '../lib/db';
import MiniaturaDispositivo from '../MiniaturaDispositivo';
import Avatar from '../Avatar';

const STORAGE_OPTIONS = [64, 128, 256, 512];

type Tecnico = { id: string; nombre: string; foto_url: string | null };
type Trabajo = { id: string; nombre: string; imagen_url: string | null };
type Cliente = { id: string; nombre: string; apellido: string | null; telefono: string | null };

type Equipo = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
  detalles: string | null;
  tecnico_id: string | null;
  estado: string;
  trabajos_realizados: string[] | null;
  fecha_ingreso_servicio: string | null;
  fecha_reparado: string | null;
  cliente_id: string | null;
  token_seguimiento: string | null;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
};

function formatearFecha(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-AR');
}

export default function ServicioTecnico() {
  const supabase = crearClienteNavegador();
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'derivados' | 'reparados' | 'tecnicos'>('derivados');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [panelReparar, setPanelReparar] = useState<string | null>(null);
  const [seleccionTrabajos, setSeleccionTrabajos] = useState<string[]>([]);
  const [tecnicoSeleccionado, setTecnicoSeleccionado] = useState<string | null>(null);

  const [carpetasStock, setCarpetasStock] = useState<string[]>([]);
  const [panelNuevo, setPanelNuevo] = useState(false);
  const [nuevoModelo, setNuevoModelo] = useState('');
  const [nuevaCapacidad, setNuevaCapacidad] = useState<number | null>(null);
  const [nuevoColor, setNuevoColor] = useState('');
  const [nuevoImei, setNuevoImei] = useState('');
  const [nuevoDetalles, setNuevoDetalles] = useState('');
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteInput, setClienteInput] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [avisoWhatsApp, setAvisoWhatsApp] = useState<{ link: string; nombre: string; tipo: 'agregado' | 'reparado' } | null>(
    null
  );
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());
  const [codigoPais, setCodigoPais] = useState('54');

  const cargar = async () => {
    const { data } = await supabase
      .from('canjes')
      .select(
        'id, modelo, capacidad_gb, color, imei, detalles, tecnico_id, estado, trabajos_realizados, fecha_ingreso_servicio, fecha_reparado, cliente_id, token_seguimiento, clientes ( nombre, apellido, telefono )'
      )
      .in('estado', ['servicio_tecnico', 'reparado'])
      .order('created_at', { ascending: false });
    setEquipos((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      const { data } = await supabase.from('tecnicos').select('id, nombre, foto_url').order('nombre');
      setTecnicos((data as Tecnico[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('trabajos').select('id, nombre, imagen_url').order('nombre');
      setTrabajos((data as Trabajo[]) ?? []);
    })();
    (async () => {
      const { data } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      setCarpetasStock((data ?? []).map((m) => m.nombre));
    })();
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
    (async () => {
      setClientes(await obtenerTodasLasFilas<Cliente>(supabase, 'clientes', 'id, nombre, apellido, telefono', [{ columna: 'nombre' }]));
    })();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase.from('perfiles').select('negocios ( pais )').eq('id', user.id).single();
      setCodigoPais(codigoLlamada((perfil as any)?.negocios?.pais));
    })();
  }, []);

  const nombreCompleto = (c: Cliente) => `${c.nombre} ${c.apellido || ''}`.trim();
  const clienteCoincidente = useMemo(
    () => clientes.find((c) => nombreCompleto(c).toLowerCase() === clienteInput.trim().toLowerCase()),
    [clientes, clienteInput]
  );

  const elegirClienteInput = (valor: string) => {
    setClienteInput(valor);
    const encontrado = clientes.find((c) => nombreCompleto(c).toLowerCase() === valor.trim().toLowerCase());
    if (encontrado) setClienteTelefono(encontrado.telefono ?? '');
  };

  const filtrados = useMemo(
    () => equipos.filter((e) => (tab === 'derivados' ? e.estado === 'servicio_tecnico' : e.estado === 'reparado')),
    [equipos, tab]
  );

  const historialTecnico = useMemo(
    () => equipos.filter((e) => e.estado === 'reparado' && e.tecnico_id === tecnicoSeleccionado),
    [equipos, tecnicoSeleccionado]
  );

  const agregarEquipo = async () => {
    if (!nuevoModelo.trim()) return;
    setGuardandoNuevo(true);

    let clienteId = clienteCoincidente?.id ?? null;
    let nombreParaMensaje = clienteCoincidente ? nombreCompleto(clienteCoincidente) : clienteInput.trim();

    if (!clienteId && clienteInput.trim()) {
      const { data: nuevoCliente } = await supabase
        .from('clientes')
        .insert({ nombre: clienteInput.trim(), telefono: clienteTelefono.trim() || null })
        .select('id')
        .single();
      clienteId = nuevoCliente?.id ?? null;
    }

    const { data: nuevoCanje } = await supabase
      .from('canjes')
      .insert({
        modelo: nuevoModelo.trim(),
        capacidad_gb: nuevaCapacidad,
        color: nuevoColor.trim() || null,
        imei: limpiarImei(nuevoImei),
        detalles: nuevoDetalles.trim() || null,
        estado: 'servicio_tecnico',
        fecha_ingreso_servicio: new Date().toISOString(),
        cliente_id: clienteId,
      })
      .select('token_seguimiento')
      .single();

    if (clienteId && clienteTelefono.trim() && nuevoCanje?.token_seguimiento) {
      const url = `${window.location.origin}/seguimiento/${nuevoCanje.token_seguimiento}`;
      const mensaje = mensajeSeguimientoServicio(nombreParaMensaje || 'estimado/a', nuevoModelo.trim(), url);
      setAvisoWhatsApp({ link: armarLinkWhatsApp(clienteTelefono, mensaje, codigoPais), nombre: nombreParaMensaje, tipo: 'agregado' });
    }

    setNuevoModelo('');
    setNuevaCapacidad(null);
    setNuevoColor('');
    setNuevoImei('');
    setNuevoDetalles('');
    setClienteInput('');
    setClienteTelefono('');
    setPanelNuevo(false);
    setGuardandoNuevo(false);
    cargar();
  };

  const asignarTecnico = async (id: string, tecnicoId: string) => {
    setGuardando(id);
    await supabase.from('canjes').update({ tecnico_id: tecnicoId || null }).eq('id', id);
    setEquipos((eq) => eq.map((e) => (e.id === id ? { ...e, tecnico_id: tecnicoId || null } : e)));
    setGuardando(null);
  };

  const abrirPanelReparar = (id: string) => {
    setPanelReparar(panelReparar === id ? null : id);
    setSeleccionTrabajos([]);
  };

  const toggleTrabajo = (nombre: string) => {
    setSeleccionTrabajos((sel) => (sel.includes(nombre) ? sel.filter((n) => n !== nombre) : [...sel, nombre]));
  };

  const marcarReparado = async (id: string) => {
    setGuardando(id);
    await supabase
      .from('canjes')
      .update({ estado: 'reparado', trabajos_realizados: seleccionTrabajos, fecha_reparado: new Date().toISOString() })
      .eq('id', id);
    setPanelReparar(null);
    setGuardando(null);

    const equipo = equipos.find((e) => e.id === id);
    if (equipo?.cliente_id && equipo.clientes?.telefono && equipo.token_seguimiento) {
      const url = `${window.location.origin}/seguimiento/${equipo.token_seguimiento}`;
      const nombre = `${equipo.clientes.nombre} ${equipo.clientes.apellido || ''}`.trim();
      const mensaje = mensajeListoServicio(nombre || 'estimado/a', equipo.modelo || 'equipo', url);
      setAvisoWhatsApp({ link: armarLinkWhatsApp(equipo.clientes.telefono, mensaje, codigoPais), nombre, tipo: 'reparado' });
    }

    cargar();
  };

  const volverADerivado = async (id: string) => {
    if (!confirm('¿Volver a mandar este equipo a "Derivados a reparación"?')) return;
    setGuardando(id);
    await supabase
      .from('canjes')
      .update({ estado: 'servicio_tecnico', fecha_reparado: null, fecha_ingreso_servicio: new Date().toISOString() })
      .eq('id', id);
    setGuardando(null);
    cargar();
  };

  const agregarAlStock = async (e: Equipo) => {
    if (!confirm('¿Pasar este equipo al Stock como dispositivo disponible para vender?')) return;
    setGuardando(e.id);
    await supabase.from('dispositivos').insert({
      modelo: e.modelo,
      capacidad_gb: e.capacidad_gb,
      color: e.color,
      imei: e.imei,
      estado: 'usado',
      en_stock: true,
    });
    await asegurarModelo(supabase, e.modelo);
    await supabase.from('canjes').delete().eq('id', e.id);
    setGuardando(null);
    cargar();
  };

  const eliminarEquipo = async (e: Equipo) => {
    if (!confirm('¿Eliminar este equipo de Servicio Técnico? Esta acción no se puede deshacer.')) return;
    setGuardando(e.id);
    await supabase.from('canjes').delete().eq('id', e.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó de Servicio Técnico un equipo (${e.modelo || 'sin modelo'}${e.imei ? `, IMEI ${e.imei}` : ''})`,
      entidad: 'canje',
      entidadId: e.id,
      valorAnterior: { modelo: e.modelo, capacidad_gb: e.capacidad_gb, color: e.color, imei: e.imei, estado: e.estado },
    });
    setGuardando(null);
    cargar();
  };

  const nombreTecnico = (tecnicoId: string | null) => tecnicos.find((t) => t.id === tecnicoId)?.nombre;
  const fotoTecnico = (tecnicoId: string | null) => tecnicos.find((t) => t.id === tecnicoId)?.foto_url ?? null;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium mr-auto">Servicio Técnico</span>
        <Link href="/servicio-tecnico/repuestos" className="text-xs text-accent dark:text-dark-accent underline">
          Proveedores
        </Link>
        <Link href="/servicio-tecnico/trabajos" className="text-xs text-accent dark:text-dark-accent underline">
          Trabajos
        </Link>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setTab('derivados')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'derivados' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Derivados
        </button>
        <button
          onClick={() => setTab('reparados')}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'reparados' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Reparados
        </button>
        <button
          onClick={() => {
            setTab('tecnicos');
            setTecnicoSeleccionado(null);
          }}
          className={`flex-1 rounded-xl py-2 font-medium ${
            tab === 'tecnicos' ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Técnicos
        </button>
      </div>

      {tab === 'tecnicos' ? (
        tecnicoSeleccionado ? (
          <>
            <button onClick={() => setTecnicoSeleccionado(null)} className="text-sm text-accent dark:text-dark-accent underline self-start">
              &larr; Todos los técnicos
            </button>
            <p className="text-sm font-medium flex items-center gap-2">
              <Avatar src={fotoTecnico(tecnicoSeleccionado)} nombre={nombreTecnico(tecnicoSeleccionado) ?? '?'} size={36} />
              {nombreTecnico(tecnicoSeleccionado)}
            </p>
            {historialTecnico.length === 0 && (
              <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Todavía no tiene arreglos registrados.</p>
            )}
            <div className="flex flex-col gap-2">
              {historialTecnico.map((e) => (
                <div key={e.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-1">
                  <p className="text-sm font-medium">
                    {e.modelo}
                    {e.capacidad_gb ? ` · ${e.capacidad_gb}GB` : ''}
                  </p>
                  {e.imei && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary">
                      IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{e.imei}</span>
                    </p>
                  )}
                  {e.trabajos_realizados && e.trabajos_realizados.length > 0 && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary">Arreglo: {e.trabajos_realizados.join(', ')}</p>
                  )}
                  {e.fecha_reparado && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary">Reparado el {formatearFecha(e.fecha_reparado)}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {tecnicos.length === 0 && (
              <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
                Todavía no cargaste técnicos.{' '}
                <Link href="/configuracion/tecnicos" className="text-accent dark:text-dark-accent underline">
                  Cargar acá
                </Link>
              </p>
            )}
            <div className="flex flex-col gap-2">
              {tecnicos.map((t) => {
                const cantidad = equipos.filter((e) => e.estado === 'reparado' && e.tecnico_id === t.id).length;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTecnicoSeleccionado(t.id)}
                    className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between text-left"
                  >
                    <span className="flex items-center gap-2.5">
                      <Avatar src={t.foto_url} nombre={t.nombre} size={44} />
                      <p className="text-sm font-medium">{t.nombre}</p>
                    </span>
                    <p className="text-xs text-muted dark:text-dark-text-secondary">{cantidad} arreglo{cantidad === 1 ? '' : 's'}</p>
                  </button>
                );
              })}
            </div>
          </>
        )
      ) : (
        <>
          {tab === 'derivados' && (
            <>
              <button
                onClick={() => setPanelNuevo((v) => !v)}
                className="w-full rounded-xl border border-border dark:border-dark-border py-3 text-center text-sm font-medium"
              >
                {panelNuevo ? 'Cancelar' : '+ Agregar equipo'}
              </button>

              {panelNuevo && (
                <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
                  <input
                    value={nuevoModelo}
                    onChange={(e) => setNuevoModelo(e.target.value)}
                    placeholder="Modelo (ej. iPhone 13)"
                    list="carpetas-stock-servicio"
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <datalist id="carpetas-stock-servicio">
                    {carpetasStock.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <div className="flex gap-2">
                    {STORAGE_OPTIONS.map((gb) => (
                      <button
                        key={gb}
                        onClick={() => setNuevaCapacidad(gb)}
                        className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                          nuevaCapacidad === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
                        }`}
                      >
                        {gb}GB
                      </button>
                    ))}
                  </div>
                  <input
                    value={nuevoColor}
                    onChange={(e) => setNuevoColor(e.target.value)}
                    placeholder="Color"
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={nuevoImei}
                    onChange={(e) => setNuevoImei(e.target.value)}
                    placeholder="IMEI"
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm font-mono"
                  />
                  <textarea
                    value={nuevoDetalles}
                    onChange={(e) => setNuevoDetalles(e.target.value)}
                    placeholder="Detalles (ej. no enciende, pantalla rota)"
                    rows={2}
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />

                  <p className="text-xs font-medium text-muted dark:text-dark-text-secondary mt-1">
                    Cliente (opcional — para avisarle por WhatsApp)
                  </p>
                  <input
                    value={clienteInput}
                    onChange={(e) => elegirClienteInput(e.target.value)}
                    placeholder="Nombre del cliente"
                    list="clientes-servicio"
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <datalist id="clientes-servicio">
                    {clientes.map((c) => (
                      <option key={c.id} value={nombreCompleto(c)} />
                    ))}
                  </datalist>
                  <input
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    placeholder="Teléfono (con código de área)"
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />

                  <button
                    disabled={!nuevoModelo.trim() || guardandoNuevo}
                    onClick={agregarEquipo}
                    className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {guardandoNuevo ? 'Agregando...' : 'Agregar a Servicio Técnico'}
                  </button>
                </div>
              )}

            </>
          )}

          {avisoWhatsApp && (
            <div className="rounded-xl border border-good/30 bg-good/10 p-3 flex flex-col gap-2">
              <p className="text-sm">
                {avisoWhatsApp.tipo === 'agregado' ? 'Equipo agregado.' : '¡Equipo marcado como reparado!'} ¿Le avisamos a{' '}
                <strong>{avisoWhatsApp.nombre}</strong> por WhatsApp?
              </p>
              <div className="flex gap-2">
                <a
                  href={avisoWhatsApp.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setAvisoWhatsApp(null)}
                  className="flex-1 rounded-lg bg-good text-white text-center py-2 text-sm font-medium"
                >
                  Enviar WhatsApp
                </a>
                <button
                  onClick={() => setAvisoWhatsApp(null)}
                  className="rounded-lg border border-border dark:border-dark-border px-3 py-2 text-sm font-medium"
                >
                  Ahora no
                </button>
              </div>
            </div>
          )}

          {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
          {!loading && filtrados.length === 0 && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
              {tab === 'derivados'
                ? 'No hay equipos derivados a reparación. Se envían desde Plan Canje o se agregan acá directamente.'
                : 'Todavía no marcaste ningún equipo como reparado.'}
            </p>
          )}

          {!loading && filtrados.length > 0 && (
            <p className="text-xs text-muted dark:text-dark-text-secondary -mb-1">
              Etiquetá el dispositivo defectuoso para identificarlo fácil en el local.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {filtrados.map((e) => (
              <div key={e.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <MiniaturaDispositivo src={imagenPorNombreExacto(e.modelo, imagenesCarpetas)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {e.modelo}
                      {e.capacidad_gb ? ` · ${e.capacidad_gb}GB` : ''}
                      {e.color ? ` · ${e.color}` : ''}
                    </p>
                    {e.imei && (
                      <p className="text-xs text-muted dark:text-dark-text-secondary">
                        IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{e.imei}</span>
                      </p>
                    )}
                  </div>
                </div>
                {e.detalles && <p className="text-xs text-muted dark:text-dark-text-secondary">Detalles: {e.detalles}</p>}
                {e.fecha_ingreso_servicio && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary">Ingresó: {formatearFecha(e.fecha_ingreso_servicio)}</p>
                )}

                <Link
                  href={`/servicio-tecnico/etiqueta/${e.id}`}
                  className="rounded-lg border border-border dark:border-dark-border py-2 text-center text-xs font-medium"
                >
                  🏷️ Imprimir etiqueta
                </Link>

                {tab === 'derivados' && (
                  <div>
                    <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">Técnico asignado</label>
                    <select
                      value={e.tecnico_id ?? ''}
                      disabled={guardando === e.id}
                      onChange={(ev) => asignarTecnico(e.id, ev.target.value)}
                      className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
                    >
                      <option value="">Sin asignar</option>
                      {tecnicos.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {tab === 'reparados' && (
                  <>
                    {nombreTecnico(e.tecnico_id) && (
                      <p className="text-xs text-muted dark:text-dark-text-secondary flex items-center gap-1.5">
                        Reparado por: <Avatar src={fotoTecnico(e.tecnico_id)} nombre={nombreTecnico(e.tecnico_id) ?? '?'} size={24} />{' '}
                        {nombreTecnico(e.tecnico_id)}
                      </p>
                    )}
                    {e.trabajos_realizados && e.trabajos_realizados.length > 0 && (
                      <p className="text-xs text-muted dark:text-dark-text-secondary">Arreglo realizado: {e.trabajos_realizados.join(', ')}</p>
                    )}
                    {e.fecha_reparado && (
                      <p className="text-xs text-muted dark:text-dark-text-secondary">Reparado: {formatearFecha(e.fecha_reparado)}</p>
                    )}
                  </>
                )}

                {tab === 'derivados' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => abrirPanelReparar(e.id)}
                      className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-xs font-medium"
                    >
                      {panelReparar === e.id ? 'Cancelar' : 'Marcar como reparado'}
                    </button>
                    <button
                      disabled={guardando === e.id}
                      onClick={() => eliminarEquipo(e)}
                      className="rounded-lg border border-bad/30 py-2 px-3 text-xs font-medium text-bad disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                  </div>
                )}

                {tab === 'reparados' && (
                  <div className="flex gap-2">
                    <button
                      disabled={guardando === e.id}
                      onClick={() => volverADerivado(e.id)}
                      className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-xs font-medium disabled:opacity-40"
                    >
                      Volver a Derivados
                    </button>
                    <button
                      disabled={guardando === e.id}
                      onClick={() => agregarAlStock(e)}
                      className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Agregar al Stock
                    </button>
                    <button
                      disabled={guardando === e.id}
                      onClick={() => eliminarEquipo(e)}
                      className="rounded-lg border border-bad/30 py-2 px-3 text-xs font-medium text-bad disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                  </div>
                )}

                {panelReparar === e.id && (
                  <div className="rounded-lg border border-border dark:border-dark-border bg-white dark:bg-dark-surface p-3 flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Arreglo realizado</p>
                    {trabajos.length === 0 && (
                      <p className="text-xs text-muted dark:text-dark-text-secondary">
                        Todavía no cargaste trabajos en el catálogo.{' '}
                        <Link href="/servicio-tecnico/trabajos" className="text-accent dark:text-dark-accent underline">
                          Cargar acá
                        </Link>
                      </p>
                    )}
                    {trabajos.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={seleccionTrabajos.includes(t.nombre)}
                          onChange={() => toggleTrabajo(t.nombre)}
                          className="h-4 w-4 accent-ink"
                        />
                        <MiniaturaDispositivo src={t.imagen_url} size={24} />
                        {t.nombre}
                      </label>
                    ))}
                    <button
                      disabled={guardando === e.id}
                      onClick={() => marcarReparado(e.id)}
                      className="mt-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Confirmar reparado
                    </button>
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
