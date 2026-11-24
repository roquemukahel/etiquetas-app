'use client';

import { useState } from 'react';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { sanitizarDecimal } from '../../lib/numeros';
import {
  registrarMovimientoFondo,
  CATEGORIAS_FONDO,
  ETIQUETA_CATEGORIA_FONDO,
  SIMBOLO_CATEGORIA_FONDO,
  type CategoriaFondo,
  type TipoMovimientoFondo,
} from '../../lib/fondos';
import { Boton } from '../../Boton';
import Modal from '../../Modal';
import CampoFecha from '../../CampoFecha';
import { useT } from '../../lib/idioma';

function aFechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Formulario para registrar un ingreso o egreso manual en una de las 3 categorías de Fondos disponibles.
export default function ModalMovimientoFondo({
  categoriaInicial,
  tipoInicial = 'ingreso',
  onClose,
  onGuardado,
}: {
  categoriaInicial: CategoriaFondo;
  tipoInicial?: TipoMovimientoFondo;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const supabase = crearClienteNavegador();
  const t = useT();
  const [fecha, setFecha] = useState(() => aFechaLocal(new Date()));
  const [categoria, setCategoria] = useState<CategoriaFondo>(categoriaInicial);
  const [tipo, setTipo] = useState<TipoMovimientoFondo>(tipoInicial);
  const [descripcion, setDescripcion] = useState('');
  const [importe, setImporte] = useState('');
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
    setGuardando(true);
    setError(null);
    const resultado = await registrarMovimientoFondo(supabase, { fecha, categoria, tipo, importe: monto, descripcion });
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
    <Modal titulo={tipo === 'ingreso' ? t('Registrar ingreso') : t('Registrar egreso')} onClose={onClose} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-canvas dark:bg-dark-bg p-1">
          {(['ingreso', 'egreso'] as TipoMovimientoFondo[]).map((tp) => (
            <button
              key={tp}
              type="button"
              onClick={() => setTipo(tp)}
              className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                tipo === tp
                  ? tp === 'ingreso'
                    ? 'bg-good/15 text-good'
                    : 'bg-bad/15 text-bad'
                  : 'text-muted dark:text-dark-text-secondary'
              }`}
            >
              {tp === 'ingreso' ? `+ ${t('Ingreso')}` : `− ${t('Egreso')}`}
            </button>
          ))}
        </div>

        <div>
          <label className={etiqueta}>{t('Categoría')}</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaFondo)} className={campo}>
            {CATEGORIAS_FONDO.map((c) => (
              <option key={c} value={c}>
                {t(ETIQUETA_CATEGORIA_FONDO[c])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={etiqueta}>{t('Descripción')}</label>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={t('Ej. Retiro para pagar un proveedor')}
            autoFocus
            className={campo}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={etiqueta}>{t('Importe')}</label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted dark:text-dark-text-secondary">{SIMBOLO_CATEGORIA_FONDO[categoria]}</span>
              <input value={importe} onChange={(e) => setImporte(sanitizarDecimal(e.target.value))} inputMode="decimal" className={campo} />
            </div>
          </div>
          <div>
            <label className={etiqueta}>{t('Fecha')}</label>
            <CampoFecha value={fecha} onChange={setFecha} ancho="completo" />
          </div>
        </div>

        <div className="flex gap-2 mt-1">
          <Boton variante="secundario" tamano="md" onClick={onClose} className="flex-1">
            {t('Cancelar')}
          </Boton>
          <Boton variante={tipo === 'ingreso' ? 'exito' : 'peligro'} tamano="md" cargando={guardando} onClick={confirmar} className="flex-1">
            {t('Registrar')}
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
