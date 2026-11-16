import {
  TYPE_ORDER, ROLE_ORDER, parseDecklist, slugFromInput, filtersFromInput, summarize, frontFace, lookup,
} from './classify.js';
import { BRACKETS, RULES_CHECKED, bracketById, bracketSignals } from './brackets.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cardCache = new Map();   // lowercase name -> card
const state = { avg: null, mine: null, commander: null, open: new Set(), cross: null, themes: null };

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

// Type/role summary plus bracket signals (Game Changers, extra turns, mass land denial).
function analyze(entries, commanderName) {
  const s = summarize(entries, cardCache, commanderName);
  s.signals = bracketSignals(entries, cardCache, lookup);
  Object.assign(s.lists, s.signals.lists);
  return s;
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
  // An EDHREC link such as .../commanders/dain-of-the-ancient-halls/upgraded sets the filters too.
  const linked = filtersFromInput(input);
  if (linked.bracket) $('#bracket').value = linked.bracket;
  if (linked.budget) $('#budget').value = linked.budget;
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
    state.avg = analyze(entries, data.commander.name || input);
    state.open.clear();
    state.cross = null;
    $('#cross').innerHTML = '';
    setStatus($('#crossStatus'), '');
    if (state.mineEntries) state.mine = analyze(state.mineEntries, data.commander.name || input);
    store.set('last', { input, bracket, budget });

    startThemes(data, linked.tag);
    render();
    setStatus(status, missing.length ? `Done. ${missing.length} card(s) not found on Scryfall: ${missing.slice(0, 5).join(', ')}` : '');
    $('#results').hidden = false;
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadThemes();
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
    state.mine = analyze(entries, state.commander?.commander?.name || '');
    render();
    if (state.cross) renderCross();
    if (state.themes) renderThemes();
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

// One list of metrics, shared by the main table and the cross-bracket table.
// get(summary) -> number. key = tap-to-list category. warn = flag big shortfalls.
function metrics(present = () => true, { curve = false } = {}) {
  const rows = [{ group: 'Card types' }];
  for (const t of TYPE_ORDER) {
    if ((t === 'Battle' || t === 'Other' || t === 'Planeswalker') && !present((s) => s.types[t])) continue;
    rows.push({ key: t, label: TYPE_LABELS[t], get: (s) => s.types[t], warn: t === 'Land' });
    if (t === 'Land') {
      rows.push({ sub: true, label: 'Basic', get: (s) => s.basics });
      rows.push({ sub: true, label: 'Non-basic', get: (s) => s.nonbasics });
      rows.push({ label: 'Non-land spells', get: (s) => s.spells });
    }
  }
  rows.push({ group: 'Roles (a card can count in more than one)' });
  for (const r of ROLE_ORDER) rows.push({ key: r, label: r, get: (s) => s.roles[r], warn: true });
  rows.push({ group: 'Bracket signals' });
  rows.push({ key: 'Game Changers', label: 'Game Changers', get: (s) => s.signals.counts.gameChangers });
  rows.push({ key: 'Extra turns', label: 'Extra turns', get: (s) => s.signals.counts.extraTurns });
  rows.push({ key: 'Mass land denial', label: 'Mass land denial', get: (s) => s.signals.counts.massLandDenial });
  rows.push({ label: 'Bracket floor', get: (s) => s.signals.floor.bracket });
  if (curve) {
    rows.push({ group: 'Mana curve (non-land cards)' });
    for (let i = 0; i < 8; i++) rows.push({ label: `Mana value ${i === 7 ? '7+' : i}`, get: (s) => s.curve[i] });
  }
  rows.push({ group: 'Totals' });
  rows.push({ label: 'Average mana value', get: (s) => Number(s.avgCmc.toFixed(2)) });
  rows.push({ label: 'Cards (excluding commander)', get: (s) => s.total });
  return rows;
}

function rowsSpec() {
  const a = state.avg, m = state.mine;
  return metrics((get) => get(a) || (m && get(m))).map(r => r.group ? r : {
    ...r, avg: r.get(a), mine: m ? r.get(m) : undefined,
  });
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

  renderBracketNote();
  renderFacts();
  renderCurve();
}

// Facts strip under the hero, and the sticky bar on phones.
function renderFacts() {
  const { commander: data, avg } = state;
  const b = bracketById(data.bracket);
  const facts = [
    [data.commander.num_decks ? Number(data.commander.num_decks).toLocaleString() : '?', 'decks averaged'],
    [fmt(avg.types.Land), 'lands'],
    [fmt(avg.spells), 'non-land spells'],
    [avg.avgCmc.toFixed(2), 'average mana value'],
  ];
  $('#facts').innerHTML = `<div class="wrap">${facts.map(([v, l]) => `<div><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`;
  $('#mbarTitle').textContent = data.commander.name || data.slug;
  $('#mbarSub').textContent = `${b ? `Bracket ${b.number} · ${b.name}` : 'All brackets'} · cards allow ${avg.signals.floor.bracket}+`;
  $('#mbar').hidden = false;
}

function floorText(who, sig) {
  const f = sig.floor;
  if (!f.reasons.length) return `${who}: nothing in the card list rules out Bracket 1.`;
  return `${who}: Bracket ${f.bracket} or higher, because of ${f.reasons.filter(r => r.bracket === f.bracket).map(r => r.why).join(' and ')}.`;
}

// What the selected bracket means, and where the card limits put each deck.
function renderBracketNote() {
  const { commander: data, avg, mine } = state;
  const b = bracketById(data.bracket);
  const lines = [];
  if (b) {
    const gc = b.limits.gameChangers === Infinity ? 'any number of Game Changers' : b.limits.gameChangers ? `up to ${b.limits.gameChangers} Game Changers` : 'no Game Changers';
    lines.push(`<p><strong>Bracket ${b.number} · ${esc(b.name)}.</strong> ${esc(b.summary)} ${b.minTurns ? `Expect at least ${b.minTurns} turns before anyone wins or loses.` : ''} Card limit: ${gc}.</p>`);
  }
  lines.push(`<p>${esc(floorText('Average deck', avg.signals))}</p>`);
  if (mine) lines.push(`<p>${esc(floorText('Your deck', mine.signals))}</p>`);
  lines.push('<p class="note">This is a floor from the card list only. It can\'t see two-card combos or how fast a deck really is, and the brackets also depend on intent, so a deck can belong higher.</p>');
  $('#bracketNote').innerHTML = lines.join('');
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
  legend.innerHTML = `<i style="background:var(--brand-2)"></i>Average${mine ? '<i style="background:var(--accent)"></i>Yours' : ''}`;
}

// ---------- across brackets ----------

$('#crossGo').addEventListener('click', async () => {
  const data = state.commander;
  const status = $('#crossStatus');
  if (!data) return;
  $('#crossGo').disabled = true;
  setStatus(status, 'Getting all five bracket averages from EDHREC…');
  try {
    const results = await Promise.allSettled(BRACKETS.map(b => {
      const params = new URLSearchParams({ slug: data.slug, bracket: b.id });
      if (data.budget) params.set('budget', data.budget);
      return api(`/api/edhrec?${params}`);
    }));
    const decks = results.map(r => (r.status === 'fulfilled' ? r.value : null));
    if (!decks.some(Boolean)) throw new Error(results[0].reason?.message || 'EDHREC has no bracket averages for this commander.');
    const entries = decks.map(d => (d ? parseDecklist(d.deck.join('\n')) : null));
    const names = entries.flatMap(e => (e ? e.map(x => x.name) : []));
    setStatus(status, `Looking up ${new Set(names).size} cards on Scryfall…`);
    await loadCards(names);
    state.cross = BRACKETS.map((b, i) => ({
      bracket: b,
      data: decks[i],
      summary: decks[i] ? analyze(entries[i], decks[i].commander.name || data.commander.name) : null,
    }));
    renderCross();
    const missing = BRACKETS.filter((b, i) => !decks[i]).map(b => b.name);
    setStatus(status, missing.length ? `EDHREC has no average deck for: ${missing.join(', ')}.` : '');
  } catch (err) {
    setStatus(status, err.message, true);
  } finally {
    $('#crossGo').disabled = false;
  }
});

// Rows whose average moves most between the lowest and highest bracket with data.
function biggestShifts(cols) {
  if (cols.length < 2) return '';
  const lo = cols[0], hi = cols[cols.length - 1];
  const out = [];
  for (const r of metrics()) {
    if (r.group || r.sub || r.label.startsWith('Bracket floor') || r.label.startsWith('Cards')) continue;
    const a = r.get(lo.summary), b = r.get(hi.summary);
    const big = r.label === 'Average mana value' ? Math.abs(b - a) >= 0.25 : Math.abs(b - a) >= 2;
    if (big) out.push({ label: r.label, a, b, d: Math.abs(b - a) / (r.label === 'Average mana value' ? 0.1 : 1) });
  }
  if (!out.length) return '';
  const items = out.sort((x, y) => y.d - x.d).slice(0, 6)
    .map(x => `<li>${esc(x.label)}: ${fmt(x.a)} → ${fmt(x.b)}</li>`).join('');
  return `<p class="note">Biggest shifts from Bracket ${lo.bracket.number} to ${hi.bracket.number}:</p><ul class="shifts">${items}</ul>`;
}

function renderCross() {
  const cols = state.cross.filter(c => c.summary);
  const mine = state.mine;
  const all = cols.map(c => c.summary).concat(mine ? [mine] : []);
  const sel = state.commander.bracket;
  const head = cols.map(c => `<th class="n${c.bracket.id === sel ? ' sel' : ''}" title="${esc(c.bracket.name)}">${c.bracket.number}<small>${esc(c.bracket.name)}</small></th>`).join('')
    + (mine ? '<th class="n">You</th>' : '');
  const rows = [`<tr><td>Decks on EDHREC</td>${cols.map(c => `<td class="n">${c.data.commander.num_decks ? Number(c.data.commander.num_decks).toLocaleString() : '?'}</td>`).join('')}${mine ? '<td class="n"></td>' : ''}</tr>`];
  for (const r of metrics((get) => all.some(s => get(s)))) {
    if (r.group) { rows.push(`<tr class="group"><td colspan="${cols.length + 1 + (mine ? 1 : 0)}">${esc(r.group)}</td></tr>`); continue; }
    rows.push(`<tr class="${r.sub ? 'sub' : ''}"><td>${esc(r.label)}</td>${cols.map(c => `<td class="n${c.bracket.id === sel ? ' sel' : ''}">${fmt(r.get(c.summary))}</td>`).join('')}${mine ? `<td class="n mine-col">${fmt(r.get(mine))}</td>` : ''}</tr>`);
  }
  $('#cross').innerHTML = `<div class="scroll"><table class="cross"><thead><tr><th>Category</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>${biggestShifts(cols)}`;
}

// ---------- by theme ----------

const THEME_DEFAULT = 4;     // themes picked for you on a new search
const THEME_MAX = 6;         // most columns at once, so the table stays readable on a phone
const SMALL_SAMPLE = 10;     // fewer decks than this and an average is rough

// New search: list EDHREC's popular themes and pick the biggest few (plus one named in a pasted link).
function startThemes(data, linkedTag) {
  const list = (data.themes || []).slice(0, 12);
  if (linkedTag && !list.some(t => t.slug === linkedTag)) list.unshift({ slug: linkedTag, name: linkedTag.replace(/-/g, ' '), count: null });
  const picked = list.filter(t => t.count == null || t.count >= 3).slice(0, THEME_DEFAULT).map(t => t.slug);
  if (linkedTag && !picked.includes(linkedTag)) picked.splice(THEME_DEFAULT - 1, 1, linkedTag);
  state.themes = { run: (state.themes?.run || 0) + 1, list, selected: new Set(picked), loaded: new Map(), failed: new Map() };
  $('#themeTable').innerHTML = '';
  $('#themeNotes').innerHTML = '';
  setStatus($('#themeStatus'), list.length ? '' : 'EDHREC lists no themes for this commander at these filters.');
  renderChips();
}

function renderChips() {
  const t = state.themes;
  $('#themeChips').innerHTML = t.list.map(x => `<button type="button" class="chip" data-tag="${esc(x.slug)}" aria-pressed="${t.selected.has(x.slug)}">${esc(x.name)}${x.count != null ? `<small>${x.count}</small>` : ''}</button>`).join('');
}

$('#themeChips').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  const t = state.themes;
  if (!btn || !t) return;
  const tag = btn.dataset.tag;
  if (t.selected.has(tag)) t.selected.delete(tag);
  else if (t.selected.size >= THEME_MAX) return setStatus($('#themeStatus'), `Up to ${THEME_MAX} themes at once. Tap one to remove it first.`, true);
  else t.selected.add(tag);
  renderChips();
  loadThemes();
});

// Fetch the picked themes we don't have yet, then redraw.
async function loadThemes() {
  const t = state.themes, data = state.commander;
  if (!t || !data) return;
  const run = t.run;
  const todo = [...t.selected].filter(tag => !t.loaded.has(tag) && !t.failed.has(tag));
  const status = $('#themeStatus');
  if (todo.length) {
    setStatus(status, `Getting ${todo.length} theme average${todo.length > 1 ? 's' : ''} from EDHREC…`);
    const results = await Promise.allSettled(todo.map(tag => {
      const params = new URLSearchParams({ slug: data.slug, tag });
      if (data.bracket) params.set('bracket', data.bracket);
      if (data.budget) params.set('budget', data.budget);
      return api(`/api/edhrec?${params}`);
    }));
    if (run !== t.run) return;           // a newer search started meanwhile
    const got = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') got.push([todo[i], r.value, parseDecklist(r.value.deck.join('\n'))]);
      else t.failed.set(todo[i], r.reason?.message || 'failed');
    });
    try {
      await loadCards(got.flatMap(([, , e]) => e.map(x => x.name)));
    } catch (err) {
      return setStatus(status, err.message, true);
    }
    if (run !== t.run) return;
    for (const [tag, d, entries] of got) {
      t.loaded.set(tag, { data: d, entries, summary: analyze(entries, d.commander.name || data.commander.name) });
    }
  }
  const failed = [...t.selected].filter(tag => t.failed.has(tag)).map(tag => themeName(tag));
  setStatus(status, failed.length ? `EDHREC has no average deck for: ${failed.join(', ')}.` : '', !!failed.length);
  renderThemes();
}

const themeName = (tag) => state.themes.list.find(x => x.slug === tag)?.name || tag;

// Names in a deck, without basics or the commander, for overlap counts.
function nameSet(entries) {
  const out = new Set();
  const cmdr = frontFace(state.commander?.commander?.name || '').toLowerCase();
  for (const { name } of entries) {
    const c = lookup(cardCache, name);
    if (c && /\bBasic\b/.test(c.type_line)) continue;
    if (frontFace(name).toLowerCase() === cmdr) continue;
    out.add(frontFace(c ? c.name : name).toLowerCase());
  }
  return out;
}

function nameList(names, limit = 14) {
  const all = [...names].map(n => lookup(cardCache, n)?.name || n).sort((a, b) => a.localeCompare(b));
  if (!all.length) return '<p class="note">None.</p>';
  const more = all.length > limit ? `<li class="muted">and ${all.length - limit} more</li>` : '';
  return `<ul>${all.slice(0, limit).map(n => `<li>${esc(n)}</li>`).join('')}${more}</ul>`;
}

// The rows where a theme's average moves most from the overall average.
function standouts(theme, all) {
  const out = [];
  for (const r of metrics()) {
    if (r.group || r.sub || r.label.startsWith('Bracket floor') || r.label.startsWith('Cards')) continue;
    const a = r.get(all), b = r.get(theme);
    const mv = r.label === 'Average mana value';
    if (mv ? Math.abs(b - a) >= 0.15 : Math.abs(b - a) >= 2) out.push({ label: r.label, a, b, d: Math.abs(b - a) / (mv ? 0.1 : 1) });
  }
  return out.sort((x, y) => y.d - x.d).slice(0, 5);
}

function renderThemes() {
  const t = state.themes, mine = state.mine, avg = state.avg;
  const cols = [...t.selected].filter(tag => t.loaded.has(tag)).map(tag => ({ tag, name: themeName(tag), ...t.loaded.get(tag) }))
    .sort((a, b) => (b.data.commander.num_decks || 0) - (a.data.commander.num_decks || 0));
  if (!cols.length) { $('#themeTable').innerHTML = ''; $('#themeNotes').innerHTML = ''; return; }

  const decks = (d) => d.commander.num_decks;
  const small = cols.some(c => decks(c.data) && decks(c.data) < SMALL_SAMPLE);
  const all = [avg, ...cols.map(c => c.summary)].concat(mine ? [mine] : []);
  const width = cols.length + 2 + (mine ? 1 : 0);
  const head = `<th class="n all">All</th>` + cols.map(c => `<th class="n">${esc(c.name)}${decks(c.data) && decks(c.data) < SMALL_SAMPLE ? '*' : ''}</th>`).join('') + (mine ? '<th class="n">You</th>' : '');
  const num = (d) => (d ? Number(d).toLocaleString() : '?');
  const rows = [`<tr><td>Decks on EDHREC</td><td class="n all">${num(state.commander.commander.num_decks)}</td>${cols.map(c => `<td class="n">${num(decks(c.data))}</td>`).join('')}${mine ? '<td class="n"></td>' : ''}</tr>`];
  for (const r of metrics((get) => all.some(s => get(s)), { curve: true })) {
    if (r.group) { rows.push(`<tr class="group"><td colspan="${width}">${esc(r.group)}</td></tr>`); continue; }
    rows.push(`<tr class="${r.sub ? 'sub' : ''}"><td>${esc(r.label)}</td><td class="n all">${fmt(r.get(avg))}</td>${cols.map(c => `<td class="n">${fmt(r.get(c.summary))}</td>`).join('')}${mine ? `<td class="n mine-col">${fmt(r.get(mine))}</td>` : ''}</tr>`);
  }
  $('#themeTable').innerHTML = `<div class="scroll"><table class="cross themes"><thead><tr><th>Category</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    + (small ? `<p class="note">* Fewer than ${SMALL_SAMPLE} decks, so treat that average as rough.</p>` : '');

  // Per theme: what moves, which cards it adds and drops, and (with your list) what you're missing.
  const base = nameSet(parseDecklist(state.commander.deck.join('\n')));
  const mineSet = state.mineEntries && mine ? nameSet(state.mineEntries) : null;
  const notes = [];
  if (mineSet) {
    const overlap = cols.map(c => ({ name: c.name, n: [...nameSet(c.entries)].filter(x => mineSet.has(x)).length }))
      .concat([{ name: 'the overall average', n: [...base].filter(x => mineSet.has(x)).length }])
      .sort((a, b) => b.n - a.n);
    notes.push(`<p class="closest"><strong>Closest to your deck: ${esc(overlap[0].name)}</strong>, with ${overlap[0].n} cards in common (not counting basics). ${overlap.slice(1).map(o => `${esc(o.name)} ${o.n}`).join(' · ')}.</p>`);
  }
  for (const c of cols) {
    const set = nameSet(c.entries);
    const adds = [...set].filter(x => !base.has(x));
    const drops = [...base].filter(x => !set.has(x));
    const st = standouts(c.summary, avg);
    const shifts = st.length ? `<ul class="shifts">${st.map(x => `<li>${esc(x.label)}: ${fmt(x.a)} → ${fmt(x.b)}</li>`).join('')}</ul>` : '<p class="note">No row moves by 2 or more cards from the overall average.</p>';
    const missing = mineSet ? `<h4>In the ${esc(c.name)} average, not in your deck</h4>${nameList([...set].filter(x => !mineSet.has(x)))}` : '';
    notes.push(`<details class="theme"><summary>${esc(c.name)} <small>· ${num(decks(c.data))} decks · <a href="${esc(c.data.edhrec_url)}" target="_blank" rel="noopener">EDHREC</a></small></summary>
      <h4>Biggest changes from the overall average</h4>${shifts}
      <h4>Cards it adds</h4>${nameList(adds)}
      <h4>Cards it drops</h4>${nameList(drops)}
      ${missing}</details>`);
  }
  $('#themeNotes').innerHTML = notes.join('');
}

$('#table').addEventListener('click', (e) => {
  const row = e.target.closest('tr.cat');
  if (!row) return;
  const k = row.dataset.key;
  state.open.has(k) ? state.open.delete(k) : state.open.add(k);
  render();
});

$('#bracketGuide').innerHTML = BRACKETS.map(b => {
  const l = b.limits;
  const gc = l.gameChangers === Infinity ? 'Any' : l.gameChangers ? `Up to ${l.gameChangers}` : 'None';
  const word = { none: 'None', few: 'A few, never chained', late: 'None early', any: 'Allowed' };
  return `<li><strong>${b.number} · ${esc(b.name)}</strong> ${b.minTurns ? `(${b.minTurns}+ turns)` : '(any turn)'}<br>${esc(b.summary)}
    <br><span class="muted">Game Changers: ${gc} · Extra turns: ${word[l.extraTurns]} · Mass land denial: ${word[l.massLandDenial]} · 2-card combos: ${word[l.twoCardCombos]}</span></li>`;
}).join('');
$('#rulesChecked').textContent = RULES_CHECKED;

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
