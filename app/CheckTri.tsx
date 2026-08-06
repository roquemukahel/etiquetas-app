// Toggle (switch) verde para el checklist de ingreso: encendido = funciona.
// - Normal: arranca ENCENDIDO (verde) por defecto; el técnico lo apaga (gris)
//   en lo que falla. Verde = funciona, gris = no funciona.
// - invertido (Humedad): encendido = "sí tiene humedad" (malo) → color de
//   alerta, y arranca APAGADO por defecto.
// - disabled: no se pudo probar (ej. Face ID/cámara cuando el módulo no anda):
//   queda gris, apagado y no clickeable.
export default function CheckTri({
  label,
  valor,
  onChange,
  invertido,
  disabled,
}: {
  label: string;
  valor: boolean | null;
  onChange: (v: boolean | null) => void;
  invertido?: boolean;
  disabled?: boolean;
}) {
  const on = disabled ? false : invertido ? valor === true : valor !== false;
  const colorOn = invertido ? 'bg-warn' : 'bg-good';
  return (
    <div className={`flex items-center justify-between gap-2 py-1 ${disabled ? 'opacity-50' : ''}`}>
      <span className="text-sm">
        {label}
        {disabled && <span className="text-[11px] text-muted dark:text-dark-text-secondary"> · no se pudo probar</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(on ? false : true)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          on ? colorOn : 'bg-border dark:bg-dark-border'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[22px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </div>
  );
}
