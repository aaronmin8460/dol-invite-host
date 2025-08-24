// src/app/api/debug/blob/route.ts
import type { NextRequest } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

type BlobInfo = { pathname: string };

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const prefixParam = url.searchParams.get('prefix') ?? undefined;

  const token =
    process.env.BLOB_READ_WRITE_TOKEN ?? process.env.VERCEL_BLOB_READ_WRITE_TOKEN;

  try {
    // 1) 기본 헬스체크(list 호출)
    const base = await list({
      limit: 5,
      prefix: prefixParam,
      token: token ?? undefined,
    });

    // 2) id가 있으면 해당 경로 키들 나열
    let idKeys: BlobInfo[] | null = null;
    if (id && /^[0-9]{6,10}$/.test(id)) {
      const { blobs } = await list({ prefix: `i/${id}/`, token: token ?? undefined });
      idKeys = blobs.map(b => ({ pathname: b.pathname }));
    }

    const payload = {
      ok: true,
      hasToken: Boolean(token),
      region: process.env.VERCEL_REGION ?? null,
      location: process.env.VERCEL_LOCATION ?? null,
      sampleCount: base.blobs.length,
      sample: base.blobs.map(b => ({ pathname: b.pathname })),
      id,
      idKeys,
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const payload = {
      ok: false,
      hasToken: Boolean(token),
      error: msg,
    };
    return new Response(JSON.stringify(payload, null, 2), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
