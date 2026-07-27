# Etiquetas — Paso 1.1 (base del proyecto)

Esto es el esqueleto inicial de la app: pantalla principal con el botón
"Nueva etiqueta" y configuración de PWA (instalable en el celular).
Todavía no hace nada más que navegar entre esas dos pantallas — eso viene
en los próximos pasos.

## Cómo correrlo en tu computadora

1. Instalá [Node.js](https://nodejs.org) (versión 18 o más nueva) si no lo tenés.
2. Abrí una terminal en esta carpeta y ejecutá:

   ```
   npm install
   npm run dev
   ```

3. Abrí `http://localhost:3000` en Chrome.

## Cómo probarlo en tu celular (misma red wifi)

1. Con `npm run dev` corriendo, fijate qué IP local tiene tu computadora
   (ej: 192.168.0.15).
2. En el celular, conectado a la misma wifi, abrí en Chrome o Safari:
   `http://192.168.0.15:3000`
3. Para "instalarla": en Chrome (Android) tocá el menú → "Instalar app".
   En Safari (iPhone) tocá compartir → "Agregar a pantalla de inicio".

Nota: el modo PWA completo (funcionar sin conexión, ícono, etc.) se ve
mejor una vez que la subamos a internet (eso lo hacemos más adelante,
gratis, con Vercel). Por ahora esto sirve para que veas y toques la
pantalla en tu propio teléfono.

## Estructura

```
app/
  page.tsx                 → pantalla principal
  nueva-etiqueta/page.tsx  → pantalla para cargar fotos (placeholder, sigue en el próximo paso)
  layout.tsx               → estructura común de toda la app
public/
  manifest.json            → configuración de instalación como app
  icons/                    → íconos de la app (placeholder, los cambiamos por tu logo)
```
