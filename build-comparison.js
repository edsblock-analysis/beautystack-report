const fs = require('fs');
const path = require('path');

const PROD_DIR = path.join(__dirname, 'live-site-reports'); // production / live sites
const EDS_DIR = path.join(__dirname, 'reports'); // migrated EDS sites
const OUT_FILE = path.join(__dirname, 'comparison-index.html');

// Canonical site keys shared by both production and EDS reports.
const SITE_LABELS = {
  cutex: 'Cutex',
  lottabody: 'LottaBody',
  rouxbeauty: 'Roux Beauty',
  sinfulcolors: 'SinfulColors',
};

const SITE_ORDER = ['lottabody', 'cutex', 'rouxbeauty', 'sinfulcolors'];

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

// Normalize a hostname into one of the canonical site keys.
function siteKeyFromHost(host) {
  host = host.toLowerCase().replace(/^www\./, '');
  // EDS preview: main--<slug>--beautystack-eds.aem.live
  const eds = host.match(/^main--([a-z-]+)--beautystack/);
  if (eds) return eds[1].replace(/-/g, '');
  // Production: <name>.com  -> first label
  const label = host.split('.')[0];
  if (label.includes('lottabody')) return 'lottabody';
  if (label.includes('cutex')) return 'cutex';
  if (label.includes('rouxbeauty')) return 'rouxbeauty';
  if (label.includes('sinfulcolors')) return 'sinfulcolors';
  return label;
}

function normalizePath(url) {
  try {
    const u = new URL(url);
    let p = u.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
    return p === '' ? '/' : p.toLowerCase();
  } catch {
    return null;
  }
}

function readReports(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html');
  const out = [];
  for (const file of files) {
    const html = fs.readFileSync(path.join(dir, file), 'utf-8');
    const json = extractLighthouseJson(html);
    if (!json) continue;
    const url = json.requestedUrl || json.finalUrl || '';
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    out.push({
      site: siteKeyFromHost(host),
      path: normalizePath(url),
      url,
      file,
      performance: scoreToPercent(json.categories?.performance?.score),
    });
  }
  return out;
}

function build() {
  const prod = readReports(PROD_DIR);
  const eds = readReports(EDS_DIR);

  // Index both sides by site + path.
  const map = new Map(); // key: site\u0000path -> { site, path, prod, eds }
  const keyOf = (r) => `${r.site}\u0000${r.path}`;

  for (const r of prod) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, { site: r.site, path: r.path, prod: null, eds: null });
    map.get(k).prod = { file: r.file, performance: r.performance, url: r.url };
  }
  for (const r of eds) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, { site: r.site, path: r.path, prod: null, eds: null });
    map.get(k).eds = { file: r.file, performance: r.performance, url: r.url };
  }

  // Group rows by site.
  const sites = {};
  for (const row of map.values()) {
    (sites[row.site] = sites[row.site] || []).push(row);
  }
  for (const s of Object.keys(sites)) {
    sites[s].sort((a, b) => a.path.localeCompare(b.path));
  }

  const orderedSites = [
    ...SITE_ORDER.filter((s) => sites[s]),
    ...Object.keys(sites).filter((s) => !SITE_ORDER.includes(s)).sort(),
  ];

  const data = {
    generated: new Date().toISOString(),
    siteLabels: SITE_LABELS,
    sites: orderedSites.map((s) => ({
      key: s,
      label: SITE_LABELS[s] || s,
      rows: sites[s],
    })),
  };

  fs.writeFileSync(OUT_FILE, pageTemplate(data), 'utf-8');

  console.log('Comparison report written to comparison-index.html');
  for (const site of data.sites) {
    const matched = site.rows.filter((r) => r.prod && r.eds).length;
    console.log(`  ${site.label}: ${site.rows.length} pages (${matched} matched on both)`);
  }
}

function pageTemplate(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Production vs EDS — Lighthouse Comparison</title>
<style>
:root{
  --bg:#0b0f17; --panel:#141b29; --line:rgba(255,255,255,.08);
  --text:#e8eef7; --muted:#93a1b8; --accent:#5b9dff;
  --t95:#22c55e; --t90:#84cc16; --t85:#eab308; --t80:#f97316; --low:#ef4444; --na:#64748b;
  --up:#22c55e; --down:#ef4444;
}
*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  background:radial-gradient(1200px 600px at 20% -10%,#16243d 0,var(--bg) 55%);
  color:var(--text);line-height:1.5;padding:1.5rem clamp(1rem,4vw,3rem) 4rem;min-height:100vh}
header h1{font-size:1.7rem;font-weight:700;margin:0 0 .25rem;letter-spacing:-.02em}
header p{color:var(--muted);margin:0;font-size:.9rem}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:1.5rem 0 .5rem}
.scard{background:linear-gradient(180deg,var(--panel),#11192690);border:1px solid var(--line);border-radius:14px;padding:1rem 1.2rem;transition:.15s}
.scard:hover{border-color:var(--accent);transform:translateY(-2px)}
.scard h3{margin:0 0 .7rem;font-size:1.05rem;display:flex;align-items:center;gap:.5rem}
.scard h3::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent)}
.avgrow{display:flex;justify-content:space-between;align-items:baseline;font-size:.85rem;color:var(--muted);margin:.25rem 0}
.avgrow b{font-size:1.25rem;font-weight:700;letter-spacing:-.02em;color:var(--text)}
section{margin-top:2.25rem}
h2{font-size:1.2rem;font-weight:700;margin:0 0 .2rem;letter-spacing:-.01em}
.sub{color:var(--muted);font-size:.82rem;margin:0 0 .8rem}
.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
table{width:100%;border-collapse:collapse;font-size:.85rem;table-layout:fixed}
col.side-col{width:44%}
col.delta-col{width:60px}
th,td{text-align:left;padding:.55rem .8rem;border-bottom:1px solid var(--line);vertical-align:middle}
tbody tr{transition:background .12s}
tbody tr:nth-child(even){background:rgba(255,255,255,.018)}
tbody tr:hover{background:rgba(91,157,255,.08)}
tbody tr:last-child td{border-bottom:none}
th{color:var(--muted);font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;background:#0f1623;position:sticky;top:0;z-index:1}
th.c,td.c{text-align:center}
td .path{word-break:break-word}
.pill{display:inline-block;min-width:34px;text-align:center;padding:.2rem .45rem;border-radius:6px;font-weight:700;font-size:.8rem;flex-shrink:0}
.pill.t95{background:rgba(34,197,94,.15);color:var(--t95)}
.pill.t90{background:rgba(132,204,22,.15);color:var(--t90)}
.pill.t85{background:rgba(234,179,8,.15);color:var(--t85)}
.pill.t80{background:rgba(249,115,22,.15);color:var(--t80)}
.pill.low{background:rgba(239,68,68,.15);color:var(--low)}
.pill.na{background:rgba(100,116,139,.15);color:var(--na)}
.view{display:inline-block;margin-left:.45rem;color:var(--accent);text-decoration:none;font-size:.78rem}
.view:hover{text-decoration:underline}
.view.dis{color:var(--na);pointer-events:none}
.delta{font-weight:700;font-size:.82rem}
.delta.up{color:var(--up)} .delta.down{color:var(--down)} .delta.flat{color:var(--muted)}
.cell{display:flex;align-items:center;gap:.1rem}
.side{display:flex;align-items:center;gap:.55rem;min-width:0}
.url{flex:1;min-width:0;color:var(--muted);text-decoration:none;font-size:.68rem;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.01em}
.url:hover{color:var(--accent);text-decoration:underline}
.muted{color:var(--muted)}
</style>
</head>
<body>
<header>
  <h1>Production vs EDS — Lighthouse Performance Comparison</h1>
  <p>Old production sites vs migrated EDS sites · <span id="meta"></span></p>
</header>

<div class="summary" id="summary"></div>
<div id="content"></div>

<script>
const DATA = __DATA__;

function tierOf(p){
  if(p==null) return 'na';
  if(p>=95) return 't95';
  if(p>=90) return 't90';
  if(p>=85) return 't85';
  if(p>=80) return 't80';
  return 'low';
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function avg(arr){ const v=arr.filter(x=>x!=null); return v.length? Math.round(v.reduce((a,b)=>a+b,0)/v.length):null; }
function fmt(n){ return n==null?'—':n; }

function pill(score){
  return '<span class="pill '+tierOf(score)+'">'+(score==null?'—':score)+'</span>';
}
function viewLink(side, item){
  if(!item) return '<span class="view dis">no report</span>';
  const dir = side==='prod' ? 'live-site-reports/' : 'reports/';
  return '<a class="view" target="_blank" href="'+dir+encodeURIComponent(item.file)+'">view</a>';
}
function sideCell(side, item){
  if(!item) return '<div class="side">'+pill(null)+'<span class="url">—</span><span class="view dis">no report</span></div>';
  return '<div class="side">'+
    pill(item.performance)+
    '<a class="url" title="'+esc(item.url)+'" target="_blank" href="'+esc(item.url)+'">'+esc(item.url)+'</a>'+
    viewLink(side,item)+
  '</div>';
}
function delta(row){
  if(!row.prod||!row.eds||row.prod.performance==null||row.eds.performance==null) return '<span class="delta flat">—</span>';
  const d = row.eds.performance - row.prod.performance;
  if(d===0) return '<span class="delta flat">0</span>';
  const cls = d>0?'up':'down';
  return '<span class="delta '+cls+'">'+(d>0?'+':'')+d+'</span>';
}

function renderSummary(){
  const wrap=document.getElementById('summary');
  wrap.innerHTML = DATA.sites.map(site=>{
    const prodAvg = avg(site.rows.map(r=>r.prod&&r.prod.performance));
    const edsAvg = avg(site.rows.map(r=>r.eds&&r.eds.performance));
    const d = (prodAvg!=null&&edsAvg!=null)? edsAvg-prodAvg : null;
    const dStr = d==null?'—':(d>0?'+'+d:''+d);
    const dCls = d==null?'flat':(d>0?'up':(d<0?'down':'flat'));
    return '<div class="scard">'+
      '<h3>'+esc(site.label)+'</h3>'+
      '<div class="avgrow"><span>Production avg</span> <b>'+fmt(prodAvg)+'</b></div>'+
      '<div class="avgrow"><span>EDS avg</span> <b>'+fmt(edsAvg)+'</b></div>'+
      '<div class="avgrow"><span>Difference</span> <b class="delta '+dCls+'">'+dStr+'</b></div>'+
      '<div class="avgrow"><span class="muted">'+site.rows.length+' pages</span></div>'+
    '</div>';
  }).join('');
}

function renderSites(){
  const wrap=document.getElementById('content');
  wrap.innerHTML = DATA.sites.map(site=>{
    const rows = site.rows.map(r=>{
      return '<tr>'+
        '<td>'+sideCell('prod', r.prod)+'</td>'+
        '<td>'+sideCell('eds', r.eds)+'</td>'+
        '<td class="c">'+delta(r)+'</td>'+
      '</tr>';
    }).join('');
    return '<section>'+
      '<h2>'+esc(site.label)+'</h2>'+
      '<p class="sub">'+site.rows.length+' pages compared</p>'+
      '<div class="tablewrap"><table>'+
        '<colgroup><col class="side-col"><col class="side-col"><col class="delta-col"></colgroup>'+
        '<thead><tr>'+
          '<th>Production</th>'+
          '<th>EDS</th>'+
          '<th class="c">Δ</th>'+
        '</tr></thead>'+
        '<tbody>'+rows+'</tbody>'+
      '</table></div>'+
    '</section>';
  }).join('');
}

function init(){
  const totalPages = DATA.sites.reduce((a,s)=>a+s.rows.length,0);
  document.getElementById('meta').textContent =
    totalPages+' pages across '+DATA.sites.length+' sites · generated '+new Date(DATA.generated).toLocaleString();
  renderSummary();
  renderSites();
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

module.exports = { build };
