import { NextRequest, NextResponse } from 'next/server';
import { analyzeText, type Dict } from '@cs/core';
import { readFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

// --- helper to add CORS headers ---
function withCORS(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

// --- load the dictionary JSON file ---
function loadDict(): Dict {
  const dictPath = path.join(
    process.cwd(),
    '..', '..', 'packages', 'dictionaries',
    'incidb_2025-09-15.json'
  );
  const json = readFileSync(dictPath, 'utf8');
  return JSON.parse(json) as Dict;
}

// --- handle preflight OPTIONS ---
export async function OPTIONS() {
  return withCORS(new NextResponse(null, { status: 204 }));
}

// --- main POST handler ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = body?.input?.text ?? '';

    if (!text || typeof text !== 'string') {
      return withCORS(
        NextResponse.json(
          { error: { code: 'EMPTY', message: 'No text provided' } },
          { status: 422 }
        )
      );
    }

    const dict = loadDict();
    const res = analyzeText(text, dict);

    return withCORS(
      NextResponse.json({
        id: `an_${Math.random().toString(36).slice(2)}`,
        score: {
          value: res.score,
          scale: { min: 0, max: 100 },
          rule: 'champagne-standard:v1'
        },
        counts: res.counts,
        buckets: res.buckets,
        normalized: res.normalized,
        dictionary: { version: dict.version },
        meta: {
          processing_ms: 0,
          source: { mode: body?.input?.mode ?? 'text' },
          warnings: []
        }
      })
    );
  } catch (e: any) {
    return withCORS(
      NextResponse.json(
        { error: { code: 'SERVER', message: e?.message || 'Unknown' } },
        { status: 500 }
      )
    );
  }
}
