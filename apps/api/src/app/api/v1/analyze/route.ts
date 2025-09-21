// apps/api/src/app/api/v1/analyze/route.ts
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

/* ---------------- Raw Dict shape ---------------- */
type Row =
  | { inci: string; aliases?: string[]; status: "green"|"yellow"|"red"|"unknown"; why?: string }
  | string;

type RawDict = { version?: string; items?: Row[] } | Row[];

/* ---------------- Dict loader: URL -> file path (defaults to app/data/ingredient-db.v1.json) ---------------- */
let _mem: {
  dict?: Dict;
  etag?: string | null;
  lastModified?: string | null;
  filePath?: string;
  fileMtime?: number | null;
} = {};

function fileMtimeMs(p: string): number | null { try { return statSync(p).mtimeMs; } catch { return null; } }

function resolveDefaultFilePath(): string {
  // cwd is apps/api — default to repo-root/app/data/ingredient-db.v1.json
  const pref = path.join(process.cwd(), "..", "..", "app", "data", "ingredient-db.v1.json");
  return pref;
}

function adapt(raw: RawDict): Dict {
  const wrap = Array.isArray(raw)
    ? { version: "ingredient-db.v1", items: raw }
    : { version: raw.version || "ingredient-db.v1", items: raw.items || [] };

  const entries = (wrap.items || []).map((i) => {
    if (typeof i === "string") {
      const inci = i.trim().toLowerCase();
      return inci ? { inci, aliases: [], status: "unknown" as const, why: "" } : null;
    }
    return {
      inci: String(i.inci || "").toLowerCase(),
      aliases: (i.aliases || []).map((a) => String(a).toLowerCase()),
      status: i.status,
      why: i.why || "",
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

  const raw = (await r.json()) as RawDict;
  const dict = adapt(raw);
  _mem.dict = dict;
  return dict;
}

function loadFromFile(p: string): Dict {
  const m = fileMtimeMs(p);
  if (_mem.dict && _mem.filePath === p && _mem.fileMtime === m) return _mem.dict!;
  const raw = JSON.parse(readFileSync(p, "utf8")) as RawDict;
  const dict = adapt(raw);
  _mem.filePath = p;
  _mem.fileMtime = m;
  _mem.dict = dict;
  return dict;
}

async function loadDict(): Promise<Dict> {
  // 1) Prefer DB/HTTP source when available
  if (process.env.DICT_URL) {
    try { return await loadFromUrl(process.env.DICT_URL); }
    catch (e) { console.warn("[analyze] DICT_URL failed, falling back to file:", (e as any)?.message || e); }
  }
  // 2) File path (env or default)
  const p = process.env.DICT_PATH || resolveDefaultFilePath();
  return loadFromFile(p);
}

/* ---------------- ETHYST-parity tokenizer & classifier ---------------- */
// Normalizer
function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extra normalization for chemicals (dashes/numbers variants)
function normalizeChem(s: string): string {
  return s
    .replace(/[\-\u2010-\u2015]/g, " ") // dashes -> space
    .replace(/\s+/g, " ")
    .trim();
}

// Aliases (same as your front-end)
const COMMON_ALIASES = new Map<string,string>([
  ["evening primrose oil", "oenothera biennis oil"],
  ["rosehip oil", "rosa canina fruit oil"],
  ["argan oil", "argania spinosa kernel oil"],
  ["marula oil", "sclerocarya birrea seed oil"],
  ["tamanu oil", "calophyllum inophyllum seed oil"],
  ["jojoba oil", "simmondsia chinensis seed oil"],
  ["sunflower seed oil", "helianthus annuus seed oil"],
  ["sweet almond oil", "prunus amygdalus dulcis oil"],
  ["olive oil", "olea europaea fruit oil"],
  ["grapeseed oil", "vitis vinifera seed oil"],
  ["pomegranate seed oil", "punica granatum seed oil"],
  ["cranberry seed oil", "vaccinium macrocarpon seed oil"],
  ["raspberry seed oil", "rubus idaeus seed oil"],
  ["blackcurrant seed oil", "ribes nigrum seed oil"],
  ["borage seed oil", "borago officinalis seed oil"],
  ["evening primrose", "oenothera biennis oil"],
  ["rubus idaeus raspberry seed oil", "rubus idaeus seed oil"],
  ["vaccinium macrocarpon cranberry seed oil", "vaccinium macrocarpon seed oil"],
  ["punica granatum pomegranate seed oil", "punica granatum seed oil"]
].map(([k,v]) => [norm(k), v]));

// Plant tails + canonicalization
const PLANT_TAILS = [
  "seed oil","fruit oil","kernel oil","oil",
  "leaf extract","root extract","flower extract",
  "bark extract","stem extract","flower/leaf/vine extract",
  "extract","seed oil unsaponifiables","unsaponifiables","sterols"
];
function canonicalizePlantPhrase(token: string): string {
  if (!/^[a-z]+ [a-z]+/.test(token)) return token;
  let best = "";
  for (const t of PLANT_TAILS) if (token.endsWith(t) && t.length > best.length) best = t;
  if (!best) return token;
  const [genus, species] = token.split(/\s+/);
  if (!/^[a-z]+$/.test(genus) || !/^[a-z]+$/.test(species)) return token;
  return `${genus} ${species} ${best}`;
}
function canonicalizeTails(token: string): string {
  token = token.replace(/\s+/g, " ").trim();
  token = token.replace(/\bseed oil unsaponifiables\b/g, "seed oil unsaponifiables");
  if (/unsaponifiables$/.test(token) && /\bseed oil\b/.test(token)) {
    token = token.replace(/\bunsaponifiables\b/g, "").replace(/\s+/g, " ").trim() + " unsaponifiables";
  }
  return token;
}

// Tokenizer (parity with browser)
function tokenize(text: string): string[] {
  const cleaned = String(text || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/ingredients?:/ig, " ")
    .replace(/may contain.*$/ig, " ")
    .replace(/[•\u2022\u00B7]/g, ",");
  return cleaned
    .split(/[;,]+/g)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => norm(s))
    .map(s => canonicalizePlantPhrase(s))
    .map(s => canonicalizeTails(s))
    .filter(s => s.length > 1);
}

type Buckets = { green: any[]; yellow: any[]; red: any[]; unknown: any[] };

function classify(tokens: string[], dict: Dict): { buckets: Buckets; normalized: string[]; counts: any; score: number } {
  const map = new Map<string, { inci: string; status: string; why: string; aliases?: string[] }>();
  for (const e of dict.entries) {
    map.set(norm(e.inci), { inci: e.inci, status: e.status, why: e.why || "", aliases: e.aliases || [] });
    for (const a of (e.aliases || [])) map.set(norm(a), { inci: e.inci, status: e.status, why: e.why || "", aliases: e.aliases || [] });
  }
  const allKeys = Array.from(map.keys()).sort((a,b)=>b.length-a.length);

  const seenTokens = new Set<string>();
  const seenCanonical = new Set<string>();
  const buckets: Buckets = { green: [], yellow: [], red: [], unknown: [] };
  const normalizedOut: string[] = [];

  for (const raw of tokens) {
    if (seenTokens.has(raw)) continue;
    seenTokens.add(raw);

    const alias = COMMON_ALIASES.get(norm(raw));
    const t = norm(alias || raw);
    let hit = map.get(t);

    // fuzzy/variant fallback
    if (!hit && t.length >= 4) {
      const t2 = normalizeChem(t);
      for (const k of allKeys) {
        if (k.length < 4) break;
        if (t2.includes(k) || k.includes(t2)) { hit = map.get(k); if (hit) break; }
        const collapsed = canonicalizePlantPhrase(t2);
        if (collapsed !== t2) { const h2 = map.get(collapsed); if (h2) { hit = h2; break; } }
      }
    }

    if (hit) {
      if (!seenCanonical.has(hit.inci)) {
        seenCanonical.add(hit.inci);
        (buckets as any)[hit.status]?.push({ inci: hit.inci, status: hit.status, why: hit.why, aliases: hit.aliases || [] });
        normalizedOut.push(norm(hit.inci));
      }
    } else {
      if (!seenCanonical.has(t)) {
        seenCanonical.add(t);
        buckets.unknown.push({ inci: t, status: "unknown", why: "" });
        normalizedOut.push(t);
      }
    }
  }

  const counts = {
    green: buckets.green.length,
    yellow: buckets.yellow.length,
    red: buckets.red.length,
    unknown: buckets.unknown.length
  };
  let score = 100 - (25 * counts.red) - (8 * counts.yellow) + (2 * Math.min(counts.green, 10));
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { buckets, normalized: normalizedOut, counts, score };
}

/* ---------------- Handlers ---------------- */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    let body: any;
    try { body = await req.json(); } catch {
      return withCORS(NextResponse.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }, { status: 400 }));
    }

    const raw = body?.input?.text;
    if (typeof raw !== "string" || !raw.trim()) {
      return withCORS(NextResponse.json({ error: { code: "EMPTY", message: "No text provided" } }, { status: 422 }));
    }

    const dict = await loadDict();
    const tokens = tokenize(raw);
    const { buckets, normalized, counts, score } = classify(tokens, dict);

    const resp = {
      id: `an_${Math.random().toString(36).slice(2)}`,
      score: { value: score, scale: { min: 0, max: 100 }, rule: "champagne-standard:v1" },
      counts,
      buckets,
      normalized,
      dictionary: { version: dict.version },
      meta: { processing_ms: Date.now() - t0, source: { mode: body?.input?.mode ?? "text" }, warnings: [] }
    };
    return withCORS(NextResponse.json(resp));
  } catch (e: any) {
    const msg = (e && e.message) ? e.message : "Unknown error";
    return withCORS(NextResponse.json({ error: { code: "SERVER", message: msg } }, { status: 500 }));
  }
}

export async function GET() {
  return withCORS(NextResponse.json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST to /api/v1/analyze" } }, { status: 405 }));
}
