console.log('demo app.js loaded (API-backed)');

(function () {
  // === API base auto-detect ===
  // Use ?api=http://localhost:3000/api to override; otherwise default to http://localhost:3000/api
  const params = new URLSearchParams(location.search);
  const API_BASE = (params.get('api') || 'http://localhost:3000/api').replace(/\/+$/,'');
  const ENDPOINT_ANALYZE = `${API_BASE}/v1/analyze`;
  const ENDPOINT_SEARCH  = `${API_BASE}/v1/db/search`;

  // === UI hooks ===
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

  const $btnMethodology = document.getElementById('btnMethodology');
  const $modalMethodology = document.getElementById('modalMethodology');
  const $btnAlternatives = document.getElementById('btnAlternatives');
  const $btnShare = document.getElementById('btnShare');
  const $btnLink = document.getElementById('btnLink');
  const $demoBtn = document.getElementById('demoBtn');

  // Score headline
  const $scoreBar = document.getElementById('scoreBar');
  const $scoreVal = document.getElementById('scoreVal');
  const $scoreCounts = document.getElementById('scoreCounts');
  const $dbUpdated = document.getElementById('dbUpdated');

  const MAX_PILLS_SHOWN = 20;

  // State
  let lastResults = { green: [], yellow: [], red: [], unknown: [] };
  let dictVersion = '';

  // === Utils ===
  function setProgress(msg) {
    if ($progress) $progress.textContent = msg || '';
  }
  function norm(s) { return String(s||'').toLowerCase().trim(); }

  function pill(item) {
    const span = document.createElement('span');
    span.className = `pill ${item.status}`;
    span.dataset.inci = item.inci;
    span.dataset.status = item.status;

    const strong = document.createElement('strong');
    strong.textContent = item.inci;
    span.appendChild(strong);

    if (item.why && item.why.trim().length && (item.status === 'red' || item.status === 'yellow')) {
      span.dataset.why = item.why;
      span.appendChild(document.createTextNode(' '));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'why';
      btn.textContent = 'why?';
      btn.setAttribute('aria-haspopup', 'dialog');
      span.appendChild(btn);
    }
    return span;
  }

  function clearAllBuckets() {
    ['green','yellow','red','unknown'].forEach(k=>{
      const slot = document.getElementById(`list-${k}`);
      const empty = document.getElementById(`empty-${k}`);
      const count = document.getElementById(`count-${k}`);
      const more = document.getElementById(`more-${k}`);
      slot && (slot.innerHTML = '');
      empty && (empty.hidden = true);
      count && (count.textContent = '0');
      more && (more.hidden = true);
    });
  }

  function maybeToggleEmpty(isEmpty) {
    if ($resultsGrid && $resultsEmpty) {
      $resultsGrid.hidden = !!isEmpty;
      $resultsEmpty.hidden = !isEmpty;
    }
  }

  function computeScore(b) {
    const reds = b.red.length || 0;
    const yellows = b.yellow.length || 0;
    const greens = b.green.length || 0;
    let s = 100 - (25 * reds) - (8 * yellows) + (2 * Math.min(greens, 10));
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  function renderScore(b) {
    const total = b.green.length + b.yellow.length + b.red.length + b.unknown.length;
    if (!total) { hideScore(); return; }
    const score = computeScore(b);
    if ($scoreVal) $scoreVal.textContent = String(score);
    if ($scoreCounts) $scoreCounts.textContent = `• ${b.red.length} Avoid • ${b.yellow.length} Caution • ${b.green.length} Safe`;
    if ($scoreBar) {
      $scoreBar.hidden = false;
      $scoreBar.classList.toggle('elite', score >= 90);
    }
    if ($btnAlternatives) $btnAlternatives.hidden = !(b.red.length || b.yellow.length);
  }
  function hideScore() {
    if ($scoreBar) $scoreBar.hidden = true;
    if ($btnAlternatives) $btnAlternatives.hidden = true;
  }

  function renderResults(b) {
    const totalCount = ['green','yellow','red','unknown'].reduce((n,k)=>n+(b[k]?.length||0),0);
    if (!totalCount) {
      clearAllBuckets(); maybeToggleEmpty(true); hideScore(); return;
    }
    maybeToggleEmpty(false);
    renderScore(b);

    const ORDER = ['red','yellow','green','unknown'];
    for (const k of ORDER) {
      const items = b[k] || [];
      const slot = document.getElementById(`list-${k}`);
      const empty = document.getElementById(`empty-${k}`);
      const count = document.getElementById(`count-${k}`);
      const more = document.getElementById(`more-${k}`);

      if (!slot) continue;
      slot.innerHTML = '';
      count && (count.textContent = String(items.length));

      if (!items.length) {
        empty && (empty.hidden = false);
        more && (more.hidden = true);
        continue;
      } else {
        empty && (empty.hidden = true);
      }

      const visible = items.slice(0, MAX_PILLS_SHOWN);
      visible.forEach(item => slot.appendChild(pill(item)));

      if (items.length > MAX_PILLS_SHOWN && more) {
        more.hidden = false;
        more.textContent = `Show all (${items.length})`;
        more.onclick = () => {
          slot.innerHTML = '';
          items.forEach(item => slot.appendChild(pill(item)));
          more.hidden = true;
        };
      } else if (more) more.hidden = true;
    }

    lastResults = b;
  }

  function updateDictBadge(version) {
    dictVersion = version || dictVersion || '';
    if ($dbUpdated) $dbUpdated.textContent = `Dictionary — ${dictVersion || 'unknown'}`;
  }

  // === API calls ===
  async function callAnalyze(text) {
    const r = await fetch(ENDPOINT_ANALYZE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { mode: "text", text } })
    });
    const json = await r.json();
    if (json?.error) throw new Error(json.error.message || 'Analyze error');
    updateDictBadge(json?.dictionary?.version);
    return json;
  }

  async function callSearch(q, limit=8) {
    const u = new URL(ENDPOINT_SEARCH);
    u.searchParams.set('q', q);
    u.searchParams.set('limit', String(limit));
    const r = await fetch(u.toString(), { method: 'GET' });
    const json = await r.json();
    return json?.results || [];
  }

  // === OCR helpers ===
  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  }
  function downscale(img, maxW, maxH) {
    const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return { canvas: c, w, h };
  }

  // === Wire up UI ===
  $analyze?.addEventListener('click', async () => {
    const text = ($input?.value || '').trim();
    if (!text) { setProgress('Paste some ingredients first.'); return; }
    try {
      setProgress('Analyzing…');
      const json = await callAnalyze(text);
      renderResults(json.buckets || { green:[], yellow:[], red:[], unknown:[] });
      setProgress('');
    } catch (e) {
      console.error(e);
      setProgress('Error analyzing ingredients.');
    }
  });

  // Cmd/Ctrl+Enter to analyze
  $input?.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") $analyze?.click();
  });

  // Demo chip
  $demoBtn?.addEventListener('click', () => {
    const demo = "Water (Aqua), Glycerin, Sodium Laureth Sulfate, Fragrance (Parfum), Phenoxyethanol, Simmondsia Chinensis (Jojoba) Seed Oil";
    if ($input) $input.value = demo;
    $analyze?.click();
    window.scrollTo({ top: $scoreBar?.offsetTop || 0, behavior: 'smooth' });
  });

  // Quick Find → calls /db/search and renders a mini result set
  let findTimer;
  $quickFind?.addEventListener("input", () => {
    const q = ($quickFind.value || '').trim();
    clearTimeout(findTimer);
    findTimer = setTimeout(async () => {
      if (!q) {
        maybeToggleEmpty(true);
        clearAllBuckets();
        hideScore();
        return;
      }
      try {
        setProgress('Searching…');
        const results = await callSearch(q, 12);
        setProgress('');
        const buckets = { green:[], yellow:[], red:[], unknown:[] };
        for (const e of results) (buckets[e.status] || buckets.unknown).push(e);
        renderResults(buckets);
      } catch (e) {
        console.error(e);
        setProgress('Search failed.');
      }
    }, 160);
  });

  // Upload / Camera (OCR)
  document.getElementById('uploadBtn')?.addEventListener("click", () => $upload?.click());
  document.getElementById('cameraBtn')?.addEventListener("click", () => $camera?.click());
  $upload?.addEventListener("change", (e) => handleFile(e.target.files?.[0]));
  $camera?.addEventListener("change", (e) => handleFile(e.target.files?.[0]));
  async function handleFile(file){
    if (!file) return;
    if ($preview) $preview.src = URL.createObjectURL(file);
    setProgress("Preparing image…");
    const img = await loadImage($preview.src);
    const { canvas } = downscale(img, 1600, 1600);

    if (!window.Tesseract) { setProgress("Tesseract not loaded."); return; }
    try {
      setProgress("Recognizing…");
      const { data } = await Tesseract.recognize(canvas, "eng");
      const raw = data?.text || "";
      if ($input) $input.value = raw;
      $analyze?.click();
      setProgress('');
    } catch (err) {
      console.error(err); setProgress("OCR failed. Try a clearer photo.");
    }
  }

  // Collapsible buckets
  document.querySelectorAll('.toggle[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-toggle');
      const bucket = document.querySelector(`.bucket[data-bucket="${key}"]`);
      if (!bucket) return;
      const items = bucket.querySelector('.bucket__items');
      const empty = bucket.querySelector('.empty');
      const expanded = btn.getAttribute('aria-expanded') !== 'false';
      if (expanded) {
        items && (items.style.display = 'none');
        empty && (empty.style.display = 'none');
        btn.textContent = 'Expand list';
        btn.setAttribute('aria-expanded', 'false');
      } else {
        items && (items.style.display = '');
        empty && (empty.style.display = '');
        btn.textContent = 'Collapse list';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Methodology modal
  $btnMethodology?.addEventListener('click', () => $modalMethodology?.setAttribute('open',''));
  $modalMethodology?.addEventListener('click', (e) => {
    if (e.target === $modalMethodology || e.target.hasAttribute('data-close')) {
      $modalMethodology.close?.(); $modalMethodology.removeAttribute('open');
    }
  });

  // “why?” popover
  const pop = document.createElement('div');
  pop.id = 'why-popover';
  pop.setAttribute('role','dialog');
  pop.setAttribute('aria-modal','false');
  pop.hidden = true;
  document.body.appendChild(pop);
  const style = document.createElement('style');
  style.textContent = `
    #why-popover{position:fixed;z-index:1000;max-width:420px;background:#fff;border:1px solid var(--line,#e6e6e8);border-radius:12px;box-shadow:0 12px 28px rgba(0,0,0,.18);padding:14px}
    #why-popover[hidden]{display:none}
    #why-popover .hdr{font-weight:800;margin:0 0 6px}
    #why-popover .meta{color:#555;font-size:12.5px;margin-bottom:8px}
    #why-popover ul{margin:0 0 8px 18px;padding:0;font-size:14px}
    #why-popover .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
    #why-popover .btn{padding:8px 10px;border-radius:10px;border:1px solid var(--line,#ddd);background:#fff;font-weight:700;cursor:pointer}
  `;
  document.head.appendChild(style);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.why');
    const inPopover = e.target.closest('#why-popover');
    if (btn) {
      e.preventDefault();
      const pillEl = btn.closest('.pill');
      if (!pillEl) return;
      const inci = pillEl.dataset.inci || 'Ingredient';
      const status = pillEl.dataset.status || 'unknown';
      const reason = pillEl.dataset.why || '';
      if (!reason) return;

      const title = `${inci} — ${status[0].toUpperCase()+status.slice(1)}`;
      pop.innerHTML = `
        <div class="hdr">${escapeHtml(title)}</div>
        <div class="meta">Dictionary: ${escapeHtml(dictVersion || '—')}</div>
        <ul><li><strong>Why we flag it:</strong> ${escapeHtml(reason)}</li></ul>
        <div class="actions">
          <button class="btn" data-action="methodology">View methodology</button>
          <button class="btn" data-action="close">Close</button>
        </div>
      `;
      pop.hidden = false;

      const r = pillEl.getBoundingClientRect();
      pop.style.top = '0px'; pop.style.left = '-9999px';
      const popW = pop.offsetWidth; const popH = pop.offsetHeight;
      let top = r.bottom + 8;
      let left = Math.min(Math.max(12, r.left), window.innerWidth - popW - 12);
      if (top + popH > window.innerHeight - 12) top = Math.max(12, r.top - popH - 8);
      pop.style.top = `${Math.round(top + window.scrollY)}px`;
      pop.style.left = `${Math.round(left + window.scrollX)}px`;
      pop.querySelector('.btn')?.focus();
      return;
    }
    if (!inPopover) pop.hidden = true;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });

  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));}

  // Share buttons
  $btnLink?.addEventListener('click', async () => {
    const val = encodeURIComponent($input?.value || '');
    const url = `${location.origin}${location.pathname}?api=${encodeURIComponent(API_BASE)}&q=${val}`;
    try { await navigator.clipboard.writeText(url); alert("Copied link:\n\n"+url); }
    catch { prompt("Copy this link:", url); }
  });
  $btnShare?.addEventListener('click', () => window.print());

  // Deep link ?q=
  (function bootstrapFromQuery(){
    const q = params.get('q');
    if (q) { if ($input) $input.value = q; $analyze?.click(); }
  })();
})();
