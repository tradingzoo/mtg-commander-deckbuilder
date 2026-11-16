import {
  TYPE_ORDER, ROLE_ORDER, parseDecklist, slugFromInput, summarize, frontFace,
} from './classify.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cardCache = new Map();   // lowercase name -> card
const state = { avg: null, mine: null, commander: null, open: new Set() };

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function setStatus(el, msg, isError = false) {
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

async function api(path, init) {
  const r = await fetch(path, init);
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
  return body;
}

// Fetch only the cards we haven't seen yet.
async function loadCards(names) {
  const missing = [...new Set(names.map(frontFace))].filter(n => !cardCache.has(n.toLowerCase()));
  const notFound = [];
  for (let i = 0; i < missing.length; i += 250) {
    const { cards, not_found } = await api('/api/cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: missing.slice(i, i + 250) }),
    });
    for (const c of cards) {
      for (const k of [c.name, frontFace(c.name), c.requested]) if (k) cardCache.set(k.toLowerCase(), c);
    }
    notFound.push(...not_found);
  }
  return notFound;
}

// ---------- search ----------

let acTimer;
$('#commander').addEventListener('input', (e) => {
  clearTimeout(acTimer);
  const q = e.target.value.trim();
  if (q.length < 2 || /edhrec\.com/i.test(q)) return;
  acTimer = setTimeout(async () => {
    try {
      const { names } = await api(`/api/autocomplete?q=${encodeURIComponent(q)}`);
      $('#suggest').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
    } catch { /* suggestions are optional */ }
  }, 250);
});

$('#search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#commander').value;
  const slug = slugFromInput(input);
  const bracket = $('#bracket').value;
  const budget = $('#budget').value;
  const status = $('#status');
  if (!slug) return setStatus(status, 'Enter a commander name.', true);

  $('#go').disabled = true;
  setStatus(status, 'Getting the average deck from EDHREC…');
  try {
    const params = new URLSearchParams({ slug });
    if (bracket) params.set('bracket', bracket);
    if (budget) params.set('budget', budget);
    const data = await api(`/api/edhrec?${params}`);

    const entries = parseDecklist(data.deck.join('\n'));
    setStatus(status, `Looking up ${entries.length} cards on Scryfall…`);
    const missing = await loadCards(entries.map(x => x.name));

    state.commander = data;
    state.avg = summarize(entries, cardCache, data.commander.name || input);
    state.open.clear();
    if (state.mineEntries) state.mine = summarize(state.mineEntries, cardCache, data.commander.name || input);
    store.set('last', { input, bracket, budget });

    render();
    setStatus(status, missing.length ? `Done. ${missing.length} card(s) not found on Scryfall: ${missing.slice(0, 5).join(', ')}` : '');
    $('#results').hidden = false;
    $('#cmdr').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(status, err.message, true);
  } finally {
    $('#go').disabled = false;
  }
});

$('#compare').addEventListener('click', async () => {
  const status = $('#compareStatus');
  const entries = parseDecklist($('#mydeck').value);
  if (!entries.length) return setStatus(status, 'Paste a decklist first.', true);
  $('#compare').disabled = true;
  setStatus(status, `Looking up ${entries.length} cards…`);
  try {
    const missing = await loadCards(entries.map(x => x.name));
    state.mineEntries = entries;
    state.mine = summarize(entries, cardCache, state.commander?.commander?.name || '');
    render();
    setStatus(status, `Compared ${state.mine.total} cards.` + (missing.length ? ` Not found: ${missing.slice(0, 5).join(', ')}` : ''));
    $('#table').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    setStatus(status, err.message, true);
  } finally {
    $('#compare').disabled = false;
  }
});

// ---------- render ----------

const TYPE_LABELS = {
  Land: 'Lands', Creature: 'Creatures', Instant: 'Instants', Sorcery: 'Sorceries', Artifact: 'Artifacts',
  Enchantment: 'Enchantments', Planeswalker: 'Planeswalkers', Battle: 'Battles', Other: 'Unknown / other',
};

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function diffCell(avg, mine, warnWhenShort) {
  if (mine == null) return '<td class="n mine"></td>';
  const d = mine - avg;
  const txt = d === 0 ? '0' : (d > 0 ? '+' : '') + fmt(d);
  let cls = '';
  if (!warnWhenShort) return `<td class="n mine">${txt}</td>`;
  if (d > 0) cls = 'diff-pos';
  if (d < 0) cls = warnWhenShort && d <= -3 ? 'diff-bad' : 'diff-neg';
  return `<td class="n mine ${cls}">${txt}</td>`;
}

function rowsSpec() {
  const a = state.avg, m = state.mine;
  const rows = [{ group: 'Card types' }];
  for (const t of TYPE_ORDER) {
    if ((t === 'Battle' || t === 'Other' || t === 'Planeswalker') && !a.types[t] && !(m && m.types[t])) continue;
    rows.push({ key: t, label: TYPE_LABELS[t], avg: a.types[t], mine: m?.types[t], warn: t === 'Land' });
    if (t === 'Land') {
      rows.push({ sub: true, label: 'Basic', avg: a.basics, mine: m?.basics });
      rows.push({ sub: true, label: 'Non-basic', avg: a.nonbasics, mine: m?.nonbasics });
    }
  }
  rows.push({ group: 'Roles (a card can count in more than one)' });
  for (const r of ROLE_ORDER) rows.push({ key: r, label: r, avg: a.roles[r], mine: m?.roles[r], warn: true });
  rows.push({ group: 'Totals' });
  rows.push({ label: 'Average mana value', avg: Number(a.avgCmc.toFixed(2)), mine: m ? Number(m.avgCmc.toFixed(2)) : undefined });
  rows.push({ label: 'Cards (excluding commander)', avg: a.total, mine: m?.total });
  return rows;
}

function cardList(title, list) {
  if (!list || !list.length) return '';
  const items = [...list].sort((x, y) => x.name.localeCompare(y.name))
    .map(c => `<li>${c.qty > 1 ? c.qty + '× ' : ''}${esc(c.name)}</li>`).join('');
  return `<h4>${esc(title)}</h4><ul>${items}</ul>`;
}

function render() {
  const { commander: data, avg, mine } = state;
  const c = data.commander;
  const pips = (c.color_identity.length ? c.color_identity : ['C']).map(x => `<span class="pip ${esc(x)}">${esc(x)}</span>`).join('');
  const filters = [data.bracket, data.budget].filter(Boolean).join(' · ');
  $('#cmdr').innerHTML = `
    ${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : ''}
    <div>
      <h2>${esc(c.name || data.slug)}</h2>
      <p><span class="pips">${pips}</span> ${c.num_decks ? `· ${Number(c.num_decks).toLocaleString()} decks on EDHREC` : ''}</p>
      <p>${filters ? 'Filter: ' + esc(filters) + ' · ' : ''}<a href="${esc(data.edhrec_url)}" target="_blank" rel="noopener">Open on EDHREC</a></p>
    </div>`;

  $('#table').classList.toggle('hide-mine', !mine);
  const html = [];
  for (const r of rowsSpec()) {
    if (r.group) { html.push(`<tr class="group"><td colspan="4">${esc(r.group)}</td></tr>`); continue; }
    const cls = r.sub ? 'sub' : r.key ? 'cat' : '';
    html.push(`<tr class="${cls}" ${r.key ? `data-key="${esc(r.key)}"` : ''}>
      <td>${esc(r.label)}${r.key ? ' ›' : ''}</td><td class="n">${fmt(r.avg)}</td>
      <td class="n mine">${r.mine == null ? '' : fmt(r.mine)}</td>${diffCell(r.avg, r.mine, r.warn)}</tr>`);
    if (r.key && state.open.has(r.key)) {
      const body = cardList('Average deck', avg.lists[r.key]) + (mine ? cardList('Your deck', mine.lists[r.key]) : '');
      html.push(`<tr class="cards"><td colspan="4">${body || '<em>No cards</em>'}</td></tr>`);
    }
  }
  $('#table tbody').innerHTML = html.join('');

  const s = data.edhrec_stats;
  $('#edhrecNote').textContent = s
    ? `EDHREC's own type averages: ${s.land ?? '?'} lands (${s.basic ?? '?'} basic), ${s.creature ?? '?'} creatures, ${s.instant ?? '?'} instants, ${s.sorcery ?? '?'} sorceries, ${s.artifact ?? '?'} artifacts, ${s.enchantment ?? '?'} enchantments.`
    : '';

  renderCurve();
}

function renderCurve() {
  const { avg, mine } = state;
  const max = Math.max(1, ...avg.curve, ...(mine ? mine.curve : []));
  const bars = avg.curve.map((v, i) => {
    const h = (x) => Math.round((x / max) * 100);
    return `<div class="bar" title="Mana value ${i === 7 ? '7+' : i}: average ${v}${mine ? ', yours ' + mine.curve[i] : ''}">
      <div class="cols"><div class="b" style="height:${h(v)}%"></div>${mine ? `<div class="b mine" style="height:${h(mine.curve[i])}%"></div>` : ''}</div>
      <span>${v}${mine ? ' / ' + mine.curve[i] : ''}</span><span>${i === 7 ? '7+' : i}</span></div>`;
  }).join('');
  $('#curve').innerHTML = bars;
  let legend = document.querySelector('.legend');
  if (!legend) { legend = document.createElement('p'); legend.className = 'legend'; $('#curve').after(legend); }
  legend.innerHTML = `<i style="background:var(--accent)"></i>Average${mine ? '<i style="background:#d9a441"></i>Yours' : ''}`;
}

$('#table').addEventListener('click', (e) => {
  const row = e.target.closest('tr.cat');
  if (!row) return;
  const k = row.dataset.key;
  state.open.has(k) ? state.open.delete(k) : state.open.add(k);
  render();
});

// ---------- start ----------

const last = store.get('last');
if (last) {
  $('#commander').value = last.input || '';
  $('#bracket').value = last.bracket || '';
  $('#budget').value = last.budget || '';
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
