'use strict';
// Läser JSONL-filerna och gör rapport. Delas av extensionen och CLI:t.
const fs = require('fs');
const path = require('path');
const { dataDir, dayKey, TICK_MS } = require('./tracker');

const MÅNADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

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
    byProject: {},
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
      x = { ide, start, end: null, lastBeat: 0, project: '' };
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
      const x = run(l.ts, l.ide);
      if (l.w) x.project = l.w;
    } else if (l.t === 'seg' && l.end > l.start) {
      const x = run(l.start, l.ide);
      x.end = l.end;
      if (l.w) x.project = l.w;
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
    if (x.project) r.byProject[x.project] = (r.byProject[x.project] || 0) + ms;
    r.sessions.push({ ide: x.ide, start: x.start, end, ms, project: x.project });
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
      parts.push('| Start | Slut | Längd | Editor | Projekt |');
      parts.push('| --- | --- | --- | --- | --- |');
      for (const s of r.sessions) {
        parts.push(
          `| ${hm(s.start)} | ${hm(s.end)} | ${fmt(s.ms)} | ${s.ide} | ${s.project || '(okänt)'} |`
        );
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

// Aggregat över flera dagar. En dag i taget: loggen är append-only, så en dags
// fil är liten nog att läsa rakt av. Ett år är ~365 filer, vilket är sekunder —
// och bara när någon faktiskt ber om årsrapporten.
function totals(days) {
  const byIde = {};
  const byProject = {};
  const perDay = {};
  let totalMs = 0;
  for (const day of days) {
    const r = readDay(day);
    totalMs += r.totalMs;
    perDay[day] = r.totalMs;
    for (const [k, v] of Object.entries(r.byIde)) byIde[k] = (byIde[k] || 0) + v;
    for (const [k, v] of Object.entries(r.byProject)) byProject[k] = (byProject[k] || 0) + v;
  }
  return { totalMs, byIde, byProject, perDay };
}

function table(head, unit, map, kronologisk = false) {
  const keys = Object.keys(map).filter((k) => map[k] > 0);
  if (!keys.length) return [];
  keys.sort(kronologisk ? undefined : (a, b) => map[b] - map[a]);
  const out = [`| ${head} | ${unit} |`, '| --- | --- |'];
  for (const k of keys) out.push(`| ${k} | ${fmt(map[k])} |`);
  out.push('');
  return out;
}

function dagarMellan(from, to) {
  const out = [];
  for (let t = new Date(from + 'T12:00:00').getTime(); dayKey(t) <= to; t += 86400000) {
    out.push(dayKey(t));
  }
  return out;
}

function monthDays(month) {
  const [y, m] = month.split('-').map(Number);
  const sista = new Date(y, m, 0).getDate();
  return dagarMellan(`${month}-01`, `${month}-${String(sista).padStart(2, '0')}`);
}

function yearDays(year) {
  return dagarMellan(`${year}-01-01`, `${year}-12-31`);
}

function summering(titel, days, radEnhet) {
  const t = totals(days);
  const aktiva = Object.values(t.perDay).filter((v) => v > 0).length;
  const out = [
    `# CodeTimeStamper — ${titel}\n`,
    `**Total: ${fmt(t.totalMs)}** över ${aktiva} ${aktiva === 1 ? 'dag' : 'dagar'} med tid\n`,
  ];
  out.push(...table('Editor', 'Tid', t.byIde));
  out.push(...table('Projekt', 'Tid', t.byProject));
  const rader = {};
  for (const [day, ms] of Object.entries(t.perDay)) {
    const k = radEnhet === 'manad' ? day.slice(0, 7) : day;
    rader[k] = (rader[k] || 0) + ms;
  }
  out.push(...table(radEnhet === 'manad' ? 'Månad' : 'Dag', 'Tid', rader, true));
  return out.join('\n');
}

function weekMarkdown(endDay = dayKey(Date.now())) {
  const end = new Date(endDay + 'T12:00:00').getTime();
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(dayKey(end - i * 86400000));
  return summering(`7 dagar till ${endDay}`, days, 'dag');
}

function monthMarkdown(month = dayKey(Date.now()).slice(0, 7)) {
  const namn = MÅNADER[Number(month.slice(5, 7)) - 1] || month;
  return summering(`${namn} ${month.slice(0, 4)}`, monthDays(month), 'dag');
}

function yearMarkdown(year = dayKey(Date.now()).slice(0, 4)) {
  return summering(year, yearDays(year), 'manad');
}

/**
 * Den samlade filen: dagens pass och månaden i sammandrag i ett dokument, det
 * man öppnar för att se vilka projekt tiden gick till och när. Rubriknivån
 * sänks ett steg så att filen får en titel och två avsnitt.
 */
function samladMarkdown(day = dayKey(Date.now())) {
  return [
    '# CodeTimeStamper\n',
    markdown([day]).replace(/^# /, '## '),
    monthMarkdown(day.slice(0, 7)).replace(/^# /, '## '),
  ].join('\n');
}

module.exports = {
  readDay,
  listDays,
  markdown,
  samladMarkdown,
  weekMarkdown,
  monthMarkdown,
  yearMarkdown,
  totals,
  fmt,
};
