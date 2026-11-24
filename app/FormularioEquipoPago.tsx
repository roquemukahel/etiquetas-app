'use client';

import { useEffect, useState } from 'react';
import { crearClienteNavegador } from './lib/supabase/client';
import { OPCIONES_ALMACENAMIENTO, formatearGB } from './lib/almacenamiento';
import { compararModelosPorSalida } from './lib/catalogosMarcas';
import { EQUIPO_PAGO_VACIO, type EquipoPago } from './lib/equipoPago';
import { useCoincidenciasCanje } from './lib/useCoincidenciasCanje';
import { useCoincidenciasStandby } from './lib/useCoincidenciasStandby';
import SelectorColorAuto from './SelectorColorAuto';
import SelectorEstadoDispositivo from './SelectorEstadoDispositivo';
import AvisoCanje from './AvisoCanje';
import AvisoStandby from './AvisoStandby';
import { useT } from './lib/idioma';

const campo = 'w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm';
const etiqueta = 'text-xs text-muted dark:text-dark-text-secondary block mb-1';

// Datos del equipo que el cliente deja como parte de pago (modelo, GB, color, IMEI, estado...). El valor reconocido
// NO va acá: es el monto del pago, que lo pone quien cobra en el formulario de arriba.
export default function FormularioEquipoPago({ value, onChange }: { value: EquipoPago; onChange: (v: EquipoPago) => void }) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [carpetas, setCarpetas] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('modelos_stock').select('nombre').order('nombre');
      // Sin la lista de carpetas el modelo se puede escribir igual (solo falta la sugerencia).
      if (error) return;
      setCarpetas(((data ?? []) as { nombre: string }[]).map((m) => m.nombre).sort(compararModelosPorSalida));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Si el IMEI o el modelo coinciden con un equipo que ya espera en Plan Canje o en Standby, se avisa (solo aviso).
  const coincidenciasCanje = useCoincidenciasCanje(supabase, value.imei, value.modelo);
  const coincidenciasStandby = useCoincidenciasStandby(supabase, value.imei, value.modelo);
  const set = (parcial: Partial<EquipoPago>) => onChange({ ...EQUIPO_PAGO_VACIO, ...value, ...parcial });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border dark:border-dark-border p-3">
      <p className="text-xs font-semibold">📱 {t('Equipo que deja como parte de pago')}</p>
      <div>
        <label className={etiqueta}>{t('Modelo')}</label>
        <input value={value.modelo} onChange={(e) => set({ modelo: e.target.value })} placeholder="iPhone 13" list="carpetas-equipo-pago" className={campo} />
        <datalist id="carpetas-equipo-pago">
          {carpetas.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div>
        <label className={etiqueta}>{t('Almacenamiento')}</label>
        <div className="flex flex-wrap gap-2">
          {OPCIONES_ALMACENAMIENTO.map((gb) => (
            <button
              key={gb}
              type="button"
              onClick={() => set({ capacidad_gb: value.capacidad_gb === gb ? null : gb })}
              className={`flex-1 min-w-[3.5rem] rounded-lg py-2 text-sm font-medium ${
                value.capacidad_gb === gb ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
              }`}
            >
              {formatearGB(gb)}
            </button>
          ))}
        </div>
      </div>
      <SelectorColorAuto label={t('Color')} modelo={value.modelo} value={value.color} onChange={(c) => set({ color: c })} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={etiqueta}>IMEI</label>
          <input value={value.imei} onChange={(e) => set({ imei: e.target.value })} inputMode="numeric" className={campo} />
        </div>
        <div>
          <label className={etiqueta}>{t('Salud de batería (%)')}</label>
          <input value={value.bateria} onChange={(e) => set({ bateria: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })} inputMode="numeric" className={campo} />
        </div>
      </div>
      <AvisoCanje supabase={supabase} porImei={coincidenciasCanje.porImei} porModelo={coincidenciasCanje.porModelo} sucursalId={null} onAgregado={() => {}} soloAviso />
      <AvisoStandby supabase={supabase} porImei={coincidenciasStandby.porImei} porModelo={coincidenciasStandby.porModelo} onAgregado={() => {}} soloAviso />
      <SelectorEstadoDispositivo value={value.condicion} onChange={(c) => set({ condicion: c })} label={t('Estado')} />
      <div>
        <label className={etiqueta}>{t('Detalles (opcional)')}</label>
        <textarea value={value.detalles} onChange={(e) => set({ detalles: e.target.value })} rows={2} placeholder={t('Ej. módulo con detalle, carcasa con un rayón, no anda el Face ID...')} className={campo} />
      </div>
    </div>
  );
}
