import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // 허용 경로만
        if (!/^i\/[0-9]{6,10}\/(index\.html|merged\.png|thumb_1200x630\.jpg)$/i.test(pathname)) {
          throw new Error('허용되지 않은 경로 또는 파일명');
        }
        return {
          allowedContentTypes: ['text/html', 'image/png', 'image/jpeg'],
          addRandomSuffix: false,                // ← 이게 핵심!
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('blob upload completed', blob.pathname);
      },
    });

    return NextResponse.json(json);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
