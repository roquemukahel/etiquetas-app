export default function EtiquetaSeccion({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-block w-fit bg-ink text-white text-[11px] font-semibold uppercase tracking-wide rounded-md px-2.5 py-1 mb-2">
      {children}
    </p>
  );
}
