'use client';

// Tarjeta de catálogo con foto (trabajos, accesorios/productos) — antes cada
// pantalla (Órdenes > Nueva, Stock, recepción de Servicio Técnico) tenía su
// propia copia con la imagen en un tamaño fijo (h-16/h-28) dentro de una
// tarjeta cuyo ancho lo definía la grilla, así que en pantallas anchas
// quedaba un cuadro grande con una foto chica flotando en el medio. Acá la
// imagen ocupa todo el ancho de la tarjeta (aspect-square), así que siempre
// se ve del tamaño de la tarjeta, sin importar el viewport.
type CatalogoCardProps = {
  nombre: string;
  imagenUrl?: string | null;
  precio?: number | null;
  moneda?: string;
  emoji: string;
  onClick: () => void;
  seleccionado?: boolean;
  animIndex?: number;
};

export default function CatalogoCard({
  nombre,
  imagenUrl,
  precio,
  moneda = '$',
  emoji,
  onClick,
  seleccionado,
  animIndex = 0,
}: CatalogoCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-xl border p-1.5 flex flex-col items-center gap-1 text-center transition-colors ${
        seleccionado
          ? 'border-accent dark:border-dark-accent bg-accent/10 dark:bg-dark-accent/10'
          : 'border-border dark:border-dark-border bg-white dark:bg-dark-surface'
      }`}
    >
      <span className="block w-full aspect-square animate-flotar" style={{ animationDelay: `${(animIndex % 3) * 0.4}s` }}>
        {imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagenUrl}
            alt=""
            className="h-full w-full object-contain transition-transform duration-300 ease-out group-hover:animate-vaivenLateral"
          />
        ) : (
          <div className="h-full w-full rounded-lg bg-canvas dark:bg-dark-bg flex items-center justify-center text-3xl">{emoji}</div>
        )}
      </span>
      <span className="text-xs font-medium leading-tight line-clamp-2">{nombre}</span>
      {precio != null && (
        <span className="text-xs font-semibold">
          {moneda}
          {precio.toLocaleString('es-AR')}
        </span>
      )}
    </button>
  );
}
