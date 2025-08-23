// src/app/i/[id]/route.ts
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
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find((b) => b.pathname === pathname);
  if (!blob) return new Response('Not found', { status: 404 });

  // url 또는 downloadUrl 모두 사용 가능. 우선 downloadUrl 우선.
  const upstream = await fetch((blob as any).downloadUrl ?? blob.url);
  if (!upstream.ok) return new Response('Upstream error', { status: 502 });

  let html = await upstream.text();

  // <head> 직후에 base 태그 삽입(이미 base가 있으면 중복 방지)
  if (!/<base\s/i.test(html)) {
    html = html.replace(
      /<head>/i,
      `<head><base href="/i/${id}/">`
    );
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
  });
}
