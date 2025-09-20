import { NextRequest, NextResponse } from 'next/server';
import { analyzeText, type Dict } from '@cs/core';
import { readFileSync } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

function loadDict(): Dict {
  // cwd is .../cs-saas/apps/api
  const dictPath = path.join(process.cwd(), '..', '..', 'packages', 'dictionaries', 'incidb_2025-09-15.json');
  const json = readFileSync(dictPath, 'utf8');
  return JSON.parse(json) as Dict;
}

export async function POST(req: NextRequest){
  try{
    const body = await req.json();
    const text = body?.input?.text ?? '';
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error:{ code:'EMPTY', message:'No text provided' } }, { status: 422 });
    }
    const dict = loadDict();
    const res = analyzeText(text, dict);
    return NextResponse.json({
      id: `an_${Math.random().toString(36).slice(2)}`,
      score: { value: res.score, scale: { min: 0, max: 100 }, rule: 'champagne-standard:v1' },
      counts: res.counts,
      buckets: res.buckets,
      normalized: res.normalized,
      dictionary: { version: dict.version },
      meta: { processing_ms: 0, source: { mode: 'text' }, warnings: [] }
    });
  } catch(e:any){
    return NextResponse.json({ error: { code:'SERVER', message: e?.message || 'Unknown' }}, { status: 500 });
  }
}
