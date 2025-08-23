// src/app/api/invites/new-id/route.ts
import { list } from '@vercel/blob';

// (선택) 라우트를 항상 서버에서 동적으로 처리
export const dynamic = 'force-dynamic';

// 7자리 숫자 ID 생성
function genNumericId(len = 7): string {
  const min = 10 ** (len - 1);
  const max = (10 ** len) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

// 반드시 "export async function GET()" 를 내보내야 Next가 라우트로 인식합니다.
export async function GET(): Promise<Response> {
  // 충돌 방지: i/<id>/index.html 존재 여부 확인 후, 없는 ID만 반환
  for (let tries = 0; tries < 8; tries++) {
    const id = genNumericId(7);
    const pathname = `i/${id}/index.html`;
    const { blobs } = await list({ prefix: pathname, limit: 1 });
    const exists = blobs.some(b => b.pathname === pathname);
    if (!exists) {
      return new Response(JSON.stringify({ id }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  }

  return new Response(JSON.stringify({ error: '고유 ID 생성 실패(잠시 후 다시 시도)' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
