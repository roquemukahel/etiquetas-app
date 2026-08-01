export default function Avatar({ src, nombre, size = 34 }: { src?: string | null; nombre: string; size?: number }) {
  const estilo = { height: size, width: size, fontSize: Math.max(10, size * 0.4) };
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?';

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={estilo}
      className="rounded-full object-cover shrink-0 border border-border dark:border-dark-border"
    />
  ) : (
    <div
      style={estilo}
      className="rounded-full bg-accent-soft dark:bg-dark-accent-soft text-accent dark:text-dark-accent border border-border dark:border-dark-border flex items-center justify-center font-semibold shrink-0"
    >
      {inicial}
    </div>
  );
}
