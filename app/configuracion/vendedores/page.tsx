'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';
import { useActor } from '../../lib/actor';
import { tienePermiso } from '../../lib/permisos';
import Avatar from '../../Avatar';
import PermisosEditor, { PermisosForm } from '../../PermisosEditor';
import { obtenerSucursales, type Sucursal } from '../../lib/sucursales';
import { useT } from '../../lib/idioma';

type Vendedor = {
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
  puede_gestionar_financiacion: boolean;
  sucursal_id?: string | null;
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
  puedeGestionarFinanciacion: true,
};

export default function Vendedores() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  const t = useT();
  const puedeGestionarUsuarios = tienePermiso(actor, 'gestionar_usuarios');
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState<string | null>(null);
  const [telefonoEdit, setTelefonoEdit] = useState('');
  const [edadEdit, setEdadEdit] = useState('');
  const [pinEdit, setPinEdit] = useState('');
  // El PIN real nunca se vuelve a mostrar (ver conPin más abajo) — este flag
  // distingue "no lo tocó" (no enviar nada, no pisar el que ya tenía) de
  // "lo dejó vacío a propósito" (sí enviar, para sacarle el PIN).
  const [pinTocado, setPinTocado] = useState(false);
  const [permisosEdit, setPermisosEdit] = useState<PermisosForm>(PERMISOS_DEFAULT);
  const [sucursalIdEdit, setSucursalIdEdit] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [conPin, setConPin] = useState<Set<string>>(new Set());

  const cargar = async () => {
    const [{ data }, { data: idsConPin }] = await Promise.all([
      supabase.from('vendedores').select('*').order('nombre'),
      supabase.rpc('ids_vendedores_con_pin'),
    ]);
    setVendedores((data as Vendedor[]) ?? []);
    setConPin(new Set(((idsConPin as { id: string }[]) ?? []).map((r) => r.id)));
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      try {
        setSucursales(await obtenerSucursales(supabase, false));
      } catch {
        // Tabla sucursales todavía no existe en este negocio.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agregar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error: insertError } = await supabase.from('vendedores').insert({ nombre: nombre.trim() });
    if (insertError) {
      setError(t('No pudimos guardar:') + ' ' + insertError.message);
      setGuardando(false);
      return;
    }
    setNombre('');
    setGuardando(false);
    cargar();
  };

  const eliminar = async (id: string) => {
    if (!confirm(t('¿Eliminar este vendedor?'))) return;
    const vendedor = vendedores.find((v) => v.id === id);

    // comision_movimientos/comision_liquidaciones son "on delete restrict"
    // (libro de comisiones inmutable) — sin este chequeo, el delete de acá
    // abajo fallaría con un error crudo de Postgres apenas el vendedor
    // tuviera cualquier comisión generada. Se avisa antes, con un mensaje
    // claro, en vez de dejar que llegue a intentarlo.
    const [{ count: cComisiones }, { count: cLiquidaciones }, { count: cOrdenes }] = await Promise.all([
      supabase.from('comision_movimientos').select('id', { count: 'exact', head: true }).eq('vendedor_id', id),
      supabase.from('comision_liquidaciones').select('id', { count: 'exact', head: true }).eq('vendedor_id', id),
      supabase.from('ordenes').select('id', { count: 'exact', head: true }).eq('vendedor_id', id),
    ]);
    if ((cComisiones ?? 0) > 0 || (cLiquidaciones ?? 0) > 0 || (cOrdenes ?? 0) > 0) {
      alert(
        t(
          'Este vendedor tiene ventas o comisiones registradas — no se puede eliminar para no perder ese historial. Si ya no trabaja más acá, podés dejarlo así: no molesta en la lista.'
        )
      );
      return;
    }

    await supabase.from('vendedores').delete().eq('id', id);
    await registrarAuditoria(supabase, {
      accion: `eliminó un vendedor (${vendedor?.nombre || 'sin nombre'})`,
      entidad: 'vendedor',
      entidadId: id,
      valorAnterior: vendedor ? { nombre: vendedor.nombre, telefono: vendedor.telefono } : null,
    });
    cargar();
  };

  const abrirPerfil = (v: Vendedor) => {
    setEditando(editando === v.id ? null : v.id);
    setTelefonoEdit(v.telefono ?? '');
    setEdadEdit(v.edad != null ? String(v.edad) : '');
    // El PIN nunca se vuelve a mostrar en texto plano — arranca vacío
    // siempre, tenga o no tenga uno cargado ya (ver conPin/pinTocado).
    setPinEdit('');
    setPinTocado(false);
    setPermisosEdit({
      esAdministrador: v.es_administrador,
      accesoCompleto: v.acceso_completo,
      puedeVender: v.puede_vender,
      puedeEliminar: v.puede_eliminar,
      puedeAgregarStock: v.puede_agregar_stock,
      puedeVerEstadisticas: v.puede_ver_estadisticas,
      puedeRecibirServicioTecnico: v.puede_recibir_servicio_tecnico,
      puedeGestionarServicioTecnico: v.puede_gestionar_servicio_tecnico,
      puedeGestionarFinanciacion: v.puede_gestionar_financiacion,
    });
    setSucursalIdEdit(v.sucursal_id ?? '');
    setError(null);
  };

  const cambiarFoto = (v: Vendedor, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setVendedores((vs) => vs.map((x) => (x.id === v.id ? { ...x, foto_url: dataUrl } : x)));
      await supabase.from('vendedores').update({ foto_url: dataUrl }).eq('id', v.id);
    };
    reader.readAsDataURL(file);
  };

  const guardarPerfil = async (v: Vendedor) => {
    if (pinEdit.trim() && !/^\d{4,6}$/.test(pinEdit.trim())) {
      setError(t('El PIN tiene que ser de 4 a 6 números, o dejarlo vacío para no pedir ninguno'));
      return;
    }
    setGuardandoPerfil(true);
    // El PIN va por un RPC aparte que lo hashea del lado del servidor — nunca
    // se guarda ni se compara en texto plano. Solo se toca si de verdad lo
    // tocaron (pinTocado); si no, el que ya tenía queda como estaba.
    if (pinTocado) {
      await supabase.rpc('establecer_pin_vendedor', { p_vendedor_id: v.id, p_pin: pinEdit.trim() || null });
    }
    await supabase
      .from('vendedores')
      .update({
        telefono: telefonoEdit.trim() || null,
        edad: edadEdit ? Number(edadEdit) : null,
        es_administrador: permisosEdit.esAdministrador,
        acceso_completo: permisosEdit.accesoCompleto,
        puede_vender: permisosEdit.puedeVender,
        puede_eliminar: permisosEdit.puedeEliminar,
        puede_agregar_stock: permisosEdit.puedeAgregarStock,
        puede_ver_estadisticas: permisosEdit.puedeVerEstadisticas,
        puede_recibir_servicio_tecnico: permisosEdit.puedeRecibirServicioTecnico,
        puede_gestionar_servicio_tecnico: permisosEdit.puedeGestionarServicioTecnico,
        puede_gestionar_financiacion: permisosEdit.puedeGestionarFinanciacion,
        ...(sucursales.length > 0 ? { sucursal_id: sucursalIdEdit || null } : {}),
      })
      .eq('id', v.id);
    setGuardandoPerfil(false);
    setEditando(null);
    cargar();
  };

  if (!puedeGestionarUsuarios) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">{t('No tenés permiso para gestionar vendedores.')}</p>
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
        <span className="text-lg font-medium">{t('Vendedores')}</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('Nombre del vendedor')}
          className="flex-1 bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
        />
        <button
          disabled={!nombre.trim() || guardando}
          onClick={agregar}
          className="rounded-xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors px-5 text-sm font-medium text-white disabled:opacity-40"
        >
          {t('Agregar')}
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Cargando...')}</p>}
      {!loading && vendedores.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">{t('Todavía no cargaste vendedores.')}</p>
      )}

      <div className="flex flex-col gap-2">
        {vendedores.map((v) => (
          <div key={v.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="shrink-0 cursor-pointer">
                <Avatar src={v.foto_url} nombre={v.nombre} size={68} />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => cambiarFoto(v, e)} />
              </label>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{v.nombre}</p>
                {(v.telefono || v.edad) && (
                  <p className="text-xs text-muted dark:text-dark-text-secondary">
                    {v.telefono}
                    {v.telefono && v.edad ? ' · ' : ''}
                    {v.edad ? `${v.edad} ${t('años')}` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => abrirPerfil(v)} className="shrink-0 text-xs text-accent dark:text-dark-accent underline">
                {editando === v.id ? t('Cerrar') : t('Editar')}
              </button>
              <button onClick={() => eliminar(v.id)} className="shrink-0 text-xs text-bad underline">
                {t('Eliminar')}
              </button>
            </div>

            {editando === v.id && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border dark:border-dark-border">
                <div className="flex gap-2">
                  <input
                    value={telefonoEdit}
                    onChange={(e) => setTelefonoEdit(e.target.value)}
                    placeholder={t('Teléfono')}
                    className="flex-1 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={edadEdit}
                    onChange={(e) => setEdadEdit(e.target.value)}
                    placeholder={t('Edad')}
                    inputMode="numeric"
                    className="w-20 bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <input
                    value={pinEdit}
                    onChange={(e) => {
                      setPinTocado(true);
                      setPinEdit(e.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                    placeholder={conPin.has(v.id) ? t('•••• (ya tiene un PIN — escribí uno nuevo para cambiarlo)') : t('PIN de 4 a 6 dígitos (opcional)')}
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                  />
                  <p className="text-[10px] text-muted dark:text-dark-text-secondary mt-1">
                    {conPin.has(v.id) && !pinTocado
                      ? t('Por seguridad no se muestra el PIN ya cargado. Dejalo así para no cambiarlo, o escribí uno nuevo para reemplazarlo.')
                      : t('Si le ponés un PIN, va a tener que escribirlo al elegirse en "Cambiar". Dejalo vacío para que no pida nada.')}
                  </p>
                </div>

                {sucursales.length > 0 && (
                  <div>
                    <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{t('Sucursal asignada')}</label>
                    <select
                      value={sucursalIdEdit}
                      onChange={(e) => setSucursalIdEdit(e.target.value)}
                      className="w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">{t('Sin asignar (elige sucursal al trabajar)')}</option>
                      {sucursales.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <PermisosEditor valor={permisosEdit} onChange={setPermisosEdit} tienePin={pinTocado ? !!pinEdit.trim() : conPin.has(v.id)} />

                <button
                  disabled={guardandoPerfil}
                  onClick={() => guardarPerfil(v)}
                  className="rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {t('Guardar')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
