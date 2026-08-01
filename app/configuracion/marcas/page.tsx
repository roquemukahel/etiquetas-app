'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { MARCAS_DISPONIBLES, CATALOGO_MODELOS, normalizarNombreModelo } from '../../lib/catalogosMarcas';

export default function MarcasAVender() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [negocioId, setNegocioId] = useState<string | null>(null);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('negocios ( id, marcas_stock )')
        .eq('id', user.id)
        .single();
      const negocio = (perfil as any)?.negocios;
      setNegocioId(negocio?.id ?? null);
      setMarcas(negocio?.marcas_stock ?? []);
      setLoading(false);
    })();
  }, []);

  const toggleMarca = (id: string) =>
    setMarcas((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const handleGuardar = async () => {
    if (!negocioId) return;
    setGuardando(true);
    setError(null);

    const { error: updateError } = await supabase.from('negocios').update({ marcas_stock: marcas }).eq('id', negocioId);
    if (updateError) {
      setError('No pudimos guardar: ' + updateError.message);
      setGuardando(false);
      return;
    }

    const { data: existentes } = await supabase.from('modelos_stock').select('nombre');
    const nombresExistentes = new Set((existentes ?? []).map((m) => normalizarNombreModelo(m.nombre)));

    const nuevasCarpetas: string[] = [];
    for (const marcaId of marcas) {
      const catalogo = CATALOGO_MODELOS[marcaId];
      if (!catalogo) continue;
      for (const modelo of catalogo) {
        if (!nombresExistentes.has(normalizarNombreModelo(modelo))) {
          nombresExistentes.add(normalizarNombreModelo(modelo));
          nuevasCarpetas.push(modelo);
        }
      }
    }

    if (nuevasCarpetas.length > 0) {
      await supabase.from('modelos_stock').insert(nuevasCarpetas.map((nombre) => ({ nombre })));
    }

    router.push('/configuracion');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">Cargando...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Marcas a vender</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <p className="text-sm text-muted dark:text-dark-text-secondary">
        Elegí las marcas con las que trabajás. Para las que tienen catálogo (iPhone, Samsung), se van a crear
        automáticamente las carpetas de Stock con el nombre de cada modelo, para que no tengas que escribirlas a
        mano y terminar con carpetas repetidas por una mayúscula o un espacio de más. Podés seguir creando y
        editando carpetas manualmente desde Stock → Carpetas cuando quieras (por ejemplo, si vendés algo que no
        está en ninguna de estas listas).
      </p>

      <div className="flex flex-col gap-2">
        {MARCAS_DISPONIBLES.map((m) => {
          const elegida = marcas.includes(m.id);
          return (
            <label
              key={m.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm cursor-pointer ${
                elegida ? 'border-accent dark:border-dark-accent bg-accent-soft' : 'border-border dark:border-dark-border bg-white dark:bg-dark-surface'
              }`}
            >
              <input
                type="checkbox"
                checked={elegida}
                onChange={() => toggleMarca(m.id)}
                className="h-5 w-5 accent-ink shrink-0"
              />
              <span className="font-medium">{m.nombre}</span>
              {!CATALOGO_MODELOS[m.id] && (
                <span className="text-xs text-muted dark:text-dark-text-secondary ml-auto">sin catálogo</span>
              )}
            </label>
          );
        })}
      </div>

      <button
        disabled={guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </main>
  );
}
