'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { ESLOGAN } from '../../lib/eslogan';
import { imagenColorDeModelo } from '../../lib/coloresModelo';
import MiniaturaDispositivo from '../../MiniaturaDispositivo';

type ModeloDisponible = {
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  estado: string | null;
  cantidad: number;
};

type StockPublico = {
  nombre: string;
  logo_url: string | null;
  telefono: string | null;
  modelos: ModeloDisponible[];
};

export default function StockPublico() {
  const { token } = useParams<{ token: string }>();
  const supabase = crearClienteNavegador();
  const [datos, setDatos] = useState<StockPublico | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('stock_publico', { token });
      setDatos((data as StockPublico) ?? null);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-muted">Cargando...</p>
      </main>
    );
  }

  if (!datos) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-canvas">
        <p className="text-2xl">🔍</p>
        <p className="text-sm text-muted">
          No encontramos este stock. Puede que el link esté mal o que el local haya desactivado esta página.
        </p>
      </main>
    );
  }

  // Agrupa por nombre de modelo, para mostrar cada iPhone (o lo que sea)
  // como una sección con sus variantes de capacidad/color adentro — más
  // fácil de escanear que una lista plana.
  const porModelo = new Map<string, ModeloDisponible[]>();
  for (const m of datos.modelos) {
    const clave = m.modelo || 'Otro';
    if (!porModelo.has(clave)) porModelo.set(clave, []);
    porModelo.get(clave)!.push(m);
  }

  // bg-canvas/text-ink fijos (sin variantes dark:) en TODO este componente a
  // propósito: es una página PÚBLICA que ve cualquier cliente con el link, no
  // tiene por qué heredar el modo oscuro de la cuenta del negocio que la
  // generó. Eso era justo el bug reportado: si quien mira el link tiene una
  // sesión propia en modo oscuro, el texto (claro, pensado para fondo oscuro)
  // quedaba prácticamente invisible sobre las tarjetas blancas de acá.
  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-10 gap-6 bg-canvas">
      <div className="w-full max-w-xl flex flex-col gap-6 text-ink">
        <div className="flex flex-col items-center gap-2 text-center">
          {datos.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={datos.logo_url} alt={datos.nombre} className="h-20 w-20 rounded-2xl object-contain bg-white border border-border shadow-card" />
          )}
          <p className="text-xl font-display font-semibold">{datos.nombre}</p>
          <p className="text-sm text-muted">Stock disponible en tiempo real</p>
          {datos.telefono && <p className="text-xs text-muted">📞 {datos.telefono}</p>}
        </div>

        {porModelo.size === 0 ? (
          <p className="text-sm text-muted text-center bg-white rounded-2xl border border-border shadow-card p-6">
            No hay equipos disponibles en este momento.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {Array.from(porModelo.entries()).map(([modelo, variantes]) => (
              <div key={modelo} className="rounded-2xl bg-white border border-border shadow-card p-4 flex flex-col gap-3">
                <p className="text-base font-semibold">{modelo}</p>
                <div className="flex flex-col gap-2">
                  {variantes.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <MiniaturaDispositivo src={imagenColorDeModelo(v.modelo, v.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {v.capacidad_gb ? `${v.capacidad_gb}GB` : ''}
                          {v.color ? ` · ${v.color}` : ''}
                        </p>
                        {v.estado === 'sellado' && (
                          <span className="inline-block text-[10px] font-bold text-black bg-gradient-to-b from-amber-300 to-amber-500 border border-black/40 rounded-full px-2 py-0.5">
                            ✦ SELLADO
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-good shrink-0">
                        {v.cantidad} disponible{v.cantidad === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-0 leading-none opacity-70 mt-2">
          <div className="flex items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/qovento-icon.png" alt="" className="h-2.5 w-2.5 object-contain" />
            <span className="text-[8px] font-semibold text-muted tracking-wide">Qovento</span>
          </div>
          <p className="text-[7px] text-muted text-center max-w-xs leading-tight">{ESLOGAN}</p>
        </div>
      </div>
    </main>
  );
}
