import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

function withCORS(res: NextResponse) {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}
export async function OPTIONS() { return withCORS(new NextResponse(null, { status: 204 })); }

export async function GET() {
  return withCORS(NextResponse.json({
    tenant: {
      id: 'tn_demo',
      name: 'IngredientIQ Demo',
      branding: {
        primary: '#0E9384',
        logo_url: '',
        badge: 'Powered by IngredientIQ™'
      },
      rubric_default: 'ingredientiq-standard:v1',
      features: { ocr: false, explanations: true, share_links: true }
    }
  }));
}
