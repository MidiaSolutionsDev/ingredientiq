// tests/smoke/sea-sculpt.spec.ts
import { splitIngredients } from "@/lib/inci";
import { judgeOne } from "@/lib/policy";
import { scoreJudgements } from "@/lib/score";
import { strict as assert } from "assert";

const SEA_SCULPT = `
Helianthus Annuus (Sunflower) Seed Oil; Squalane; Ricinus Communis (Castor) Seed Oil; Caprylic/Capric Triglyceride; Mauritia Flexuosa Fruit Oil; Citrus Aurantium Bergamia (Bergamot) Fruit Oil; Limonene; Cucumis Sativus (Cucumber) Seed Oil; Moringa Oleifera Seed Oil; Citrus Grandis (Grapefruit) Peel Oil; Cedrus Atlantica Bark Oil; Plankton Extract; Sorbitan Trioleate; Laminaria Digitata Extract; Laminaria Hyperborea Extract; Tocopherol; Apium Graveolens (Celery) Seed Extract; Linum Usitatissimum (Linseed) Seed Extract; Ascorbyl Palmitate; Linalool; Citral.
`;

test("MARA Sea Sculpt parity", () => {
  const items = splitIngredients(SEA_SCULPT);
  const j = items.map(judgeOne);
  const b = scoreJudgements(j);

  // Expect linalool + limonene "avoid"
  const avoidSet = new Set(j.filter(x => x.status === "avoid").map(x => x.normalized));
  assert(avoidSet.has("linalool"));
  assert(avoidSet.has("limonene"));

  // Champagne shows 2 Avoid, 0 Caution, 13 Safe, 6 Unknown -> 70/100
  expect(b.avoid).toBe(2);
  expect(b.caution).toBe(0);
  expect(b.score).toBe(70);
});
