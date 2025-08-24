// src/app/api/upload-zip/route.ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Buffer 사용

type Picked = JSZip.JSZipObject | null;

function detectContentType(name: string) {
  if (name.endsWith('.html')) return 'text/html';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

export async function POST(req: Request) {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Blob token missing' },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  const zipFile = form.get('zip') as File | null;

  if (!zipFile || !/^[0-9]{6,10}$/.test(id)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const buf = Buffer.from(await zipFile.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);

  const pick = (target: string): Picked => {
    let picked: Picked = null;
    zip.forEach((path, file) => {
      const base = path.split('/').pop();
      if (!file.dir && base === target) picked = file;
    });
    return picked;
  };

  const expected = ['index.html', 'merged.png', 'thumb_1200x630.jpg'] as const;
  for (const name of expected) {
    if (!pick(name)) {
      return NextResponse.json({ error: `missing ${name}` }, { status: 400 });
    }
  }

  const uploaded: string[] = [];
  for (const name of expected) {
    const file = pick(name)!;
    const contentType = detectContentType(name);
    const content = await file.async('nodebuffer'); // Buffer
    const res = await put(`i/${id}/${name}`, content, {
      access: 'public',
      addRandomSuffix: false,    // 고정 파일명!
      contentType,
      token,
    });
    uploaded.push(res.pathname);
  }

  return NextResponse.json({ ok: true, id, uploaded });
}
