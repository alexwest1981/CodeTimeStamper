'use strict';
// CodeTimeStamper — aktiv kodtid per dag. Inget annat mäts eller skickas.
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { Tracker, dataDir, dayKey } = require('./tracker');
const { markdown, weekMarkdown, readDay, listDays, fmt } = require('./report');

const IDE = vscode.env.appName || 'VS Code';
const TICK_MS = 30000;

let tracker;
let status;
let timer;

function cfg() {
  const c = vscode.workspace.getConfiguration('codetimestamper');
  return { idleMs: Math.max(1, c.get('idleMinutes', 10)) * 60000, enabled: c.get('enabled', true) };
}

// Skriv dagens rapport till rapport/ om den saknas. Gör att en dag får sin
// fil även om editorn var stängd över midnatt.
function writeDailyReports() {
  const today = dayKey(Date.now());
  const outDir = path.join(dataDir(), 'rapport');
  const days = listDays();
  for (const day of days) {
    if (day >= today) continue;
    const file = path.join(outDir, `${day}.md`);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, markdown([day]));
  }
}

function refreshStatus() {
  if (!status) return;
  const total = readDay(dayKey(Date.now())).totalMs;
  const idleText = tracker.openAt === null ? ' (pausad)' : '';
  status.text = `$(clock) ${fmt(total)}${idleText}`;
  status.tooltip = 'CodeTimeStamper — aktiv kodtid idag. Klicka för rapport.';
}

async function showDoc(title, content) {
  const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
  try {
    await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
  } catch {
    await vscode.window.showTextDocument(doc);
  }
}

function activate(context) {
  const conf = cfg();
  tracker = new Tracker(IDE, conf.idleMs);

  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'codetimestamper.show';
  context.subscriptions.push(status);

  // Endast signaler från en faktisk användare i ett fokuserat fönster räknas.
  // Utan fokus-guarden skulle en agent som skriver filer i bakgrunden hålla
  // timern vid liv hur länge som helst.
  const touch = () => {
    if (!cfg().enabled) return;
    if (!vscode.window.state.focused) return;
    tracker.touch();
    refreshStatus();
  };

  const subs = [
    vscode.workspace.onDidChangeTextDocument,
    vscode.workspace.onDidSaveTextDocument,
    vscode.workspace.onDidOpenTextDocument,
    vscode.window.onDidChangeTextEditorSelection,
    vscode.window.onDidChangeTextEditorVisibleRanges,
    vscode.window.onDidChangeActiveTextEditor,
    vscode.window.onDidOpenTerminal,
    vscode.window.onDidCloseTerminal,
    vscode.window.onDidChangeTerminalState,
    vscode.debug.onDidStartDebugSession,
    vscode.debug.onDidTerminateDebugSession,
    vscode.tasks.onDidStartTask,
  ];
  for (const ev of subs) context.subscriptions.push(ev(touch));

  timer = setInterval(() => {
    const c = cfg();
    tracker.idleMs = c.idleMs;
    if (c.enabled) tracker.tick();
    refreshStatus();
    writeDailyReports();
  }, TICK_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  context.subscriptions.push(
    vscode.commands.registerCommand('codetimestamper.show', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Idag', value: 'today' },
          { label: 'Igår', value: 'yesterday' },
          { label: 'Senaste 7 dagarna', value: 'week' },
        ],
        { placeHolder: 'Vilken rapport?' }
      );
      if (!pick) return;
      if (pick.value === 'week') return showDoc('CodeTimeStamper', weekMarkdown());
      const day = dayKey(Date.now() - (pick.value === 'yesterday' ? 86400000 : 0));
      return showDoc('CodeTimeStamper', markdown([day]));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetimestamper.openFolder', () => {
      vscode.env.openExternal(vscode.Uri.file(dataDir()));
    })
  );

  status.show();
  refreshStatus();
  writeDailyReports();
}

function deactivate() {
  if (timer) clearInterval(timer);
  // Stäng det öppna segmentet vid nu, inte vid senaste aktiviteten: användaren
  // stänger medvetet och var aktiv fram till dess.
  if (tracker) tracker.close();
}

module.exports = { activate, deactivate };
