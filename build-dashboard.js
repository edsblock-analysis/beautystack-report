const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, 'reports');
const OUT_FILE = path.join(__dirname, 'index.html');

// Friendly site labels keyed by the slug embedded in each report file name.
const SITE_LABELS = {
  cutex: 'Cutex',
  lotta_body: 'LottaBody',
  rouxbeauty: 'Roux Beauty',
  sinfulcolors: 'SinfulColors',
};

const CATEGORIES = [
  { key: 'performance', label: 'Performance' },
  { key: 'accessibility', label: 'Accessibility' },
  { key: 'best-practices', label: 'Best Practices' },
  { key: 'seo', label: 'SEO' },
];

function extractLighthouseJson(html) {
  const m = html.match(/window\.__LIGHTHOUSE_JSON__\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function scoreToPercent(score) {
  if (score == null || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

function siteFromFile(file) {
  const m = file.match(/^https___main__([a-z_]+)__beautystack/i);
  return m ? m[1] : 'other';
}

function pageNameFromUrl(url, file) {
  if (url) {
    try {
      const u = new URL(url);
      const p = u.pathname.replace(/\/$/, '');
      return p === '' ? '/ (home)' : p;
    } catch {
      /* fall through */
    }
  }
  return file.replace(/\.html$/, '');
}

function collect() {
  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.endsWith('.html') && f !== 'index.html');

  const pages = [];

  for (const file of files) {
    const html = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf-8');
    const json = extractLighthouseJson(html);
    if (!json) continue;

    const url = json.requestedUrl || json.finalUrl || '';
    const cats = json.categories || {};
    const audits = json.audits || {};

    const scores = {};
    for (const { key } of CATEGORIES) {
      scores[key] = scoreToPercent(cats[key]?.score);
    }

    const metricVal = (id) => {
      const a = audits[id];
      if (!a) return null;
      return { value: a.numericValue ?? null, display: a.displayValue ?? null };
    };

    pages.push({
      site: siteFromFile(file),
      name: pageNameFromUrl(url, file),
      url,
      file,
      scores,
      metrics: {
        fcp: metricVal('first-contentful-paint'),
        lcp: metricVal('largest-contentful-paint'),
        tbt: metricVal('total-blocking-time'),
        cls: metricVal('cumulative-layout-shift'),
        si: metricVal('speed-index'),
      },
    });
  }

  pages.sort((a, b) => {
    if (a.site !== b.site) return a.site.localeCompare(b.site);
    return (b.scores.performance ?? -1) - (a.scores.performance ?? -1);
  });

  return pages;
}

function build() {
  if (!fs.existsSync(REPORTS_DIR)) {
    console.warn('No reports/ folder found.');
    return;
  }

  const pages = collect();
  const generated = new Date().toISOString();

  const data = {
    generated,
    siteLabels: SITE_LABELS,
    categories: CATEGORIES,
    pages,
  };

  const html = pageTemplate(data);
  fs.writeFileSync(OUT_FILE, html, 'utf-8');

  const bySite = {};
  for (const p of pages) bySite[p.site] = (bySite[p.site] || 0) + 1;
  console.log(`Dashboard written to index.html`);
  console.log(`  ${pages.length} pages across ${Object.keys(bySite).length} sites`);
  for (const [s, n] of Object.entries(bySite)) {
    console.log(`    ${SITE_LABELS[s] || s}: ${n}`);
  }
}

function pageTemplate(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lighthouse Dashboard — Revlon Sites</title>
<style>
:root{
  --bg:#0b0f17; --panel:#141b29; --panel2:#1b2435; --line:rgba(255,255,255,.08);
  --text:#e8eef7; --muted:#93a1b8; --accent:#5b9dff;
  --t95:#22c55e; --t90:#84cc16; --t85:#eab308; --t80:#f97316; --low:#ef4444; --na:#64748b;
}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  background:radial-gradient(1200px 600px at 20% -10%,#16243d 0,var(--bg) 55%);
  color:var(--text);line-height:1.5;padding:1.5rem clamp(1rem,4vw,3rem) 4rem;min-height:100vh}
header h1{font-size:1.7rem;font-weight:700;margin:0 0 .25rem;letter-spacing:-.02em}
header p{color:var(--muted);margin:0;font-size:.9rem}
.controls{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.5rem 0 1rem;align-items:center}
.controls .group{display:flex;gap:.35rem;flex-wrap:wrap}
.chip{background:var(--panel);border:1px solid var(--line);color:var(--muted);
  padding:.45rem .85rem;border-radius:999px;font-size:.85rem;cursor:pointer;transition:.15s}
.chip:hover{color:var(--text);border-color:var(--accent)}
.chip.active{background:var(--accent);border-color:var(--accent);color:#05101f;font-weight:600}
.label{font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-right:.25rem}
section{margin-top:1.75rem}
h2{font-size:1.05rem;font-weight:600;margin:0 0 .9rem;padding-bottom:.5rem;border-bottom:1px solid var(--line)}
.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.85rem}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1rem 1.15rem;cursor:pointer;transition:.15s}
.tile:hover{transform:translateY(-2px);border-color:var(--accent)}
.tile.active{outline:2px solid var(--accent)}
.tile .n{font-size:2.1rem;font-weight:700;letter-spacing:-.02em}
.tile .lbl{font-size:.8rem;color:var(--muted);margin-top:.15rem}
.tile .pct{font-size:.75rem;color:var(--muted);margin-top:.4rem}
.tile.t95 .n{color:var(--t95)} .tile.t90 .n{color:var(--t90)} .tile.t85 .n{color:var(--t85)}
.tile.t80 .n{color:var(--t80)} .tile.low .n{color:var(--low)} .tile.na .n{color:var(--na)}
.sites{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}
.scard{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1.1rem 1.25rem}
.scard h3{margin:0;font-size:1.05rem;display:flex;justify-content:space-between;align-items:baseline}
.scard h3 .cnt{font-size:.8rem;color:var(--muted);font-weight:400}
.avg{font-size:2.4rem;font-weight:700;letter-spacing:-.02em;margin:.3rem 0 .1rem}
.avg small{font-size:.85rem;color:var(--muted);font-weight:400;margin-left:.3rem}
.bar{display:flex;height:12px;border-radius:6px;overflow:hidden;margin:.7rem 0 .5rem;background:#0c1322}
.bar span{display:block}
.legend{display:flex;flex-wrap:wrap;gap:.5rem 1rem;font-size:.72rem;color:var(--muted)}
.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:.35rem;vertical-align:middle}
.cats{margin-top:.85rem;display:grid;gap:.5rem}
.catrow{display:grid;grid-template-columns:110px 1fr 40px;align-items:center;gap:.6rem;font-size:.8rem}
.catrow .track{height:8px;background:#0c1322;border-radius:4px;overflow:hidden}
.catrow .fill{height:100%;border-radius:4px}
.catrow .v{text-align:right;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.5rem}
th,td{text-align:left;padding:.55rem .6rem;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;user-select:none;position:sticky;top:0;background:var(--bg)}
th:hover{color:var(--text)}
td a{color:var(--accent);text-decoration:none;word-break:break-word}
td a:hover{text-decoration:underline}
.pill{display:inline-block;min-width:34px;text-align:center;padding:.15rem .45rem;border-radius:6px;font-weight:600;font-size:.78rem}
.pill.t95{background:rgba(34,197,94,.15);color:var(--t95)}
.pill.t90{background:rgba(132,204,22,.15);color:var(--t90)}
.pill.t85{background:rgba(234,179,8,.15);color:var(--t85)}
.pill.t80{background:rgba(249,115,22,.15);color:var(--t80)}
.pill.low{background:rgba(239,68,68,.15);color:var(--low)}
.pill.na{background:rgba(100,116,139,.15);color:var(--na)}
.muted{color:var(--muted)}
.tablewrap{max-height:620px;overflow:auto;border:1px solid var(--line);border-radius:12px}
.empty{color:var(--muted);padding:1rem;text-align:center}
</style>
</head>
<body>
<header>
  <h1>Lighthouse Performance Dashboard</h1>
  <p>Mobile audits across 4 sites · <span id="meta"></span></p>
</header>

<div class="controls">
  <div class="group" id="catChips"><span class="label">Category</span></div>
  <div class="group" id="siteChips"><span class="label">Site</span></div>
</div>

<section>
  <h2 id="tierTitle">Score distribution</h2>
  <div class="tiers" id="tiers"></div>
</section>

<section>
  <h2>By site</h2>
  <div class="sites" id="sites"></div>
</section>

<section>
  <h2>Pages <span class="muted" id="pageCount" style="font-size:.8rem;font-weight:400"></span></h2>
  <div class="tablewrap">
    <table id="tbl">
      <thead><tr>
        <th data-sort="site">Site</th>
        <th data-sort="name">Page</th>
        <th data-sort="performance">Perf</th>
        <th data-sort="accessibility">A11y</th>
        <th data-sort="best-practices">Best Pr.</th>
        <th data-sort="seo">SEO</th>
        <th data-sort="lcp">LCP</th>
        <th data-sort="cls">CLS</th>
        <th data-sort="tbt">TBT</th>
        <th>Report</th>
      </tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</section>

<script>
const DATA = __DATA__;

const TIERS = [
  {key:'t95', label:'95–100', test:p=>p>=95},
  {key:'t90', label:'90–94',  test:p=>p>=90&&p<95},
  {key:'t85', label:'85–89',  test:p=>p>=85&&p<90},
  {key:'t80', label:'80–84',  test:p=>p>=80&&p<85},
  {key:'low', label:'Below 80',test:p=>p<80},
  {key:'na',  label:'No score',test:p=>p==null},
];
const TIER_COLOR = {t95:'#22c55e',t90:'#84cc16',t85:'#eab308',t80:'#f97316',low:'#ef4444',na:'#64748b'};

let state = { category:'performance', site:'all', tier:'all', sortKey:'site', sortDir:1 };

function tierOf(p){
  if(p==null) return 'na';
  for(const t of TIERS){ if(t.key!=='na' && t.test(p)) return t.key; }
  return 'na';
}
function avg(arr){ const v=arr.filter(x=>x!=null); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null; }
function fmt(n){ return n==null?'—':Math.round(n); }
function scoreColor(p){ return TIER_COLOR[tierOf(p)]; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function filteredPages(){
  return DATA.pages.filter(p => state.site==='all' || p.site===state.site);
}

function renderChips(){
  const cc = document.getElementById('catChips');
  DATA.categories.forEach(c=>{
    const el=document.createElement('span');
    el.className='chip'+(state.category===c.key?' active':'');
    el.textContent=c.label;
    el.onclick=()=>{state.category=c.key;state.tier='all';renderAll();};
    cc.appendChild(el);
  });
  const sc = document.getElementById('siteChips');
  const all=document.createElement('span');
  all.className='chip'+(state.site==='all'?' active':'');
  all.textContent='All sites';
  all.onclick=()=>{state.site='all';renderAll();};
  sc.appendChild(all);
  Object.keys(DATA.siteLabels).forEach(s=>{
    if(!DATA.pages.some(p=>p.site===s)) return;
    const el=document.createElement('span');
    el.className='chip'+(state.site===s?' active':'');
    el.textContent=DATA.siteLabels[s];
    el.onclick=()=>{state.site=s;renderAll();};
    sc.appendChild(el);
  });
}

function renderTiers(){
  const pages=filteredPages();
  const catLabel=DATA.categories.find(c=>c.key===state.category).label;
  document.getElementById('tierTitle').textContent=catLabel+' score distribution';
  const counts={};
  TIERS.forEach(t=>counts[t.key]=0);
  pages.forEach(p=>counts[tierOf(p.scores[state.category])]++);
  const total=pages.length||1;
  const wrap=document.getElementById('tiers');
  wrap.innerHTML='';
  const allTile=document.createElement('div');
  allTile.className='tile'+(state.tier==='all'?' active':'');
  allTile.innerHTML='<div class="n">'+pages.length+'</div><div class="lbl">All pages</div><div class="pct">100%</div>';
  allTile.onclick=()=>{state.tier='all';renderAll();};
  wrap.appendChild(allTile);
  TIERS.forEach(t=>{
    const n=counts[t.key];
    const el=document.createElement('div');
    el.className='tile '+t.key+(state.tier===t.key?' active':'');
    el.innerHTML='<div class="n">'+n+'</div><div class="lbl">'+t.label+'</div><div class="pct">'+Math.round(n/total*100)+'%</div>';
    el.onclick=()=>{state.tier=(state.tier===t.key?'all':t.key);renderAll();};
    wrap.appendChild(el);
  });
}

function siteBar(pages){
  const counts={};TIERS.forEach(t=>counts[t.key]=0);
  pages.forEach(p=>counts[tierOf(p.scores[state.category])]++);
  const total=pages.length||1;
  return TIERS.map(t=>{
    const w=counts[t.key]/total*100;
    return w>0?'<span style="width:'+w+'%;background:'+TIER_COLOR[t.key]+'"></span>':'';
  }).join('');
}

function renderSites(){
  const wrap=document.getElementById('sites');
  wrap.innerHTML='';
  const sites=Object.keys(DATA.siteLabels).filter(s=>DATA.pages.some(p=>p.site===s));
  const visible = state.site==='all'? sites : [state.site];
  visible.forEach(s=>{
    const pages=DATA.pages.filter(p=>p.site===s);
    const a=avg(pages.map(p=>p.scores[state.category]));
    const card=document.createElement('div');
    card.className='scard';
    let cats='';
    DATA.categories.forEach(c=>{
      const cv=avg(pages.map(p=>p.scores[c.key]));
      cats+='<div class="catrow"><span>'+c.label+'</span>'+
        '<span class="track"><span class="fill" style="width:'+(cv||0)+'%;background:'+scoreColor(cv)+'"></span></span>'+
        '<span class="v">'+fmt(cv)+'</span></div>';
    });
    const lcp=avg(pages.map(p=>p.metrics.lcp&&p.metrics.lcp.value));
    const cls=avg(pages.map(p=>p.metrics.cls&&p.metrics.cls.value));
    const tbt=avg(pages.map(p=>p.metrics.tbt&&p.metrics.tbt.value));
    card.innerHTML=
      '<h3>'+esc(DATA.siteLabels[s])+'<span class="cnt">'+pages.length+' pages</span></h3>'+
      '<div class="avg" style="color:'+scoreColor(a)+'">'+fmt(a)+'<small>avg '+esc(DATA.categories.find(c=>c.key===state.category).label)+'</small></div>'+
      '<div class="bar">'+siteBar(pages)+'</div>'+
      '<div class="cats">'+cats+'</div>'+
      '<div class="legend" style="margin-top:.7rem">'+
        '<span>LCP '+(lcp!=null?(lcp/1000).toFixed(1)+'s':'—')+'</span>'+
        '<span>CLS '+(cls!=null?cls.toFixed(3):'—')+'</span>'+
        '<span>TBT '+(tbt!=null?Math.round(tbt)+'ms':'—')+'</span>'+
      '</div>';
    wrap.appendChild(card);
  });
}

function metricVal(p,key){
  if(key==='lcp') return p.metrics.lcp&&p.metrics.lcp.value;
  if(key==='cls') return p.metrics.cls&&p.metrics.cls.value;
  if(key==='tbt') return p.metrics.tbt&&p.metrics.tbt.value;
  return null;
}

function renderTable(){
  let rows=filteredPages();
  if(state.tier!=='all') rows=rows.filter(p=>tierOf(p.scores[state.category])===state.tier);
  const sk=state.sortKey, dir=state.sortDir;
  rows=rows.slice().sort((a,b)=>{
    let av,bv;
    if(sk==='site'){av=a.site;bv=b.site;}
    else if(sk==='name'){av=a.name;bv=b.name;}
    else if(['lcp','cls','tbt'].includes(sk)){av=metricVal(a,sk);bv=metricVal(b,sk);}
    else {av=a.scores[sk];bv=b.scores[sk];}
    if(av==null)av=-Infinity;if(bv==null)bv=-Infinity;
    if(typeof av==='string')return dir*av.localeCompare(bv);
    return dir*(av-bv);
  });
  document.getElementById('pageCount').textContent='· '+rows.length+' shown';
  const tb=document.getElementById('rows');
  if(!rows.length){tb.innerHTML='<tr><td colspan="10" class="empty">No pages in this selection.</td></tr>';return;}
  tb.innerHTML=rows.map(p=>{
    const pill=k=>{const v=p.scores[k];return '<span class="pill '+tierOf(v)+'">'+(v==null?'—':v)+'</span>';};
    const lcp=p.metrics.lcp&&p.metrics.lcp.display||'—';
    const cls=p.metrics.cls&&p.metrics.cls.display||'—';
    const tbt=p.metrics.tbt&&p.metrics.tbt.display||'—';
    const href='reports/'+encodeURIComponent(p.file);
    return '<tr>'+
      '<td>'+esc(DATA.siteLabels[p.site]||p.site)+'</td>'+
      '<td>'+esc(p.name)+'</td>'+
      '<td>'+pill('performance')+'</td>'+
      '<td>'+pill('accessibility')+'</td>'+
      '<td>'+pill('best-practices')+'</td>'+
      '<td>'+pill('seo')+'</td>'+
      '<td class="muted">'+esc(lcp)+'</td>'+
      '<td class="muted">'+esc(cls)+'</td>'+
      '<td class="muted">'+esc(tbt)+'</td>'+
      '<td><a href="'+href+'" target="_blank">open</a></td>'+
    '</tr>';
  }).join('');
}

function renderAll(){
  document.querySelectorAll('#catChips .chip').forEach((c,i)=>{
    c.classList.toggle('active',DATA.categories[i].key===state.category);
  });
  // rebuild site chips active state
  document.querySelectorAll('#siteChips .chip').forEach(c=>{
    const isAll=c.textContent==='All sites';
    const match=isAll? state.site==='all' : c.textContent===DATA.siteLabels[state.site];
    c.classList.toggle('active',match);
  });
  renderTiers();
  renderSites();
  renderTable();
}

function init(){
  document.getElementById('meta').textContent =
    DATA.pages.length+' pages · generated '+new Date(DATA.generated).toLocaleString();
  renderChips();
  document.querySelectorAll('#tbl th[data-sort]').forEach(th=>{
    th.onclick=()=>{
      const k=th.getAttribute('data-sort');
      if(state.sortKey===k) state.sortDir*=-1; else {state.sortKey=k;state.sortDir=(k==='site'||k==='name')?1:-1;}
      renderTable();
    };
  });
  renderAll();
}
init();
</script>
</body>
</html>
`.replace('__DATA__', json);
}

if (require.main === module) {
  build();
}

// `buildDashboard` kept as an alias so generate.js (and any other caller)
// can run the dashboard build after each Lighthouse test run.
module.exports = { build, buildDashboard: build };
