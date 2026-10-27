#!/usr/bin/env node
// Merges changes saved from the website into the data files.
//
//   node scripts/apply-changes.mjs                 # applies every data/inbox/*.json (oldest first)
//   node scripts/apply-changes.mjs path/to/x.json  # applies specific files (e.g. a "Download changes" export)
//
// Each batch is validated on its own: if it would break the data it is rolled back and moved to data/inbox/failed/.
// Results are recorded in data/sync.json, which the website polls to know when a save is live.
// Picks and edits update the activity files; new ideas are appended to their city file;
// an edited route or preferences replaces data/route.json / data/preferences.json.
import { readdirSync, mkdirSync, renameSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJSON, writeJSON, isTransport } from './lib.mjs';

const META = ['updatedBy', 'updatedAt'];
const cities = readJSON('data/cities.json');
const files = ['data/transport.json', 'data/route.json', 'data/preferences.json', ...Object.values(cities).map((c) => c.file).filter(Boolean)];

function clean(obj) {
  const out = { ...obj };
  for (const k of META) delete out[k];
  for (const [k, v] of Object.entries(out)) if (v === null || v === '') delete out[k];
  return out;
}

function applyBatch(ch) {
  const lists = Object.fromEntries(files.filter((f) => f.includes('/activities/') || f.endsWith('transport.json')).map((f) => [f, readJSON(f, [])]));
  const find = (id) => { for (const f of Object.keys(lists)) { const i = lists[f].findIndex((x) => x.id === id); if (i >= 0) return { f, i }; } return null; };
  const fileFor = (it) => (isTransport(it) ? 'data/transport.json' : cities[it.city]?.file);
  const who = ch.exportedBy || 'someone';
  const log = [];
  for (const [id, patch] of Object.entries(ch.overrides || {})) {
    const hit = find(id);
    if (!hit) { log.push(`? ${id}: not found, skipped`); continue; }
    lists[hit.f][hit.i] = clean({ ...lists[hit.f][hit.i], ...patch });
    log.push(`~ ${id} (${patch.updatedBy || who}): ${Object.keys(patch).filter((k) => !META.includes(k)).map((k) => `${k}=${JSON.stringify(patch[k])}`).join(', ')}`);
  }
  for (const added of ch.added || []) {
    const item = clean({ addedBy: who, ...added });
    const hit = find(item.id);
    if (hit) { lists[hit.f][hit.i] = item; log.push(`~ ${item.id} (${who}): updated added idea`); continue; }
    const f = fileFor(item);
    if (!f || !lists[f]) { log.push(`? ${item.id}: city "${item.city}" has no file, skipped`); continue; }
    lists[f].push(item);
    log.push(`+ ${item.id} (${who}) → ${f}`);
  }
  for (const [f, v] of Object.entries(lists)) writeJSON(f, v);
  if (ch.route?.data) { writeJSON('data/route.json', ch.route.data); log.push(`~ route (${ch.route.updatedBy || who}): ${ch.route.data.stops.map((s) => `${s.city} ${s.nights}n`).join(' → ')}`); }
  if (ch.preferences?.data) { writeJSON('data/preferences.json', ch.preferences.data); log.push(`~ preferences (${ch.preferences.updatedBy || who})`); }
  return log;
}

let inputs = process.argv.slice(2);
const fromInbox = !inputs.length;
if (fromInbox) inputs = existsSync('data/inbox') ? readdirSync('data/inbox').filter((f) => f.endsWith('.json')).sort().map((f) => join('data/inbox', f)) : [];
if (!inputs.length) { console.log('Nothing to apply (data/inbox/ is empty).'); process.exit(0); }

const sync = readJSON('data/sync.json', { applied: [], failed: [] });
for (const path of inputs) {
  const name = basename(path);
  let ch;
  try { ch = readJSON(path); } catch (e) { ch = null; }
  const snapshot = Object.fromEntries(files.filter(existsSync).map((f) => [f, readFileSync(f, 'utf8')]));
  let log = [], errors = [];
  if (ch?.type !== 'poland-planner-changes') errors = ['Not a planner export.'];
  else {
    log = applyBatch(ch);
    const v = spawnSync(process.execPath, ['scripts/validate.mjs'], { encoding: 'utf8' });
    if (v.status !== 0) errors = v.stdout.split('\n').filter((l) => l.includes('ERROR')).map((l) => l.replace(/^\s*ERROR\s*/, ''));
  }
  if (errors.length) {
    for (const [f, text] of Object.entries(snapshot)) writeFileSync(f, text); // roll back
    console.log(`✗ ${name}: rejected\n  ${errors.join('\n  ')}`);
    sync.failed.unshift({ file: name, errors: errors.slice(0, 10), at: new Date().toISOString() });
    if (fromInbox) { mkdirSync('data/inbox/failed', { recursive: true }); renameSync(path, join('data/inbox/failed', name)); }
  } else {
    console.log(`✓ ${name}\n  ${log.join('\n  ') || 'no changes'}`);
    sync.applied.unshift(name);
    if (fromInbox) { mkdirSync('data/inbox/applied', { recursive: true }); renameSync(path, join('data/inbox/applied', name)); }
  }
}
sync.applied = sync.applied.slice(0, 200);
sync.failed = sync.failed.slice(0, 50);
sync.updatedAt = new Date().toISOString();
writeJSON('data/sync.json', sync);
