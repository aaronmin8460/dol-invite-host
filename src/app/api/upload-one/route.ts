// src/app/api/upload-one/route.ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors() });
}

const ALLOWED = /^(index\.html|merged\.(png|jpe?g)|thumb_1200x630\.(jpe?g))$/i;

export async function POST(req: Request) {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'Blob token missing' }, { status: 500, headers: cors() });
  }

  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const name = String(form.get('name') ?? '');
  const file = form.get('file') as File | null;

  if (!file || !/^[0-9]{6,10}$/.test(id) || !ALLOWED.test(name)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400, headers: cors() });
  }

  const ct = name.endsWith('.html')
    ? 'text/html'
    : name.endsWith('.png')
    ? 'image/png'
    : 'image/jpeg';

  const buf = Buffer.from(await file.arrayBuffer());
  const { pathname } = await put(`i/${id}/${name}`, buf, {
    access: 'public',
    addRandomSuffix: false,
    contentType: ct,
    token,
  });

  return NextResponse.json({ ok: true, pathname }, { headers: cors() });
}
