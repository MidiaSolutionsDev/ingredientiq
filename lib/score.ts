// lib/score.ts
import type { Judgement } from "./policy";

export type ScoreBreakdown = {
  total: number;
  avoid: number;
  caution: number;
  safe: number;
  unknown: number;
  score: number; // 0..100
};

export function scoreJudgements(js: Judgement[]): ScoreBreakdown {
  const b: ScoreBreakdown = { total: js.length, avoid: 0, caution: 0, safe: 0, unknown: 0, score: 100 };
  for (const j of js) {
    if (j.status === "avoid") b.avoid++;
    else if (j.status === "caution") b.caution++;
    else if (j.status === "safe") b.safe++;
    else b.unknown++;
  }
  // Champagne rule (replicate exactly):
  // - each AVOID = -15
  // - each CAUTION = -5
  // - UNKNOWN = 0 penalty (but surfaced in UI)
  // floor at 0, cap at 100
  const penalty = b.avoid * 15 + b.caution * 5;
  b.score = Math.max(0, Math.min(100, 100 - penalty));
  return b;
}
