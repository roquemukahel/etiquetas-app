'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { crearClienteNavegador } from '../../lib/supabase/client';

export default function NuevoCliente() {
  const router = useRouter();
  const supabase = crearClienteNavegador();

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [dni, setDni] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const puedeGuardar = nombre.trim().length > 0;

  const handleGuardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);

    const { error: insertError } = await supabase.from('clientes').insert({
      nombre: nombre.trim(),
      apellido: apellido.trim() || null,
      domicilio: domicilio.trim() || null,
      email: email.trim() || null,
      telefono: telefono.trim() || null,
      dni: dni.trim() || null,
    });

    if (insertError) {
      setError('No pudimos guardar el cliente: ' + insertError.message);
      setGuardando(false);
      return;
    }

    router.push('/clientes');
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4">
      <header className="flex items-center gap-3">
        <Link href="/clientes" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Cargar cliente</span>
      </header>

      {error && <p className="text-sm text-bad bg-bad/10 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex flex-col gap-3">
        <Campo label="Nombre" valor={nombre} onChange={setNombre} />
        <Campo label="Apellido" valor={apellido} onChange={setApellido} />
        <Campo label="Domicilio" valor={domicilio} onChange={setDomicilio} />
        <Campo label="Email" valor={email} onChange={setEmail} />
        <Campo label="Teléfono" valor={telefono} onChange={setTelefono} />
        <Campo label="DNI" valor={dni} onChange={setDni} />
      </div>

      <button
        disabled={!puedeGuardar || guardando}
        onClick={handleGuardar}
        className="mt-auto w-full rounded-2xl bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-4 text-center text-base font-medium text-white disabled:opacity-40"
      >
        {guardando ? 'Guardando...' : 'Guardar cliente'}
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
      <label className="text-xs text-muted dark:text-dark-text-secondary block mb-1">{label}</label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl px-4 py-3 text-sm"
      />
    </div>
  );
}
