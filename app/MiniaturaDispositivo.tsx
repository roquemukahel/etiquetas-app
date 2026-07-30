export default function MiniaturaDispositivo({ src, size = 40 }: { src: string | null; size?: number }) {
  const estilo = { height: size, width: size };
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={estilo}
      className="rounded-lg object-cover shrink-0 border border-border dark:border-dark-border"
    />
  ) : (
    <div
      style={estilo}
      className="rounded-lg bg-canvas dark:bg-dark-bg border border-border dark:border-dark-border flex items-center justify-center text-base shrink-0"
    >
      📱
    </div>
  );
}
