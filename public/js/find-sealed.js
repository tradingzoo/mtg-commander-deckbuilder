// Sealed and Deals pages of the card finder. Sealed: one request for the whole catalogue, then filter here.
// Singles (Deals page only): the server checks a few cards per request, so we fetch batches and add deals as they arrive.
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

// Every word typed must appear in the title, store, set, type or printing.
export function matches(o, q) {
  const hay = `${o.title} ${o.store} ${o.set || ''} ${o.kindLabel || ''} ${o.detail || ''}`.toLowerCase();
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
  const single = !o.kindLabel;
  const ref = o.ref
    ? `<small>US price: ${o.ref.source === 'msrp' ? 'MSRP' : 'TCGplayer market'} <a href="${esc(safeUrl(o.ref.url))}" target="_blank" rel="noopener">$${o.ref.usd.toFixed(2)}</a>${o.ref.thb ? ` ≈ ${esc(baht(o.ref.thb))}` : ''}${single ? ` · ${esc(o.ref.name)}` : ''}</small>`
    : '<small>No US price found</small>';
  const left = o.qty ? `<small>${esc(o.qty)} left</small>` : '';
  return `<li>
    <div><a href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener">${esc(o.title)}</a>
      <small>${esc(o.store)}${o.area && o.area !== 'Bangkok' ? ` · ${esc(o.area)}` : ''} · ${esc(single ? (o.detail || 'Single') : o.kindLabel)}</small>
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
  let data = null;      // sealed catalogue
  let singles = null;   // { offers, done, batches, per, total, fx }
  const what = () => (MODE === 'deals' && document.querySelector('input[name="what"]:checked')?.value) || 'sealed';
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  let lookup = null;    // one card the person typed: { card, offers, fx } or { loading } or { error }

  // Any card: every in-stock copy, cheapest compared with its US price first, above or below.
  function renderLookup() {
    if (lookup.loading) { $('#offers').innerHTML = ''; $('#status').textContent = `Checking ${lookup.loading} at 7 stores…`; return; }
    if (lookup.error) { $('#offers').innerHTML = ''; $('#status').textContent = lookup.error; $('#status').classList.add('error'); return; }
    const list = pick(lookup.offers, { sort: 'discount' });
    const below = list.filter(o => o.discountPct != null && o.discountPct >= 0).length;
    const above = list.filter(o => o.discountPct != null && o.discountPct < 0).length;
    $('#offers').innerHTML = list.length
      ? `<div class="card"><ul class="listings offers">${list.map(offerHtml).join('')}</ul></div>`
      : '<div class="card"><p class="note">Not in stock at any Thai store right now.</p></div>';
    $('#more').hidden = true;
    const rate = lookup.fx?.usdToThb ? ` $1 = ฿${lookup.fx.usdToThb.toFixed(2)}.` : '';
    $('#status').textContent = `${lookup.card}: ${plural(list.length, 'copy', 'copies')} in stock, ${below} at or below the US price, ${above} above${list.length - below - above ? `, ${list.length - below - above} with no clear US printing` : ''}.${rate} Clear the search to go back to the top 100.`;
  }

  async function checkCard(name) {
    lookup = { loading: name };
    $('#status').classList.remove('error');
    render();
    try {
      const r = await fetch(`/api/singles?name=${encodeURIComponent(name)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
      lookup = d;
      $('#q').value = d.card;
    } catch (e) {
      lookup = { error: e.message };
    }
    if (what() === 'singles') render();
  }

  function render() {
    const isSingles = what() === 'singles';
    if ($('#kindBox')) $('#kindBox').hidden = isSingles;
    if ($('#storeInfo')) $('#storeInfo').hidden = isSingles;
    if ($('#checkCard')) $('#checkCard').hidden = !isSingles;
    if (MODE === 'deals') $('#q').placeholder = isSingles ? 'Any card, e.g. Rhystic Study' : 'Commander deck';
    if (isSingles && lookup) return renderLookup();
    const src = isSingles ? singles : data;
    if (!src) { $('#offers').innerHTML = ''; return; }
    const opts = { q: $('#q').value.trim(), kind: isSingles ? '' : $('#kind').value, sort: $('#sort')?.value, within: Number($('#within')?.value || 0), mode: MODE };
    const list = pick(src.offers, opts);
    const loading = isSingles && singles.done < singles.batches;
    $('#offers').innerHTML = list.length
      ? `<div class="card"><ul class="listings offers">${list.slice(0, SHOW).map(offerHtml).join('')}</ul></div>`
      : loading ? '' : `<div class="card"><p class="note">${MODE === 'deals' ? `No ${isSingles ? 'singles' : 'sealed product'} at or below the US price right now` : 'Nothing in stock matches that'}${opts.q || opts.kind ? ' with these filters' : ''}.</p></div>`;
    $('#more').hidden = list.length <= SHOW;
    $('#more').textContent = `Showing ${SHOW} of ${list.length}. Search to narrow it down.`;
    const priced = src.offers.filter(o => o.ref).length;
    const rate = src.fx?.usdToThb ? ` $1 = ฿${src.fx.usdToThb.toFixed(2)}.` : ' No exchange rate right now, so no US comparison.';
    if (isSingles) {
      const cards = Math.min(singles.done * singles.per, singles.total || 0);
      const found = opts.within >= 1000 ? plural(list.length, 'copy', 'copies') + ' with a US price' : plural(list.length, 'deal', 'deals');
      $('#status').textContent = loading
        ? `Checking the top ${singles.total || 100} Commander cards at 7 stores… ${cards} done, ${found} so far. Or type any card and tap Check.`
        : `${found} among ${src.offers.length} in-stock copies of the top ${singles.total} Commander cards.${rate} Type any card and tap Check for the rest.`;
    } else {
      $('#status').textContent = MODE === 'deals'
        ? `${plural(list.length, 'deal', 'deals')} out of ${src.offers.length} in stock (${priced} with a US price).${rate}`
        : `${list.length} of ${src.offers.length} sealed products in stock.${rate}`;
    }
  }

  async function load() {
    try {
      const r = await fetch('/api/sealed');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
      data = d;
      $('#storeList').innerHTML = storesHtml(d.stores);
      if (what() === 'sealed') render();
    } catch (e) {
      if (what() !== 'sealed') return;
      $('#status').textContent = `${e.message}. Try again in a minute.`;
      $('#status').classList.add('error');
    }
  }

  async function getBatch(n) {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      try {
        const r = await fetch(`/api/singles?batch=${n}`);
        if (r.ok) return await r.json();
      } catch { /* try once more */ }
    }
    return null;
  }

  // Two batches at a time; each one is cached on the server, so a second visit fills in fast.
  async function loadSingles() {
    if (singles) return render();
    singles = { offers: [], done: 0, batches: 1, per: 5, total: 0, fx: null };
    $('#status').textContent = 'Checking the top Commander cards at 7 stores…';
    render();
    const first = await getBatch(0);
    if (!first) {
      singles = null;
      $('#status').textContent = 'Could not check singles right now. Try again in a minute.';
      $('#status').classList.add('error');
      return;
    }
    Object.assign(singles, { batches: first.batches, per: first.cards.length, total: first.total, fx: first.fx, done: 1 });
    singles.offers.push(...first.offers);
    render();
    let next = 1;
    await Promise.all([0, 1].map(async () => {
      while (next < singles.batches) {
        const b = await getBatch(next++);
        singles.done++;
        if (b) singles.offers.push(...b.offers);
        if (what() === 'singles') render();
      }
    }));
    if (what() === 'singles') render();
  }

  const p = new URLSearchParams(location.search);
  if (p.get('q')) $('#q').value = p.get('q');
  const singlesRadio = document.querySelector('input[name="what"][value="singles"]');
  if (p.get('what') === 'singles' && singlesRadio) singlesRadio.checked = true;
  let t;
  $('#filters').addEventListener('input', (e) => {
    // Editing the search after checking a card goes back to the top-100 list, filtered by what's typed.
    if (e.target.id === 'q' && lookup && !lookup.loading && e.target.value.trim() !== lookup.card) { lookup = null; $('#status').classList.remove('error'); }
    clearTimeout(t); t = setTimeout(render, 150);
  });
  $('#filters').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#q').value.trim();
    if (what() === 'singles' && name.length >= 2) checkCard(name);
  });
  // Singles show every copy, above or below the US price, unless the person picks otherwise.
  let pickedShow = false;
  const singlesDefault = () => { if (!pickedShow && $('#within')) $('#within').value = '1000'; };
  $('#filters').addEventListener('change', (e) => {
    $('#status').classList.remove('error');
    if (e.target.id === 'within') pickedShow = true;
    if (e.target.name === 'what') {
      history.replaceState(null, '', e.target.value === 'singles' ? '?what=singles' : location.pathname);
      if (e.target.value === 'singles') { singlesDefault(); return loadSingles(); }
    }
    render();
  });
  load();
  if (what() === 'singles') { singlesDefault(); loadSingles(); }
  if (what() === 'singles' && p.get('card')) checkCard(p.get('card'));
}

if (typeof document !== 'undefined' && document.querySelector('#filters')) start();
