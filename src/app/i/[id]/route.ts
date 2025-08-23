import type { NextRequest } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^[0-9]{6,10}$/.test(id)) return new Response('Invalid id', { status: 400 });

  const pathname = `i/${id}/index.html`;
  const { blobs } = await list({ prefix: pathname, limit: 10 });
  const blob = blobs.find(b => b.pathname === pathname) ?? blobs[0]; // 접미사 폴백
  if (!blob) return new Response('Not found', { status: 404 });

  const urlToFetch =
    (blob as unknown as { downloadUrl?: string; url: string }).downloadUrl ?? blob.url;

  const upstream = await fetch(urlToFetch);
  if (!upstream.ok) return new Response('Upstream error', { status: 502 });

  let html = await upstream.text();

  // 상대경로 고정
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head>/i, `<head><base href="/i/${id}/">`);
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
  });
}
