// Sealed and Deals pages of the card finder. One request for the whole catalogue, then filter here.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = (n) => (n == null ? '' : '฿' + Math.round(Number(n)).toLocaleString('en-US'));
const safeUrl = (u) => (/^https:\/\//.test(u || '') ? u : '#');
const SHOW = 60;

// Groups for the Type filter.
export function kindGroup(kind) {
  if (/-box$/.test(kind || '')) return 'box';
  if (/-pack$/.test(kind || '') || kind === 'prerelease') return 'pack';
  if (/^commander|deck-set/.test(kind || '')) return 'commander';
  if (/bundle/.test(kind || '')) return 'bundle';
  return 'other';
}

// Every word typed must appear in the title, store, set or type.
export function matches(o, q) {
  const hay = `${o.title} ${o.store} ${o.set || ''} ${o.kindLabel}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

// Deals: only offers with a US price, at most `within` % over it, biggest discount first.
export function pick(offers, { q = '', kind = '', sort = 'price', within = 0, mode = 'sealed' } = {}) {
  let list = offers.filter(o => (!q || matches(o, q)) && (!kind || kindGroup(o.kind) === kind));
  if (mode === 'deals') list = list.filter(o => o.discountPct != null && o.discountPct >= -within);
  const by = mode === 'deals' || sort === 'discount'
    ? (a, b) => (b.discountPct ?? -1e9) - (a.discountPct ?? -1e9) || a.price - b.price
    : sort === 'name' ? (a, b) => a.title.localeCompare(b.title) || a.price - b.price : (a, b) => a.price - b.price;
  return list.sort(by);
}

function badge(o) {
  if (o.discountPct == null) return '';
  const pct = Math.abs(o.discountPct).toFixed(o.discountPct % 1 ? 1 : 0);
  const what = o.ref.source === 'msrp' ? 'MSRP' : 'US market';
  if (o.discountPct > 0) return `<span class="tag in">${pct}% under ${what}</span>`;
  if (o.discountPct === 0) return `<span class="tag in">At ${what}</span>`;
  return `<span class="tag out">${pct}% over ${what}</span>`;
}

function offerHtml(o) {
  const ref = o.ref
    ? `<small>US price: ${o.ref.source === 'msrp' ? 'MSRP' : 'TCGplayer market'} <a href="${esc(safeUrl(o.ref.url))}" target="_blank" rel="noopener">$${o.ref.usd.toFixed(2)}</a>${o.ref.thb ? ` ≈ ${esc(baht(o.ref.thb))}` : ''}</small>`
    : '<small>No US price found</small>';
  const left = o.qty ? `<small>${esc(o.qty)} left</small>` : '';
  return `<li>
    <div><a href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener">${esc(o.title)}</a>
      <small>${esc(o.store)}${o.area !== 'Bangkok' ? ` · ${esc(o.area)}` : ''} · ${esc(o.kindLabel)}</small>
      ${ref}${badge(o)}</div>
    <div class="price">${esc(baht(o.price))}${left}</div>
  </li>`;
}

function storesHtml(stores) {
  return stores.map(s => `<li><div><a href="${esc(safeUrl(s.page))}" target="_blank" rel="noopener">${esc(s.name)}</a><small>${esc(s.area)}</small></div>
    <div class="price"><small>${s.ok ? `${s.count} in stock` : esc(s.error || "Couldn't check")}</small></div></li>`).join('');
}

function start() {
  const MODE = document.body.dataset.mode; // "sealed" or "deals"
  let data = null;

  function render() {
    if (!data) return;
    const opts = { q: $('#q').value.trim(), kind: $('#kind').value, sort: $('#sort')?.value, within: Number($('#within')?.value || 0), mode: MODE };
    const list = pick(data.offers, opts);
    $('#offers').innerHTML = list.length
      ? `<div class="card"><ul class="listings offers">${list.slice(0, SHOW).map(offerHtml).join('')}</ul></div>`
      : `<div class="card"><p class="note">${MODE === 'deals' ? 'No sealed product at or below the US price right now' : 'Nothing in stock matches that'}${opts.q || opts.kind ? ' with these filters' : ''}.</p></div>`;
    $('#more').hidden = list.length <= SHOW;
    $('#more').textContent = `Showing ${SHOW} of ${list.length}. Search to narrow it down.`;
    const priced = data.offers.filter(o => o.ref).length;
    const rate = data.fx.usdToThb ? ` $1 = ฿${data.fx.usdToThb.toFixed(2)}.` : ' No exchange rate right now, so no US comparison.';
    $('#status').textContent = MODE === 'deals'
      ? `${list.length} ${list.length === 1 ? 'deal' : 'deals'} out of ${data.offers.length} in stock (${priced} with a US price).${rate}`
      : `${list.length} of ${data.offers.length} sealed products in stock.${rate}`;
  }

  async function load() {
    try {
      const r = await fetch('/api/sealed');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
      data = d;
      $('#storeList').innerHTML = storesHtml(d.stores);
      render();
    } catch (e) {
      $('#status').textContent = `${e.message}. Try again in a minute.`;
      $('#status').classList.add('error');
    }
  }

  const p = new URLSearchParams(location.search);
  if (p.get('q')) $('#q').value = p.get('q');
  let t;
  $('#filters').addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 150); });
  $('#filters').addEventListener('change', render);
  load();
}

if (typeof document !== 'undefined' && document.querySelector('#filters')) start();
