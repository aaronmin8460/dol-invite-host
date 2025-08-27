// src/app/api/blob/upload/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // i/숫자ID/ 아래 고정 파일명만 허용
        if (!/^i\/[0-9]{6,10}\/(index\.html|merged\.(png|jpe?g)|thumb_1200x630\.(jpe?g))$/i.test(pathname)) {
          throw new Error('허용되지 않은 경로 또는 파일명');
        }
        return {
          allowedContentTypes: ['text/html', 'image/png', 'image/jpeg'],
          addRandomSuffix: false, // ← 필수
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('blob upload completed', blob.pathname);
      },
    });

    return NextResponse.json(json, { headers: cors() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400, headers: cors() });
  }
}
