import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';

// Mismo patrón que app/api/extract-device-info/route.ts (Stock) — acá para
// Egresos: sacarle una foto a una factura/boleta (ej. compra de repuestos
// para Servicio Técnico) y completar el formulario solo, en vez de tipear
// todo a mano.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACTION_PROMPT = `Estás viendo una foto de una factura, boleta o ticket de compra que alguien sacó para cargar un egreso/gasto del negocio (ej. compra de repuestos, alquiler, servicios, insumos).

Extraé los datos que puedas identificar CON CONFIANZA. Si un dato no aparece o no estás seguro, poné null — nunca inventes ni adivines un valor.

- "monto": el TOTAL final de la factura/boleta (el número más grande, generalmente al pie), sin símbolo de moneda, como número.
- "moneda": "ARS" si ves "$" o "pesos" o es una factura argentina, "USD" si ves "US$" o "dólares", null si no se puede determinar.
- "comercio": el nombre del comercio/proveedor que emitió la factura (el que más se destaca arriba, no el del cliente).
- "fecha": la fecha de la factura en formato "YYYY-MM-DD", null si no se ve clara.
- "descripcion": un resumen muy corto de qué se compró (ej. "Repuestos para Servicio Técnico", "Pantallas iPhone 11"), basado en los ítems visibles. Si no se distinguen ítems, usá el nombre del comercio.

Respondé ÚNICAMENTE con un objeto JSON, sin texto adicional, con esta forma exacta:
{
  "monto": number | null,
  "moneda": string | null,
  "comercio": string | null,
  "fecha": string | null,
  "descripcion": string | null
}`;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64,
              },
            },
            { type: 'text', text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    const raw = textBlock && 'text' in textBlock ? textBlock.text : '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch {
      data = { monto: null, moneda: null, comercio: null, fecha: null, descripcion: null };
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    Sentry.captureException(err);
    return NextResponse.json({ error: 'No se pudo leer la foto' }, { status: 500 });
  }
}
