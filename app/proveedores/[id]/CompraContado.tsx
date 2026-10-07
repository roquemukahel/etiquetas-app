'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useT } from '../../lib/idioma';
import { sanitizarDecimal, formatearMonto } from '../../lib/numeros';
import { comprimirImagen } from '../../lib/comprimirImagen';
import { registrarAuditoria } from '../../lib/auditoria';
import { montosPorRubro, pagoDeCompra, validarReparto, type LineaRubro } from '../../lib/rubrosCompra';
import type { Sucursal } from '../../lib/sucursales';
import type { AreaEgreso } from '../../lib/egresos';
import type { Categoria } from '../../lib/categorias';
import { registrarFallo } from '../../lib/escritura';

// Compra de contado en un solo paso: registra la compra (por rubro), la deuda y
// el pago juntos, así el proveedor queda en $0 sin tener que cargar "deuda" y
// después "pago" a mano. Si se paga solo una parte, queda debiendo la diferencia.
type Props = {
  supabase: SupabaseClient;
  proveedorId: string;
  sucursales: Sucursal[];
  areas: AreaEgreso[];
  categorias: Categoria[];
  sucursalInicial: string;
  actorNombre: string | null;
  actorFoto: string | null;
  onCerrar: () => void;
  onGuardado: () => void;
};

const MEDIOS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'débito', label: 'Débito' },
  { id: 'crédito', label: 'Crédito' },
  { id: 'usdt', label: 'USDT' },
  { id: 'cheque', label: 'Cheque' },
];

const campo = 'w-full bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 text-sm';

export default function CompraContado({
  supabase,
  proveedorId,
  sucursales,
  areas,
  categorias,
  sucursalInicial,
  actorNombre,
  actorFoto,
  onCerrar,
  onGuardado,
}: Props) {
  const t = useT();
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [lineas, setLineas] = useState<LineaRubro[]>([{ categoriaId: '', monto: '' }]);
  const [medio, setMedio] = useState('efectivo');
  const [sucursal, setSucursal] = useState(sucursalInicial);
  const [area, setArea] = useState('');
  const [observacion, setObservacion] = useState('');
  const [factura, setFactura] = useState<string | null>(null);
  const [pagoParcial, setPagoParcial] = useState(false);
  const [quedaDebiendo, setQuedaDebiendo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Number(monto) || 0;
  const sumaLineas = lineas.reduce((acc, l) => acc + (Number(l.monto) || 0), 0);
  const nombreRubro = (id: string) => categorias.find((c) => c.id === id)?.nombre ?? '';

  const elegirFactura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setFactura(await comprimirImagen(file));
    } catch {
      setError(t('No pudimos leer la foto de la factura.'));
    }
  };

  const guardar = async () => {
    setError(null);
    if (!(total > 0)) {
      setError(t('Poné el monto total de la compra.'));
      return;
    }
    const errorReparto = validarReparto(lineas, total);
    if (errorReparto) {
      setError(t(errorReparto));
      return;
    }
    const pago = pagoDeCompra(total, pagoParcial ? quedaDebiendo : null);
    if ('error' in pago) {
      setError(t(pago.error));
      return;
    }

    setGuardando(true);
    const grupo = crypto.randomUUID();
    const reparto = montosPorRubro(lineas, total);
    const filasCompra = reparto.map((r, i) => ({
      proveedor_id: proveedorId,
      modelo: descripcion.trim() || nombreRubro(r.categoriaId) || t('Compra de contado'),
      cantidad: 1,
      precio_unitario: r.monto,
      detalles: observacion.trim() || null,
      sucursal_id: sucursal || null,
      area_id: area || null,
      categoria_id: r.categoriaId,
      compra_grupo_id: grupo,
      // La foto se guarda una sola vez por compra (en la primera línea).
      tiene_factura: !!factura && i === 0,
      ...(factura && i === 0 ? { factura_url: factura } : {}),
    }));
    const { error: errorCompra } = await supabase.from('compras_proveedor').insert(filasCompra);
    if (errorCompra) {
      setError(
        /column|schema cache/i.test(errorCompra.message)
          ? t('Falta activar esta función en la base de datos (compra_contado_rubros_supabase.sql).')
          : t('No pudimos guardar la compra:') + ' ' + errorCompra.message
      );
      setGuardando(false);
      return;
    }

    const base = {
      proveedor_id: proveedorId,
      registrado_por_nombre: actorNombre,
      registrado_por_foto_url: actorFoto,
      sucursal_id: sucursal || null,
      area_id: area || null,
      compra_grupo_id: grupo,
    };
    const movimientos = [
      { ...base, tipo: 'cargo', concepto: 'deuda', monto: total, medio: null, observacion: [t('Compra'), descripcion.trim(), observacion.trim()].filter(Boolean).join(' · ') },
      ...(pago.pagado > 0
        ? [{ ...base, tipo: 'abono', concepto: 'pago', monto: pago.pagado, medio, observacion: t('Compra de contado') }]
        : []),
    ];
    // Deuda y pago van en un solo insert: o quedan los dos o ninguno.
    const { error: errorMov } = await supabase.from('proveedor_movimientos').insert(movimientos);
    if (errorMov) {
      // Sin los movimientos la compra no quedaría reflejada en el saldo: se deshace.
      const { error: errorDeshacer } = await supabase.from('compras_proveedor').delete().eq('compra_grupo_id', grupo);
      if (errorDeshacer) registrarFallo(errorDeshacer, 'deshacer compra de contado sin movimientos');
      setError(t('No pudimos registrar la deuda y el pago:') + ' ' + errorMov.message);
      setGuardando(false);
      return;
    }

    await registrarAuditoria(supabase, {
      accion: `registró una compra de contado a un proveedor ($${formatearMonto(total)}${pago.pagado < total ? `, quedó debiendo $${formatearMonto(total - pago.pagado)}` : ''})`,
      entidad: 'proveedor',
      entidadId: proveedorId,
      valorNuevo: { total, pagado: pago.pagado, rubros: reparto.map((r) => ({ rubro: nombreRubro(r.categoriaId), monto: r.monto })) },
    });
    setGuardando(false);
    onGuardado();
  };

  return (
    <div className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card p-3 flex flex-col gap-2">
      <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">{t('Compra de contado')}</p>
      <p className="text-[11px] text-muted dark:text-dark-text-secondary">
        {t('Registra la compra y el pago juntos: el proveedor queda en $0, salvo que elijas dejar una parte debiendo.')}
      </p>
      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={t('Qué compraste (opcional)')} className={campo} />
      <input
        value={monto}
        onChange={(e) => setMonto(sanitizarDecimal(e.target.value))}
        inputMode="decimal"
        placeholder={t('Monto total')}
        className={campo}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted dark:text-dark-text-secondary">{t('Rubro')} *</label>
        {lineas.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select
              value={l.categoriaId}
              onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, categoriaId: e.target.value } : x)))}
              className={`${campo} flex-1`}
            >
              <option value="">{t('Elegí el rubro')}</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {lineas.length > 1 && (
              <>
                <input
                  value={l.monto}
                  onChange={(e) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, monto: sanitizarDecimal(e.target.value) } : x)))}
                  inputMode="decimal"
                  placeholder={t('Monto')}
                  className={`${campo} w-28`}
                />
                <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} aria-label={t('Quitar rubro')} className="text-bad px-1">
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setLineas((ls) => [...ls, { categoriaId: '', monto: '' }])}
            className="text-xs text-accent dark:text-dark-accent underline self-start"
          >
            + {t('Repartir entre varios rubros')}
          </button>
          {lineas.length > 1 && (
            <span className={`text-[11px] ${Math.abs(sumaLineas - total) < 0.01 ? 'text-good' : 'text-warn'}`}>
              {t('Repartido')}: ${formatearMonto(sumaLineas)} / ${formatearMonto(total)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-muted dark:text-dark-text-secondary">{t('Forma de pago')}</label>
        <select value={medio} onChange={(e) => setMedio(e.target.value)} className={campo}>
          {MEDIOS.map((m) => (
            <option key={m.id} value={m.id}>
              {t(m.label)}
            </option>
          ))}
        </select>
      </div>

      {(sucursales.length > 1 || areas.length > 0) && (
        <div className="flex gap-2">
          {sucursales.length > 1 && (
            <select value={sucursal} onChange={(e) => setSucursal(e.target.value)} className={`${campo} flex-1`} aria-label={t('Pagado desde')}>
              <option value="">🏬 {t('Pagado desde: sin sucursal')}</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  🏬 {t('Pagado desde')} {s.nombre}
                </option>
              ))}
            </select>
          )}
          {areas.length > 0 && (
            <select value={area} onChange={(e) => setArea(e.target.value)} className={`${campo} flex-1`}>
              <option value="">{t('Sin área')}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPagoParcial(false)}
          className={`flex-1 rounded-lg py-2 text-xs font-medium ${!pagoParcial ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'}`}
        >
          {t('Pagué todo')}
        </button>
        <button
          type="button"
          onClick={() => setPagoParcial(true)}
          className={`flex-1 rounded-lg py-2 text-xs font-medium ${pagoParcial ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'}`}
        >
          {t('Quedé debiendo una parte')}
        </button>
      </div>
      {pagoParcial && (
        <input
          value={quedaDebiendo}
          onChange={(e) => setQuedaDebiendo(sanitizarDecimal(e.target.value))}
          inputMode="decimal"
          placeholder={t('Cuánto quedé debiendo')}
          className={campo}
        />
      )}

      <input value={observacion} onChange={(e) => setObservacion(e.target.value)} placeholder={t('Observación (opcional)')} className={campo} />

      <label className="text-xs text-muted dark:text-dark-text-secondary flex flex-col gap-1">
        {t('Foto de la factura (opcional)')}
        <input type="file" accept="image/*" onChange={elegirFactura} className="text-xs" />
        {factura && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={factura} alt="" className="h-24 w-auto rounded-lg border border-border dark:border-dark-border object-contain self-start" />
        )}
      </label>

      <div className="flex gap-2">
        <button onClick={onCerrar} className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-sm font-medium">
          {t('Cancelar')}
        </button>
        <button
          disabled={guardando}
          onClick={guardar}
          className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {guardando ? t('Guardando...') : t('Registrar compra')}
        </button>
      </div>
    </div>
  );
}
