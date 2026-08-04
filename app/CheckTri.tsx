export default function CheckTri({
  label,
  valor,
  onChange,
  invertido,
}: {
  label: string;
  valor: boolean | null;
  onChange: (v: boolean | null) => void;
  invertido?: boolean;
}) {
  const opciones = invertido
    ? [
        { v: false, label: 'No' },
        { v: true, label: 'Sí' },
      ]
    : [
        { v: true, label: 'OK' },
        { v: false, label: 'Falla' },
      ];
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-muted dark:text-dark-text-secondary">{label}</label>
      <div className="flex gap-1.5">
        {opciones.map((op) => (
          <button
            key={String(op.v)}
            onClick={() => onChange(valor === op.v ? null : op.v)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
              valor === op.v ? 'bg-accent dark:bg-dark-accent text-white' : 'border border-border dark:border-dark-border'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>
  );
}
