'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';

type Negocio = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  logo_url: string | null;
  texto_garantia: string | null;
};

export default function DatosNegocio() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [negocio, setNegocio] = useState<Negocio | null>(null);
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
        .select('negocio_id, negocios ( id, nombre, telefono, direccion, logo_url, texto_garantia )')
        .eq('id', user.id)
        .single();
      setNegocio((perfil as any)?.negocios ?? null);
      setLoading(false);
    })();
  }, []);

  const campo = (k: keyof Negocio, v: string) => setNegocio((prev) => (prev ? { ...prev, [k]: v } : prev));

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => campo('logo_url', reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleGuardar = async () => {
    if (!negocio) return;
    setGuardando(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('negocios')
      .update({
        nombre: negocio.nombre.trim(),
        telefono: negocio.telefono?.trim() || null,
        direccion: negocio.direccion?.trim() || null,
        logo_url: negocio.logo_url || null,
        texto_garantia: negocio.texto_garantia?.trim() || null,
      })
      .eq('id', negocio.id);

    if (updateError) {
      setError('No pudimos guardar: ' + updateError.message);
      setGuardando(false);
      return;
    }

    router.push('/configuracion');
    router.refresh();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Cargando...</p>
      </main>
    );
  }

  if (!negocio) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">No encontramos tu negocio.</p>
        <Link href="/configuracion" className="text-sm text-accent underline">
          Volver
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/configuracion" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Datos del negocio</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-3">
        <div>
          <label className="text-xs text-muted block mb-1">Logo</label>
          <div className="flex items-center gap-3">
            {negocio.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={negocio.logo_url} alt="Logo" className="h-14 w-14 rounded-lg object-contain bg-white/60 border border-black/10" />
            )}
            <label className="text-sm text-accent underline cursor-pointer">
              {negocio.logo_url ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
            </label>
          </div>
        </div>

        <Campo label="Nombre del negocio" valor={negocio.nombre} onChange={(v) => campo('nombre', v)} />
        <Campo label="Teléfono" valor={negocio.telefono ?? ''} onChange={(v) => campo('telefono', v)} />
        <Campo label="Dirección" valor={negocio.direccion ?? ''} onChange={(v) => campo('direccion', v)} />

        <div>
          <label className="text-xs text-muted block mb-1">Texto de garantía (va en la boleta)</label>
          <textarea
            value={negocio.texto_garantia ?? ''}
            onChange={(e) => campo('texto_garantia', e.target.value)}
            rows={8}
            className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
          />
        </div>
      </div>

      <button
        disabled={guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-ink py-4 text-center text-base font-medium text-base disabled:opacity-40"
      >
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </main>
  );
}

function Campo({
  label,
  valor,
  onChange,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/60 border border-black/10 rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
