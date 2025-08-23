// src/app/i/[id]/route.ts
import type { NextRequest } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^[0-9]{6,10}$/.test(id)) return new Response('Invalid id', { status: 400 });

  const token = process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
  const pathname = `i/${id}/index.html`;

  const { blobs } = await list({ prefix: pathname, limit: 10, token });
  const blob = blobs.find(b => b.pathname === pathname) ?? blobs[0];
  if (!blob) return new Response('Not found', { status: 404 });

  const upstream = await fetch((blob as any).downloadUrl ?? blob.url);
  if (!upstream.ok) return new Response('Upstream error', { status: 502 });

  let html = await upstream.text();

  // 절대 URL 생성 (카톡/카카오미리보기용)
  const origin = new URL(req.url).origin;
  const pageUrl = `${origin}/i/${id}/`;
  const ogImage = `${origin}/i/${id}/thumb_1200x630.jpg`;

  // <head> 바로 뒤에 base + 절대 OG 태그 주입 (가장 먼저 오도록)
  const inject =
    `<base href="/i/${id}/">` +
    `<meta property="og:url" content="${pageUrl}">` +
    `<meta property="og:image" content="${ogImage}">` +
    `<meta property="og:image:width" content="1200">` +
    `<meta property="og:image:height" content="630">` +
    `<meta name="twitter:card" content="summary_large_image">`;

  html = html.replace(/<head>/i, `<head>${inject}`);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
  });
}
