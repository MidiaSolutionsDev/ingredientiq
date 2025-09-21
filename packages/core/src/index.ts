// packages/core/src/index.ts
export type Status = 'green' | 'yellow' | 'red' | 'unknown';

export type DictEntry = {
  inci: string;
  aliases?: string[];
  status: Status;
  why?: string;
};

export type Dict = {
  version: string;
  entries: DictEntry[];
};

export type AnalyzeResult = {
  score: number;
  counts: { green: number; yellow: number; red: number; unknown: number };
  buckets: { green: DictEntry[]; yellow: DictEntry[]; red: DictEntry[]; unknown: DictEntry[] };
  normalized: string[];
};

const PLANT_TAILS = [
  "seed oil","fruit oil","kernel oil","oil",
  "leaf extract","root extract","flower extract","bark extract","stem extract",
  "flower/leaf/vine extract","extract","seed oil unsaponifiables","unsaponifiables","sterols"
];

export function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizePlantPhrase(token: string): string {
  if (!/^[a-z]+ [a-z]+/.test(token)) return token;
  let bestTail = '';
  for (const t of PLANT_TAILS) if (token.endsWith(t) && t.length > bestTail.length) bestTail = t;
  if (!bestTail) return token;
  const parts = token.split(/\s+/);
  const [genus, species] = parts;
  if (!/^[a-z]+$/.test(genus) || !/^[a-z]+$/.test(species)) return token;
  return `${genus} ${species} ${bestTail}`;
}

function canonicalizeTails(token: string): string {
  let t = token.replace(/\s+/g, ' ').trim();
  t = t.replace(/\bseed oil unsaponifiables\b/g, "seed oil unsaponifiables");
  if (/unsaponifiables$/.test(t) && /\bseed oil\b/.test(t)) {
    t = t.replace(/\bunsaponifiables\b/g, '').replace(/\s+/g, ' ').trim() + " unsaponifiables";
  }
  return t;
}

export function tokenize(text: string): string[] {
  const cleaned = String(text || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/ingredients?:/ig, ' ')
    .replace(/may contain.*$/ig, ' ')
    .replace(/[•\u2022\u00B7]/g, ',');
  return cleaned
    .split(/[;,]+/g)
    .map(s => s.trim())
    .filter(Boolean)
    .map(norm)
    .map(canonicalizePlantPhrase)
    .map(canonicalizeTails)
    .filter(s => s.length > 1);
}

export function analyzeText(text: string, dict: Dict): AnalyzeResult {
  const tokens = tokenize(text);
  const map = new Map<string, DictEntry>();
  for (const e of dict.entries || []) {
    const payload = { inci: e.inci, status: e.status, why: e.why || '', aliases: e.aliases || [] };
    map.set(norm(e.inci), payload);
    for (const a of (e.aliases || [])) map.set(norm(a), payload);
  }
  // for fuzzy contains checks
  const keys = Array.from(map.keys()).sort((a,b)=>b.length-a.length);

  const seenTokens = new Set<string>();
  const seenCanonical = new Set<string>();
  const buckets = { green: [] as DictEntry[], yellow: [] as DictEntry[], red: [] as DictEntry[], unknown: [] as DictEntry[] };
  const normalized: string[] = [];

  for (const raw of tokens) {
    if (seenTokens.has(raw)) continue;
    seenTokens.add(raw);
    normalized.push(raw);

    let hit = map.get(raw);
    if (!hit && raw.length >= 4) {
      const collapsed = canonicalizePlantPhrase(raw);
      if (collapsed !== raw) hit = map.get(collapsed);
      if (!hit) {
        for (const k of keys) {
          if (k.length < 4) break;
          if (raw.includes(k) || k.includes(raw)) { hit = map.get(k); if (hit) break; }
        }
      }
    }

    if (hit) {
      if (!seenCanonical.has(hit.inci)) {
        seenCanonical.add(hit.inci);
        buckets[hit.status].push(hit);
      }
    } else {
      if (!seenCanonical.has(raw)) {
        seenCanonical.add(raw);
        buckets.unknown.push({ inci: raw, status: 'unknown', why: '' });
      }
    }
  }

  const counts = {
    green: buckets.green.length,
    yellow: buckets.yellow.length,
    red: buckets.red.length,
    unknown: buckets.unknown.length
  };

  // same heuristic you use client-side
  const score = Math.max(0, Math.min(100, Math.round(
    100 - 25 * counts.red - 8 * counts.yellow + 2 * Math.min(counts.green, 10)
  )));

  return { score, counts, buckets, normalized };
}
