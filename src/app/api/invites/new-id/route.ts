import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

function genNumericId(len = 7): string {
  const min = 10 ** (len - 1);
  const max = (10 ** len) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

export async function GET(): Promise<Response> {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Blob token missing (환경변수 설정/재배포 필요)' }),
      { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }

  for (let tries = 0; tries < 8; tries++) {
    const id = genNumericId(7);
    const pathname = `i/${id}/index.html`;
    const { blobs } = await list({ prefix: pathname, limit: 5, token });
    const exists = blobs.some(
      (b) => b.pathname === pathname || b.pathname.startsWith(pathname + '-')
    );
    if (!exists) {
      return new Response(JSON.stringify({ id }), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
  }

  return new Response(
    JSON.stringify({ error: '고유 ID 생성 실패(잠시 후 다시 시도)' }),
    { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } }
  );
}
