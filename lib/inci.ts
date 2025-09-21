// lib/inci.ts
export type InciRecord = {
  inci: string;
  aliases?: string[];
  status: "avoid" | "caution" | "safe" | "unknown";
  why?: string;
  tags?: string[]; // e.g., ["fragrance-allergen","preservative","uv-filter"]
};

const DIACRITICS = /[\u0300-\u036f]/g;
const NON_ALNUM_SPACE = /[^a-z0-9\s-]/g;
const MULTISPACE = /\s+/g;

export function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(NON_ALNUM_SPACE, " ")
    .replace(MULTISPACE, " ")
    .trim();
}

// Tokenize a textarea containing INCI joined by ; or , and tolerant of () [].
export function splitIngredients(raw: string): string[] {
  if (!raw) return [];
  // Prefer semicolons. If none, fall back to commas (but keep commas inside parentheses).
  const hasSemis = raw.includes(";");
  const parts = (hasSemis ? raw.split(";") : raw.split(/,(?![^\(]*\))/))
    .map(s => s.trim())
    .filter(Boolean);
  return parts;
}
