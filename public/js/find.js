// Card finder page: type a card, see Bangkok store stock in baht, then online prices.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = (n) => (n == null ? '' : '฿' + Number(n).toLocaleString('en-US', { maximumFractionDigits: n % 1 ? 2 : 0 }));
const safeUrl = (u) => (/^https:\/\//.test(u || '') ? u : '#');

function setStatus(msg, isError = false) {
  $('#status').textContent = msg;
  $('#status').classList.toggle('error', isError);
}

let acTimer;
$('#card').addEventListener('input', (e) => {
  clearTimeout(acTimer);
  const q = e.target.value.trim();
  if (q.length < 3) return;
  acTimer = setTimeout(async () => {
    try {
      const r = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`);
      const { names } = await r.json();
      $('#suggest').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
    } catch { /* suggestions are optional */ }
  }, 250);
});

function storeHtml(s) {
  const tag = !s.ok ? '<span class="tag err">Couldn\'t check</span>'
    : s.inStock ? `<span class="tag in">In stock · from ${esc(baht(s.cheapest))}</span>`
      : '<span class="tag out">Not in stock</span>';
  const rows = s.listings.slice(0, 8).map(l => `
    <li class="${l.inStock ? '' : 'sold'}">
      <div><a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.name)}</a>
        <small>${esc([l.set, l.finish].filter(Boolean).join(' · '))}</small></div>
      <div class="price">${l.price != null ? esc(baht(l.price)) : '–'}
        <small>${l.inStock ? (l.qty ? `${esc(l.qty)} left` : 'in stock') : 'sold out'}</small></div>
    </li>`).join('');
  let note = '';
  if (!s.ok) note = `<p class="note">${esc(s.error)}. Tap the link to search the store yourself.</p>`;
  else if (!s.listings.length && s.outOfStockCount) note = `<p class="note">They list ${s.outOfStockCount} matching ${s.outOfStockCount === 1 ? 'copy' : 'copies'}, all sold out right now.</p>`;
  else if (!s.listings.length) note = '<p class="note">No listing for this card.</p>';
  return `<div class="card store">
    <div class="store-top"><h3>${esc(s.name)}</h3>${tag}</div>
    ${rows ? `<ul class="listings">${rows}</ul>` : ''}${note}
    <a class="note" href="${esc(safeUrl(s.searchUrl))}" target="_blank" rel="noopener">Open ${esc(s.site)} search</a>
  </div>`;
}

function onlineHtml(o, links) {
  const thb = (usd) => (o.usdToThb ? ` <small>≈ ${esc(baht(Math.round(usd * o.usdToThb)))}</small>` : '');
  const eurThb = (eur) => (o.usdToThb && o.eurToUsd ? thb(eur * o.eurToUsd) : '');
  const rows = [];
  if (o.usd) rows.push(`<li><div><a href="${esc(safeUrl(o.usd.url))}" target="_blank" rel="noopener">TCGplayer</a><small>${esc(o.usd.set)} · US</small></div>
    <div class="price">$${o.usd.price.toFixed(2)}${thb(o.usd.price)}</div></li>`);
  if (o.eur) rows.push(`<li><div><a href="${esc(safeUrl(o.eur.url))}" target="_blank" rel="noopener">Cardmarket</a><small>${esc(o.eur.set)} · Europe</small></div>
    <div class="price">€${o.eur.price.toFixed(2)}${eurThb(o.eur.price)}</div></li>`);
  rows.push(`<li><div><a href="${esc(safeUrl(links.hareruya))}" target="_blank" rel="noopener">Hareruya</a><small>Japan · ships to Thailand</small></div><div class="price"><small>search</small></div></li>`);
  rows.push(`<li><div><a href="${esc(safeUrl(links.cardkingdom))}" target="_blank" rel="noopener">Card Kingdom</a><small>US</small></div><div class="price"><small>search</small></div></li>`);
  return `<ul class="listings">${rows.join('')}</ul>${o.usdToThb ? `<p class="note">Baht at $1 = ฿${o.usdToThb.toFixed(2)}.</p>` : ''}`;
}

function render(d) {
  $('#cardHead').innerHTML = `${d.card.image ? `<img class="cardimg" src="${esc(d.card.image)}" alt="">` : ''}
    <div><h2>${esc(d.card.name)}</h2><p>${esc(d.card.type_line)}</p>
    <p><a href="${esc(safeUrl(d.card.scryfall_uri))}" target="_blank" rel="noopener">Scryfall</a></p></div>`;
  $('#stores').innerHTML = d.stores.map(storeHtml).join('');
  $('#onlineList').innerHTML = onlineHtml(d.online, d.links);
  $('#results').hidden = false;
}

async function find(name) {
  $('#go').disabled = true;
  setStatus(`Checking 6 Bangkok stores for ${name}…`);
  try {
    const r = await fetch(`/api/find?name=${encodeURIComponent(name)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    render(d);
    const n = d.stores.filter(s => s.inStock).length;
    setStatus(n ? `In stock at ${n} of ${d.stores.length} Bangkok stores.` : 'Not in stock in Bangkok right now. Online prices are below.');
    history.replaceState(null, '', `?card=${encodeURIComponent(d.card.name)}`);
    $('#cardHead').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    $('#go').disabled = false;
  }
}

$('#find').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#card').value.trim();
  if (name) find(name);
});

const start = new URLSearchParams(location.search).get('card');
if (start) { $('#card').value = start; find(start); }
