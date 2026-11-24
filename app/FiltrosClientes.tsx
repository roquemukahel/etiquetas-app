'use client';

import { useEffect, useState } from 'react';
import { useT } from './lib/idioma';
import { useSucursalActual } from './lib/sucursal';
import type { Sucursal } from './lib/sucursales';
import { CALIFICACIONES, FUENTES_INGRESO, RANGOS_PAGO, SIN_SUCURSAL, type FiltrosCliente } from './lib/clienteCobro';

// El filtro de sucursal arranca en la que está elegida en el menú lateral y la sigue cuando cambia (como en Estadísticas); desde acá
// también se puede mirar otra o "Todas" sin cambiar de sucursal de trabajo.
export function useFiltroSucursal(): [string, (v: string) => void] {
  const global = useSucursalActual();
  const [valor, setValor] = useState(global.id ?? '');
  useEffect(() => setValor(global.id ?? ''), [global.id]);
  return [valor, setValor];
}

type Props = {
  filtros: FiltrosCliente;
  onChange: (f: FiltrosCliente) => void;
  sucursales: Sucursal[];
  // Si el negocio ya corrió clientes_cobro_supabase.sql: se ofrecen fuente, rango y calificación.
  conDatosCobro: boolean;
  // Cantidad de clientes marcados "ya cobró – no pagó" (undefined = no se ofrece ese filtro).
  cantidadYaCobroNoPago?: number;
};

const CLASE_SELECT = 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs';

export default function FiltrosClientes({ filtros, onChange, sucursales, conDatosCobro, cantidadYaCobroNoPago }: Props) {
  const t = useT();
  const set = (parcial: Partial<FiltrosCliente>) => onChange({ ...filtros, ...parcial });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sucursales.length > 1 && (
        <select value={filtros.sucursal} onChange={(e) => set({ sucursal: e.target.value })} aria-label={t('Filtrar por sucursal')} className={CLASE_SELECT}>
          <option value="">🏬 {t('Todas las sucursales')}</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              🏬 {s.nombre}
            </option>
          ))}
          <option value={SIN_SUCURSAL}>🏬 {t('Sin sucursal asignada')}</option>
        </select>
      )}
      {conDatosCobro && (
        <>
          <select value={filtros.fuente} onChange={(e) => set({ fuente: e.target.value })} aria-label={t('Filtrar por fuente de ingreso')} className={CLASE_SELECT}>
            <option value="">💼 {t('Toda fuente de ingreso')}</option>
            {FUENTES_INGRESO.map((f) => (
              <option key={f.clave} value={f.clave}>
                💼 {t(f.etiqueta)}
              </option>
            ))}
          </select>
          <select value={filtros.rango} onChange={(e) => set({ rango: e.target.value })} aria-label={t('Filtrar por rango de pago pactado')} className={CLASE_SELECT}>
            <option value="">📅 {t('Todo rango de pago')}</option>
            {RANGOS_PAGO.map((r) => (
              <option key={r} value={r}>
                📅 {t('Del')} {r.replace('-', ` ${t('al')} `)}
              </option>
            ))}
          </select>
          <select value={filtros.calificacion} onChange={(e) => set({ calificacion: e.target.value })} aria-label={t('Filtrar por calidad del cliente')} className={CLASE_SELECT}>
            <option value="">⭐ {t('Toda calidad')}</option>
            {CALIFICACIONES.map((c) => (
              <option key={c.clave} value={c.clave}>
                ⭐ {t(c.etiqueta)}
              </option>
            ))}
          </select>
        </>
      )}
      {conDatosCobro && cantidadYaCobroNoPago !== undefined && (
        <button
          onClick={() => set({ soloYaCobroNoPago: !filtros.soloYaCobroNoPago })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
            filtros.soloYaCobroNoPago ? 'bg-bad text-white border-bad' : 'border-bad/40 text-bad'
          }`}
          title={t('Ya pasó su día de cobro de este mes y todavía no pagó la cuota.')}
        >
          🔴 {t('Ya cobró – no pagó')} ({cantidadYaCobroNoPago})
        </button>
      )}
    </div>
  );
}

// Etiquetas chicas para la lista (calidad del cliente y "ya cobró – no pagó").
export function EtiquetaCalidad({ calificacion }: { calificacion: string | null | undefined }) {
  const t = useT();
  if (!calificacion) return null;
  const estilos: Record<string, string> = {
    bueno: 'bg-good/10 text-good',
    regular: 'bg-warn/10 text-warn',
    riesgoso: 'bg-bad/10 text-bad',
  };
  const c = CALIFICACIONES.find((x) => x.clave === calificacion);
  if (!c) return null;
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${estilos[calificacion] ?? ''}`}>{t(c.etiqueta)}</span>;
}

export function EtiquetaYaCobro() {
  const t = useT();
  return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-bad text-white">🔴 {t('Ya cobró – no pagó')}</span>;
}
