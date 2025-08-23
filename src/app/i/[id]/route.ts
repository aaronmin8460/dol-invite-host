import type { NextRequest } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

type BlobRef = { url: string; pathname: string; downloadUrl?: string };

async function buildHtml(req: NextRequest, id: string): Promise<{ html: string; status: number; headers: HeadersInit }> {
  if (!/^[0-9]{6,10}$/.test(id)) {
    return { html: 'Invalid id', status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } };
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
  const indexKey = `i/${id}/index.html`;
  const thumbKey = `i/${id}/thumb_1200x630.jpg`;

  // index.html
  const { blobs: htmlBlobs } = await list({ prefix: indexKey, limit: 10, token });
  const foundHtml = htmlBlobs.find(b => b.pathname === indexKey) ?? htmlBlobs[0];
  if (!foundHtml) {
    return { html: 'Not found', status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } };
  }
  const htmlRef = foundHtml as unknown as BlobRef;
  const upstream = await fetch(htmlRef.downloadUrl ?? htmlRef.url);
  if (!upstream.ok) {
    return { html: 'Upstream error', status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } };
  }
  let html = await upstream.text();

  // 썸네일(절대 URL 만들어서 og:image로)
  const { blobs: thumbBlobs } = await list({ prefix: thumbKey, limit: 10, token });
  const foundThumb = thumbBlobs.find(b => b.pathname === thumbKey) ?? thumbBlobs[0];
  const origin = new URL(req.url).origin;
  const pageUrl = `${origin}/i/${id}/`;
  const ogImageAbs = foundThumb
    ? ((foundThumb as unknown as BlobRef).downloadUrl ?? (foundThumb as unknown as BlobRef).url)
    : `${origin}/i/${id}/thumb_1200x630.jpg`; // 폴백

  // <title>에서 제목 추출(없으면 기본값)
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || '초대장';

  // base 주입(중복 방지)
  if (!/<base\s/i.test(html)) {
    html = html.replace(/<head>/i, `<head><base href="/i/${id}/">`);
  }

  // 절대 OG/Twitter 메타를 <head> 맨 앞에 주입
  const inject =
    `<meta property="og:url" content="${pageUrl}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${title}">` +
    `<meta property="og:description" content="돌잔치 초대장">` +
    `<meta property="og:image" content="${ogImageAbs}">` +
    `<meta property="og:image:secure_url" content="${ogImageAbs}">` +
    `<meta property="og:image:width" content="1200">` +
    `<meta property="og:image:height" content="630">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta name="twitter:title" content="${title}">` +
    `<meta name="twitter:description" content="돌잔치 초대장">` +
    `<meta name="twitter:image" content="${ogImageAbs}">`;
  html = html.replace(/<head>/i, `<head>${inject}`);

  const headers: HeadersInit = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=600, s-maxage=3600',
    'X-Robots-Tag': 'all',
  };
  return { html, status: 200, headers };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const built = await buildHtml(req, id);
  return new Response(built.html, { status: built.status, headers: built.headers });
}

// 일부 크롤러가 HEAD 먼저 칠 수 있으므로 응답 헤더만 동일하게 반환
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const built = await buildHtml(req, id);
  return new Response(null, { status: built.status, headers: built.headers });
}
