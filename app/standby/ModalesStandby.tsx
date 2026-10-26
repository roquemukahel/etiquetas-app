'use client';

import { useState } from 'react';
import { crearClienteNavegador } from '../lib/supabase/client';
import { getActor, MENSAJE_ACTOR_REQUERIDO } from '../lib/actor';
import { registrarAuditoria } from '../lib/auditoria';
import { crearEquipoEnStandby, type EquipoStandby } from '../lib/standby';
import type { Sucursal } from '../lib/sucursales';
import { Boton } from '../Boton';
import Modal from '../Modal';
import { useT } from '../lib/idioma';

export const campo = 'w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm';
export const etiqueta = 'text-xs text-muted dark:text-dark-text-secondary block mb-1';

export function ModalNuevoEquipo({ sucursales, sucursalId, onClose, onGuardado }: { sucursales: Sucursal[]; sucursalId: string | null; onClose: () => void; onGuardado: () => void }) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [modelo, setModelo] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [color, setColor] = useState('');
  const [imei, setImei] = useState('');
  const [motivo, setMotivo] = useState('');
  // Con varias sucursales hay que elegir a cuál pertenece el equipo, si no queda fuera de los filtros por sucursal.
  const [sucursalElegida, setSucursalElegida] = useState(sucursalId ?? (sucursales.length === 1 ? sucursales[0].id : ''));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!modelo.trim()) {
      setError(t('Poné el modelo del equipo.'));
      return;
    }
    if (sucursales.length > 1 && !sucursalElegida) {
      setError(t('Elegí una sucursal.'));
      return;
    }
    const quien = getActor();
    if (!quien) {
      setError(t(MENSAJE_ACTOR_REQUERIDO));
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await crearEquipoEnStandby(supabase, {
      modelo,
      capacidadGb: capacidad ? Number(capacidad) : null,
      color,
      imei,
      motivo,
      sucursalId: sucursalElegida || null,
      actor: quien,
    });
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    onGuardado();
  };

  return (
    <Modal titulo={t('Agregar equipo a Standby')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <div>
          <label className={etiqueta}>{t('Modelo')}</label>
          <input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="iPhone 13" className={campo} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiqueta}>{t('Capacidad (GB)')}</label>
            <input value={capacidad} onChange={(e) => setCapacidad(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={campo} />
          </div>
          <div>
            <label className={etiqueta}>{t('Color')}</label>
            <input value={color} onChange={(e) => setColor(e.target.value)} className={campo} />
          </div>
        </div>
        <div>
          <label className={etiqueta}>IMEI</label>
          <input value={imei} onChange={(e) => setImei(e.target.value)} inputMode="numeric" className={campo} />
        </div>
        {sucursales.length > 1 && (
          <div>
            <label className={etiqueta}>{t('Sucursal')}</label>
            <select value={sucursalElegida} onChange={(e) => setSucursalElegida(e.target.value)} className={campo}>
              <option value="">{t('Elegí una sucursal')}</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  🏬 {s.nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={etiqueta}>{t('Qué le pasa')}</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder={t('Ej. Pantalla rota, no carga, esperando repuesto')} className={campo} />
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" cargando={guardando} onClick={guardar} className="flex-1">
            {t('Agregar a Standby')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}

export function ModalMotivo({ equipo, onClose, onGuardado }: { equipo: EquipoStandby; onClose: () => void; onGuardado: (motivo: string | null) => void }) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [motivo, setMotivo] = useState(equipo.espera_motivo ?? equipo.detalles ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const { error: errorUpdate } = await supabase.from('dispositivos').update({ espera_motivo: motivo.trim() || null }).eq('id', equipo.id);
    setGuardando(false);
    if (errorUpdate) {
      setError(errorUpdate.message);
      return;
    }
    await registrarAuditoria(supabase, {
      accion: `editó el detalle de ${equipo.modelo || 'un equipo'}${equipo.imei ? ` (IMEI ${equipo.imei})` : ''} en Standby`,
      entidad: 'dispositivo',
      entidadId: equipo.id,
    });
    onGuardado(motivo.trim() || null);
  };

  return (
    <Modal titulo={`${t('Qué le pasa')} · ${equipo.modelo || t('Equipo')}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} className={campo} autoFocus />
        <div className="flex gap-2">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" cargando={guardando} onClick={guardar} className="flex-1">
            {t('Guardar cambios')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
