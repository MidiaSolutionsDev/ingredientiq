// apps/api/src/app/api/v1/db/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import type { Dict } from "@ingredientiq/core";
import { readFileSync, statSync } from "fs";
import path from "path";

export const runtime = "nodejs";

/* ---------------- CORS ---------------- */
function withCORS(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}
export async function OPTIONS() { return withCORS(new NextResponse(null, { status: 204 })); }

/* ---------------- Dict loader (URL -> file path -> default app/data/ingredient-db.v1.json) ---------------- */
type Row =
  | { inci: string; aliases?: string[]; status: "green" | "yellow" | "red" | "unknown"; why?: string }
  | string;

type Raw = { version?: string; items?: Row[] } | Row[];

let _mem: {
  dict?: Dict;
  etag?: string | null;
  lastModified?: string | null;
  filePath?: string;
  fileMtime?: number | null;
} = {};

function mtime(p: string): number | null {
  try { return statSync(p).mtimeMs; } catch { return null; }
}

function adapt(raw: Raw): Dict {
  const wrap = Array.isArray(raw)
    ? { version: "ingredient-db.v1", items: raw }
    : { version: raw.version || "ingredient-db.v1", items: raw.items || [] };

  const entries = (wrap.items || [])
    .map((r) => {
      if (typeof r === "string") {
        const inci = r.trim().toLowerCase();
        return inci ? { inci, aliases: [], status: "unknown" as const, why: "" } : null;
      }
      return {
        inci: String(r.inci || "").toLowerCase(),
        aliases: (r.aliases || []).map((a) => String(a).toLowerCase()),
        status: r.status,
        why: r.why || "",
      };
    })
    .filter(Boolean) as Dict["entries"];

  return { version: wrap.version!, entries };
}

async function loadFromUrl(url: string): Promise<Dict> {
  const headers: Record<string, string> = {};
  if (_mem.etag) headers["If-None-Match"] = _mem.etag;
  if (_mem.lastModified) headers["If-Modified-Since"] = _mem.lastModified;

  const r = await fetch(url, { headers, cache: "no-store" });
  if (r.status === 304 && _mem.dict) return _mem.dict;
  if (!r.ok) throw new Error(`DICT_URL fetch failed: HTTP ${r.status}`);

  _mem.etag = r.headers.get("ETag");
  _mem.lastModified = r.headers.get("Last-Modified");

  const raw = (await r.json()) as Raw;
  const dict = adapt(raw);
  _mem.dict = dict;
  return dict;
}

function resolveDefaultPath(): string {
  // cwd is apps/api — default to repo-root/app/data/ingredient-db.v1.json
  return path.join(process.cwd(), "..", "..", "app", "data", "ingredient-db.v1.json");
}

function loadFromFile(p: string): Dict {
  const mt = mtime(p);
  if (_mem.dict && _mem.filePath === p && _mem.fileMtime === mt) return _mem.dict;
  const raw = JSON.parse(readFileSync(p, "utf8")) as Raw;
  const dict = adapt(raw);
  _mem.filePath = p;
  _mem.fileMtime = mt;
  _mem.dict = dict;
  return dict;
}

async function loadDict(): Promise<Dict> {
  // 1) Prefer live URL (e.g., DB-backed dump endpoint)
  if (process.env.DICT_URL) {
    try { return await loadFromUrl(process.env.DICT_URL); }
    catch (e) { console.warn("[db/search] DICT_URL failed, falling back to file:", (e as any)?.message || e); }
  }
  // 2) Explicit file override
  const p = process.env.DICT_PATH || resolveDefaultPath();
  return loadFromFile(p);
}

/* ---------------- Handler ---------------- */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const qRaw = searchParams.get("q");
    if (typeof qRaw !== "string") {
      return withCORS(
        NextResponse.json(
          { results: [], error: { code: "BAD_REQUEST", message: "Missing q" } },
          { status: 400 }
        )
      );
    }

    const q = qRaw.toLowerCase().trim();
    const limitNum = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(limitNum, 50)) : 10;

    if (!q) return withCORS(NextResponse.json({ results: [] }));

    const dict: Dict = await loadDict();
    const needle = q.replace(/\s+/g, " ");

    const results = dict.entries
      .filter(
        (e) =>
          e.inci.includes(needle) ||
          (Array.isArray(e.aliases) && e.aliases.some((a) => a.includes(needle)))
      )
      .slice(0, limit)
      .map((e) => ({
        inci: e.inci,
        aliases: e.aliases ?? [],
        status: e.status,
        why: e.why ?? "",
      }));

    return withCORS(NextResponse.json({ results, dictionary: { version: dict.version } }));
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    return withCORS(
      NextResponse.json({ results: [], error: { code: "SERVER", message: msg } }, { status: 500 })
    );
  }
}

// Optional: respond to accidental POSTs with method info (keeps CORS consistent)
export async function POST() {
  return withCORS(
    NextResponse.json(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET to /api/v1/db/search" } },
      { status: 405 }
    )
  );
}
