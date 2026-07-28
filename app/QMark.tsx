export default function QMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <circle cx="50" cy="50" r="34" stroke="#355CDE" strokeWidth="9" />
      <line x1="67" y1="67" x2="86" y2="86" stroke="#355CDE" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}
