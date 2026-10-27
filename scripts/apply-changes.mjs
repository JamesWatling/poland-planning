#!/usr/bin/env node
// Merges changes exported from the website ("Download changes" / "Copy changes") into the data files.
//
//   node scripts/apply-changes.mjs                 # applies every data/inbox/*.json, then moves them to data/inbox/applied/
//   node scripts/apply-changes.mjs path/to/x.json  # applies specific files
//
// Picks (status/date/start) and edits become part of the shared plan; new ideas are appended to their city file.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { TRANSPORT } from '../planner.js';

const META = ['updatedBy', 'updatedAt'];
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const writeJSON = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

const trip = readJSON('data/trip.json');
const fileFor = (it) => (TRANSPORT.has(it.type) ? trip.transportFile : trip.cities[it.city]?.file);
const files = [trip.transportFile, ...Object.values(trip.cities).map((c) => c.file)].filter(Boolean);
const data = Object.fromEntries(files.map((f) => [f, readJSON(f)]));
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
    const merged = { ...data[hit.f][hit.i], ...patch };
    data[hit.f][hit.i] = clean(merged);
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
}

for (const f of files) writeJSON(f, data[f]);
if (fromInbox) {
  mkdirSync('data/inbox/applied', { recursive: true });
  for (const p of inputs) renameSync(p, join('data/inbox/applied', basename(p)));
}
console.log(log.join('\n') || 'No changes.');
console.log('\nNow run: node scripts/validate.mjs');
