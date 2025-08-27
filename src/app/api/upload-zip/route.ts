// src/app/api/upload-zip/route.ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';     // ZIP 해제/Buffer 사용
export const maxDuration = 60;       // 업로드 여유

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  // 프리플라이트 허용
  return new Response(null, { status: 204, headers: cors() });
}

type PickFn = (target: string) => JSZip.JSZipObject | null;

export async function POST(req: Request) {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'Blob token missing' }, { status: 500, headers: cors() });
  }

  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const zipFile = form.get('zip') as File | null;

  if (!zipFile || !/^[0-9]{6,10}$/.test(id)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400, headers: cors() });
  }

  const buf = Buffer.from(await zipFile.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);

  const pick: PickFn = (target) => {
    let picked: JSZip.JSZipObject | null = null;
    zip.forEach((path, file) => {
      const base = path.split('/').pop();
      if (!file.dir && base === target) picked = file as JSZip.JSZipObject;
    });
    return picked;
  };

  // 필수/선택 파일 확인 (하위폴더 허용)
  const html = pick('index.html');
  const merged = pick('merged.jpg') ?? pick('merged.jpeg') ?? pick('merged.png');
  const thumb = pick('thumb_1200x630.jpg') ?? pick('thumb_1200x630.jpeg');

  if (!html) {
    return NextResponse.json({ error: 'missing index.html' }, { status: 400, headers: cors() });
  }
  if (!merged) {
    return NextResponse.json({ error: 'missing merged.(jpg|jpeg|png)' }, { status: 400, headers: cors() });
  }
  if (!thumb) {
    return NextResponse.json({ error: 'missing thumb_1200x630.(jpg|jpeg)' }, { status: 400, headers: cors() });
  }

  const uploads: Array<[string, JSZip.JSZipObject, string]> = [
    [merged.name.split('/').pop()!, merged, merged.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'],
    [thumb.name.split('/').pop()!, thumb, 'image/jpeg'],
    ['index.html', html, 'text/html'],
  ];

  const uploaded: string[] = [];
  for (const [outName, file, contentType] of uploads) {
    const content = await file.async('nodebuffer');
    const { pathname } = await put(`i/${id}/${outName}`, content, {
      access: 'public',
      addRandomSuffix: false,
      contentType,
      token,
    });
    uploaded.push(pathname);
  }

  return NextResponse.json({ ok: true, id, uploaded }, { headers: cors() });
}
