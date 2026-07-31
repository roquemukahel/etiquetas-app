'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from '../lib/supabase/client';
import { asegurarModelo } from '../lib/modelos';
import { obtenerImagenesCarpetas, imagenPorNombreExacto } from '../lib/carpetas';
import { registrarAuditoria } from '../lib/auditoria';
import MiniaturaDispositivo from '../MiniaturaDispositivo';

type Canje = {
  id: string;
  modelo: string | null;
  capacidad_gb: number | null;
  color: string | null;
  imei: string | null;
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
  const [imagenesCarpetas, setImagenesCarpetas] = useState<Map<string, string>>(new Map());

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
    (async () => setImagenesCarpetas(await obtenerImagenesCarpetas(supabase)))();
  }, []);

  const filtrados = useMemo(
    () => canjes.filter((c) => (verDerivados ? c.estado === 'servicio_tecnico' : c.estado === 'en_canje')),
    [canjes, verDerivados]
  );

  const derivar = async (id: string) => {
    if (!confirm('¿Derivar este dispositivo a Servicio Técnico?')) return;
    setProcesando(id);
    await supabase
      .from('canjes')
      .update({ estado: 'servicio_tecnico', fecha_ingreso_servicio: new Date().toISOString() })
      .eq('id', id);
    setProcesando(null);
    cargar();
  };

  const volverACanje = async (id: string) => {
    if (!confirm('¿Volver a mandar este equipo a Plan Canje?')) return;
    setProcesando(id);
    await supabase.from('canjes').update({ estado: 'en_canje', fecha_ingreso_servicio: null }).eq('id', id);
    setProcesando(null);
    cargar();
  };

  const agregarAlStock = async (c: Canje) => {
    if (!confirm('¿Agregar este dispositivo al Stock para venderlo?')) return;
    setProcesando(c.id);
    await supabase.from('dispositivos').insert({
      modelo: c.modelo,
      capacidad_gb: c.capacidad_gb,
      color: c.color,
      imei: c.imei,
      salud_bateria: c.salud_bateria,
      estado: 'usado',
      en_stock: true,
    });
    await asegurarModelo(supabase, c.modelo);
    await supabase.from('canjes').delete().eq('id', c.id);
    setProcesando(null);
    cargar();
  };

  const eliminar = async (c: Canje) => {
    if (!confirm('¿Eliminar este dispositivo de Plan Canje? Esta acción no se puede deshacer.')) return;
    setProcesando(c.id);
    await supabase.from('canjes').delete().eq('id', c.id);
    await registrarAuditoria(supabase, {
      accion: `eliminó de Plan Canje un dispositivo (${c.modelo || 'sin modelo'}${c.imei ? `, IMEI ${c.imei}` : ''})`,
      entidad: 'canje',
      entidadId: c.id,
      valorAnterior: { modelo: c.modelo, capacidad_gb: c.capacidad_gb, color: c.color, imei: c.imei, monto: c.monto },
    });
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
            !verDerivados ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          En canje
        </button>
        <button
          onClick={() => setVerDerivados(true)}
          className={`flex-1 rounded-xl py-2 font-medium ${
            verDerivados ? 'bg-accent dark:bg-dark-accent text-white' : 'bg-white dark:bg-dark-surface border border-border dark:border-dark-border text-ink dark:text-dark-text'
          }`}
        >
          Derivados a Servicio Técnico
        </button>
      </div>

      {loading && <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">Cargando...</p>}
      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted dark:text-dark-text-secondary text-center mt-6">No hay dispositivos para mostrar acá.</p>
      )}

      <div className="flex flex-col gap-2">
        {filtrados.map((c) => (
          <div key={c.id} className="rounded-xl border border-border dark:border-dark-border bg-white dark:bg-dark-surface shadow-card px-4 py-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <MiniaturaDispositivo src={imagenPorNombreExacto(c.modelo, imagenesCarpetas)} />
                <div>
                  <p className="text-sm font-medium">
                    {c.modelo}
                    {c.capacidad_gb ? ` · ${c.capacidad_gb}GB` : ''}
                    {c.color ? ` · ${c.color}` : ''}
                  </p>
                  {c.imei && (
                    <p className="text-xs text-muted dark:text-dark-text-secondary">
                      IMEI: <span className="font-bold font-mono text-ink dark:text-dark-text">{c.imei}</span>
                    </p>
                  )}
                  {c.salud_bateria != null && <p className="text-xs text-muted dark:text-dark-text-secondary">Batería: {c.salud_bateria}%</p>}
                </div>
              </div>
              {c.monto != null && <p className="text-sm font-medium">${c.monto.toLocaleString('es-AR')}</p>}
            </div>
            <div className="text-xs text-muted dark:text-dark-text-secondary flex flex-col gap-0.5">
              {c.detalles && <p>Detalles: {c.detalles}</p>}
              {c.vendedores?.nombre && <p>Recibido por: {c.vendedores.nombre}</p>}
            </div>
            {!verDerivados ? (
              <div className="flex gap-2 mt-1">
                <button
                  disabled={procesando === c.id}
                  onClick={() => agregarAlStock(c)}
                  className="flex-1 rounded-lg bg-accent dark:bg-dark-accent hover:bg-accent-hover dark:hover:bg-dark-accent-hover transition-colors py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  Agregar al Stock
                </button>
                <button
                  disabled={procesando === c.id}
                  onClick={() => derivar(c.id)}
                  className="flex-1 rounded-lg border border-border dark:border-dark-border py-2 text-xs font-medium disabled:opacity-40"
                >
                  Derivar a Servicio Técnico
                </button>
              </div>
            ) : (
              <button
                disabled={procesando === c.id}
                onClick={() => volverACanje(c.id)}
                className="mt-1 rounded-lg border border-border dark:border-dark-border py-2 text-xs font-medium disabled:opacity-40"
              >
                Volver a Plan Canje
              </button>
            )}
            <button
              disabled={procesando === c.id}
              onClick={() => eliminar(c)}
              className="rounded-lg border border-bad/30 py-2 text-xs font-medium text-bad disabled:opacity-40"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
