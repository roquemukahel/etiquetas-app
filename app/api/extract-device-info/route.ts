import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';
import { limpiarImei } from '../../lib/imei';

// Esta clave nunca se expone al celular/navegador: vive solo en el servidor.
// Se configura como variable de entorno ANTHROPIC_API_KEY (lo vemos al desplegar).
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACTION_PROMPT = `Estás viendo una foto tomada por un vendedor de celulares para cargar rápido un dispositivo al stock. Puede ser cualquiera de estas cosas:
(a) una captura de pantalla de "Información" de un iPhone (Ajustes > General > Información);
(b) una etiqueta impresa pegada al dispositivo o a su bolsa (etiqueta de grading/reacondicionado), con datos como modelo, almacenamiento, color abreviado, porcentaje de batería, código de barras e IMEI;
(c) la CAJA de un iPhone sellado (a estrenar): de frente se ve el modelo y el color impresos en la caja; de atrás se ve el código de barras, el IMEI/número de serie y la capacidad.

Extraé todos los datos que puedas identificar CON CONFIANZA. Si una etiqueta abrevia el color (ej. "Grphte", "MidnGrn", "Strlt"), expandilo a su nombre completo en español (ej. "Grafito", "Verde noche", "Blanco estrella"). Si un dato no aparece en la imagen o no estás seguro, poné null — nunca inventes ni adivines un valor.

Si es una foto de la CAJA de un equipo sellado (a estrenar, con film plástico, sin uso), marcá "sellado": true. En ese caso casi nunca hay un % de batería impreso — dejá "salud_bateria" en null (la app asume 100% para un sellado).

Respondé ÚNICAMENTE con un objeto JSON, sin texto adicional, con esta forma exacta:
{
  "modelo": string | null,
  "capacidad_gb": number | null,
  "color": string | null,
  "imei": string | null,
  "salud_bateria": number | null,
  "numero_serie": string | null,
  "version_ios": string | null,
  "sellado": boolean
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
      data = {
        modelo: null,
        capacidad_gb: null,
        color: null,
        imei: null,
        salud_bateria: null,
        numero_serie: null,
        version_ios: null,
        sellado: false,
      };
    }

    if (data.imei) data.imei = limpiarImei(data.imei);

    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    Sentry.captureException(err);
    return NextResponse.json(
      { error: 'No se pudo leer la foto' },
      { status: 500 }
    );
  }
}
