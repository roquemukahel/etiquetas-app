import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { crearClienteServidor } from '../../../lib/supabase/server';

// Borra el LOGIN de un vendedor (no su nombre-tag, que sigue existiendo
// para el historial de "quién hizo qué" — solo pierde el acceso). Solo el
// dueño del negocio puede hacerlo, y no sobre sí mismo ni sobre otro dueño.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const perfilId = typeof body?.perfilId === 'string' ? body.perfilId : null;
  if (!perfilId) {
    return NextResponse.json({ error: 'Falta el id del acceso a eliminar' }, { status: 400 });
  }

  const supabase = crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: esDueno } = await supabase.rpc('es_dueno_actual');
  if (!esDueno) {
    return NextResponse.json({ error: 'Solo el dueño del negocio puede eliminar accesos' }, { status: 403 });
  }

  if (perfilId === user.id) {
    return NextResponse.json({ error: 'No podés eliminar tu propio acceso desde acá' }, { status: 400 });
  }

  const { data: negocioId } = await supabase.rpc('negocio_actual');

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: perfilObjetivo } = await admin
    .from('perfiles')
    .select('id, negocio_id, es_dueno')
    .eq('id', perfilId)
    .maybeSingle();

  if (!perfilObjetivo || perfilObjetivo.negocio_id !== negocioId) {
    return NextResponse.json({ error: 'No encontramos ese acceso en tu negocio' }, { status: 404 });
  }
  if (perfilObjetivo.es_dueno) {
    return NextResponse.json({ error: 'No se puede eliminar el acceso de un dueño desde acá' }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(perfilId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
