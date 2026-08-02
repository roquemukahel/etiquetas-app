import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { crearClienteServidor } from '../../../lib/supabase/server';

// Solo el dueño de un negocio puede crear accesos (mail+contraseña) para
// sus vendedores. Crear una cuenta con contraseña real requiere la Admin
// API de Supabase (service role key), que no se puede invocar desde el
// navegador sin exponer esa clave — por eso esto es una ruta de servidor,
// no una función de SQL como el resto de las acciones del panel admin.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
  const vendedorId = typeof body?.vendedorId === 'string' ? body.vendedorId : null;

  if (!email || !password || (!vendedorId && !nombre)) {
    return NextResponse.json({ error: 'Faltan datos (mail, contraseña, y nombre o vendedor existente)' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
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
    return NextResponse.json({ error: 'Solo el dueño del negocio puede agregar vendedores con acceso' }, { status: 403 });
  }

  const { data: negocioId } = await supabase.rpc('negocio_actual');
  if (!negocioId) {
    return NextResponse.json({ error: 'No pudimos identificar tu negocio' }, { status: 400 });
  }

  // Si se eligió un vendedor ya cargado (nombre-tag existente), confirmamos
  // acá — con el cliente normal, así RLS ya garantiza que sea de este
  // negocio — que todavía no tenga un acceso vinculado.
  if (vendedorId) {
    const { data: vendedor, error: vendedorError } = await supabase
      .from('vendedores')
      .select('id, perfil_id')
      .eq('id', vendedorId)
      .maybeSingle();
    if (vendedorError || !vendedor) {
      return NextResponse.json({ error: 'No encontramos ese vendedor' }, { status: 404 });
    }
    if (vendedor.perfil_id) {
      return NextResponse.json({ error: 'Ese vendedor ya tiene un acceso creado' }, { status: 400 });
    }
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: nuevoUsuario, error: crearError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (crearError || !nuevoUsuario.user) {
    return NextResponse.json({ error: crearError?.message || 'No pudimos crear el acceso' }, { status: 400 });
  }

  const { error: perfilError } = await admin
    .from('perfiles')
    .insert({ id: nuevoUsuario.user.id, negocio_id: negocioId, es_dueno: false });
  if (perfilError) {
    // Sin perfil, esa cuenta no sirve para nada — no la dejamos huérfana.
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    return NextResponse.json({ error: 'No pudimos terminar de crear el acceso: ' + perfilError.message }, { status: 400 });
  }

  if (vendedorId) {
    const { error: linkError } = await admin
      .from('vendedores')
      .update({ perfil_id: nuevoUsuario.user.id })
      .eq('id', vendedorId);
    if (linkError) {
      // Sin este link, quedaría un login real que no aparece en ningún
      // lado de la pantalla de Vendedores — mejor deshacer todo.
      await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
      return NextResponse.json({ error: 'No pudimos terminar de crear el acceso: ' + linkError.message }, { status: 400 });
    }
  } else {
    const { error: vendedorInsertError } = await admin
      .from('vendedores')
      .insert({ nombre, negocio_id: negocioId, perfil_id: nuevoUsuario.user.id });
    if (vendedorInsertError) {
      await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
      return NextResponse.json({ error: 'No pudimos terminar de crear el acceso: ' + vendedorInsertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true, id: nuevoUsuario.user.id, email });
}
