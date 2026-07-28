'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';
import { MONEDAS } from '../../lib/monedas';

type Negocio = {
  id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  logo_url: string | null;
  texto_garantia: string | null;
  texto_garantia_servicio: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  mostrar_instagram: boolean;
  mostrar_facebook: boolean;
  mostrar_tiktok: boolean;
  moneda: string;
  texto_declaracion_compra: string | null;
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
        .select(
          'negocio_id, negocios ( id, nombre, telefono, direccion, logo_url, texto_garantia, texto_garantia_servicio, instagram, facebook, tiktok, mostrar_instagram, mostrar_facebook, mostrar_tiktok, moneda, texto_declaracion_compra )'
        )
        .eq('id', user.id)
        .single();
      setNegocio((perfil as any)?.negocios ?? null);
      setLoading(false);
    })();
  }, []);

  const campo = (k: keyof Negocio, v: string) => setNegocio((prev) => (prev ? { ...prev, [k]: v } : prev));
  const campoBool = (k: keyof Negocio, v: boolean) => setNegocio((prev) => (prev ? { ...prev, [k]: v } : prev));

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
        texto_garantia_servicio: negocio.texto_garantia_servicio?.trim() || null,
        instagram: negocio.instagram?.trim() || null,
        facebook: negocio.facebook?.trim() || null,
        tiktok: negocio.tiktok?.trim() || null,
        mostrar_instagram: negocio.mostrar_instagram,
        mostrar_facebook: negocio.mostrar_facebook,
        mostrar_tiktok: negocio.mostrar_tiktok,
        moneda: negocio.moneda,
        texto_declaracion_compra: negocio.texto_declaracion_compra?.trim() || null,
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
              <img src={negocio.logo_url} alt="Logo" className="h-14 w-14 rounded-lg object-contain bg-white border border-border" />
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
          <label className="text-xs text-muted block mb-1">Moneda (se usa en la boleta)</label>
          <select
            value={negocio.moneda}
            onChange={(e) => campo('moneda', e.target.value)}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
          >
            {MONEDAS.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.nombre} ({m.simbolo})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">Garantía de productos (va en la boleta de venta)</label>
          <textarea
            value={negocio.texto_garantia ?? ''}
            onChange={(e) => campo('texto_garantia', e.target.value)}
            rows={8}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">
            Garantía de servicio técnico (va en la boleta cuando incluye un arreglo)
          </label>
          <textarea
            value={negocio.texto_garantia_servicio ?? ''}
            onChange={(e) => campo('texto_garantia_servicio', e.target.value)}
            rows={8}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">
            Declaración de compra (va en la boleta al comprarle un dispositivo a alguien)
          </label>
          <textarea
            value={negocio.texto_declaracion_compra ?? ''}
            onChange={(e) => campo('texto_declaracion_compra', e.target.value)}
            rows={6}
            placeholder="Declaro que el dispositivo entregado es de mi propiedad, ha sido obtenido de buena fe y que soy responsable de la información brindada."
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
          />
        </div>

        <p className="text-xs text-muted font-medium mt-2">Redes sociales (opcional)</p>
        <RedSocial
          label="Instagram"
          valor={negocio.instagram ?? ''}
          onChange={(v) => campo('instagram', v)}
          mostrar={negocio.mostrar_instagram}
          onToggleMostrar={(v) => campoBool('mostrar_instagram', v)}
        />
        <RedSocial
          label="Facebook"
          valor={negocio.facebook ?? ''}
          onChange={(v) => campo('facebook', v)}
          mostrar={negocio.mostrar_facebook}
          onToggleMostrar={(v) => campoBool('mostrar_facebook', v)}
        />
        <RedSocial
          label="TikTok"
          valor={negocio.tiktok ?? ''}
          onChange={(v) => campo('tiktok', v)}
          mostrar={negocio.mostrar_tiktok}
          onToggleMostrar={(v) => campoBool('mostrar_tiktok', v)}
        />
      </div>

      <button
        disabled={guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-accent hover:bg-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
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
        className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}

function RedSocial({
  label,
  valor,
  onChange,
  mostrar,
  onToggleMostrar,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  mostrar: boolean;
  onToggleMostrar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <label className="text-xs text-muted block mb-1">{label}</label>
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="@usuario"
          className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm"
        />
      </div>
      <label className="flex flex-col items-center gap-1 pt-4">
        <input
          type="checkbox"
          checked={mostrar}
          onChange={(e) => onToggleMostrar(e.target.checked)}
          className="h-5 w-5 accent-ink"
        />
        <span className="text-[10px] text-muted">en boleta</span>
      </label>
    </div>
  );
}
