#!/usr/bin/env node
// Show the route (stays + generated transport), or regenerate it.
//
//   node scripts/route.mjs               # print the current route, nights per city, trains and warnings
//   node scripts/route.mjs --regenerate  # fit nights / order / pins (same as the website button) and save data/route.json
import { createPlanner, regenerateRoute, findRoute, daysBetween } from '../planner.js';
import { loadAll, writeJSON } from './lib.mjs';

const d = loadAll();
const plan = () => createPlanner({ ...d, activities: d.activities });
let P = plan();

if (process.argv.includes('--regenerate')) {
  const res = regenerateRoute({ route: d.route, cities: d.cities, routes: d.routes, nights: P.itin.nights, arrDate: P.itin.arrDate });
  for (const r of res.report) console.log(`✨ ${r}`);
  if (res.ok) { d.route = { ...d.route, stops: res.stops }; writeJSON('data/route.json', d.route); console.log('Saved data/route.json\n'); P = plan(); }
}

const name = (id) => d.cities[id]?.name || id;
console.log(`Fly into ${name(d.route.arrival.city)} (${P.itin.arrDate}), home from ${name(d.route.departure.city)} (${P.itin.depDate}) · ${P.itin.assigned}/${P.itin.nights} nights assigned\n`);
for (const s of P.itin.stays) console.log(`  ${s.checkIn} → ${s.checkOut}  ${String(daysBetween(s.checkIn, s.checkOut)).padStart(2)}n  ${name(s.city).padEnd(14)} ${s.lodging?.name || ''}${s.lodging?.placeholder ? ' (to book)' : ''}`);
console.log('\nTransport:');
for (const t of P.itin.transport) console.log(`  ${t.from.time} → ${t.to.time}  ${t.title}${t.auto ? ' [generated]' : t.placeholder ? ' [placeholder]' : ' [booked]'}`);
const stops = d.route.stops;
const total = stops.reduce((m, s, i) => (i ? m + findRoute(d.routes, d.cities, stops[i - 1].city, s.city).minutes : m), 0);
console.log(`\nIntercity travel ≈ ${Math.round(total / 6) / 10}h`);
for (const p of P.itin.pinStatus) console.log(`📌 ${p.date} ${name(p.city)}: ${p.ok ? 'ok' : 'NOT satisfied'}`);
for (const w of P.itin.warnings) console.log(`⚠️  ${w}`);
