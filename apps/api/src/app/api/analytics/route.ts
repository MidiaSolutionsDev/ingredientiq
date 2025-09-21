// apps/api/src/app/api/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

function withCORS(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}
export async function OPTIONS() { return withCORS(new NextResponse(null, { status: 204 })); }

export async function POST(req: NextRequest) {
  // In real life, write to logs/DB. Here we just 204.
  await req.text().catch(()=>null);
  return withCORS(new NextResponse(null, { status: 204 }));
}
