#!/usr/bin/env node
'use strict';
const { markdown, weekMarkdown, readDay, listDays, fmt } = require('../report');
const { dayKey, dataDir } = require('../tracker');

const args = process.argv.slice(2);

if (args.includes('--json')) {
  const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || dayKey(Date.now());
  console.log(JSON.stringify(readDay(day), null, 2));
} else if (args.includes('--vecka') || args.includes('--week')) {
  console.log(weekMarkdown());
} else if (args.includes('--dagar') || args.includes('--list')) {
  const days = listDays();
  if (!days.length) console.log(`Ingen logg i ${dataDir()}`);
  for (const d of days) console.log(`${d}  ${fmt(readDay(d).totalMs)}`);
} else if (args.includes('--help') || args.includes('-h')) {
  console.log(`CodeTimeStamper — aktiv kodtid

  codetimestamper                 dagens rapport
  codetimestamper 2026-09-22      rapport för ett datum
  codetimestamper --vecka         senaste 7 dagarna
  codetimestamper --dagar         alla sparade dagar
  codetimestamper --json [datum]  rådata

Logg: ${dataDir()}`);
} else {
  const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || dayKey(Date.now());
  console.log(markdown([day]));
}
