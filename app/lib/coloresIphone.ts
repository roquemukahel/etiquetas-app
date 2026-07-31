export const COLORES_IPHONE = [
  { nombre: 'Negro', hex: '#1c1c1e' },
  { nombre: 'Blanco', hex: '#f5f5f0' },
  { nombre: 'Silver', hex: '#e3e4e5' },
  { nombre: 'Space Gray', hex: '#54524f' },
  { nombre: 'Gold', hex: '#f0e2ce' },
  { nombre: 'Rose Gold', hex: '#f7ced3' },
  { nombre: 'Product Red', hex: '#b91c2b' },
  { nombre: 'Jet Black', hex: '#0a0a0a' },
  { nombre: 'Amarillo', hex: '#f9e478' },
  { nombre: 'Verde', hex: '#a3c6a8' },
  { nombre: 'Azul', hex: '#a0c0d8' },
  { nombre: 'Púrpura', hex: '#d0c1de' },
  { nombre: 'Rosa', hex: '#f6d6de' },
  { nombre: 'Coral', hex: '#f4816f' },
  { nombre: 'Grafito', hex: '#54524e' },
  { nombre: 'Pacific Blue', hex: '#3e5266' },
  { nombre: 'Midnight Green', hex: '#4e5851' },
  { nombre: 'Sierra Blue', hex: '#a6c2d6' },
  { nombre: 'Alpine Green', hex: '#7c8c7a' },
  { nombre: 'Midnight', hex: '#2c2c2e' },
  { nombre: 'Starlight', hex: '#f0ead6' },
  { nombre: 'Deep Purple', hex: '#4a3c53' },
  { nombre: 'Natural Titanium', hex: '#8c8577' },
  { nombre: 'Blue Titanium', hex: '#3b4a5a' },
  { nombre: 'White Titanium', hex: '#e9e5da' },
  { nombre: 'Black Titanium', hex: '#3a3a3c' },
  { nombre: 'Desert Titanium', hex: '#c9b190' },
  { nombre: 'Ultramarine', hex: '#4d6de0' },
  { nombre: 'Teal', hex: '#7ba6a0' },
];

export function hexColorDe(nombre: string | null | undefined) {
  const q = (nombre ?? '').trim().toLowerCase();
  if (!q) return null;
  return COLORES_IPHONE.find((c) => c.nombre.toLowerCase() === q)?.hex ?? null;
}
