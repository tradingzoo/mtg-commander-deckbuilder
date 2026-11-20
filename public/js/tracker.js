// Commander game tracker page: setup, the table, the per-player sheet, end of game and the game log.
// Rules live in tracker-core.js. Everything is saved in localStorage after each change.
import {
  newGame, sources, changeLife, changePoison, changeCmd, changeCasts, setConceded, nextTurn,
  finishGame, stats, tax, maxCmd, aliveCount, parseBackup, mergeGames, clock, HOW_WON, POISON_LETHAL, CMD_LETHAL,
} from './tracker-core.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = { game: 'cgt.current', games: 'cgt.games', setup: 'cgt.setup' };
const COLORS = ['#34503a', '#8a5d00', '#2f5d8a', '#a8261d', '#2b7a78', '#b8571a'];

const load = (k, fallback) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fallback; } catch { return fallback; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

let game = load(KEY.game, null);
let undo = [];          // snapshots of the game before each change
let lastTouch = null;   // { who, at } so a run of taps on one player is one undo step
let view = 'setup', prevView = 'setup';

// ---------- Setup ----------
const setup = Object.assign({ count: 4, life: 40, faceTable: true, cmdTakesLife: true, seats: [] }, load(KEY.setup, {}));

function seg(el, values, current, onPick, label = v => v) {
  el.innerHTML = values.map(v => `<button type="button" role="radio" aria-checked="${v === current}" data-v="${v}">${label(v)}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (b) onPick(Number(b.dataset.v)); };
}

function readSeats() {
  [...document.querySelectorAll('#seats .seat')].forEach((row, i) => {
    setup.seats[i] = {
      name: row.querySelector('.nm').value,
      cmdrs: [...row.querySelectorAll('.cm')].map(x => x.value),
      partner: !row.querySelector('.cm2').hidden,
    };
  });
}

function renderSetup() {
  seg($('#countSeg'), [2, 3, 4, 5, 6], setup.count, n => { readSeats(); setup.count = n; renderSetup(); });
  seg($('#lifeSeg'), [20, 30, 40], setup.life, n => { setup.life = n; renderSetup(); });
  const rows = [];
  for (let i = 0; i < setup.count; i++) {
    const s = setup.seats[i] || { name: '', cmdrs: ['', ''], partner: false };
    rows.push(`<div class="seat" style="--pc:${COLORS[i]}">
      <span class="dot">${i + 1}</span>
      <div class="seat-fields">
        <input class="nm" placeholder="Player ${i + 1}" value="${esc(s.name)}" list="pastNames" maxlength="24" autocomplete="off" aria-label="Player ${i + 1} name">
        <input class="cm" placeholder="Commander (optional)" value="${esc(s.cmdrs?.[0])}" list="pastCmdrs" autocomplete="off" aria-label="Player ${i + 1} commander">
        <input class="cm cm2" placeholder="Partner / background" value="${esc(s.cmdrs?.[1])}" list="pastCmdrs" autocomplete="off" aria-label="Player ${i + 1} second commander" ${s.partner ? '' : 'hidden'}>
        <button type="button" class="link addp">${s.partner ? '− Remove partner' : '+ Partner'}</button>
      </div>
    </div>`);
  }
  $('#seats').innerHTML = rows.join('');
  const first = $('#first');
  const was = first.value || 'random';
  first.innerHTML = '<option value="random">Random</option>' +
    Array.from({ length: setup.count }, (_, i) => `<option value="${i}">${esc(setup.seats[i]?.name || `Player ${i + 1}`)}</option>`).join('');
  first.value = Number(was) < setup.count || was === 'random' ? was : 'random';
  $('#faceTable').checked = setup.faceTable;
  $('#cmdTakesLife').checked = setup.cmdTakesLife;

  const past = load(KEY.games, []);
  const names = new Set(), cmdrs = new Set();
  for (const r of past) for (const p of r.players) { names.add(p.name); p.cmdrs.forEach(c => cmdrs.add(c)); }
  $('#pastNames').innerHTML = [...names].slice(0, 40).map(n => `<option value="${esc(n)}">`).join('');
  $('#pastCmdrs').innerHTML = [...cmdrs].slice(0, 80).map(n => `<option value="${esc(n)}">`).join('');

  const live = game && !game.done;
  $('#resume').hidden = !live;
  if (live) $('#resumeInfo').textContent = ` · round ${game.round}, ${game.players.map(p => p.name).join(', ')}`;
}

$('#seats').addEventListener('click', e => {
  const b = e.target.closest('.addp');
  if (!b) return;
  const cm2 = b.parentElement.querySelector('.cm2');
  cm2.hidden = !cm2.hidden;
  if (cm2.hidden) cm2.value = '';
  b.textContent = cm2.hidden ? '+ Partner' : '− Remove partner';
  if (!cm2.hidden) cm2.focus();
});
$('#seats').addEventListener('input', e => {
  if (e.target.classList.contains('nm')) {
    const i = [...document.querySelectorAll('#seats .nm')].indexOf(e.target);
    const opt = $('#first').options[i + 1];
    if (opt) opt.textContent = e.target.value || `Player ${i + 1}`;
  }
  if (e.target.classList.contains('cm')) suggest(e.target.value);
});

// Commander name suggestions from Scryfall while online (offline, past commanders still show).
let sugTimer;
function suggest(q) {
  clearTimeout(sugTimer);
  if (q.trim().length < 3 || !navigator.onLine) return;
  sugTimer = setTimeout(async () => {
    try {
      const r = await fetch('/api/autocomplete?q=' + encodeURIComponent(q.trim()));
      const { names = [] } = await r.json();
      const have = new Set([...$('#pastCmdrs').options].map(o => o.value));
      $('#pastCmdrs').insertAdjacentHTML('beforeend', names.filter(n => !have.has(n)).map(n => `<option value="${esc(n)}">`).join(''));
    } catch { /* offline: fine */ }
  }, 250);
}

$('#start').addEventListener('click', () => {
  readSeats();
  setup.faceTable = $('#faceTable').checked;
  setup.cmdTakesLife = $('#cmdTakesLife').checked;
  save(KEY.setup, setup);
  if (game && !game.done && !confirmInline('#start', 'Start a new game? The one in progress is dropped.')) return;
  const f = $('#first').value;
  game = newGame({
    players: setup.seats.slice(0, setup.count).map(s => ({ name: s.name, cmdrs: s.partner ? s.cmdrs : s.cmdrs.slice(0, 1) })),
    startLife: setup.life,
    first: f === 'random' ? 'random' : Number(f),
    faceTable: setup.faceTable, cmdTakesLife: setup.cmdTakesLife,
  });
  undo = [];
  persist();
  show('game');
  toast(`${game.players[game.first].name} goes first`);
});
$('#resumeBtn').addEventListener('click', () => show('game'));

// Two-tap confirm on a button instead of a browser dialog: the first tap arms it.
const armed = new WeakMap();
function confirmInline(sel, msg) {
  const b = typeof sel === 'string' ? $(sel) : sel;
  if (armed.get(b)) { armed.delete(b); return true; }
  armed.set(b, b.textContent);
  const old = b.textContent;
  b.textContent = msg.length > 40 ? 'Tap again to confirm' : msg;
  toast(msg);
  setTimeout(() => { if (armed.get(b)) { armed.delete(b); b.textContent = old; } }, 3500);
  return false;
}

// ---------- The table ----------
function persist() { save(KEY.game, game); }

function snapshot(who) {
  const now = Date.now();
  if (lastTouch && lastTouch.who === who && who !== null && now - lastTouch.at < 1500) { lastTouch.at = now; return; }
  undo.push(JSON.stringify(game));
  if (undo.length > 80) undo.shift();
  lastTouch = { who, at: now };
}

function act(who, fn) {
  snapshot(who);
  fn();
  persist();
  paint();
}

function rows(n) {
  // Seats run clockwise from the bottom left: the bottom row left to right, then the top row right to left.
  const top = Math.floor(n / 2), bottom = n - top;
  const bottomSeats = Array.from({ length: bottom }, (_, i) => i);
  const topSeats = Array.from({ length: top }, (_, i) => n - 1 - i);
  return { top: topSeats, bottom: bottomSeats };
}

function buildBoard() {
  const n = game.players.length;
  const { top, bottom } = rows(n);
  const board = $('#board');
  board.className = `board n${n}` + (game.faceTable ? ' face' : '');
  const panel = (pi, flip) => {
    const p = game.players[pi];
    return `<section class="panel${flip ? ' flip' : ''}" data-pi="${pi}" style="--pc:${COLORS[pi]}">
      <div class="inner">
        <button type="button" class="who" data-act="sheet">
          <span class="nm">${esc(p.name)}</span><span class="cmd">${esc(p.cmdrs.join(' + ') || 'Tap for counters')}</span>
        </button>
        <div class="life">
          <button type="button" class="tap minus" data-act="minus" aria-label="${esc(p.name)} lose 1 life"><span>−</span></button>
          <output class="num" aria-live="polite"></output>
          <button type="button" class="tap plus" data-act="plus" aria-label="${esc(p.name)} gain 1 life"><span>+</span></button>
          <span class="delta" aria-hidden="true"></span>
        </div>
        <button type="button" class="badges" data-act="sheet" aria-label="${esc(p.name)} counters"></button>
        <div class="outmark" hidden></div>
      </div>
    </section>`;
  };
  board.innerHTML =
    `<div class="row top" style="--cols:${top.length}">${top.map(pi => panel(pi, game.faceTable)).join('')}</div>` +
    `<div class="row bottom" style="--cols:${bottom.length}">${bottom.map(pi => panel(pi, false)).join('')}</div>`;
}

const deltas = new Map(); // pi -> { sum, timer }
function showDelta(pi, d) {
  const el = document.querySelector(`.panel[data-pi="${pi}"] .delta`);
  const cur = deltas.get(pi) || { sum: 0 };
  clearTimeout(cur.timer);
  cur.sum += d;
  el.textContent = cur.sum > 0 ? `+${cur.sum}` : String(cur.sum);
  el.classList.toggle('neg', cur.sum < 0);
  el.classList.add('on');
  cur.timer = setTimeout(() => { el.classList.remove('on'); deltas.delete(pi); }, 1400);
  deltas.set(pi, cur);
}

function paint() {
  if (!game) return;
  if (!document.querySelector('#board .panel') || document.querySelectorAll('#board .panel').length !== game.players.length) buildBoard();
  game.players.forEach((p, pi) => {
    const el = document.querySelector(`.panel[data-pi="${pi}"]`);
    el.querySelector('.num').textContent = p.life;
    el.classList.toggle('active', pi === game.active && aliveCount(game) > 1);
    el.classList.toggle('out', p.out);
    el.classList.toggle('low', !p.out && p.life <= 10);
    const b = [];
    if (p.poison) b.push(`<span class="b${p.poison >= POISON_LETHAL - 3 ? ' hot' : ''}">☣ ${p.poison}</span>`);
    const mc = maxCmd(p);
    if (mc) b.push(`<span class="b${mc >= CMD_LETHAL - 6 ? ' hot' : ''}">⚔ ${mc}</span>`);
    const t = p.cmdrs.length > 1 ? `${tax(p, 0)}/${tax(p, 1)}` : tax(p, 0);
    if (p.casts[0] || p.casts[1]) b.push(`<span class="b">Tax +${t}</span>`);
    if (!b.length) b.push('<span class="b ghost">Counters</span>');
    el.querySelector('.badges').innerHTML = b.join('');
    const om = el.querySelector('.outmark');
    om.hidden = !p.out;
    if (p.out) om.textContent = `Out · ${p.outWhy}`;
  });
  $('#roundTxt').textContent = `Round ${game.round}`;
  $('#undoBtn').disabled = !undo.length;
  tick();
}

function tick() { if (game) $('#clockTxt').textContent = clock(Date.now() - game.startedAt); }
setInterval(tick, 15000);

// Tap the left half to lose life, right half to gain. Hold to keep going.
let hold = null;
function stopHold() { if (hold) { clearTimeout(hold.t); clearInterval(hold.i); hold.ac?.abort(); hold = null; } }
$('#board').addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-act="minus"], [data-act="plus"]');
  if (!b || !game) return;
  e.preventDefault();
  const pi = Number(b.closest('.panel').dataset.pi);
  const d = b.dataset.act === 'plus' ? 1 : -1;
  const step = () => { act(pi, () => changeLife(game, pi, d)); showDelta(pi, d); };
  stopHold();
  step();
  hold = { t: setTimeout(() => { hold.i = setInterval(step, 90); }, 450) };
  b.classList.add('pressed');
  const ac = new AbortController();
  ac.signal.addEventListener('abort', () => b.classList.remove('pressed'));
  const up = () => stopHold();
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, up, { signal: ac.signal });
  hold.ac = ac;
});
// Keyboard users: Enter / Space on the buttons (pointer taps are handled above).
$('#board').addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const b = e.target.closest('[data-act="minus"], [data-act="plus"]');
  if (!b) return;
  e.preventDefault();
  const pi = Number(b.closest('.panel').dataset.pi);
  const d = b.dataset.act === 'plus' ? 1 : -1;
  act(pi, () => changeLife(game, pi, d)); showDelta(pi, d);
});
$('#board').addEventListener('click', e => {
  const b = e.target.closest('[data-act="sheet"]');
  if (b) playerSheet(Number(b.closest('.panel').dataset.pi));
});
$('#board').addEventListener('contextmenu', e => e.preventDefault());

$('#nextBtn').addEventListener('click', () => {
  act(null, () => nextTurn(game));
  toast(`${game.players[game.active].name}'s turn`);
});
$('#undoBtn').addEventListener('click', () => {
  if (!undo.length) return;
  game = JSON.parse(undo.pop());
  lastTouch = null;
  persist(); paint();
  toast('Undone');
  if (!$('#sheet').hidden && sheetRefresh) sheetRefresh();
});
$('#menuBtn').addEventListener('click', menuSheet);

// ---------- Sheets ----------
let sheetRefresh = null;
function openSheet(title, flip, render) {
  sheetPi = -1;
  $('#sheetTitle').textContent = title;
  $('#sheet').hidden = false;
  $('#sheet').classList.toggle('flip', !!flip);
  sheetRefresh = render;
  render();
}
function closeSheet() { $('#sheet').hidden = true; sheetRefresh = null; paint(); }
$('#sheetClose').addEventListener('click', closeSheet);
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

const stepper = (label, value, act, sub = '') => `<div class="step">
  <div class="step-l"><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>
  <div class="step-c"><button type="button" class="sb" data-step="${act}" data-d="-1" aria-label="${label} minus 1">−</button>
  <output>${value}</output>
  <button type="button" class="sb" data-step="${act}" data-d="1" aria-label="${label} plus 1">+</button></div></div>`;

function isTopRow(pi) { return game.faceTable && rows(game.players.length).top.includes(pi); }

let sheetPi = -1;
function playerSheet(pi) {
  const p = () => game.players[pi];
  openSheet(game.players[pi].name, isTopRow(pi), () => {
    sheetPi = pi;
    const me = p();
    const srcs = sources(game).filter(s => s.pi !== pi);
    const lifeBtns = [-10, -5, 5, 10].map(d => `<button type="button" class="chip" data-life="${d}">${d > 0 ? '+' : ''}${d}</button>`).join('');
    $('#sheetBody').innerHTML = `
      <div class="lifebig"><span>Life</span><strong>${me.life}</strong><div class="chips">${lifeBtns}</div></div>
      <h3>Commander damage taken</h3>
      ${srcs.map(s => stepper(esc(s.label), me.cmd[s.key] || 0, 'cmd:' + s.key,
        esc(game.players[s.pi].name) + ((me.cmd[s.key] || 0) >= CMD_LETHAL ? ' · lethal' : ''))).join('')}
      <h3>Counters</h3>
      ${stepper('Poison', me.poison, 'poison', me.poison >= POISON_LETHAL ? 'lethal' : `${POISON_LETHAL} is lethal`)}
      <h3>Commander tax</h3>
      ${(me.cmdrs.length ? me.cmdrs : ['Commander']).map((c, ci) =>
        stepper(esc(c), me.casts[ci] || 0, 'cast:' + ci, `Cast ${me.casts[ci] || 0}× from the command zone · tax +${tax(me, ci)}`)).join('')}
      <button type="button" class="btn ${me.conceded ? '' : 'dark'} wide" data-concede>${me.conceded ? 'Bring back in' : 'Concede / knocked out'}</button>`;
  });
}

$('#sheetBody').addEventListener('click', e => {
  const t = e.target;
  const pi = game ? sheetPi : -1;
  const stepB = t.closest('[data-step]');
  if (stepB && pi >= 0) {
    const d = Number(stepB.dataset.d);
    const [kind, ...rest] = stepB.dataset.step.split(':');
    const key = rest.join(':');
    act(`sheet${pi}${kind}${key}`, () => {
      if (kind === 'cmd') changeCmd(game, pi, key, d);
      else if (kind === 'poison') changePoison(game, pi, d);
      else if (kind === 'cast') changeCasts(game, pi, Number(key), d);
    });
    sheetRefresh?.();
    return;
  }
  const lb = t.closest('[data-life]');
  if (lb && pi >= 0) { const d = Number(lb.dataset.life); act(pi, () => changeLife(game, pi, d)); sheetRefresh?.(); return; }
  if (t.closest('[data-concede]') && pi >= 0) {
    act(null, () => setConceded(game, pi, !game.players[pi].conceded));
    sheetRefresh?.();
  }
});

function menuSheet() {
  openSheet('Game', false, () => {
    const alive = aliveCount(game);
    $('#sheetBody').innerHTML = `
      <p class="muted">Round ${game.round} · ${clock(Date.now() - game.startedAt)} played · ${alive} of ${game.players.length} still in · ${wakeText()}</p>
      <button type="button" class="btn wide" id="endBtn">End game and pick the winner</button>
      <button type="button" class="btn dark wide" id="randBtn">Pick a random player</button>
      <button type="button" class="btn dark wide" id="logBtn">Game log</button>
      <button type="button" class="btn dark wide" id="setupBtn">Back to setup (keeps this game)</button>
      <button type="button" class="link danger" id="dropBtn">Abandon this game without saving</button>
      ${game.events.length ? `<h3>This game</h3><ol class="events">${game.events.slice(-12).reverse().map(ev => `<li><span class="mono">R${ev.round}</span> ${esc(ev.text)}</li>`).join('')}</ol>` : ''}`;
    $('#endBtn').onclick = endSheet;
    $('#randBtn').onclick = () => {
      const alivePlayers = game.players.filter(p => !p.out);
      toast(`🎲 ${alivePlayers[Math.floor(Math.random() * alivePlayers.length)].name}`);
    };
    $('#logBtn').onclick = () => { closeSheet(); show('history'); };
    $('#setupBtn').onclick = () => { closeSheet(); show('setup'); };
    $('#dropBtn').onclick = e => {
      if (!confirmInline(e.currentTarget, 'Tap again to abandon')) return;
      game = null; undo = []; save(KEY.game, null); closeSheet(); show('setup');
    };
  });
}

function endSheet() {
  const alive = game.players.map((p, i) => i).filter(i => !game.players[i].out);
  let winner = alive.length === 1 ? alive[0] : null;
  let how = '';
  openSheet('Who won?', false, () => {
    $('#sheetBody').innerHTML = `
      <div class="pick" id="winPick">${game.players.map((p, i) => `<button type="button" class="opt${winner === i ? ' on' : ''}" data-w="${i}" style="--pc:${COLORS[i]}">
        <strong>${esc(p.name)}</strong><small>${esc(p.cmdrs.join(' + '))}${p.out ? ' · out R' + p.outRound : ''}</small></button>`).join('')}
        <button type="button" class="opt${winner === -1 ? ' on' : ''}" data-w="-1"><strong>Draw / no winner</strong></button></div>
      <h3>How</h3>
      <div class="chips" id="howPick">${HOW_WON.map(h => `<button type="button" class="chip${how === h ? ' on' : ''}" data-h="${esc(h)}">${esc(h)}</button>`).join('')}</div>
      <p class="muted">Saves round ${game.round} as the win turn and ${clock(Date.now() - game.startedAt)} as the game length.</p>
      <button type="button" class="btn big wide" id="saveGame" ${winner === null ? 'disabled' : ''}>Save game</button>`;
    $('#winPick').onclick = e => { const b = e.target.closest('[data-w]'); if (b) { winner = Number(b.dataset.w); sheetRefresh(); } };
    $('#howPick').onclick = e => { const b = e.target.closest('[data-h]'); if (b) { how = how === b.dataset.h ? '' : b.dataset.h; sheetRefresh(); } };
    $('#saveGame').onclick = () => {
      const rec = finishGame(game, { winner: winner >= 0 ? winner : null, how });
      save(KEY.games, mergeGames(load(KEY.games, []), [rec]));
      game = null; undo = []; save(KEY.game, null);
      closeSheet();
      show('history');
      toast('Game saved');
    };
  });
}

// ---------- Game log ----------
function renderHistory() {
  const games = load(KEY.games, []);
  const s = stats(games);
  const pct = r => Math.round(r * 100) + '%';
  const table = (title, rowsArr) => rowsArr.length ? `<div class="card"><h3>${title}</h3><table class="st"><thead><tr><th></th><th>Games</th><th>Wins</th><th>Win %</th></tr></thead><tbody>
    ${rowsArr.slice(0, 15).map(r => `<tr><td>${esc(r.name)}</td><td>${r.games}</td><td>${r.wins}</td><td>${pct(r.rate)}</td></tr>`).join('')}</tbody></table></div>` : '';
  $('#statsBox').innerHTML = s.games ? `
    <div class="facts"><div><strong>${s.games}</strong><span>games</span></div>
      <div><strong>${s.avgRounds.toFixed(1)}</strong><span>avg rounds</span></div>
      <div><strong>${Math.round(s.avgMinutes)}</strong><span>avg minutes</span></div></div>
    ${table('Players', s.players)}${table('Commanders', s.commanders)}`
    : '<p class="muted">No games saved yet. Finish a game from the table’s menu and it shows up here.</p>';
  $('#gameList').innerHTML = games.map(r => {
    const d = new Date(r.date);
    const w = r.winner !== null ? r.players[r.winner] : null;
    return `<div class="card game-row">
      <div class="gr-top"><strong>${w ? `${esc(w.name)} won` : 'Draw'}</strong><span class="muted mono">${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · R${r.rounds} · ${r.minutes} min</span></div>
      ${w ? `<div class="muted">${esc(w.cmdrs.join(' + ') || '')}${r.how ? ` · ${esc(r.how)}` : ''}</div>` : ''}
      <ul class="gp">${r.players.map((p, i) => `<li class="${i === r.winner ? 'won' : ''}">${esc(p.name)}${p.cmdrs.length ? ` <span class="muted">(${esc(p.cmdrs.join(' + '))})</span>` : ''}${p.outRound ? ` <span class="muted">out R${p.outRound}</span>` : ''}</li>`).join('')}</ul>
      <button type="button" class="link danger" data-del="${esc(r.id)}">Delete</button>
    </div>`;
  }).join('');
}

$('#gameList').addEventListener('click', e => {
  const b = e.target.closest('[data-del]');
  if (!b || !confirmInline(b, 'Tap again to delete')) return;
  save(KEY.games, load(KEY.games, []).filter(r => r.id !== b.dataset.del));
  renderHistory();
});

$('#exportBtn').addEventListener('click', () => {
  const games = load(KEY.games, []);
  const blob = new Blob([JSON.stringify({ app: 'commander-game-tracker', version: 1, games }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `commander-games-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  $('#backupStatus').textContent = `Saved ${games.length} games to a file.`;
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const incoming = parseBackup(await f.text());
    const have = load(KEY.games, []);
    const merged = mergeGames(have, incoming);
    save(KEY.games, merged);
    $('#backupStatus').className = 'status';
    $('#backupStatus').textContent = `Added ${merged.length - have.length} games (${incoming.length - (merged.length - have.length)} were already here).`;
    renderHistory();
  } catch (err) {
    $('#backupStatus').className = 'status error';
    $('#backupStatus').textContent = err.message;
  }
  e.target.value = '';
});

// ---------- Views, screen wake, toasts ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  show(b.dataset.go === 'back' ? (prevView === 'history' ? 'setup' : prevView) : b.dataset.go);
});

function show(v) {
  if (v === 'game' && !game) v = 'setup';
  if (v !== view) prevView = view;
  view = v;
  $('#setupView').hidden = v !== 'setup';
  $('#gameView').hidden = v !== 'game';
  $('#historyView').hidden = v !== 'history';
  document.body.classList.toggle('in-game', v === 'game');
  if (v === 'setup') renderSetup();
  if (v === 'history') renderHistory();
  if (v === 'game') { buildBoard(); paint(); }
  wake(v === 'game');
  window.scrollTo(0, 0);
}

let lock = null, wantWake = false;
async function wake(on) {
  wantWake = on;
  try {
    if (on && 'wakeLock' in navigator && !lock && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wake(wantWake); tick(); } });
const wakeText = () => lock ? 'screen stays on' : ('wakeLock' in navigator ? 'screen may sleep' : 'set auto-lock to Never to keep the screen on');

let toastEl;
function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.append(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastEl.t);
  toastEl.t = setTimeout(() => toastEl.classList.remove('on'), 1800);
}

show(game && !game.done ? 'game' : 'setup');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
