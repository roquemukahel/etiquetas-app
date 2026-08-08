'use client';

import SelectorColor from './SelectorColor';
import SelectorColorImagen from './SelectorColorImagen';
import { coloresDeModelo } from './lib/coloresModelo';

// Selector de color unificado para TODA la app (Stock, Servicio Técnico,
// canje, compras, etiqueta, etc.). Fuente única de verdad para que el color
// se elija igual en todos lados:
//  1. Si el modelo tiene fotos por color (todos los iPhone del 7 en adelante,
//     y varios más) -> selector de fotos, SIN paleta.
//  2. Si no tiene fotos (Samsung/Xiaomi/otros, o un iPhone viejo sin foto) ->
//     paleta de colores por hex, como respaldo, para que el color nunca falte.
// Con `label`, envuelve el control con su etiqueta.
export default function SelectorColorAuto({
  modelo,
  value,
  onChange,
  label,
}: {
  modelo: string | null | undefined;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const ci = coloresDeModelo(modelo);

  const control = ci ? (
    <SelectorColorImagen colores={ci} value={value} onChange={onChange} />
  ) : (
    <SelectorColor value={value} onChange={onChange} />
  );

  if (!label) return control;
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      {control}
    </div>
  );
}
