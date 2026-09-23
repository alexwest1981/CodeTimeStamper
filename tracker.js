'use strict';
// Ren logik, inget vscode-beroende -> kan köras och provas med plain node.
// Det enda som skrivs till disk är tidsstämplar och vilken editor.
const fs = require('fs');
const os = require('os');
const path = require('path');

const IDLE_MS = 10 * 60 * 1000;

function dataDir() {
  // ponytail: env-override finns bara för provet
  return process.env.CODETIMESTAMPER_DIR || path.join(os.homedir(), '.codetimestamper');
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
  const day = dayKey(line.t === 'seg' ? line.start : line.ts);
  fs.appendFileSync(path.join(dir, `${day}.jsonl`), JSON.stringify(line) + '\n');
}

class Tracker {
  constructor(ide, idleMs = IDLE_MS) {
    this.ide = ide;
    this.idleMs = idleMs;
    this.openAt = null;
    this.lastActivity = 0;
  }

  // Varje aktivitetssignal (tangent, markering, skroll, editorbyte, ...).
  touch(now = Date.now()) {
    if (this.openAt === null) {
      this.openAt = now;
      append({ ide: this.ide, t: 'open', ts: now });
    }
    this.lastActivity = now;
  }

  // Kallas med jämna mellanrum. Stänger vid senaste aktivitet + tröskeln, inte
  // vid nu: annars skulle de tio minuterna före pausen aldrig räknas, trots att
  // tysta luckor under tröskeln inuti en session räknas. Inkonsekvent = fel.
  tick(now = Date.now()) {
    if (this.openAt !== null && now - this.lastActivity >= this.idleMs) {
      this.close(this.lastActivity + this.idleMs);
    }
  }

  close(end = Date.now()) {
    if (this.openAt === null) return;
    if (end > this.openAt) {
      for (const part of splitDays(this.openAt, end)) {
        append({ ide: this.ide, t: 'seg', start: part.start, end: part.end });
      }
    }
    this.openAt = null;
  }
}

module.exports = { Tracker, IDLE_MS, dataDir, dayKey, splitDays };
