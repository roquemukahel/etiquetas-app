'use client';

import SelectorColor from './SelectorColor';
import SelectorColorImagen from './SelectorColorImagen';
import { coloresDeModelo } from './lib/coloresModelo';
import { usePaletaColor } from './lib/usePaletaColor';

// Selector de color unificado para TODA la app (Stock, Servicio Técnico,
// canje, compras, etiqueta, etc.). Fuente única de verdad para que el color
// se elija igual en todos lados:
//  1. Si el modelo tiene fotos por color (todos los iPhone) -> selector de fotos.
//  2. Si no, y el negocio vende otras marcas -> paleta de colores por hex.
//  3. Si no (local solo-iPhone y modelo sin fotos) -> no se muestra nada.
// Con `label`, envuelve el control con su etiqueta y, si no hay control, no
// renderiza ni la etiqueta (no deja un "Color" colgado sin control).
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
  const paleta = usePaletaColor();

  const control = ci ? (
    <SelectorColorImagen colores={ci} value={value} onChange={onChange} />
  ) : paleta ? (
    <SelectorColor value={value} onChange={onChange} />
  ) : null;

  if (!control) return null;
  if (!label) return control;
  return (
    <div>
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      {control}
    </div>
  );
}
