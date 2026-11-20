import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, sources, changeLife, changeCmd, setConceded,
  finishGame, stats, maxCmd, lethalReason, parseBackup, mergeGames, clock, aliveCount,
} from '../public/js/tracker-core.js';

const pod = (extra = {}) => newGame({
  players: [
    { name: 'zac', cmdrs: ['Dáin of the Ancient Halls'] },
    { name: 'Ryan', cmdrs: ['Edgar Markov'] },
    { name: 'Max', cmdrs: ['Tymna the Weaver', 'Kraum, Ludevic\'s Opus'] },
    { name: '', cmdrs: [] },
  ],
  startLife: 40, ...extra,
}, 1_000_000);

test('new game: 40 life, names filled in, no turn tracking', () => {
  const g = pod();
  assert.equal(g.players.length, 4);
  assert.ok(g.players.every(p => p.life === 40 && Object.keys(p.cmd).length === 0));
  assert.equal(g.players[3].name, 'Player 4');
  assert.equal(g.cmdTakesLife, true);
  assert.equal(g.faceTable, true);
  assert.equal('round' in g, false);
  assert.equal('poison' in g.players[0], false);
});

test('new game: needs two players, caps at six, bad life falls back to 40', () => {
  assert.throws(() => newGame({ players: [{ name: 'solo' }] }));
  const g = newGame({ players: Array.from({ length: 8 }, (_, i) => ({ name: 'p' + i })), startLife: 'x' });
  assert.equal(g.players.length, 6);
  assert.equal(g.startLife, 40);
  assert.equal(newGame({ players: [{}, {}], startLife: 20 }).players[0].life, 20);
});

test('sources: partners give two commander damage sources, no commander still gives one', () => {
  const s = sources(pod());
  assert.equal(s.length, 5);
  assert.deepEqual(s.filter(x => x.pi === 2).map(x => x.label), ['Tymna the Weaver', 'Kraum, Ludevic\'s Opus']);
  assert.equal(s.find(x => x.pi === 3).label, "Player 4's commander");
});

test('life at 0 puts a player out, healing brings them back', () => {
  const g = pod();
  changeLife(g, 1, -40);
  assert.equal(g.players[1].out, true);
  assert.equal(g.players[1].outWhy, 'Life');
  assert.equal(aliveCount(g), 3);
  changeLife(g, 1, 3);
  assert.equal(g.players[1].out, false);
  assert.equal(g.players[1].outWhy, null);
});

test('commander damage also takes life, and 21 from one commander is lethal', () => {
  const g = pod();
  const dain = 'p0:0';
  changeCmd(g, 1, dain, 7);
  assert.equal(g.players[1].cmd[dain], 7);
  assert.equal(g.players[1].life, 33);
  changeCmd(g, 1, dain, -10); // can't go below 0, gives back only what was dealt
  assert.equal(g.players[1].cmd[dain], undefined);
  assert.equal(g.players[1].life, 40);
  changeCmd(g, 1, dain, 21);
  assert.equal(g.players[1].life, 19);
  assert.equal(g.players[1].outWhy, 'Commander damage');
});

test('21 split across partner commanders is not lethal; life link can be turned off', () => {
  const g = pod({ cmdTakesLife: false });
  changeCmd(g, 0, 'p2:0', 11);
  changeCmd(g, 0, 'p2:1', 10);
  assert.equal(g.players[0].out, false);
  assert.equal(g.players[0].life, 40);
  assert.equal(maxCmd(g.players[0]), 11);
});

test('conceding puts a player out and can be undone', () => {
  const g = pod();
  setConceded(g, 0, true);
  assert.equal(lethalReason(g.players[0]), 'Conceded');
  assert.equal(g.players[0].out, true);
  setConceded(g, 0, false);
  assert.equal(g.players[0].out, false);
  assert.equal(g.events.length, 2);
});

test('finish game: record keeps the winner, time and how', () => {
  const g = pod();
  changeLife(g, 3, -40);
  const r = finishGame(g, { winner: 0, how: 'Commander damage' }, 1_000_000 + 47 * 60000);
  assert.equal(r.minutes, 47);
  assert.equal(r.winner, 0);
  assert.equal(r.how, 'Commander damage');
  assert.equal(r.players[0].cmdrs[0], 'Dáin of the Ancient Halls');
  assert.equal(r.players[3].out, true);
  assert.equal(finishGame(g, { winner: 9 }).winner, null);
});

test('stats: win rates per player and per commander pair', () => {
  const recs = [];
  for (const w of [0, 0, 1, null]) recs.push(finishGame(pod(), { winner: w }, 1_000_000 + 60 * 60000));
  const s = stats(recs);
  assert.equal(s.games, 4);
  assert.equal(s.avgMinutes, 60);
  assert.deepEqual(s.players[0], { name: 'zac', games: 4, wins: 2, rate: 0.5 });
  assert.equal(s.players.find(p => p.name === 'Ryan').wins, 1);
  assert.ok(s.commanders.some(c => c.name === "Tymna the Weaver + Kraum, Ludevic's Opus" && c.games === 4));
  assert.equal(s.commanders.length, 3); // Player 4 had no commander named
});

test('backup: bad files are refused, good games merge without duplicates', () => {
  assert.throws(() => parseBackup('nope'));
  assert.throws(() => parseBackup('{"x":1}'));
  const a = finishGame(pod(), { winner: 0 });
  const b = { ...finishGame(pod(), { winner: 1 }), id: 'other', date: '2030-01-01T00:00:00.000Z' };
  const got = parseBackup(JSON.stringify({ games: [a, b, { id: 'broken' }] }));
  assert.equal(got.length, 2);
  const merged = mergeGames([a], got);
  assert.deepEqual(merged.map(r => r.id), ['other', a.id]);
});

test('clock shows hours and minutes', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(65 * 60000 + 5000), '1:05');
});
