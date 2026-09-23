'use strict';
// Läser JSONL-filerna och gör rapport. Delas av extensionen och CLI:t.
const fs = require('fs');
const path = require('path');
const { dataDir, dayKey, splitDays } = require('./tracker');

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
  const maxEnd = {};
  const opens = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let l;
    try {
      l = JSON.parse(line);
    } catch {
      r.badLines++;
      continue;
    }
    if (l.t === 'seg' && l.end > l.start) {
      const ms = l.end - l.start;
      r.totalMs += ms;
      r.byIde[l.ide] = (r.byIde[l.ide] || 0) + ms;
      r.sessions.push({ ide: l.ide, start: l.start, end: l.end, ms });
      maxEnd[l.ide] = Math.max(maxEnd[l.ide] || 0, l.end);
    } else if (l.t === 'open') {
      opens.push(l);
    } else {
      r.badLines++;
    }
  }
  // En öppnad session utan avslut efter sig = krasch. Räknas inte, redovisas.
  r.orphans = opens.filter((o) => !(maxEnd[o.ide] > o.ts));
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
      parts.push(`> Avbruten session (${o.ide}) startad ${hm(o.ts)} räknas inte — programmet stängdes oväntat.`);
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
