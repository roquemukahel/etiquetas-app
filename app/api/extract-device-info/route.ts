import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Esta clave nunca se expone al celular/navegador: vive solo en el servidor.
// Se configura como variable de entorno ANTHROPIC_API_KEY (lo vemos al desplegar).
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACTION_PROMPT = `Estás viendo una captura de pantalla de "Información" o "Acerca de" de un iPhone (Ajustes > General > Información).
Extraé estos datos si están visibles. Si un dato no aparece en la imagen, poné null (no inventes valores).

Respondé ÚNICAMENTE con un objeto JSON, sin texto adicional, con esta forma exacta:
{
  "modelo": string | null,
  "capacidad_gb": number | null,
  "imei": string | null,
  "numero_serie": string | null,
  "version_ios": string | null
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
        imei: null,
        numero_serie: null,
        version_ios: null,
      };
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'No se pudo leer la foto' },
      { status: 500 }
    );
  }
}
