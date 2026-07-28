'use client';

import BotonSalir from '../BotonSalir';

export default function CuentaDesactivada() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-10 gap-4 text-center">
      <p className="text-2xl">🔒</p>
      <h1 className="text-xl font-display font-semibold">Esta cuenta está desactivada</h1>
      <p className="text-sm text-muted max-w-xs">
        Tu acceso a Qovento fue desactivado. Si creés que es un error, contactá a quien te dio de alta el servicio.
      </p>
      <BotonSalir />
    </main>
  );
}
