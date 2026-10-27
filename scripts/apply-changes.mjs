#!/usr/bin/env node
// Merges changes exported from the website ("Download changes" / "Copy changes") into the data files.
//
//   node scripts/apply-changes.mjs                 # applies every data/inbox/*.json, then moves them to data/inbox/applied/
//   node scripts/apply-changes.mjs path/to/x.json  # applies specific files
//
// Picks (status/date/start) and edits become part of the shared plan; new ideas are appended to their city file;
// an edited route or preferences replaces data/route.json / data/preferences.json.
import { readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readJSON, writeJSON, isTransport } from './lib.mjs';

const META = ['updatedBy', 'updatedAt'];
const cities = readJSON('data/cities.json');
const files = ['data/transport.json', ...Object.values(cities).map((c) => c.file).filter(Boolean)];
const data = Object.fromEntries(files.map((f) => [f, readJSON(f, [])]));
const fileFor = (it) => (isTransport(it) ? 'data/transport.json' : cities[it.city]?.file);
const find = (id) => { for (const f of files) { const i = data[f].findIndex((x) => x.id === id); if (i >= 0) return { f, i }; } return null; };

function clean(obj) {
  const out = { ...obj };
  for (const k of META) delete out[k];
  for (const [k, v] of Object.entries(out)) if (v === null || v === '') delete out[k];
  return out;
}

let inputs = process.argv.slice(2);
const fromInbox = !inputs.length;
if (fromInbox) inputs = existsSync('data/inbox') ? readdirSync('data/inbox').filter((f) => f.endsWith('.json')).map((f) => join('data/inbox', f)) : [];
if (!inputs.length) { console.log('Nothing to apply (data/inbox/ is empty).'); process.exit(0); }

const log = [];
for (const path of inputs) {
  const ch = readJSON(path);
  if (ch.type !== 'poland-planner-changes') { console.error(`${path}: not a planner export, skipped`); continue; }
  const who = ch.exportedBy || 'someone';
  for (const [id, patch] of Object.entries(ch.overrides || {})) {
    const hit = find(id);
    if (!hit) { log.push(`? ${id}: not found, skipped`); continue; }
    data[hit.f][hit.i] = clean({ ...data[hit.f][hit.i], ...patch });
    log.push(`~ ${id} (${who}): ${Object.keys(patch).filter((k) => !META.includes(k)).map((k) => `${k}=${JSON.stringify(patch[k])}`).join(', ')}`);
  }
  for (const added of ch.added || []) {
    const item = clean({ addedBy: who, ...added });
    const hit = find(item.id);
    if (hit) { data[hit.f][hit.i] = item; log.push(`~ ${item.id} (${who}): updated added idea`); continue; }
    const f = fileFor(item);
    if (!f) { log.push(`? ${item.id}: city "${item.city}" has no file, skipped`); continue; }
    data[f].push(item);
    log.push(`+ ${item.id} (${who}) → ${f}`);
  }
  if (ch.route?.data) { writeJSON('data/route.json', ch.route.data); log.push(`~ route.json replaced (${ch.route.updatedBy || who}): ${ch.route.data.stops.map((s) => `${s.city} ${s.nights}n`).join(' → ')}`); }
  if (ch.preferences?.data) { writeJSON('data/preferences.json', ch.preferences.data); log.push(`~ preferences.json replaced (${ch.preferences.updatedBy || who})`); }
}

for (const f of files) if (existsSync(f) || data[f].length) writeJSON(f, data[f]);
if (fromInbox) {
  mkdirSync('data/inbox/applied', { recursive: true });
  for (const p of inputs) renameSync(p, join('data/inbox/applied', basename(p)));
}
console.log(log.join('\n') || 'No changes.');
console.log('\nNow run: node scripts/validate.mjs');
