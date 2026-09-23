'use strict';
// CodeTimeStamper — aktiv kodtid per dag. Inget annat mäts eller skickas.
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { Tracker, dataDir, dayKey, TICK_MS } = require('./tracker');
const {
  markdown,
  weekMarkdown,
  monthMarkdown,
  yearMarkdown,
  readDay,
  listDays,
  fmt,
} = require('./report');

const IDE = vscode.env.appName || 'VS Code';

let tracker;
let status;
let timer;

function cfg() {
  const c = vscode.workspace.getConfiguration('codetimestamper');
  return { idleMs: Math.max(1, c.get('idleMinutes', 10)) * 60000, enabled: c.get('enabled', true) };
}

// Projektmappens namn — basename, aldrig sökvägen. Tomt när inställningen är
// av eller när fönstret inte har någon mapp (t.ex. en ensam fil).
function projectName() {
  const c = vscode.workspace.getConfiguration('codetimestamper');
  if (!c.get('recordProject', true)) return '';
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length ? folders[0].name : '';
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

// Dagens rapport skrivs om när ett pass tar slut, så att markdownfilen på disk
// är aktuell utan att man behöver öppna rapporten. Samma regel som i
// JetBrains-pluginen.
function writeTodayReport() {
  const outDir = path.join(dataDir(), 'rapport');
  fs.mkdirSync(outDir, { recursive: true });
  const today = dayKey(Date.now());
  fs.writeFileSync(path.join(outDir, `${today}.md`), markdown([today]));
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
  tracker = new Tracker(IDE, conf.idleMs, projectName());

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
    // Läses om varje tick: ett annat projekt kan ha öppnats i samma fönster,
    // och recordProject kan ha slagits av, utan att extensionen startas om.
    tracker.project = projectName();
    const wasOpen = tracker.openAt !== null;
    if (c.enabled) tracker.tick();
    if (wasOpen && tracker.openAt === null) writeTodayReport();
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
          { label: 'Denna månad', value: 'month' },
          { label: 'I år', value: 'year' },
        ],
        { placeHolder: 'Vilken rapport?' }
      );
      if (!pick) return;
      if (pick.value === 'week') return showDoc('CodeTimeStamper', weekMarkdown());
      if (pick.value === 'month') return showDoc('CodeTimeStamper', monthMarkdown());
      if (pick.value === 'year') return showDoc('CodeTimeStamper', yearMarkdown());
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
  writeTodayReport();
}

module.exports = { activate, deactivate };
