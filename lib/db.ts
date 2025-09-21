import INDEX from "@/data/ingredient-db.v1.json";
import ALIASES from "@/data/aliases.json";  // make sure this file exists

import { norm } from "./inci";

export type InciRecord = {
  inci: string;
  aliases?: string[];
  status: "avoid" | "caution" | "safe" | "unknown";
  why?: string;
  tags?: string[];
};

type Lookup = Map<string, InciRecord>;

const buildLookup = (): Lookup => {
  const m = new Map<string, InciRecord>();

  for (const rec of INDEX as InciRecord[]) {
    const key = norm(rec.inci);
    m.set(key, rec);

    for (const a of rec.aliases || []) {
      m.set(norm(a), rec);
    }
  }

  // Apply alias overrides if available
  for (const [alias, canonical] of Object.entries(ALIASES || {})) {
    const rec = m.get(norm(canonical));
    if (rec) m.set(norm(alias), rec);
  }

  return m;
};

const LOOKUP = buildLookup();

export function resolveInci(raw: string): InciRecord | null {
  return LOOKUP.get(norm(raw)) || null;
}
