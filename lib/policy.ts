// lib/policy.ts
import type { InciRecord } from "./inci";
import { resolveInci, } from "./db";
import { norm } from "./inci";

const UNDISCLOSED_KEYS = new Set([
  "fragrance", "parfum", "aroma", "flavor" // treat as undisclosed mixtures
]);

const HARD_AVOID_TAGS = new Set([
  "fragrance-allergen", // e.g., linalool, limonene, citronellol, etc.
]);

export type Judgement = {
  name: string;                     // original as-typed
  normalized: string;
  status: "avoid" | "caution" | "safe" | "unknown";
  why?: string;
  source: "db" | "rule" | "fallback";
};

export function judgeOne(name: string): Judgement {
  const n = norm(name);

  // Rule: undisclosed mixtures
  if (UNDISCLOSED_KEYS.has(n)) {
    return {
      name, normalized: n, status: "avoid",
      why: "Undisclosed mixture; per policy we require full disclosure.",
      source: "rule"
    };
  }

  const rec = resolveInci(name);
  if (rec) {
    // Elevate to avoid if tagged as fragrance allergen (policy parity)
    if (rec.tags?.some(t => HARD_AVOID_TAGS.has(t))) {
      return {
        name, normalized: n, status: "avoid",
        why: rec.why || "Fragrance allergen flagged by policy.",
        source: "db"
      };
    }
    return { name, normalized: n, status: rec.status, why: rec.why, source: "db" };
  }

  return { name, normalized: n, status: "unknown", source: "fallback" };
}
