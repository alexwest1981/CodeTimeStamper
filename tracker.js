'use strict';
// Ren logik, inget vscode-beroende -> kan köras och provas med plain node.
// Det enda som skrivs till disk är tidsstämplar och vilken editor.
const fs = require('fs');
const os = require('os');
const path = require('path');

const IDLE_MS = 30 * 60 * 1000;

// Hur ofta ett pulsslag skrivs. Rapportens beräkning av ett kraschat pass
// använder samma tal, så det bor här och inte på två ställen.
const TICK_MS = 30000;

function dataDir() {
  // ponytail: env-override finns bara för provet
  return process.env.CODETIMESTAMPER_DIR || path.join(os.homedir(), '.codetimestamper');
}

// Den läsbara mappen: det man öppnar och läser. Råloggen ligger kvar i
// ~/.codetimestamper — den skrivs atomiskt och flyttas inte, för en flytt
// skulle tappa historiken för den som redan har en logg där.
function outDir() {
  if (process.env.CODETIMESTAMPER_OUT) return process.env.CODETIMESTAMPER_OUT;
  // Prov och sandlådor pekar om datamappen; då följer utmappen med, så inget
  // prov skriver i någons Documents.
  if (process.env.CODETIMESTAMPER_DIR) return path.join(process.env.CODETIMESTAMPER_DIR, 'rapport');
  return path.join(os.homedir(), 'Documents', 'CodeTimeStamper');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Delar ett intervall vid lokal midnatt så att varje dag får sin egen tid.
function splitDays(start, end) {
  const out = [];
  let s = start;
  while (s < end) {
    const d = new Date(s);
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const e = Math.min(end, midnight);
    out.push({ start: s, end: e });
    s = e;
  }
  return out;
}

function append(line) {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  // open är en händelse (ts), seg och beat hör till en körning (start).
  const day = dayKey(line.t === 'open' ? line.ts : line.start);
  fs.appendFileSync(path.join(dir, `${day}.jsonl`), JSON.stringify(line) + '\n');
}

class Tracker {
  // project = projektmappens namn (basename, aldrig sökvägen). Tomt om
  // inställningen är av eller om fönstret inte har någon mapp.
  constructor(ide, idleMs = IDLE_MS, project = '') {
    this.ide = ide;
    this.idleMs = idleMs;
    this.project = project;
    this.openAt = null;
    this.lastActivity = 0;
  }

  // Varje aktivitetssignal (tangent, markering, skroll, editorbyte, ...).
  touch(now = Date.now()) {
    if (this.openAt === null) {
      this.openAt = now;
      const line = { ide: this.ide, t: 'open', ts: now };
      if (this.project) line.w = this.project;
      append(line);
    }
    this.lastActivity = now;
  }

  // Kallas med jämna mellanrum. Stänger vid senaste aktivitet + tröskeln, inte
  // vid nu: annars skulle de tio minuterna före pausen aldrig räknas, trots att
  // tysta luckor under tröskeln inuti en session räknas. Inkonsekvent = fel.
  //
  // Är passet fortfarande öppet lämnas ett pulsslag. Det är det som gör att
  // tiden inte hänger på att stängningen lyckas: en extension host som dör utan
  // att deactivate() körs lämnar ett pulsslag i stället för ingenting, och
  // rapporten kan räkna passet fram till dess i stället för att kasta det.
  // Pulsslaget bär sin egen starttid, så två fönster i samma editor (som har
  // var sin extension host och var sin tracker) kan inte blandas ihop.
  tick(now = Date.now()) {
    if (this.openAt === null) return;
    if (now - this.lastActivity >= this.idleMs) {
      this.close(this.lastActivity + this.idleMs);
    } else {
      append({ ide: this.ide, t: 'beat', start: this.openAt, ts: now });
    }
  }

  close(end = Date.now()) {
    if (this.openAt === null) return;
    if (end > this.openAt) {
      for (const part of splitDays(this.openAt, end)) {
        const line = { ide: this.ide, t: 'seg', start: part.start, end: part.end };
        if (this.project) line.w = this.project;
        append(line);
      }
    }
    this.openAt = null;
  }
}

module.exports = { Tracker, IDLE_MS, TICK_MS, dataDir, outDir, dayKey, splitDays };
