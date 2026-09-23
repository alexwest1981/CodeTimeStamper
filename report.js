'use strict';
// Läser JSONL-filerna och gör rapport. Delas av extensionen och CLI:t.
const fs = require('fs');
const path = require('path');
const { dataDir, dayKey, TICK_MS } = require('./tracker');

function listDays(dir = dataDir()) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n))
    .map((n) => n.slice(0, 10))
    .sort();
}

// Lokal midnatt efter en dagnyckel, så ett pulsslag strax före midnatt inte
// räknas in i nästa dygn.
function midnightAfter(day) {
  const d = new Date(day + 'T12:00:00');
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

function readDay(day, dir = dataDir()) {
  const r = {
    day,
    totalMs: 0,
    byIde: {},
    sessions: [],
    orphans: [],
    badLines: 0,
  };
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, `${day}.jsonl`), 'utf8');
  } catch {
    return r;
  }

  // En körning identifieras av sin starttid och sin editor. Tiden räknas från
  // körningens avslut om ett sådant finns, annars från dess sista pulsslag —
  // aldrig från en gissning, och aldrig kastad bara för att avslutet saknas.
  // Editorn är med i nyckeln: två editorer som öppnar i samma millisekund ska
  // inte slås ihop till en körning.
  const runs = new Map();
  const run = (start, ide) => {
    const key = `${start}|${ide}`;
    let x = runs.get(key);
    if (!x) {
      x = { ide, start, end: null, lastBeat: 0 };
      runs.set(key, x);
    }
    return x;
  };

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let l;
    try {
      l = JSON.parse(line);
    } catch {
      r.badLines++;
      continue;
    }
    if (l.t === 'open') {
      run(l.ts, l.ide);
    } else if (l.t === 'seg' && l.end > l.start) {
      run(l.start, l.ide).end = l.end;
    } else if (l.t === 'beat') {
      const x = run(l.start, l.ide);
      if (l.ts > x.lastBeat) x.lastBeat = l.ts;
    } else {
      r.badLines++;
    }
  }

  const dayEnd = midnightAfter(day);
  for (const x of runs.values()) {
    const end = x.end !== null
      ? x.end
      : x.lastBeat
        ? Math.min(x.lastBeat + TICK_MS, dayEnd)
        : null;
    // Utan både avslut och pulsslag finns ingen uppgift om längden alls. Att
    // gissa vore värre än att säga att passet inte kunde räknas.
    if (end === null || end <= x.start) {
      r.orphans.push({ ide: x.ide, ts: x.start });
      continue;
    }
    const ms = end - x.start;
    r.totalMs += ms;
    r.byIde[x.ide] = (r.byIde[x.ide] || 0) + ms;
    r.sessions.push({ ide: x.ide, start: x.start, end, ms });
  }
  r.sessions.sort((a, b) => a.start - b.start);
  return r;
}

function fmt(ms) {
  const min = Math.round(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

function hm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function markdown(days) {
  const parts = [];
  for (const day of days) {
    const r = readDay(day);
    const weekdays = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
    const wd = weekdays[new Date(day + 'T12:00:00').getDay()];
    parts.push(`# CodeTimeStamper — ${wd} ${day}\n`);
    parts.push(`**Total: ${fmt(r.totalMs)}**\n`);
    const ides = Object.keys(r.byIde).sort((a, b) => r.byIde[b] - r.byIde[a]);
    if (ides.length) {
      parts.push('| Editor | Tid |');
      parts.push('| --- | --- |');
      for (const ide of ides) parts.push(`| ${ide} | ${fmt(r.byIde[ide])} |`);
      parts.push('');
    } else {
      parts.push('_Ingen aktivitet registrerad._\n');
    }
    if (r.sessions.length) {
      parts.push('| Start | Slut | Längd | Editor |');
      parts.push('| --- | --- | --- | --- |');
      for (const s of r.sessions) {
        parts.push(`| ${hm(s.start)} | ${hm(s.end)} | ${fmt(s.ms)} | ${s.ide} |`);
      }
      parts.push('');
    }
    for (const o of r.orphans) {
      parts.push(`> Kort avbrott (${o.ide}) vid ${hm(o.ts)} — passet blev kortare än ett pulsslag och kunde inte räknas.`);
    }
    if (r.badLines) parts.push(`\n> ${r.badLines} oläsbar rad i loggen ignorerades.`);
    parts.push('');
  }
  return parts.join('\n');
}

function weekMarkdown(endDay = dayKey(Date.now())) {
  const days = listDays();
  const end = new Date(endDay + 'T12:00:00').getTime();
  const span = [];
  for (let i = 6; i >= 0; i--) span.push(dayKey(end - i * 86400000));
  const rows = span.map((d) => ({ d, r: readDay(d) }));
  const total = rows.reduce((a, x) => a + x.r.totalMs, 0);
  const out = [`# CodeTimeStamper — 7 dagar till ${endDay}\n`, `**Total: ${fmt(total)}**\n`];
  out.push('| Dag | Tid |');
  out.push('| --- | --- |');
  for (const { d, r } of rows) out.push(`| ${d} | ${fmt(r.totalMs)} |`);
  out.push('', `Sparade dagar i loggen: ${days.length}.`);
  return out.join('\n');
}

module.exports = { readDay, listDays, markdown, weekMarkdown, fmt };
