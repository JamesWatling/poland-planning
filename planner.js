// Pure planning logic (no DOM). Used by the website (app.js) and by scripts/validate.mjs.

export const TRANSPORT = new Set(['flight', 'train', 'bus', 'uber', 'taxi', 'car', 'ferry', 'transfer']);
export const ACTIVITY_TYPES = ['sight', 'museum', 'food', 'tour', 'daytrip', 'nature', 'event', 'nightlife', 'shopping', 'rest', 'other'];
export const STATUSES = ['idea', 'maybe', 'yes', 'no', 'planned', 'booked'];
export const SCHEDULED = new Set(['yes', 'planned', 'booked']);

// ---------- dates & time zones ----------

const dtf = {};
function parts(utc, tz) {
  const f = (dtf[tz] ||= new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }));
  const o = {};
  for (const p of f.formatToParts(new Date(utc))) o[p.type] = p.value;
  return o;
}

function offsetMin(tz, utc) {
  const p = parts(utc, tz);
  const asUtc = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return (asUtc - Math.floor(utc / 60000) * 60000) / 60000;
}

/** "2026-11-20T16:00" wall-clock time in `tz` -> UTC milliseconds. */
export function zonedToUtc(local, tz) {
  const [d, t = '00:00'] = local.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mi] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, dd, hh, mi);
  const first = guess - offsetMin(tz, guess) * 60000;
  return guess - offsetMin(tz, first) * 60000;
}

export const localDate = (utc, tz) => { const p = parts(utc, tz); return `${p.year}-${p.month}-${p.day}`; };
export const localHM = (utc, tz) => { const p = parts(utc, tz); return `${String(+p.hour % 24).padStart(2, '0')}:${p.minute}`; };
export const hmToMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function tripDays(trip) {
  const out = [];
  for (let d = trip.startDate; d <= trip.endDate; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- geography ----------

export const hasLoc = (p) => !!p && typeof p.lat === 'number' && typeof p.lng === 'number';

export function km(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

/** Rough door-to-door estimate. Straight-line distance x1.3 for real streets. */
export function estimateLeg(a, b, currency = 'PLN') {
  const d = km(a, b) * 1.3;
  if (d < 0.15) return null;
  const opts = {
    walk: (d / 4.8) * 60,
    transit: d > 40 ? (d / 50) * 60 + 20 : (d / 16) * 60 + 10,
    uber: d > 40 ? (d / 65) * 60 + 10 : (d / 25) * 60 + 6,
  };
  const best = d <= 1.6 ? 'walk' : d <= 7 ? 'transit' : 'uber';
  const fare = currency === 'USD' ? Math.round(6 + d * 1.6) : Math.round(8 + d * 3);
  return { km: d, best, min: Math.round(opts[best]), opts, fare, currency };
}

// ---------- the planner ----------

export function createPlanner(trip, items) {
  const set = trip.settings;
  const city = (id) => trip.cities[id] || { name: id || '?', short: '?', tz: 'Europe/Warsaw', currency: 'PLN', color: '#888' };
  const nightStay = (d) => trip.stays.find((s) => s.checkIn <= d && d < s.checkOut);
  const locOf = (it) => (hasLoc(it) ? { lat: it.lat, lng: it.lng, name: it.title, address: it.address } : null);
  const isTransport = (it) => TRANSPORT.has(it.type);

  function timing(it) {
    if (it.from?.time && it.to?.time) {
      return { s: zonedToUtc(it.from.time, it.from.tz), e: zonedToUtc(it.to.time, it.to.tz), sTz: it.from.tz, eTz: it.to.tz };
    }
    if (!it.date || !it.start) return null;
    const tz = city(it.city).tz;
    const s = zonedToUtc(`${it.date}T${it.start}`, tz);
    return { s, e: s + (it.duration || 60) * 60000, sTz: tz, eTz: tz };
  }

  function stayFor(date) {
    const evening = nightStay(date);
    const morning = nightStay(addDays(date, -1)) || evening;
    return { morning, evening: evening || morning };
  }

  function dayInfo(date) {
    const { morning, evening } = stayFor(date);
    const mTz = city(morning.city).tz, eTz = city(evening.city).tz;
    const w0 = zonedToUtc(`${date}T00:00`, mTz), w1 = zonedToUtc(`${addDays(date, 1)}T00:00`, eTz);
    const currency = city(evening.city).currency;

    const scheduled = items
      .filter((it) => SCHEDULED.has(it.status))
      .map((it) => ({ it, t: timing(it) }))
      .filter((x) => x.t && x.t.e > w0 && x.t.s < w1)
      .sort((a, b) => a.t.s - b.t.s);

    // Travel legs between consecutive places: lodging -> items -> lodging.
    const legs = [];
    const pushLeg = (from, to, prevEnd, nextStart, before) => {
      if (!hasLoc(from) || !hasLoc(to)) return;
      const est = estimateLeg(from, to, currency);
      if (!est || est.km > 400) return;
      const gap = prevEnd != null && nextStart != null ? (nextStart - prevEnd) / 60000 : null;
      legs.push({ before, from, to, est, gap, tight: gap != null && gap < est.min });
    };
    let prevLoc = morning.lodging, prevEnd = null;
    scheduled.forEach((x, i) => {
      if (x.t.s >= w0) pushLeg(prevLoc, x.it.from || locOf(x.it), prevEnd, x.t.s, i);
      prevLoc = x.it.to || locOf(x.it);
      prevEnd = x.t.e;
    });
    pushLeg(prevLoc, evening.lodging, prevEnd, null, scheduled.length);

    // Totals
    const clip = (t) => Math.max(0, (Math.min(t.e, w1) - Math.max(t.s, w0)) / 60000);
    let activity = 0, transport = 0;
    for (const x of scheduled) isTransport(x.it) ? (transport += clip(x.t)) : (activity += clip(x.t));
    const legMin = legs.reduce((n, l) => n + l.est.min, 0);
    const awake = hmToMin(set.dayEnd) - hmToMin(set.dayStart);
    const rest = Math.max(0, awake - activity - transport - legMin);

    let usd = 0, unpriced = 0;
    for (const x of scheduled) {
      if (localDate(x.t.s, x.t.sTz) !== date) continue;
      const p = x.it.price;
      if (!p || p.amount == null) { if (!isTransport(x.it) || x.it.type === 'flight') unpriced++; continue; }
      usd += p.amount * (set.fxToUSD[p.currency] ?? 0);
    }
    const rides = legs.filter((l) => l.est.best === 'uber');
    const ridesUsd = rides.reduce((n, l) => n + l.est.fare * (set.fxToUSD[l.est.currency] ?? 0), 0);

    // Warnings
    const warnings = [];
    scheduled.forEach((x, i) => {
      const prev = scheduled[i - 1];
      if (prev && x.t.s < prev.t.e) warnings.push(`“${x.it.title}” overlaps “${prev.it.title}”.`);
      if (x.t.s < w0) return;
      const sHM = localHM(x.t.s, x.t.sTz), eHM = localHM(x.t.e, x.t.eTz);
      const endsNextDay = localDate(x.t.e, x.t.eTz) !== localDate(x.t.s, x.t.sTz);
      if (sHM < set.earliest) warnings.push(`Early start: “${x.it.title}” at ${sHM}.`);
      if (!isTransport(x.it) && (eHM > set.latest || endsNextDay)) warnings.push(`Late finish: “${x.it.title}” ends ${eHM}.`);
      if (x.it.hours && !isTransport(x.it) && (sHM < x.it.hours.open || eHM > x.it.hours.close || endsNextDay)) {
        warnings.push(`“${x.it.title}” is outside its usual hours (${x.it.hours.open}–${x.it.hours.close}).`);
      }
    });
    for (const l of legs) {
      if (l.tight) warnings.push(`Tight: about ${Math.round(l.est.min)} min to get to ${l.to.name || 'the next stop'}, but only ${Math.max(0, Math.round(l.gap))} min free.`);
    }
    if (activity > set.maxActivityMinutes) warnings.push(`Packed day: ${Math.round(activity / 60 * 10) / 10}h of activities (aim for ≤ ${set.maxActivityMinutes / 60}h).`);
    else if (activity > 0 && rest < set.minRestMinutes) warnings.push('Not much downtime today. Consider dropping something.');

    const cities = [...new Set([morning.city, evening.city])];
    return { date, morning, evening, mTz, eTz, w0, w1, items: scheduled, legs, activity, transport, legMin, rest, usd, unpriced, ridesUsd, warnings, cities };
  }

  /** Best start time for `it` on `date`: its preferred time, or the next gap that fits (with travel). */
  function findSlot(it, date, pref) {
    const tz = city(it.city).tz;
    const dur = (it.duration || 60) * 60000;
    const loc = locOf(it);
    const busy = dayInfo(date).items
      .filter((x) => x.it.id !== it.id)
      .map((x) => ({ s: x.t.s, e: x.t.e, a: x.it.from || locOf(x.it), b: x.it.to || locOf(x.it) }));
    const travel = (p, q) => {
      if (!hasLoc(p) || !hasLoc(q)) return 15 * 60000;
      return Math.max(10, estimateLeg(p, q)?.min || 0) * 60000;
    };
    const q15 = (t) => Math.ceil(t / 900000) * 900000;
    // Stay inside the day's sensible hours and, if known, the place's opening hours.
    const open = it.hours && it.hours.open > set.earliest ? it.hours.open : set.earliest;
    const close = it.hours && it.hours.close < set.latest ? it.hours.close : set.latest;
    const earliest = zonedToUtc(`${date}T${open}`, tz), latest = zonedToUtc(`${date}T${close}`, tz);
    const want = zonedToUtc(`${date}T${pref || it.start || it.suggestedStart || '10:00'}`, tz);
    const tryFrom = (start) => {
      let s = start;
      for (let i = 0; i < 50; i++) {
        const c = busy.find((x) => s < x.e + travel(x.b, loc) && s + dur + travel(loc, x.a) > x.s);
        if (!c) return s + dur <= latest ? s : null;
        s = q15(c.e + travel(c.b, loc));
      }
      return null;
    };
    let s = tryFrom(Math.max(want, earliest));
    if (s == null) s = tryFrom(earliest);
    if (s == null) return { start: localHM(want, tz), conflict: true, shifted: false };
    return { start: localHM(s, tz), conflict: false, shifted: s !== want };
  }

  /** Undecided ideas for the city/cities of `date`, best matches first. */
  function deckFor(date) {
    const cities = new Set(dayInfo(date).cities);
    const rank = (it) => (it.suggestedDate === date ? 0 : it.suggestedDate ? 3 : it.status === 'maybe' ? 2 : 1);
    return items
      .filter((it) => !isTransport(it) && cities.has(it.city) && (!it.status || it.status === 'idea' || it.status === 'maybe'))
      .sort((a, b) => rank(a) - rank(b) || (a.suggestedStart || '99').localeCompare(b.suggestedStart || '99'));
  }

  const daysInCity = (cityId) => tripDays(trip).filter((d) => { const s = stayFor(d); return s.morning.city === cityId || s.evening.city === cityId; });

  return { city, nightStay, stayFor, locOf, isTransport, timing, dayInfo, findSlot, deckFor, daysInCity };
}
