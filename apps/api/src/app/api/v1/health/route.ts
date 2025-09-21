// apps/api/src/app/api/v1/health/route.ts
import { NextResponse } from "next/server";
export const runtime = "nodejs";

/** ---- CORS (match other v1 routes) ---- */
function withCORS(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}

export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

export async function HEAD() {
  // Lightweight check for preflight/uptime probes
  return withCORS(new NextResponse(null, { status: 200 }));
}

export async function GET() {
  const now = new Date();
  const payload = {
    ok: true,
    service: "ingredientiq-api",
    ts: now.toISOString(),
    uptimeSec: Number(process.uptime().toFixed(1)),
    // Optional build metadata if present in env
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || undefined,
    env: process.env.NODE_ENV || "development"
  };
  return withCORS(NextResponse.json(payload, { status: 200 }));
}
