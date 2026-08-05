import Link from 'next/link';
import ThemeToggle from '../ThemeToggle';
import Secciones from './Secciones';

export default function Configuracion() {
  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Configuración</span>
      </header>

      <div className="flex flex-col gap-3">
        <ThemeToggle />
        <Secciones />
      </div>

      <p className="text-xs text-muted dark:text-dark-text-secondary text-center mt-auto pt-4">
        <Link href="/terminos" className="underline">
          Términos y Condiciones
        </Link>
        {' · '}
        <Link href="/privacidad" className="underline">
          Política de Privacidad
        </Link>
      </p>
    </main>
  );
}
