'use strict';
// Kör extension.js mot en stubbad vscode-modul: hela aktiveringen, händelserna,
// kommandona och filskrivningarna provas på riktigt, utan editor.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cts-h-'));
process.env.CODETIMESTAMPER_DIR = TMP;

// --- kontrollerad klocka -----------------------------------------------------
let clock = new Date(2026, 8, 23, 9, 0).getTime();
Date.now = () => clock;

// --- stub för vscode ---------------------------------------------------------
const listeners = {}; // händelsenamn -> [fn]
const commands = {};
const statusBars = [];
let executed = [];
let idleMinutes = 10;

const ev = (name) => (fn) => {
  (listeners[name] = listeners[name] || []).push(fn);
  return { dispose() {} };
};

const vscode = {
  env: {
    appName: 'Visual Studio Code (prov)',
    openExternal: (uri) => executed.push(['openExternal', uri]),
  },
  Uri: { file: (p) => ({ fsPath: p, scheme: 'file' }) },
  StatusBarAlignment: { Right: 2 },
  window: {
    state: { focused: true },
    createStatusBarItem: () => {
      const item = { text: '', tooltip: '', command: '', show() {}, dispose() {} };
      statusBars.push(item);
      return item;
    },
    showQuickPick: async () => ({ label: 'Idag', value: 'today' }),
    showTextDocument: async (d) => executed.push(['showTextDocument', d]),
    onDidChangeTextEditorSelection: ev('selection'),
    onDidChangeTextEditorVisibleRanges: ev('visibleRanges'),
    onDidChangeActiveTextEditor: ev('activeEditor'),
    onDidOpenTerminal: ev('openTerminal'),
    onDidCloseTerminal: ev('closeTerminal'),
    onDidChangeTerminalState: ev('terminalState'),
  },
  workspace: {
    getConfiguration: () => ({
      get: (k, d) => (k === 'idleMinutes' ? idleMinutes : k === 'enabled' ? d : d),
    }),
    onDidChangeTextDocument: ev('textDocument'),
    onDidSaveTextDocument: ev('save'),
    onDidOpenTextDocument: ev('openDocument'),
    openTextDocument: async () => ({ uri: { fsPath: 'prov.md' } }),
  },
  debug: { onDidStartDebugSession: ev('debugStart'), onDidTerminateDebugSession: ev('debugStop') },
  tasks: { onDidStartTask: ev('taskStart') },
  commands: {
    registerCommand: (name, fn) => {
      commands[name] = fn;
      return { dispose() {} };
    },
    executeCommand: async (name, arg) => executed.push([name, arg]),
  },
};

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') return vscode;
  return origLoad.call(this, request, ...rest);
};

// --- kontrollerad tick ------------------------------------------------------
let tick = null;
const realSetInterval = global.setInterval;
global.setInterval = (fn, ms) => {
  tick = fn;
  return { unref() {}, _fake: true };
};
global.clearInterval = () => {};

// --- seedad gårdag så att den automatiska dagsrapporten har något att skriva --
const yesterday = '2026-09-22';
const y = (h, m) => new Date(2026, 8, 22, h, m).getTime();
fs.writeFileSync(
  path.join(TMP, `${yesterday}.jsonl`),
  JSON.stringify({ ide: 'prov', t: 'open', ts: y(9, 0) }) +
    '\n' +
    JSON.stringify({ ide: 'prov', t: 'seg', start: y(9, 0), end: y(11, 30) }) +
    '\n'
);

const fire = (name, ...args) => (listeners[name] || []).forEach((f) => f(...args));

let n = 0;
const ok = (name) => console.log(`  ok  ${++n}. ${name}`);

(async () => {
  const { activate, deactivate } = require('../extension');
  const disposed = [];
  activate({ subscriptions: { push: (d) => disposed.push(d) } });

  assert.strictEqual(Object.keys(commands).length, 2, 'två kommandon registreras');
  assert.strictEqual(Object.keys(listeners).length, 12, 'tolv aktivitetssignaler lyssnas på');
  assert.strictEqual(statusBars.length, 1, 'statusrad skapad');
  ok('aktiveringen kopplar in kommandon, signaler och statusrad');

  // gårdagens rapport skrevs automatiskt
  const rep = fs.readFileSync(path.join(TMP, 'rapport', `${yesterday}.md`), 'utf8');
  assert.ok(rep.includes('2 h 30 min'), `gårdagsrapporten saknar summan: ${rep}`);
  ok('dagsrapport skrivs automatiskt för avslutade dagar');

  // ingen aktivitet i ett ofokuserat fönster -> ingen logg
  vscode.window.state.focused = false;
  fire('textDocument');
  assert.deepStrictEqual(fs.readdirSync(TMP).filter((f) => f.endsWith('.jsonl')), [
    `${yesterday}.jsonl`,
  ]);
  ok('signaler i ofokuserat fönster ignoreras (agent som skriver i bakgrunden)');

  // aktivitet -> segment öppnas
  vscode.window.state.focused = true;
  fire('textDocument');
  clock += 20 * 60000;
  fire('visibleRanges'); // skroll räknas som aktivitet
  const today = fs.readFileSync(path.join(TMP, '2026-09-23.jsonl'), 'utf8').trim().split('\n');
  assert.strictEqual(today.length, 1, 'bara en öppningsrad ännu');
  assert.strictEqual(JSON.parse(today[0]).t, 'open');
  ok('tangent och skroll öppnar ett segment');

  // nio minuters tystnad -> inget avbrott
  clock += 9 * 60000;
  tick();
  assert.strictEqual(today.length, 1);
  assert.strictEqual(fs.readFileSync(path.join(TMP, '2026-09-23.jsonl'), 'utf8').trim().split('\n').length, 1);
  ok('nio tysta minuter avbryter inte');

  // över tröskeln -> segmentet stängs vid senaste aktivitet + tröskeln
  clock += 2 * 60000;
  tick();
  const lines = fs
    .readFileSync(path.join(TMP, '2026-09-23.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  const seg = lines.find((l) => l.t === 'seg');
  assert.ok(seg, 'segmentet stängdes');
  assert.strictEqual(seg.end - seg.start, 30 * 60000, '20 min aktivt + 10 min tröskel');
  assert.strictEqual(seg.ide, 'Visual Studio Code (prov)');
  ok('elva tysta minuter stänger segmentet, tiden stannar vid tröskeln');

  // statusraden visar dagens summa och att timern är pausad
  assert.ok(statusBars[0].text.includes('30 min'), statusBars[0].text);
  assert.ok(statusBars[0].text.includes('pausad'), statusBars[0].text);
  ok('statusraden visar dagens tid och pausläget');

  // ny aktivitet startar ett nytt segment direkt
  clock += 5 * 60000;
  fire('selection');
  assert.strictEqual(
    fs.readFileSync(path.join(TMP, '2026-09-23.jsonl'), 'utf8').trim().split('\n').length,
    3
  );
  ok('aktiviteten startar ett nytt segment efter pausen');

  // konfigurerad tröskel läses om
  idleMinutes = 1;
  clock += 65000;
  tick();
  const after = fs
    .readFileSync(path.join(TMP, '2026-09-23.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.strictEqual(after[after.length - 1].end - after[after.length - 1].start, 60000);
  ok('idleMinutes-inställningen slår igenom direkt');
  idleMinutes = 10;

  // kommandot Visar rapport
  clock += 5 * 60000;
  fire('textDocument');
  await commands['codetimestamper.show']();
  assert.ok(executed.some((e) => e[0] === 'markdown.showPreview'), 'öppnade rapporten');
  ok('kommandot Visa rapport öppnar en markdown-förhandsvisning');

  await commands['codetimestamper.openFolder']();
  assert.ok(executed.some((e) => e[0] === 'openExternal'));
  ok('kommandot Öppna datamappen');

  // stängning stänger det öppna segmentet
  clock += 3 * 60000;
  deactivate();
  const last = fs
    .readFileSync(path.join(TMP, '2026-09-23.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .pop();
  assert.strictEqual(last.t, 'seg', 'deactivate stänger segmentet');
  ok('deactivate stänger det öppna segmentet');

  global.setInterval = realSetInterval;
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${n} prov i extensionen, alla gröna.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
