'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { crearClienteNavegador } from './lib/supabase/client';
import { obtenerTodasLasFilas } from './lib/db';

type Cliente = { id: string; nombre: string; apellido: string | null; telefono: string | null; dni: string | null };
type Dispositivo = {
  id: string;
  modelo: string | null;
  imei: string | null;
  numero_serie: string | null;
  en_stock: boolean;
  capacidad_gb: number | null;
  color: string | null;
};
type Canje = {
  id: string;
  modelo: string | null;
  imei: string | null;
  detalles: string | null;
  estado: string;
  cliente_id: string | null;
  clientes: { nombre: string; apellido: string | null } | null;
};
type Compra = {
  id: string;
  modelo: string | null;
  imei: string | null;
  detalles: string | null;
  cliente_id: string | null;
  clientes: { nombre: string; apellido: string | null } | null;
};
type Orden = {
  id: string;
  total: number | null;
  estado: string;
  cliente_id: string | null;
  clientes: { nombre: string; apellido: string | null; telefono: string | null } | null;
  orden_items: { descripcion: string }[];
};

function coincide(texto: string | null | undefined, q: string) {
  return !!texto && texto.toLowerCase().includes(q);
}

function nombreCompleto(c: { nombre: string; apellido: string | null } | null | undefined) {
  if (!c) return null;
  return `${c.nombre} ${c.apellido || ''}`.trim();
}

export default function BuscadorUniversal() {
  const supabase = crearClienteNavegador();
  const [query, setQuery] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [cargado, setCargado] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [canjes, setCanjes] = useState<Canje[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [ordenes, setOrdenes] = useState<Orden[]>([]);

  const cargarDatos = async () => {
    if (cargado) return;
    setCargado(true);
    const [cl, di, { data: ca }, { data: co }, { data: or }] = await Promise.all([
      obtenerTodasLasFilas<Cliente>(supabase, 'clientes', 'id, nombre, apellido, telefono, dni'),
      obtenerTodasLasFilas<Dispositivo>(supabase, 'dispositivos', 'id, modelo, imei, numero_serie, en_stock, capacidad_gb, color'),
      supabase.from('canjes').select('id, modelo, imei, detalles, estado, cliente_id, clientes ( nombre, apellido )'),
      supabase.from('compras').select('id, modelo, imei, detalles, cliente_id, clientes ( nombre, apellido )'),
      supabase
        .from('ordenes')
        .select('id, total, estado, cliente_id, clientes ( nombre, apellido, telefono ), orden_items ( descripcion )'),
    ]);
    setClientes(cl);
    setDispositivos(di);
    setCanjes((ca as any) ?? []);
    setCompras((co as any) ?? []);
    setOrdenes((or as any) ?? []);
  };

  useEffect(() => {
    const cerrarSiAfuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrarSiAfuera);
    return () => document.removeEventListener('mousedown', cerrarSiAfuera);
  }, []);

  const q = query.trim().toLowerCase();
  const activo = q.length >= 2;

  const clientesCoincidentes = useMemo(
    () => (activo ? clientes.filter((c) => [c.nombre, c.apellido, c.telefono, c.dni].some((v) => coincide(v, q))) : []),
    [clientes, q, activo]
  );
  const idsClientesCoincidentes = useMemo(() => new Set(clientesCoincidentes.map((c) => c.id)), [clientesCoincidentes]);

  const dispositivosCoincidentes = useMemo(
    () => (activo ? dispositivos.filter((d) => [d.modelo, d.imei, d.numero_serie].some((v) => coincide(v, q))) : []),
    [dispositivos, q, activo]
  );

  const canjesCoincidentes = useMemo(
    () =>
      activo
        ? canjes.filter(
            (c) =>
              [c.modelo, c.imei, c.detalles].some((v) => coincide(v, q)) ||
              (c.cliente_id && idsClientesCoincidentes.has(c.cliente_id))
          )
        : [],
    [canjes, q, activo, idsClientesCoincidentes]
  );

  const comprasCoincidentes = useMemo(
    () =>
      activo
        ? compras.filter(
            (c) =>
              [c.modelo, c.imei, c.detalles].some((v) => coincide(v, q)) ||
              (c.cliente_id && idsClientesCoincidentes.has(c.cliente_id))
          )
        : [],
    [compras, q, activo, idsClientesCoincidentes]
  );

  const ordenesCoincidentes = useMemo(
    () =>
      activo
        ? ordenes.filter(
            (o) =>
              o.orden_items.some((i) => coincide(i.descripcion, q)) ||
              (o.cliente_id && idsClientesCoincidentes.has(o.cliente_id))
          )
        : [],
    [ordenes, q, activo, idsClientesCoincidentes]
  );

  const sinResultados =
    activo &&
    clientesCoincidentes.length === 0 &&
    dispositivosCoincidentes.length === 0 &&
    canjesCoincidentes.length === 0 &&
    comprasCoincidentes.length === 0 &&
    ordenesCoincidentes.length === 0;

  const linkCanje = (c: Canje) => (c.estado === 'en_canje' ? '/canje' : `/servicio-tecnico/etiqueta/${c.id}`);

  return (
    <div ref={contenedorRef} className="relative">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted dark:text-dark-text-secondary"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          cargarDatos();
          setAbierto(true);
        }}
        placeholder="Buscar cliente, teléfono, IMEI, orden o reparación…"
        className="w-full bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-2xl pl-11 pr-4 py-4 text-[15px] shadow-card focus:outline-none focus:ring-2 focus:ring-accent/40 dark:focus:ring-dark-accent/40 transition-shadow"
      />

      {abierto && activo && (
        <div className="absolute z-40 mt-2 w-full max-h-[70vh] overflow-y-auto rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-elevated p-2 flex flex-col gap-1">
          {sinResultados && (
            <p className="text-sm text-muted dark:text-dark-text-secondary text-center py-4">
              No encontramos nada con &quot;{query}&quot;.
            </p>
          )}

          <Grupo titulo="Clientes" cantidad={clientesCoincidentes.length}>
            {clientesCoincidentes.map((c) => (
              <Resultado
                key={c.id}
                href={`/clientes/${c.id}`}
                titulo={`${c.nombre} ${c.apellido || ''}`.trim()}
                subtitulo={[c.telefono, c.dni ? `DNI ${c.dni}` : null].filter(Boolean).join(' · ')}
                onClick={() => setAbierto(false)}
              />
            ))}
          </Grupo>

          <Grupo titulo="Stock" cantidad={dispositivosCoincidentes.length}>
            {dispositivosCoincidentes.map((d) => (
              <Resultado
                key={d.id}
                href={`/stock/${d.id}`}
                titulo={`${d.modelo || 'Dispositivo'}${d.capacidad_gb ? ` · ${d.capacidad_gb}GB` : ''}`}
                subtitulo={[d.imei ? `IMEI ${d.imei}` : null, d.en_stock ? 'En stock' : 'Fuera de stock'].filter(Boolean).join(' · ')}
                onClick={() => setAbierto(false)}
              />
            ))}
          </Grupo>

          <Grupo titulo="Plan Canje / Servicio Técnico" cantidad={canjesCoincidentes.length}>
            {canjesCoincidentes.map((c) => (
              <Resultado
                key={c.id}
                href={linkCanje(c)}
                titulo={c.modelo || 'Dispositivo'}
                subtitulo={[
                  nombreCompleto(c.clientes),
                  c.imei ? `IMEI ${c.imei}` : null,
                  c.estado === 'en_canje' ? 'En canje' : c.estado === 'reparado' ? 'Reparado' : 'En reparación',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => setAbierto(false)}
              />
            ))}
          </Grupo>

          <Grupo titulo="Compras (a individuos)" cantidad={comprasCoincidentes.length}>
            {comprasCoincidentes.map((c) => (
              <Resultado
                key={c.id}
                href={`/compras/${c.id}`}
                titulo={c.modelo || 'Dispositivo'}
                subtitulo={[nombreCompleto(c.clientes), c.imei ? `IMEI ${c.imei}` : null].filter(Boolean).join(' · ')}
                onClick={() => setAbierto(false)}
              />
            ))}
          </Grupo>

          <Grupo titulo="Órdenes" cantidad={ordenesCoincidentes.length}>
            {ordenesCoincidentes.map((o) => (
              <Resultado
                key={o.id}
                href={`/ordenes/${o.id}`}
                titulo={nombreCompleto(o.clientes) || 'Orden sin cliente'}
                subtitulo={[
                  o.orden_items[0]?.descripcion,
                  o.total != null ? `$${o.total.toLocaleString('es-AR')}` : null,
                  o.estado,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => setAbierto(false)}
              />
            ))}
          </Grupo>
        </div>
      )}
    </div>
  );
}

function Grupo({ titulo, cantidad, children }: { titulo: string; cantidad: number; children: React.ReactNode }) {
  if (cantidad === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted dark:text-dark-text-secondary px-2 pt-2">{titulo}</p>
      {children}
    </div>
  );
}

function Resultado({
  href,
  titulo,
  subtitulo,
  onClick,
}: {
  href: string;
  titulo: string;
  subtitulo: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-xl px-2 py-2 flex flex-col hover:bg-canvas dark:hover:bg-dark-bg transition-colors"
    >
      <span className="text-sm font-medium truncate">{titulo}</span>
      {subtitulo && <span className="text-xs text-muted dark:text-dark-text-secondary truncate">{subtitulo}</span>}
    </Link>
  );
}
