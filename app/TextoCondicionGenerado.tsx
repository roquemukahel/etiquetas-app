'use client';

import { useState } from 'react';
import { generarTextoCondicionIngreso } from './lib/reparaciones';

export default function TextoCondicionGenerado({ datos }: { datos: Parameters<typeof generarTextoCondicionIngreso>[0] }) {
  const [copiado, setCopiado] = useState(false);
  const texto = generarTextoCondicionIngreso(datos);
  if (!texto) return null;

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="rounded-lg bg-canvas dark:bg-dark-bg p-3 flex flex-col gap-2 mt-1">
      <p className="text-xs font-medium text-muted dark:text-dark-text-secondary">Texto para la boleta / cliente</p>
      <p className="text-xs whitespace-pre-wrap">{texto}</p>
      <button
        onClick={copiar}
        className="self-start rounded-lg border border-border dark:border-dark-border px-3 py-1.5 text-xs font-medium"
      >
        {copiado ? '✓ Copiado' : 'Copiar texto'}
      </button>
    </div>
  );
}
