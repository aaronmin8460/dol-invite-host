import type { NextRequest } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

type BlobRef = { url: string; pathname: string; downloadUrl?: string };

const mime = (name: string) => {
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; file: string[] }> }
): Promise<Response> {
  const { id, file } = await ctx.params;
  if (!/^[0-9]{6,10}$/.test(id)) return new Response('Invalid id', { status: 400 });

  const token = process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
  const rel = file.join('/');
  const pathname = `i/${id}/${rel}`;

  const { blobs } = await list({ prefix: pathname, limit: 10, token });
  const found = blobs.find(b => b.pathname === pathname) ?? blobs[0];
  if (!found) return new Response('Not found', { status: 404 });

  const ref = found as unknown as BlobRef;
  const upstream = await fetch(ref.downloadUrl ?? ref.url);
  if (!upstream.ok) return new Response('Upstream error', { status: 502 });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': mime(rel),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
