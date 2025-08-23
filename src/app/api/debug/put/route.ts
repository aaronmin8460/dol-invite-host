import { put } from '@vercel/blob';
export const dynamic = 'force-dynamic'; // 캐시 우회

export async function GET(): Promise<Response> {
  const { url, pathname } = await put('i/debug/hello.txt', 'Hello Blob!', {
    access: 'public',
  });
  return new Response(
    JSON.stringify({ ok: true, url, pathname }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } }
  );
}
