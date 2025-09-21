export default async function handler(req, res) {
  // CORS for demo (tighten later)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-iq-key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { text, imageDataUrl } = req.body ?? {};
    const demo = {
      score: 86,
      buckets: {
        safe: ['Aqua (Water)', 'Glycerin', 'Squalane', 'Sodium Hyaluronate'],
        caution: ['Phenoxyethanol'],
        avoid: ['Fragrance'],
        unknown: []
      },
      version: 'incidb_2025-09-15'
    };
    return res.status(200).json(demo);
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e) });
  }
}
