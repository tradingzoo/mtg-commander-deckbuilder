// Game tracker rules, kept free of the page so `npm test` can check them.
// A game is a plain object (saved as JSON): players with life, poison, commander damage taken
// and commander casts, plus the round, whose turn it is and an event list.

export const POISON_LETHAL = 10;
export const CMD_LETHAL = 21;
export const HOW_WON = ['Combat', 'Commander damage', 'Combo', 'Poison', 'Alt win', 'Last one standing', 'Other'];

const clean = (s, max = 60) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// setup: { players: [{ name, cmdrs: [a, b?] }], startLife, first: index | 'random', faceTable, cmdTakesLife }
export function newGame(setup, now = Date.now(), rand = Math.random) {
  const list = (setup.players || []).slice(0, 6);
  if (list.length < 2) throw new Error('A game needs at least 2 players');
  const startLife = Number(setup.startLife) > 0 ? Math.round(Number(setup.startLife)) : 40;
  const players = list.map((p, i) => ({
    id: 'p' + i,
    name: clean(p.name, 24) || `Player ${i + 1}`,
    cmdrs: (p.cmdrs || []).map(c => clean(c)).filter(Boolean).slice(0, 2),
    life: startLife, poison: 0, cmd: {}, casts: [0, 0],
    conceded: false, out: false, outRound: null, outWhy: null,
  }));
  let first = setup.first;
  if (first === 'random' || !(Number.isInteger(first) && first >= 0 && first < players.length)) {
    first = Math.floor(rand() * players.length);
  }
  return {
    id: uid(), startedAt: now, startLife,
    faceTable: setup.faceTable !== false, cmdTakesLife: setup.cmdTakesLife !== false,
    players, first, active: first, round: 1,
    events: [{ at: now, round: 1, text: `${players[first].name} goes first` }],
  };
}

// The commanders a player can deal damage with. A player with no commander named still gets one source.
export function sources(g) {
  const out = [];
  g.players.forEach((p, pi) => {
    const n = Math.max(1, p.cmdrs.length);
    for (let ci = 0; ci < n; ci++) out.push({ key: `${p.id}:${ci}`, pi, ci, label: p.cmdrs[ci] || `${p.name}'s commander` });
  });
  return out;
}

export function lethalReason(p) {
  if (p.conceded) return 'Conceded';
  if (p.life <= 0) return 'Life';
  if (p.poison >= POISON_LETHAL) return 'Poison';
  if (Object.values(p.cmd).some(n => n >= CMD_LETHAL)) return 'Commander damage';
  return null;
}

export const isAlive = p => !p.out;
export const tax = (p, ci = 0) => 2 * (p.casts[ci] || 0);
export const maxCmd = p => Math.max(0, ...Object.values(p.cmd));

// Re-works who is out after any change. A player who comes back (an undo-like fix) loses the mark.
function settle(g, now) {
  for (const p of g.players) {
    const why = lethalReason(p);
    if (why && !p.out) {
      p.out = true; p.outRound = g.round; p.outWhy = why;
      g.events.push({ at: now, round: g.round, text: `${p.name} is out (${why.toLowerCase()})` });
    } else if (!why && p.out) {
      p.out = false; p.outRound = null; p.outWhy = null;
      g.events.push({ at: now, round: g.round, text: `${p.name} is back in` });
    }
  }
  if (!isAlive(g.players[g.active])) {
    const next = nextAlive(g, g.active);
    if (next !== null) g.active = next;
  }
  return g;
}

function nextAlive(g, from) {
  const n = g.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (isAlive(g.players[i])) return i;
  }
  return null;
}

export function changeLife(g, pi, delta, now = Date.now()) {
  g.players[pi].life += delta;
  return settle(g, now);
}

export function changePoison(g, pi, delta, now = Date.now()) {
  const p = g.players[pi];
  p.poison = Math.max(0, p.poison + delta);
  return settle(g, now);
}

// Commander damage is also life loss unless the table turned that off.
export function changeCmd(g, pi, key, delta, now = Date.now()) {
  const p = g.players[pi];
  const was = p.cmd[key] || 0;
  const next = Math.max(0, was + delta);
  if (next) p.cmd[key] = next; else delete p.cmd[key];
  if (g.cmdTakesLife) p.life -= next - was;
  return settle(g, now);
}

export function changeCasts(g, pi, ci, delta) {
  const p = g.players[pi];
  p.casts[ci] = Math.max(0, (p.casts[ci] || 0) + delta);
  return g;
}

export function setConceded(g, pi, on, now = Date.now()) {
  g.players[pi].conceded = !!on;
  return settle(g, now);
}

// Passes the turn to the next player still in. The round goes up each time play passes the first seat.
export function nextTurn(g, now = Date.now()) {
  const n = g.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (g.active + k) % n;
    if (i === g.first) g.round++;
    if (isAlive(g.players[i])) { g.active = i; break; }
  }
  return g;
}

export const aliveCount = g => g.players.filter(isAlive).length;

// Turns a finished game into the record kept in the log.
// winner: a player index, or null for a draw / no winner.
export function finishGame(g, { winner = null, how = '' } = {}, now = Date.now()) {
  const w = Number.isInteger(winner) && g.players[winner] ? winner : null;
  return {
    id: g.id,
    date: new Date(g.startedAt).toISOString(),
    minutes: Math.max(0, Math.round((now - g.startedAt) / 60000)),
    rounds: g.round,
    startLife: g.startLife,
    firstSeat: g.first,
    winner: w,
    how: clean(how, 40),
    players: g.players.map(p => ({
      name: p.name, cmdrs: p.cmdrs.slice(), life: p.life, poison: p.poison,
      out: p.out, outRound: p.outRound, outWhy: p.outWhy,
    })),
  };
}

const cmdrKey = p => p.cmdrs.length ? p.cmdrs.join(' + ') : '';

// Wins and games per player and per commander, best win rate first (then most games).
export function stats(records) {
  const byPlayer = new Map(), byCmdr = new Map();
  const add = (map, key, won, extra) => {
    if (!key) return;
    const k = key.toLowerCase();
    const row = map.get(k) || { name: key, games: 0, wins: 0, ...extra };
    row.games++; if (won) row.wins++;
    map.set(k, row);
  };
  let rounds = 0, minutes = 0;
  for (const r of records) {
    rounds += r.rounds || 0; minutes += r.minutes || 0;
    r.players.forEach((p, i) => {
      add(byPlayer, p.name, r.winner === i);
      add(byCmdr, cmdrKey(p), r.winner === i);
    });
  }
  const sort = rows => rows.map(x => ({ ...x, rate: x.games ? x.wins / x.games : 0 }))
    .sort((a, b) => b.rate - a.rate || b.games - a.games || a.name.localeCompare(b.name));
  const n = records.length;
  return {
    games: n,
    avgRounds: n ? rounds / n : 0,
    avgMinutes: n ? minutes / n : 0,
    players: sort([...byPlayer.values()]),
    commanders: sort([...byCmdr.values()]),
  };
}

// Checks an imported backup file and keeps only well-formed game records.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file is not a tracker backup'); }
  const games = Array.isArray(data) ? data : data?.games;
  if (!Array.isArray(games)) throw new Error('That file is not a tracker backup');
  return games.filter(r => r && typeof r.id === 'string' && Array.isArray(r.players) && r.players.length >= 2
    && r.players.every(p => p && typeof p.name === 'string' && Array.isArray(p.cmdrs)));
}

// Adds imported games to the log, skipping ones already there, newest first.
export function mergeGames(have, incoming) {
  const seen = new Set(have.map(r => r.id));
  const all = have.concat(incoming.filter(r => !seen.has(r.id) && seen.add(r.id)));
  return all.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function clock(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
