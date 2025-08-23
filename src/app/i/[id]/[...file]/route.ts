import type { NextRequest } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

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
  const { id, file } = await ctx.params; // Next 15: params는 Promise
  if (!/^[0-9]{6,10}$/.test(id)) return new Response('Invalid id', { status: 400 });

  const rel = file.join('/');            // [...file]은 필수 → 빈 배열일 일은 없음
  const pathname = `i/${id}/${rel}`;

  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find((b) => b.pathname === pathname);
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
