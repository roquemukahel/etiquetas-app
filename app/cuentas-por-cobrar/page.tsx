'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { useActor } from '../lib/actor';
import { tienePermiso } from '../lib/permisos';
import { simboloMoneda } from '../lib/monedas';
import { estadoCuenta, ESTADO_INFO } from '../lib/cuentaCorriente';

type Cliente = { id: string; nombre: string; apellido: string | null; suspendido: boolean | null };
type Saldo = { cliente_id: string; saldo: number; vencido: number };

type Fila = {
  id: string;
  nombre: string;
  saldo: number;
  vencido: number;
  suspendido: boolean;
};

export default function CuentasPorCobrar() {
  const supabase = crearClienteNavegador();
  const actor = useActor();
  // Misma llave que Estadísticas: es información sensible de plata.
  const puedeVer = tienePermiso(actor, 'ver_estadisticas');

  const [filas, setFilas] = useState<Fila[]>([]);
  const [monedaCodigo, setMonedaCodigo] = useState('ARS');
  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState<'saldo' | 'vencido' | 'nombre'>('saldo');

  const moneda = useMemo(() => simboloMoneda(monedaCodigo), [monedaCodigo]);

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    (async () => {
      const [{ data: saldosData }, { data: clientesData }, { data: userData }] = await Promise.all([
        supabase.rpc('saldos_cuenta_corriente'),
        supabase.from('clientes').select('id, nombre, apellido, suspendido'),
        supabase.auth.getUser(),
      ]);
      const clientes = new Map(((clientesData as Cliente[]) ?? []).map((c) => [c.id, c]));
      const armadas: Fila[] = ((saldosData as Saldo[]) ?? [])
        .map((s) => {
          const c = clientes.get(s.cliente_id);
          const saldo = Number(s.saldo) || 0;
          return {
            id: s.cliente_id,
            nombre: c ? `${c.nombre} ${c.apellido || ''}`.trim() : 'Cliente eliminado',
            saldo,
            vencido: Number(s.vencido) || 0,
            suspendido: !!c?.suspendido,
          };
        })
        .filter((f) => f.saldo > 0.009);
      setFilas(armadas);

      if (userData?.user) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('negocios ( moneda )')
          .eq('id', userData.user.id)
          .single();
        const cod = (perfil as any)?.negocios?.moneda;
        if (cod) setMonedaCodigo(cod);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer]);

  const ordenadas = useMemo(() => {
    const copia = [...filas];
    if (orden === 'nombre') copia.sort((a, b) => a.nombre.localeCompare(b.nombre));
    else if (orden === 'vencido') copia.sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);
    else copia.sort((a, b) => b.saldo - a.saldo);
    return copia;
  }, [filas, orden]);

  const totalPorCobrar = filas.reduce((acc, f) => acc + f.saldo, 0);
  const totalVencido = filas.reduce((acc, f) => acc + f.vencido, 0);
  const fmt = (n: number) => `${moneda}${Math.round(n).toLocaleString('es-AR')}`;

  if (!puedeVer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted dark:text-dark-text-secondary">No tenés permiso para ver Cuentas por cobrar.</p>
        <Link href="/" className="text-sm text-accent dark:text-dark-accent underline">
          Volver al inicio
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-6 gap-4 max-w-2xl mx-auto w-full">
      <header className="flex items-center gap-3">
        <Link href="/" className="text-2xl leading-none">
          &larr;
        </Link>
        <span className="text-lg font-medium">Cuentas por cobrar</span>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4">
          <p className="text-2xl font-display font-semibold leading-none text-warn">{fmt(totalPorCobrar)}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1.5">Total por cobrar (plata en la calle)</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-4">
          <p className={`text-2xl font-display font-semibold leading-none ${totalVencido > 0 ? 'text-bad' : ''}`}>{fmt(totalVencido)}</p>
          <p className="text-[11px] text-muted dark:text-dark-text-secondary mt-1.5">Vencido (a gestionar)</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">
          Nadie te debe nada por cuenta corriente. 🎉
        </p>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted dark:text-dark-text-secondary">Ordenar por:</span>
            {(['saldo', 'vencido', 'nombre'] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOrden(o)}
                className={`rounded-lg px-2.5 py-1 font-medium ${
                  orden === o ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border'
                }`}
              >
                {o === 'saldo' ? 'Deuda' : o === 'vencido' ? 'Vencido' : 'Nombre'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {ordenadas.map((f) => {
              const estado = estadoCuenta(f.saldo, f.vencido, f.suspendido);
              const info = ESTADO_INFO[estado];
              return (
                <Link
                  key={f.id}
                  href={`/clientes/${f.id}`}
                  className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.nombre}</p>
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${info.fondo}`}>
                      {info.label}
                      {f.vencido > 0 ? ` · vencido ${fmt(f.vencido)}` : ''}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-warn shrink-0">{fmt(f.saldo)}</p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
