// src/app/i/[id]/route.ts
import type { NextRequest } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

type BlobRef = { url: string; pathname: string; downloadUrl?: string };

async function buildHtml(
  req: NextRequest,
  id: string
): Promise<{ html: string; status: number; headers: HeadersInit }> {
  // 유효성
  if (!/^[0-9]{6,10}$/.test(id)) {
    return {
      html: 'Invalid id',
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    };
  }

  // Blob 토큰
  const token =
    process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return {
      html: 'Blob token missing',
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    };
  }

  const indexKey = `i/${id}/index.html`;
  const thumbKey = `i/${id}/thumb_1200x630.jpg`;

  // index.html 찾기 (접미사 폴백 포함)
  const { blobs: htmlBlobs } = await list({ prefix: indexKey, limit: 10, token });
  const foundHtml = htmlBlobs.find((b) => b.pathname === indexKey) ?? htmlBlobs[0];
  if (!foundHtml) {
    return {
      html: 'Not found',
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    };
  }

  const htmlRef = foundHtml as unknown as BlobRef;
  const upstream = await fetch(htmlRef.downloadUrl ?? htmlRef.url);
  if (!upstream.ok) {
    return {
      html: 'Upstream error',
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    };
  }
  let html = await upstream.text();

  // 썸네일(blob 절대 URL)
  const { blobs: thumbBlobs } = await list({ prefix: thumbKey, limit: 10, token });
  const foundThumb = thumbBlobs.find((b) => b.pathname === thumbKey) ?? thumbBlobs[0];
  const thumbRef = foundThumb as unknown as BlobRef | undefined;

  // 프로덕션(고정) 도메인으로 OG를 주입 (없으면 런타임 origin)
  const runtimeOrigin = new URL(req.url).origin;
  const canonicalOrigin =
    process.env.NEXT_PUBLIC_CANONICAL_ORIGIN || runtimeOrigin;

  const pageUrl = `${canonicalOrigin}/i/${id}/`;
  const ogImageAbs =
    thumbRef?.downloadUrl ??
    thumbRef?.url ??
    `${canonicalOrigin}/i/${id}/thumb_1200x630.jpg`;

  // <title>에서 제목 추출(없으면 기본값)
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  const title = (titleMatch?.[1] ?? '초대장').trim();

  // base 태그가 없으면 추가
  const hasBase = /<base\s/i.test(html);
  const baseTag = hasBase ? '' : `<base href="/i/${id}/">`;

  // 절대 OG/Twitter 메타를 <head> 맨 앞에 주입
  const ogMeta =
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

  html = html.replace(/<head>/i, `<head>${baseTag}${ogMeta}`);

  return {
    html,
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
      'X-Robots-Tag': 'all',
    },
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const built = await buildHtml(req, id);
  return new Response(built.html, { status: built.status, headers: built.headers });
}

// 일부 크롤러가 HEAD를 먼저 호출하는 경우 대응
export async function HEAD(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await ctx.params;
  const built = await buildHtml(req, id);
  return new Response(null, { status: built.status, headers: built.headers });
}
