'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-2xl">⚠️</p>
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="text-sm text-gray-500 max-w-xs">
          Ya nos avisamos del error. Probá recargar la página.
        </p>
        <button
          onClick={reset}
          className="rounded-xl bg-black text-white px-5 py-3 text-sm"
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
