#!/usr/bin/env node
'use strict';
const {
  markdown,
  weekMarkdown,
  monthMarkdown,
  yearMarkdown,
  readDay,
  listDays,
  fmt,
} = require('../report');
const { dayKey, dataDir } = require('../tracker');

const args = process.argv.slice(2);
const efter = (flagga, monster) => args.find((a, i) => args[i - 1] === flagga && monster.test(a));

if (args.includes('--json')) {
  const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || dayKey(Date.now());
  console.log(JSON.stringify(readDay(day), null, 2));
} else if (args.includes('--vecka') || args.includes('--week')) {
  console.log(weekMarkdown());
} else if (args.includes('--manad')) {
  console.log(monthMarkdown(efter('--manad', /^\d{4}-\d{2}$/) || dayKey(Date.now()).slice(0, 7)));
} else if (args.includes('--ar')) {
  console.log(yearMarkdown(efter('--ar', /^\d{4}$/) || dayKey(Date.now()).slice(0, 4)));
} else if (args.includes('--dagar') || args.includes('--list')) {
  const days = listDays();
  if (!days.length) console.log(`Ingen logg i ${dataDir()}`);
  for (const d of days) console.log(`${d}  ${fmt(readDay(d).totalMs)}`);
} else if (args.includes('--help') || args.includes('-h')) {
  console.log(`CodeTimeStamper — aktiv kodtid

  codetimestamper                     dagens rapport
  codetimestamper 2026-09-22          rapport för ett datum
  codetimestamper --vecka             senaste 7 dagarna
  codetimestamper --manad [2026-09]   hela månaden
  codetimestamper --ar [2026]         hela året, månad för månad
  codetimestamper --dagar             alla sparade dagar
  codetimestamper --json [datum]      rådata

Logg: ${dataDir()}`);
} else {
  const day = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || dayKey(Date.now());
  console.log(markdown([day]));
}
