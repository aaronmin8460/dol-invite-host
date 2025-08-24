// src/app/api/debug/ping/route.ts
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const now = new Date();
  const ua = req.headers.get('user-agent') ?? '';
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const payload = {
    ok: true,
    ts: now.getTime(),
    iso: now.toISOString(),
    region: process.env.VERCEL_REGION ?? null,
    location: process.env.VERCEL_LOCATION ?? null,
    node: process.version,
    ip,
    ua,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function HEAD(): Promise<Response> {
  return new Response(null, { status: 200 });
}
