'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';

type Canje = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  salud_bateria: number | null;
  detalles: string | null;
  monto: number | null;
  estado: string;
  vendedores: { nombre: string } | null;
};

export default function PlanCanje() {
  const supabase = crearClienteNavegador();
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [loading, setLoading] = useState(true);
  const [verDerivados, setVerDerivados] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = async () => {
    const { data } = await supabase
      .from('canjes')
      .select('*, vendedores ( nombre )')
      .order('created_at', { ascending: false });
    setCanjes((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(
    () => canjes.filter((c) => (verDerivados ? c.estado === 'servicio_tecnico' : c.estado === 'en_canje')),
    [canjes, verDerivados]
  );

  const derivar = async (id: string) => {
    if (!confirm('¿Derivar este dispositivo a Servicio Técnico?')) return;
    setProcesando(id);
    await supabase.from('canjes').update({ estado: 'servicio_tecnico' }).eq('id', id);
    setProcesando(null);
    cargar();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Plan Canje</span>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setVerDerivados(false)}
          className={`flex-1 rounded-xl py-2 font-medium ${
            !verDerivados ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
          }`}
        >
          En canje
        </button>
        <button
          onClick={() => setVerDerivados(true)}
          className={`flex-1 rounded-xl py-2 font-medium ${
            verDerivados ? 'bg-ink text-base' : 'bg-white/60 border border-black/10 text-ink'
          }`}
        >
          Derivados a Servicio Técnico
        </button>
      </div>

      {loading && <p className="text-sm text-muted text-center mt-6">Cargando...</p>}
      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted text-center mt-6">No hay dispositivos para mostrar acá.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((c) => (
          <div key={c.id} className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {c.modelo}
                  {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                  {c.color ? ` · ${c.color}` : ''}
                </p>
                {c.salud_bateria != null && <p className="text-xs text-muted">Batería: {c.salud_bateria}%</p>}
              </div>
              {c.monto != null && <p className="text-sm font-medium">${c.monto.toLocaleString('es-AR')}</p>}
            </div>
            <div className="text-xs text-muted flex flex-col gap-0.5">
              {c.detalles && <p>Detalles: {c.detalles}</p>}
              {c.vendedores?.nombre && <p>Recibido por: {c.vendedores.nombre}</p>}
            </div>
            {!verDerivados && (
              <button
                disabled={procesando === c.id}
                onClick={() => derivar(c.id)}
                className="mt-1 rounded-lg border border-black/15 py-2 text-xs font-medium disabled:opacity-40"
              >
                Derivar a Servicio Técnico
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
