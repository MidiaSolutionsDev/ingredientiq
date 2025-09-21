// apps/api/src/app/lib/dict.ts
import type { Dict } from "@ingredientiq/core";
import { readFileSync, statSync } from "fs";
import path from "path";

type Row =
  | { inci: string; aliases?: string[]; status: "green"|"yellow"|"red"|"unknown"; why?: string }
  | string;

type Raw =
  | { version?: string; items?: Row[] }
  | Row[];

let _mem: {
  dict?: Dict;
  etag?: string | null;
  lastModified?: string | null;
  filePath?: string;
  fileMtime?: number | null;
} = {};

function mtime(p: string): number | null { try { return statSync(p).mtimeMs; } catch { return null; } }

function adapt(raw: Raw): Dict {
  const wrap = Array.isArray(raw)
    ? { version: "ingredient-db.v1", items: raw }
    : { version: raw.version || "ingredient-db.v1", items: raw.items || [] };

  const entries = (wrap.items || []).map((r) => {
    if (typeof r === "string") {
      const inci = r.trim().toLowerCase();
      return inci ? { inci, aliases: [], status: "unknown" as const, why: "" } : null;
    }
    return {
      inci: String(r.inci || "").toLowerCase(),
      aliases: (r.aliases || []).map(a => String(a).toLowerCase()),
      status: r.status,
      why: r.why || ""
    };
  }).filter(Boolean) as Dict["entries"];

  return { version: wrap.version!, entries };
}

async function loadFromUrl(url: string): Promise<Dict> {
  const headers: Record<string,string> = {};
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
  // cwd is apps/api — default to repo-root/data/ingredient-db.v1.json
  return path.join(process.cwd(), "..", "..", "data", "ingredient-db.v1.json");
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

export async function loadDict(): Promise<Dict> {
  // 1) Prefer live URL if provided
  if (process.env.DICT_URL) {
    try { return await loadFromUrl(process.env.DICT_URL); }
    catch (e) { console.warn("[dict] DICT_URL failed, falling back to file:", (e as any)?.message || e); }
  }
  // 2) Explicit file path override
  const p = process.env.DICT_PATH || resolveDefaultPath();
  return loadFromFile(p);
}
