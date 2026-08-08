'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import Avatar from '../../Avatar';
import PermisosEditor, { PermisosForm } from '../../PermisosEditor';

type Tecnico = {
  id: string;
  nombre: string;
  telefono: string | null;
  edad: number | null;
  foto_url: string | null;
  pin: string | null;
  es_administrador: boolean;
  acceso_completo: boolean;
  puede_vender: boolean;
  puede_eliminar: boolean;
  puede_agregar_stock: boolean;
  puede_ver_estadisticas: boolean;
  puede_recibir_servicio_tecnico: boolean;
  puede_gestionar_servicio_tecnico: boolean;
};

const PERMISOS_DEFAULT: PermisosForm = {
  esAdministrador: true,
  accesoCompleto: true,
  puedeVender: true,
  puedeEliminar: true,
  puedeAgregarStock: true,
  puedeVerEstadisticas: true,
  puedeRecibirServicioTecnico: true,
  puedeGestionarServicioTecnico: true,
};

export default function Tecnicos() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const puedeGestionarUsuarios = tienePermiso(actor, 'gestionar_usuarios');
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [telefonoEdit, setTelefonoEdit] = useState('');
  const [edadEdit, setEdadEdit] = useState('');
  const [pinEdit, setPinEdit] = useState('');
  const [permisosEdit, setPermisosEdit] = useState<PermisosForm>(PERMISOS_DEFAULT);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const cargar = async () => {
    const { data } = await supabase.from('tecnicos').select('*').order('nombre');
    setTecnicos((data as Tecnico[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const agregar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: insertError } = await supabase.from('tecnicos').insert({ nombre: nombre.trim() });
    if (insertError) {
      setError('No pudimos guardar: ' + insertError.message);
      setGuardando(false);
      return;
    }
    setNombre('');
    setGuardando(false);
    cargar();
  };

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este técnico?')) return;
    const tecnico = tecnicos.find((t) => t.id === id);
    await supabase.from('tecnicos').delete().eq('id', id);
    await registrarAuditoria(supabase, {
      accion: `eliminó un técnico (${tecnico?.nombre || 'sin nombre'})`,
      entidad: 'tecnico',
      entidadId: id,
      valorAnterior: tecnico ? { nombre: tecnico.nombre, telefono: tecnico.telefono } : null,
    });
    cargar();
  };

  const abrirPerfil = (t: Tecnico) => {
    setEditando(editando === t.id ? null : t.id);
    setTelefonoEdit(t.telefono ?? '');
    setEdadEdit(t.edad != null ? String(t.edad) : '');
    setPinEdit(t.pin ?? '');
    setPermisosEdit({
      esAdministrador: t.es_administrador,
      accesoCompleto: t.acceso_completo,
      puedeVender: t.puede_vender,
      puedeEliminar: t.puede_eliminar,
      puedeAgregarStock: t.puede_agregar_stock,
      puedeVerEstadisticas: t.puede_ver_estadisticas,
      puedeRecibirServicioTecnico: t.puede_recibir_servicio_tecnico,
      puedeGestionarServicioTecnico: t.puede_gestionar_servicio_tecnico,
    });
    setError(null);
  };

  const cambiarFoto = (t: Tecnico, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setTecnicos((ts) => ts.map((x) => (x.id === t.id ? { ...x, foto_url: dataUrl } : x)));
      await supabase.from('tecnicos').update({ foto_url: dataUrl }).eq('id', t.id);
    };
    reader.readAsDataURL(file);
  };

  const guardarPerfil = async (t: Tecnico) => {
    if (pinEdit.trim() && !/^\d{4,6}$/.test(pinEdit.trim())) {
      setError('El PIN tiene que ser de 4 a 6 números, o dejarlo vacío para no pedir ninguno');
      return;
    }
    setGuardandoPerfil(true);
    await supabase
      .from('tecnicos')
      .update({
        telefono: telefonoEdit.trim() || null,
        edad: edadEdit ? Number(edadEdit) : null,
        pin: pinEdit.trim() || null,
        es_administrador: permisosEdit.esAdministrador,
        acceso_completo: permisosEdit.accesoCompleto,
        puede_vender: permisosEdit.puedeVender,
        puede_eliminar: permisosEdit.puedeEliminar,
        puede_agregar_stock: permisosEdit.puedeAgregarStock,
        puede_ver_estadisticas: permisosEdit.puedeVerEstadisticas,
        puede_recibir_servicio_tecnico: permisosEdit.puedeRecibirServicioTecnico,
        puede_gestionar_servicio_tecnico: permisosEdit.puedeGestionarServicioTecnico,
      })
      .eq('id', t.id);
    setGuardandoPerfil(false);
    setEditando(null);
    cargar();
  };

  if (!puedeGestionarUsuarios) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para gestionar técnicos.</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          Volver
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
        <span className="text-lg font-medium">Técnicos</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del técnico"
          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
        <button
          disabled={!nombre.trim() || guardando}
          onClick={agregar}
          className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-5 text-sm font-medium text-white disabled:opacity-40"
        >
          Agregar
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
      {!loading && tecnicos.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Todavía no cargaste técnicos.</p>
      )}

      <div className="flex flex-col gap-2">
        {tecnicos.map((t) => (
          <div key={t.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="shrink-0 cursor-pointer">
                <Avatar src={t.foto_url} nombre={t.nombre} size={68} />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => cambiarFoto(t, e)} />
              </label>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.nombre}</p>
                {(t.telefono || t.edad) && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {t.telefono}
                    {t.telefono && t.edad ? ' · ' : ''}
                    {t.edad ? `${t.edad} años` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => abrirPerfil(t)} className="shrink-0 text-xs text-accent dark:text-dark-accent underline">
                {editando === t.id ? 'Cerrar' : 'Editar'}
              </button>
              <button onClick={() => eliminar(t.id)} className="shrink-0 text-xs text-bad underline">
                Eliminar
              </button>
            </div>

            {editando === t.id && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border dark:border-dark-border">
                <div className="flex gap-2">
                  <input
                    value={telefonoEdit}
                    onChange={(e) => setTelefonoEdit(e.target.value)}
                    placeholder="Teléfono"
                    className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={edadEdit}
                    onChange={(e) => setEdadEdit(e.target.value)}
                    placeholder="Edad"
                    inputMode="numeric"
                    className="w-20 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <input
                    value={pinEdit}
                    onChange={(e) => setPinEdit(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="PIN de 4 a 6 dígitos (opcional)"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <p className="text-[10px] text-muted dark:text-dark-text-secondary mt-1">
                    Si le ponés un PIN, va a tener que escribirlo al elegirse en "Cambiar". Dejalo vacío para que no
                    pida nada.
                  </p>
                </div>

                <PermisosEditor valor={permisosEdit} onChange={setPermisosEdit} tienePin={!!pinEdit.trim()} />

                <button
                  disabled={guardandoPerfil}
                  onClick={() => guardarPerfil(t)}
                  className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Guardar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
