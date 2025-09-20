export type Status = 'green' | 'yellow' | 'red' | 'unknown';

export type DictItem = {
  inci: string;
  aliases?: string[];
  status: Status;
  why?: string;
};

export type Dict = {
  version: string;
  items: DictItem[];
};

export type ScoreParams = {
  red_weight: number;
  yellow_weight: number;
  green_bonus: number;
  green_bonus_cap: number;
  min: number;
  max: number;
};

export const DEFAULT_PARAMS: ScoreParams = {
  red_weight: 25,
  yellow_weight: 8,
  green_bonus: 2,
  green_bonus_cap: 10,
  min: 0,
  max: 100,
};

// --- helpers

export function normalize(s: string): string {
  // Lowercase, remove extra punctuation around separators, collapse whitespace
  return s
    .toLowerCase()
    // normalize separators to comma
    .replace(/[;/|]/g, ',')
    // remove parentheses but preserve words inside
    .replace(/[()]/g, ' ')
    // collapse multiple commas into one
    .replace(/,+/g, ',')
    // spaces around commas
    .replace(/\s*,\s*/g, ',')
    // non-alphanum (keep commas) -> space
    .replace(/[^a-z0-9,\s]/g, ' ')
    // collapse spaces
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const norm = normalize(text);
  // split by commas, then by " + " patterns, trim empties
  const first = norm.split(',').map(t => t.trim()).filter(Boolean);
  // Split any that still contain multiple words separated by ' + ' (rare on INCI)
  const tokens = first.flatMap(tok =>
    tok.includes(' + ') ? tok.split(' + ').map(t => t.trim()).filter(Boolean) : [tok]
  );
  return tokens;
}

function toIndex(dict: Dict) {
  const map = new Map<string, DictItem>();
  for (const it of dict.items) {
    map.set(it.inci.toLowerCase(), it);
    for (const a of it.aliases ?? []) {
      map.set(a.toLowerCase(), it);
    }
  }
  return map;
}

export function classify(tokens: string[], dict: Dict) {
  const idx = toIndex(dict);
  const buckets: Record<Status, Array<{ inci: string; status: Status; why?: string }>> = {
    green: [],
    yellow: [],
    red: [],
    unknown: [],
  };
  for (const raw of tokens) {
    const t = raw.trim();
    const hit = idx.get(t);
    if (!hit) {
      buckets.unknown.push({ inci: t, status: 'unknown' });
    } else {
      buckets[hit.status].push({ inci: hit.inci, status: hit.status, why: hit.why });
    }
  }
  const counts = {
    green: buckets.green.length,
    yellow: buckets.yellow.length,
    red: buckets.red.length,
    unknown: buckets.unknown.length,
    total: tokens.length,
  };
  return { buckets, counts };
}

export function score(
  counts: { red: number; yellow: number; green: number },
  p: ScoreParams = DEFAULT_PARAMS
) {
  const v =
    100 -
    p.red_weight * counts.red -
    p.yellow_weight * counts.yellow +
    p.green_bonus * Math.min(counts.green, p.green_bonus_cap);
  return Math.max(p.min, Math.min(p.max, Math.round(v)));
}

export function analyzeText(text: string, dict: Dict, params: ScoreParams = DEFAULT_PARAMS) {
  const input_text = normalize(text);
  const tokens = tokenize(text);
  const { buckets, counts } = classify(tokens, dict);
  const value = score(counts, params);
  return {
    score: value,
    buckets,
    counts,
    normalized: { input_text, tokens },
    dictionary: { version: dict.version },
  };
}
