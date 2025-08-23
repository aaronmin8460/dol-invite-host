// src/app/i/[id]/[...file]/route.ts
import { list } from '@vercel/blob';

const mime = (name: string) => {
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
};

export async function GET(
  _req: Request,
  { params }: { params: { id: string; file?: string[] } }
) {
  const id = params.id;
  if (!/^[0-9]{6,10}$/.test(id)) return new Response('Invalid id', { status: 400 });

  const rel = (params.file ?? []).join('/');
  if (!rel) return new Response('Not found', { status: 404 });

  const pathname = `i/${id}/${rel}`;
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find(b => b.pathname === pathname);
  if (!blob) return new Response('Not found', { status: 404 });

  const upstream = await fetch(blob.url);
  if (!upstream.ok) return new Response('Upstream error', { status: 502 });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': mime(rel),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
