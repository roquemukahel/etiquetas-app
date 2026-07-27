import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between px-6 py-10">
      <header className="w-full flex items-center justify-between">
        <span className="text-lg font-medium">Etiquetas</span>
        <span className="text-xs text-muted">v0.1</span>
      </header>

      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-14 w-14 rounded-2xl border-2 border-accent" />
        <p className="text-sm text-muted max-w-[220px]">
          Generá etiquetas de celulares en segundos
        </p>
      </div>

      <Link
        href="/nueva-etiqueta"
        className="w-full max-w-xs rounded-2xl bg-ink py-5 text-center text-lg font-medium text-base active:scale-[0.98] transition-transform"
      >
        Nueva etiqueta
      </Link>
    </main>
  );
}
