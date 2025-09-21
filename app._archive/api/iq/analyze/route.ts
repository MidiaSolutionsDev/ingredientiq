// app/api/iq/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { splitIngredients } from "incidb/inci";
import { judgeOne } from "incidb/policy";
import { scoreJudgements } from "incidb/score";
import { DICT_VERSION } from "incidb/version";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { text } = await req.json().catch(() => ({ text: "" }));

  // Normalize + analyze
  const items = splitIngredients(text);
  const judgements = items.map(judgeOne);
  const summary = scoreJudgements(judgements);

  return NextResponse.json({
    product: "IngredientIQ",
    dictVersion: DICT_VERSION,
    summary,
    items: judgements,
  });
}
