import { list } from '@vercel/blob';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!/^[0-9]{6,10}$/.test(id)) return new Response('Invalid id', { status: 400 });

  const pathname = `i/${id}/index.html`;
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  const blob = blobs.find(b => b.pathname === pathname);
  if (!blob) return new Response('Not found', { status: 404 });

  const upstream = await fetch((blob as any).downloadUrl ?? blob.url);
  if (!upstream.ok) return new Response('Upstream error', { status: 502 });

  const html = await upstream.text();
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
  });
}
