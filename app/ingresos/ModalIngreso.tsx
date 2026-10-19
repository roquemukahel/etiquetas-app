'use client';

import { useState } from 'react';
import { crearClienteNavegador } from '../lib/supabase/client';
import { sanitizarDecimal } from '../lib/numeros';
import { MEDIOS_PAGO } from '../lib/cuentaCorriente';
import { NOMBRE_CAJA, type TipoCaja } from '../lib/caja/motor';
import { crearIngreso, editarIngreso, ETIQUETA_TIPO_INGRESO, type CajaIngreso, type Ingreso, type TipoIngreso } from '../lib/ingresos';
import type { Sucursal } from '../lib/sucursales';
import { useSucursalActual } from '../lib/sucursal';
import { Boton } from '../Boton';
import Modal from '../Modal';
import CampoFecha from '../CampoFecha';
import { useT } from '../lib/idioma';

// 'YYYY-MM-DD' con los componentes LOCALES de la fecha (nunca toISOString: pasa a UTC y de noche daba el día siguiente).
function aFechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Formulario de ingreso de capital: lo usan la pantalla Ingresos y el botón "+ Ingreso de capital" de Caja.
export default function ModalIngreso({
  ingresoAEditar,
  sucursales,
  monedaDefault,
  monedasDisponibles,
  cajaInicial = 'venta_diaria',
  sucursalInicial,
  onClose,
  onGuardado,
}: {
  ingresoAEditar?: Ingreso;
  sucursales: Sucursal[];
  monedaDefault: string;
  monedasDisponibles: string[];
  cajaInicial?: CajaIngreso;
  // Si se abre desde Caja, el ingreso va a la sucursal de esa caja (null = caja general, sin sucursal).
  sucursalInicial?: string | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const sucursalActual = useSucursalActual();
  const [fecha, setFecha] = useState(() => ingresoAEditar?.fecha ?? aFechaLocal(new Date()));
  const [tipo, setTipo] = useState<TipoIngreso>(ingresoAEditar?.tipo ?? 'aporte_capital');
  const [descripcion, setDescripcion] = useState(ingresoAEditar?.descripcion ?? '');
  const [importe, setImporte] = useState(ingresoAEditar ? String(ingresoAEditar.importe) : '');
  const [moneda, setMoneda] = useState(ingresoAEditar?.moneda ?? monedaDefault);
  const [medioPago, setMedioPago] = useState(ingresoAEditar?.medio_pago ?? 'efectivo');
  const [cajaTipo, setCajaTipo] = useState<CajaIngreso>(ingresoAEditar?.caja_tipo ?? cajaInicial);
  const [sucursalId, setSucursalId] = useState(
    ingresoAEditar ? ingresoAEditar.sucursal_id ?? '' : sucursalInicial !== undefined ? sucursalInicial ?? '' : sucursalActual.id ?? (sucursales.length === 1 ? sucursales[0].id : '')
  );
  const [aportadoPor, setAportadoPor] = useState(ingresoAEditar?.aportado_por ?? '');
  const [notas, setNotas] = useState(ingresoAEditar?.notas ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const confirmar = async () => {
    const monto = Number(importe) || 0;
    if (!descripcion.trim()) {
      setError(t('Poné una descripción.'));
      return;
    }
    if (monto <= 0) {
      setError(t('El importe tiene que ser mayor a 0.'));
      return;
    }
    if (sucursales.length > 1 && !sucursalId) {
      setError(t('Elegí una sucursal.'));
      return;
    }
    setGuardando(true);
    setError(null);
    const params = { fecha, tipo, descripcion, importe: monto, moneda, medioPago, cajaTipo, sucursalId: sucursalId || null, aportadoPor, notas };
    const resultado = ingresoAEditar ? await editarIngreso(supabase, ingresoAEditar, params) : await crearIngreso(supabase, params);
    setGuardando(false);
    if ('error' in resultado) {
      setError(resultado.error);
      return;
    }
    onGuardado();
  };

  const campo = 'w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm';
  const etiqueta = 'text-xs text-muted dark:text-dark-text-secondary block mb-1';

  return (
    <Modal titulo={ingresoAEditar ? t('Editar ingreso') : t('Registrar ingreso')} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className={etiqueta}>{t('Descripción')}</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={t('Ej. Aporte de capital del dueño')} className={campo} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiqueta}>{t('Fecha')}</label>
            <CampoFecha value={fecha} onChange={setFecha} ancho="completo" />
          </div>
          <div>
            <label className={etiqueta}>{t('Tipo')}</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoIngreso)} className={campo}>
              {(Object.entries(ETIQUETA_TIPO_INGRESO) as [TipoIngreso, string][]).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {t(label)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiqueta}>{t('Importe')}</label>
            <input value={importe} onChange={(e) => setImporte(sanitizarDecimal(e.target.value))} inputMode="decimal" className={campo} />
          </div>
          {monedasDisponibles.length > 1 ? (
            <div>
              <label className={etiqueta}>{t('Moneda')}</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={campo}>
                {monedasDisponibles.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={etiqueta}>{t('Medio')}</label>
              <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className={campo}>
                {MEDIOS_PAGO.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {t(m.label)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {monedasDisponibles.length > 1 && (
          <div>
            <label className={etiqueta}>{t('Medio')}</label>
            <select value={medioPago} onChange={(e) => setMedioPago(e.target.value)} className={campo}>
              {MEDIOS_PAGO.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {t(m.label)}
                </option>
              ))}
            </select>
          </div>
        )}
        {medioPago === 'efectivo' && (
          <div>
            <label className={etiqueta}>{t('Caja donde entra el efectivo')}</label>
            <select value={cajaTipo} onChange={(e) => setCajaTipo(e.target.value as CajaIngreso)} className={campo}>
              {(Object.keys(NOMBRE_CAJA) as TipoCaja[]).map((c) => (
                <option key={c} value={c}>
                  {t(NOMBRE_CAJA[c])}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1">{t('Suma al efectivo esperado del turno de esa caja.')}</p>
          </div>
        )}
        {sucursales.length > 1 && (
          <div>
            <label className={etiqueta}>{t('Sucursal')}</label>
            <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} className={campo}>
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
          <label className={etiqueta}>{t('Quién lo aporta (opcional)')}</label>
          <input value={aportadoPor} onChange={(e) => setAportadoPor(e.target.value)} placeholder={t('Ej. el dueño, un socio')} className={campo} />
        </div>
        <div>
          <label className={etiqueta}>{t('Notas (opcional)')}</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={campo} />
        </div>
        <div className="flex gap-2 mt-1">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante="primario" tamano="md" cargando={guardando} onClick={confirmar} className="flex-1">
            {ingresoAEditar ? t('Guardar cambios') : t('Registrar')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
