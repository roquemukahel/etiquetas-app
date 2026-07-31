export const PAISES = [
  { codigo: 'AR', nombre: 'Argentina', llamada: '54' },
  { codigo: 'MX', nombre: 'México', llamada: '52' },
  { codigo: 'UY', nombre: 'Uruguay', llamada: '598' },
  { codigo: 'CL', nombre: 'Chile', llamada: '56' },
  { codigo: 'PY', nombre: 'Paraguay', llamada: '595' },
  { codigo: 'BO', nombre: 'Bolivia', llamada: '591' },
  { codigo: 'PE', nombre: 'Perú', llamada: '51' },
  { codigo: 'CO', nombre: 'Colombia', llamada: '57' },
  { codigo: 'BR', nombre: 'Brasil', llamada: '55' },
  { codigo: 'EC', nombre: 'Ecuador', llamada: '593' },
  { codigo: 'VE', nombre: 'Venezuela', llamada: '58' },
  { codigo: 'ES', nombre: 'España', llamada: '34' },
  { codigo: 'US', nombre: 'Estados Unidos', llamada: '1' },
];

export function codigoLlamada(pais: string | null | undefined) {
  return PAISES.find((p) => p.codigo === pais)?.llamada ?? '54';
}
