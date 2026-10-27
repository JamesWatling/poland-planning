// Shared helpers for the Node scripts: load every data file the website uses.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { TRANSPORT } from '../planner.js';

export const readJSON = (p, fallback) => {
  if (fallback !== undefined && !existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8'));
};
export const writeJSON = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

export function loadAll() {
  const trip = readJSON('data/trip.json');
  const cities = readJSON('data/cities.json');
  const routes = readJSON('data/routes.json', []);
  const route = readJSON('data/route.json');
  const prefs = readJSON('data/preferences.json', {});
  const transport = readJSON('data/transport.json', []);
  const activityFiles = Object.fromEntries(Object.entries(cities).filter(([, c]) => c.file).map(([id, c]) => [id, c.file]));
  const activities = Object.values(activityFiles).flatMap((f) => readJSON(f, []).map((a) => ({ ...a, _file: f })));
  return { trip, cities, routes, route, prefs, transport, activities, activityFiles };
}

export const isTransport = (it) => TRANSPORT.has(it.type);
