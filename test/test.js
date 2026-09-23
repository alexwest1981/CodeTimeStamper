'use strict';
// Körbart prov: node test/test.js  (inget ramverk, bara asserts)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cts-'));
process.env.CODETIMESTAMPER_DIR = TMP;

const { Tracker, splitDays, dayKey } = require('../tracker');
const { readDay, markdown, weekMarkdown } = require('../report');

const MIN = 60000;
let n = 0;
const ok = (name) => console.log(`  ok  ${++n}. ${name}`);

// 1. midnattssplittring
{
  const start = new Date(2026, 8, 22, 23, 30).getTime();
  const end = new Date(2026, 8, 23, 0, 30).getTime();
  const parts = splitDays(start, end);
  assert.strictEqual(parts.length, 2);
  assert.strictEqual(parts[0].end - parts[0].start, 30 * MIN);
  assert.strictEqual(parts[1].end - parts[1].start, 30 * MIN);
  assert.strictEqual(dayKey(parts[0].start), '2026-09-22');
  assert.strictEqual(dayKey(parts[1].start), '2026-09-23');
  ok('ett intervall över midnatt delas i två dygn');
}

// 2. timer startar på aktivitet, pausar efter 10 min, återupptas
{
  const t = new Tracker('TestIDE', 10 * MIN);
  let now = new Date(2026, 8, 22, 9, 0).getTime();
  t.touch(now);
  assert.strictEqual(t.openAt, now, 'segment öppnas vid första aktiviteten');

  now += 5 * MIN;
  t.touch(now); // aktivitet igen
  t.tick(now);
  assert.strictEqual(t.openAt !== null, true, 'inte pausad efter 5 min');

  now += 9 * MIN; // 9 min tystnad -> under tröskeln
  t.tick(now);
  assert.strictEqual(t.openAt !== null, true, 'inte pausad vid 9 min');

  now += 2 * MIN; // 11 min tystnad -> över tröskeln
  t.tick(now);
  assert.strictEqual(t.openAt, null, 'pausad efter 11 min tystnad');

  const r = readDay('2026-09-22');
  assert.strictEqual(r.sessions.length, 1);
  // 5 min aktiv + 10 min respit (till senaste aktivitet, inte till nu) = 15 min
  assert.strictEqual(r.totalMs, 15 * MIN, 'de lediga minuterna räknas inte');
  assert.strictEqual(r.orphans.length, 0);

  now += MIN;
  t.touch(now);
  t.close(now + 2 * MIN);
  assert.strictEqual(readDay('2026-09-22').sessions.length, 2, 'nytt segment efter paus');
  ok('start, paus vid 10 min, återstart');
}

// 3. flera editorer summeras var för sig
{
  const a = new Tracker('VS Code', MIN);
  const b = new Tracker('Antigravity', MIN);
  const t0 = new Date(2026, 8, 21, 10, 0).getTime();
  a.touch(t0);
  a.close(t0 + 30 * MIN);
  b.touch(t0);
  b.close(t0 + 12 * MIN);
  const r = readDay('2026-09-21');
  assert.strictEqual(r.byIde['VS Code'], 30 * MIN);
  assert.strictEqual(r.byIde['Antigravity'], 12 * MIN);
  assert.strictEqual(r.totalMs, 42 * MIN);
  ok('summering per editor');
}

// 4. krasch: öppet segment utan avslut räknas inte men redovisas
{
  const t = new Tracker('KraschIDE', MIN);
  const t0 = new Date(2026, 8, 20, 14, 0).getTime();
  t.touch(t0); // ingen close()
  const r = readDay('2026-09-20');
  assert.strictEqual(r.totalMs, 0);
  assert.strictEqual(r.orphans.length, 1);
  assert.ok(markdown(['2026-09-20']).includes('Avbruten session'));
  ok('kraschat segment räknas inte, syns i rapporten');
}

// 5. skräprad och midnatt i rapporten
{
  fs.appendFileSync(path.join(TMP, '2026-09-20.jsonl'), 'inte json\n');
  const r = readDay('2026-09-20');
  assert.strictEqual(r.badLines, 1);
  assert.strictEqual(r.totalMs, 0, 'skräprad påverkar inte summan');
  ok('oläsbar rad ignoreras');
}

// 6. veckorapporten räknar ihop dagarna
{
  const md = weekMarkdown('2026-09-22');
  assert.ok(md.includes('42 min'), 'veckan innehåller 21:a september');
  assert.ok(md.includes('| Dag | Tid |'));
  ok('veckorapport');
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${n} prov, alla gröna.`);
