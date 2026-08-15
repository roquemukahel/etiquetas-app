'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { registrarAuditoria } from '../../lib/auditoria';

type Negocio = { id: string; stock_publico_activo: boolean; token_stock_publico: string };

export default function StockPublicoConfig() {
  const supabase = crearClienteNavegador();
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( id, stock_publico_activo, token_stock_publico )')
        .eq('id', user.id)
        .single();
      setNegocio((perfil as any)?.negocios ?? null);
      setLoading(false);
    })();
  }, []);

  const toggleActivo = async () => {
    if (!negocio) return;
    const nuevoValor = !negocio.stock_publico_activo;
    setGuardando(true);
    const { error } = await supabase.from('negocios').update({ stock_publico_activo: nuevoValor }).eq('id', negocio.id);
    setGuardando(false);
    if (error) {
      alert('No pudimos guardar: ' + error.message);
      return;
    }
    setNegocio((prev) => (prev ? { ...prev, stock_publico_activo: nuevoValor } : prev));
    await registrarAuditoria(supabase, {
      accion: nuevoValor ? 'activó el enlace público de stock' : 'desactivó el enlace público de stock',
      entidad: 'negocio',
    });
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  if (!negocio) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No pudimos cargar la configuración.</p>
        <Link href="/configuracion" className="text-sm text-accent dark:text-dark-accent underline">
          Volver
        </Link>
      </main>
    );
  }

  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/stock-publico/${negocio.token_stock_publico}`;

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Stock público</span>
      </header>

      <p className="text-xs text-muted dark:text-dark-text-secondary -mt-2">
        Un enlace que le podés mandar a cualquier cliente para que vea, sin necesidad de cuenta, qué equipos tenés
        disponibles en este momento (modelo, capacidad, color y cuántos hay de cada uno — sin precios, IMEI ni costos).
        Se actualiza solo, en tiempo real.
      </p>

      <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4 flex flex-col gap-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-sm font-medium">Enlace activo</span>
          <input
            type="checkbox"
            checked={negocio.stock_publico_activo}
            disabled={guardando}
            onChange={toggleActivo}
            className="h-5 w-9 accent-ink"
          />
        </label>

        {negocio.stock_publico_activo && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted dark:text-dark-text-secondary break-all bg-canvas dark:bg-dark-bg rounded-lg px-3 py-2 font-mono">
              {link}
            </p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(link);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              }}
              className="self-start rounded-lg border border-border dark:border-dark-border px-3 py-2 text-xs font-medium"
            >
              {copiado ? '✓ Link copiado' : '🔗 Copiar link'}
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted dark:text-dark-text-secondary">
        Por defecto se muestran todos los equipos "en stock". Para ocultar uno puntual (ej. uno reservado), entrá a su
        ficha en Stock y destildá "Mostrar en el stock público".
      </p>
    </main>
  );
}
