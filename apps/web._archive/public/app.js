// apps/web/public/app.js
console.log('IngredientIQ front-end loaded');

(async function () {
  // ========== API BASE DETECTION ==========
  // Priority: ?api=... → same-origin /api → localhost:3000/api (dev fallback)
  const qsApi = new URLSearchParams(location.search).get('api');
  const sameOriginApi = `${location.origin}/api`;
  const localDevApi = `http://localhost:3000/api`;
  let API = (qsApi || sameOriginApi).replace(/\/+$/,''); // no trailing slash

  async function canReach(urlBase) {
    try {
      const r = await fetch(`${urlBase}/v1/health`, { method: 'GET', cache: 'no-store' });
      if (!r.ok) return false;
      const j = await r.json().catch(()=> ({}));
      return !!j && (j.ok === true || j.service === 'ingredientiq-api');
    } catch { return false; }
  }

  if (!(await canReach(API))) {
    if (API !== localDevApi && await canReach(localDevApi)) {
      console.warn(`API not reachable at ${API}; falling back to ${localDevApi}`);
      API = localDevApi;
    } else {
      // If still unreachable, show a visible banner and stop binding handlers that depend on API.
      showFatal(`Cannot reach IngredientIQ API at:
${API}

Fixes:
• If running static demo on port 5173 and API on 3000, open the demo with:
  ?api=http://localhost:3000/api
• Or start the API app (Next.js) and ensure CORS is enabled.`);
      // Keep minimal UI but prevent server analyze usage.
    }
  }

  const ANALYTICS_ENDPOINT = `${API}/analytics`;

  // ========== DOM HOOKS ==========
  const $input = document.getElementById("input");
  const $analyze = document.getElementById("analyze");
  const $upload = document.getElementById("fileInput");
  const $camera = document.getElementById("cameraInput");
  const $uploadBtn = document.getElementById("uploadBtn");
  const $cameraBtn = document.getElementById("cameraBtn");
  const $preview = document.getElementById("preview");
  const $progress = document.getElementById("progress");
  const $quickFind = document.getElementById("quickFind");
  const $resultsGrid = document.getElementById("results");
  const $resultsEmpty = document.getElementById("results-empty");
  const $btnAlternatives = document.getElementById('btnAlternatives');
  const $btnShare = document.getElementById('btnShare');
  const $btnLink = document.getElementById('btnLink');
  const $demoBtn = document.getElementById('demoBtn');
  const $scoreBar = document.getElementById('scoreBar');
  const $scoreVal = document.getElementById('scoreVal');
  const $scoreCounts = document.getElementById('scoreCounts');
  const $dbUpdated = document.getElementById('dbUpdated');

  // ========== UTIL ==========
  function setProgress(msg){ if ($progress) $progress.textContent = msg || ""; }
  function showError(msg){ setProgress(msg); console.error(msg); }
  function showFatal(msg){
    const el = document.createElement('div');
    el.style.cssText = 'margin:8px 0;padding:10px;border:1px solid #ef4444;background:#fef2f2;color:#7f1d1d;border-radius:8px;white-space:pre-wrap';
    el.textContent = msg;
    const parent = document.querySelector('.preview') || document.body;
    parent.appendChild(el);
  }

  // Credibility label from dict version
  try {
    const r = await fetch(`${API}/v1/db/search?q=water&limit=1`, { cache: 'no-store' });
    if (r.ok) {
      const ver = (await r.json())?.dictionary?.version || '';
      if ($dbUpdated) $dbUpdated.textContent = ver ? `Updated ${ver.replace(/^.*?_/, '').replace(/-/g,' ')}` : 'Updated —';
    }
  } catch (e) { console.warn('Version check failed:', e); }

  // ========== EVENTS ==========
  $analyze?.addEventListener("click", () => runAnalysis('click'));
  $input?.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runAnalysis('kbd'); });
  $uploadBtn?.addEventListener("click", () => $upload?.click());
  $cameraBtn?.addEventListener("click", () => $camera?.click());
  $upload?.addEventListener("change", (e) => handleFile(e.target.files?.[0]));
  $camera?.addEventListener("change", (e) => handleFile(e.target.files?.[0]));
  $btnShare?.addEventListener('click', () => { window.print(); sendEvent('cta_share_report', {}); });
  $btnLink?.addEventListener('click', async () => {
    const url = updateSharableUrl();
    try { await navigator.clipboard.writeText(url); alert("Copied link:\n\n" + url); }
    catch { prompt("Copy this link:", url); }
  });
  $demoBtn?.addEventListener('click', () => {
    const demo = "Water (Aqua), Glycerin, Phenoxyethanol, Fragrance (Parfum), Simmondsia Chinensis (Jojoba) Seed Oil";
    if ($input) $input.value = demo;
    runAnalysis('demo', demo);
    window.scrollTo({ top: $scoreBar?.offsetTop || 0, behavior: 'smooth' });
  });

  // Collapsers
  document.querySelectorAll('.toggle[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-toggle');
      const bucket = document.querySelector(`.bucket[data-bucket="${key}"]`);
      if (!bucket) return;
      const items = bucket.querySelector('.bucket__items');
      const empty = bucket.querySelector('.empty');
      const expanded = btn.getAttribute('aria-expanded') !== 'false';
      if (expanded) {
        if (items) items.style.display = 'none';
        if (empty) empty.style.display = 'none';
        btn.textContent = 'Expand list';
        btn.setAttribute('aria-expanded', 'false');
      } else {
        if (items) items.style.display = '';
        if (empty) empty.style.display = '';
        btn.textContent = 'Collapse list';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Quick Find = server analyze single token
  let findTimer;
  $quickFind?.addEventListener("input", (e) => {
    const q = (e.target.value || "").trim();
    clearTimeout(findTimer);
    findTimer = setTimeout(async () => {
      if (!q) { maybeToggleEmpty(true); clearAllBuckets(); hideScore(); return; }
      try {
        const res = await serverAnalyze(q, 'quickfind');
        render(res, { mode: 'quickfind' });
      } catch (err) {
        showError(`Analyze failed: ${String(err?.message || err)}`);
      }
    }, 120);
  });

  // ========== ANALYZE ==========
  async function runAnalysis(mode='click', rawText=null) {
    try {
      setProgress('Analyzing…');
      const source = (rawText ?? $input?.value ?? '').trim();
      if (!source) { setProgress(''); alert('Paste an ingredient list first.'); return; }
      const res = await serverAnalyze(source, mode);
      render(res, { mode });
      setProgress('');
      updateSharableUrl();
    } catch (e) {
      showError(`Analyze failed: ${String(e?.message || e)}`);
    }
  }

  async function serverAnalyze(text, mode) {
    const r = await fetch(`${API}/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { mode: mode || 'text', text } })
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); if (j?.error?.message) msg = j.error.message; } catch {}
      throw new Error(msg);
    }
    const j = await r.json();
    if (j?.error) throw new Error(j.error.message || 'Analyze error');
    return {
      score: j.score?.value || 0,
      counts: j.counts || { green:0,yellow:0,red:0,unknown:0 },
      buckets: j.buckets || { green:[], yellow:[], red:[], unknown:[] }
    };
  }

  // ========== OCR ==========
  async function handleFile(file) {
    if (!file) return;
    if ($preview) $preview.src = URL.createObjectURL(file);
    try {
      setProgress("Preparing image…");
      const img = await loadImage($preview?.src);
      const { canvas } = downscale(img, 1600, 1600);
      if (!window.Tesseract) { throw new Error("OCR engine not loaded"); }
      setProgress("Recognizing…");
      const { data } = await Tesseract.recognize(canvas, "eng");
      const raw = data?.text || "";
      if ($input) $input.value = raw;
      await runAnalysis('ocr', raw);
      setTimeout(() => setProgress(''), 800);
      sendEvent('ocr_done', { chars: raw.length });
    } catch (err) {
      showError(`OCR failed: ${String(err?.message || err)}`);
      sendEvent('ocr_error', { msg: String(err) });
    }
  }

  // ========== RENDER ==========
  function clearAllBuckets() {
    ['green', 'yellow', 'red', 'unknown'].forEach(k => {
      const slot = document.getElementById(`list-${k}`);
      const empty = document.getElementById(`empty-${k}`);
      const count = document.getElementById(`count-${k}`);
      const more = document.getElementById(`more-${k}`);
      if (slot) slot.innerHTML = '';
      if (empty) empty.hidden = true;
      if (count) count.textContent = '0';
      if (more) more.hidden = true;
    });
  }
  function maybeToggleEmpty(isEmpty) {
    if ($resultsGrid && $resultsEmpty) {
      $resultsGrid.hidden = !!isEmpty;
      $resultsEmpty.hidden = !isEmpty;
    }
  }
  function hideScore(){ if ($scoreBar) $scoreBar.hidden = true; if ($btnAlternatives) $btnAlternatives.hidden = true; }
  function renderScore(b){
    const total = b.green.length + b.yellow.length + b.red.length + b.unknown.length;
    if (!total) { hideScore(); return; }
    const reds=b.red.length,yellows=b.yellow.length,greens=b.green.length;
    let s = 100 - (25*reds) - (8*yellows) + (2*Math.min(greens,10));
    s = Math.max(0, Math.min(100, Math.round(s)));
    if ($scoreVal) $scoreVal.textContent = String(s);
    if ($scoreCounts) $scoreCounts.textContent = `• ${reds} Avoid • ${yellows} Caution • ${greens} Safe`;
    if ($scoreBar) { $scoreBar.hidden = false; $scoreBar.classList.toggle('elite', s >= 90); }
    if ($btnAlternatives) $btnAlternatives.hidden = !(reds || yellows);
  }
  function pill(item){
    const span = document.createElement('span');
    span.className = `pill ${item.status}`;
    const strong = document.createElement('strong'); strong.textContent = item.inci; span.appendChild(strong);
    if (item.why && (item.status==='red' || item.status==='yellow')) {
      span.appendChild(document.createTextNode(' '));
      const btn = document.createElement('button'); btn.type='button'; btn.className='why'; btn.textContent='why?';
      btn.onclick = () => alert(`${item.inci} — ${item.status.toUpperCase()}\n\n${item.why}`);
      span.appendChild(btn);
    }
    return span;
  }
  function render(b, opts={}){
    const total = ['green','yellow','red','unknown'].reduce((n,k)=>n+(b[k]?.length||0),0);
    if (!total){ clearAllBuckets(); maybeToggleEmpty(true); hideScore(); return; }
    maybeToggleEmpty(false);
    renderScore(b);
    const ORDER = ['red','yellow','green','unknown'];
    for (const k of ORDER){
      const items = b[k] || [];
      const slot = document.getElementById(`list-${k}`);
      const empty = document.getElementById(`empty-${k}`);
      const count = document.getElementById(`count-${k}`);
      const more = document.getElementById(`more-${k}`);
      if (!slot) continue;
      slot.innerHTML = '';
      if (count) count.textContent = String(items.length);
      if (!items.length){ if (empty) empty.hidden = false; if (more) more.hidden = true; continue; } else { if (empty) empty.hidden = true; }
      const MAX = 20;
      items.slice(0,MAX).forEach(it => slot.appendChild(pill(it)));
      if (items.length > MAX && more){
        more.hidden = false; more.textContent = `Show all (${items.length})`;
        more.onclick = () => { slot.innerHTML=''; items.forEach(it=>slot.appendChild(pill(it))); more.hidden = true; };
      } else if (more) more.hidden = true;
    }
    sendEvent('classified', { mode: opts.mode || 'analyze', green:b.green.length, yellow:b.yellow.length, red:b.red.length, unknown:b.unknown.length });
    lastResults = b;
  }

  // Alternatives
  let lastResults = { green:[], yellow:[], red:[], unknown:[] };
  $btnAlternatives?.addEventListener('click', () => {
    const reds = lastResults.red||[], yellows = lastResults.yellow||[];
    if (!reds.length && !yellows.length){ alert("Run an analysis with some red/yellow items first."); return; }
    const mk = (from,to) => `• Swap “${from}” → ${to.join(', ')}`;
    const suggestions = [];
    reds.concat(yellows).forEach(item=>{
      const name = (item.inci || '').toLowerCase();
      if (/fragrance|parfum/.test(name)) suggestions.push(mk(item.inci, ["unscented", "no added fragrance"]));
      else if (/phenoxyethanol/.test(name)) suggestions.push(mk(item.inci, ["potassium sorbate", "sodium benzoate"]));
      else if (/glycol|polysorbate|\bpeg\b|peg-/.test(name)) suggestions.push(mk(item.inci, ["glycerin", "propanediol", "butylene glycol"]));
      else if (/\boil\b/.test(name)) suggestions.push(mk(item.inci, ["jojoba oil", "sunflower seed oil", "caprylic/capric triglyceride"]));
    });
    alert((suggestions.length ? "Clean alternatives (beta):\n\n" + suggestions.slice(0,8).join('\n') : "No suggestions for these items yet."));
  });

  // ========== BOOTSTRAP ==========
  (function bootFromQuery(){
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) { if ($input) $input.value = q; runAnalysis('deep-link', q); }
  })();

  // Tiny utils
  function loadImage(src){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
  function downscale(img,maxW,maxH){ const r=Math.min(maxW/img.width,maxH/img.height,1); const w=Math.round(img.width*r),h=Math.round(img.height*r); const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); return {canvas:c,w,h}; }
  function sendEvent(type,data){ try{ const payload=JSON.stringify({type,data,ts:Date.now(),tenant:document.documentElement.dataset.tenant||'default'}); if(navigator.sendBeacon){ navigator.sendBeacon(ANALYTICS_ENDPOINT,new Blob([payload],{type:'application/json'})); } else { fetch(ANALYTICS_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:payload}); } }catch(_){} }
  function updateSharableUrl(){
    const params = new URLSearchParams(location.search);
    params.set('q', $input?.value || '');
    const url = `${location.origin}${location.pathname}?${params.toString()}`;
    history.replaceState(null,'',url);
    return url;
  }
})();
