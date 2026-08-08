'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useActor } from '../lib/actor';
import { tienePermiso, Permiso } from '../lib/permisos';

// Cada sección puede pedir un permiso para verse. Las que no piden nada las
// ve cualquiera. Vendedores/Técnicos/Auditoría son solo para administrador
// (ver app/lib/permisos.ts) — quien no lo sea directamente no las ve, no
// solo le rebota al entrar.
type Seccion = { href: string; titulo: string; desc: string; permiso?: Permiso };

const SECCIONES: Seccion[] = [
  { href: '/configuracion/negocio', titulo: 'Datos del negocio', desc: 'Nombre, logo, contacto y garantía' },
  { href: '/configuracion/vendedores', titulo: 'Vendedores', desc: 'Quién atiende cada venta', permiso: 'gestionar_usuarios' },
  { href: '/configuracion/tecnicos', titulo: 'Técnicos', desc: 'Quién repara los equipos de Servicio Técnico', permiso: 'gestionar_usuarios' },
  { href: '/configuracion/financiacion', titulo: 'Financiación en cuotas', desc: 'Interés de cada plan (3, 6 y 12 cuotas)', permiso: 'gestionar_usuarios' },
  { href: '/configuracion/comisiones', titulo: 'Comisiones', desc: 'Comisión de los vendedores por venta (minorista/mayorista)', permiso: 'gestionar_comisiones' },
  { href: '/configuracion/carpetas', titulo: 'Carpetas del stock', desc: 'Unificar carpetas repetidas y borrar las vacías', permiso: 'agregar_stock' },
  { href: '/configuracion/suscripcion', titulo: 'Suscripción', desc: 'Estado del pago y plan de Qovento' },
  { href: '/configuracion/soporte', titulo: 'Soporte', desc: 'Reportá un problema o dejanos un mensaje' },
  { href: '/configuracion/auditoria', titulo: 'Auditoría', desc: 'Quién hizo qué y cuándo', permiso: 'auditoria' },
];

export default function Secciones() {
  const actor = useActor();
  // El actor vive en localStorage (solo en el navegador). En el primer
  // render (servidor + hidratación) todavía no lo tenemos, así que hasta
  // montar mostramos todo — igual que renderiza el servidor — y recién
  // después filtramos. Evita el desajuste de hidratación de React.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const visibles = SECCIONES.filter((s) => !s.permiso || !montado || tienePermiso(actor, s.permiso));

  return (
    <>
      {visibles.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="rounded-2xl bg-white dark:bg-dark-surface border border-border dark:border-dark-border shadow-card p-5 flex flex-col hover:border-accent/40 dark:hover:border-dark-accent/40 hover:shadow-elevated transition-all active:scale-[0.98]"
        >
          <span className="text-base font-medium">{s.titulo}</span>
          <span className="text-xs text-muted dark:text-dark-text-secondary">{s.desc}</span>
        </Link>
      ))}
    </>
  );
}
