#!/usr/bin/env node
// Prints a research brief for one city: who we are, what we like/avoid, which days we're there,
// and every idea already in the database (incl. rejected ones) so research never duplicates or re-suggests them.
//
//   node scripts/brief.mjs krakow
//   node scripts/brief.mjs            # lists cities on the route and how many ideas each has
import { createPlanner, tripDays, prefMatch } from '../planner.js';
import { loadAll } from './lib.mjs';

const d = loadAll();
const P = createPlanner(d);
const cityId = process.argv[2];

if (!cityId) {
  console.log('Cities on the route (ideas: total / undecided / yes / maybe / no):');
  const onRoute = [...new Set(d.route.stops.map((s) => s.city))];
  for (const [id, c] of Object.entries(d.cities).filter(([, c]) => c.kind === 'city')) {
    const a = d.activities.filter((x) => x.city === id);
    const n = (st) => a.filter((x) => (x.status || 'idea') === st).length;
    console.log(`  ${onRoute.includes(id) ? '●' : '○'} ${id.padEnd(10)} ${String(a.length).padStart(3)} / ${n('idea')} / ${n('yes')} / ${n('maybe')} / ${n('no')}   days: ${P.daysInCity(id).length}`);
  }
  console.log('\nRun: node scripts/brief.mjs <city>');
  process.exit(0);
}

const c = d.cities[cityId];
if (!c) { console.error(`Unknown city "${cityId}". Known: ${Object.keys(d.cities).join(', ')}`); process.exit(1); }
const days = P.daysInCity(cityId);
const stays = P.itin.stays.filter((s) => s.city === cityId);
const mine = d.activities.filter((a) => a.city === cityId);
const by = (st) => mine.filter((a) => (a.status || 'idea') === st);

const out = [];
out.push(`# Research brief: ${c.name}`);
out.push(`File to edit: ${c.file}   (schema: data/AGENTS.md)`);
out.push(`\n## When we're there`);
out.push(stays.length ? stays.map((s) => `- ${s.checkIn} → ${s.checkOut}, lodging: ${s.lodging.name}${s.lodging.placeholder ? ' (not booked)' : ''}`).join('\n') : '- Not on the route yet (research anyway, for planning).');
if (days.length) out.push(`- Days touching ${c.name}: ${days.join(', ')}`);
out.push(`- Season: late Nov – early Dec. Cold (~0 °C), sunset ~15:30–15:50, Christmas markets open. Prefer indoor/evening-friendly things.`);
out.push(`\n## Who we are`);
for (const t of d.prefs.travelers || []) out.push(`- ${t.name}${(t.diet || []).length ? ` (diet: ${t.diet.join(', ')})` : ''}${t.notes ? `: ${t.notes}` : ''}`);
out.push(`- Interests (find more of these): ${(d.prefs.interests || []).join(', ') || '–'}`);
out.push(`- AVOID (never suggest): ${(d.prefs.avoid || []).join(', ') || '–'}`);
for (const f of d.prefs.flexible || []) out.push(`- Flexible: ${f}`);
out.push(`\n## Already in the database (${mine.length}). Don't duplicate these.`);
for (const [st, label] of [['yes', 'YES (planned)'], ['maybe', 'MAYBE'], ['idea', 'Undecided'], ['no', 'REJECTED: never re-add these or close variants']]) {
  const l = by(st);
  if (l.length) out.push(`${label}:\n${l.map((a) => `  - ${a.id}: ${a.title} [${a.type}]${prefMatch(a, d.prefs).love.length ? ' ⭐' : ''}`).join('\n')}`);
}
const types = Object.entries(mine.reduce((m, a) => ({ ...m, [a.type]: (m[a.type] || 0) + 1 }), {})).map(([k, v]) => `${k}:${v}`).join(' ');
out.push(`\nType mix so far: ${types || 'none'}`);
out.push(`\n## Task`);
out.push(`Target about ${Math.max(10, days.length * 4)} total ideas for ${c.name} (${Math.max(0, Math.max(10, days.length * 4) - mine.length)} more), weighted to our interests, with`);
out.push(`at least ${Math.max(3, days.length)} vegan-friendly food places if anyone is vegan. Fill gaps in the type mix. Verify facts online; set "approx": true on prices.`);
console.log(out.join('\n'));
