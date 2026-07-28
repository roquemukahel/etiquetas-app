export default function QMark({ size = 40 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/qovento-icon.png" alt="Qovento" width={size} height={size} style={{ width: size, height: size, objectFit: 'contain' }} />;
}
