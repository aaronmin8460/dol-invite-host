import { list } from '@vercel/blob';

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;
  const pathname = `${slug}/index.html`;

  // 정확히 이 파일을 찾기 (Blob의 "폴더"처럼 prefix 사용)
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find(b => b.pathname === pathname);
  if (!blob) return new Response('Not found', { status: 404 });

  // Blob은 HTML을 첨부파일로 서빙하므로, 우리가 받아서 text/html로 다시 내려준다.
  // url 또는 downloadUrl 어느 쪽이든 fetch 가능.
  const res = await fetch((blob as any).downloadUrl ?? blob.url);
  if (!res.ok) return new Response('Upstream error', { status: 502 });

  const html = await res.text();
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // CDN 캐싱 (원하는 값으로 조절)
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
  });
}
