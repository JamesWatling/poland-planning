// Pure planning logic (no DOM). Used by the website (app.js) and by the scripts in /scripts.

export const TRANSPORT = new Set(['flight', 'train', 'bus', 'uber', 'taxi', 'car', 'ferry', 'transfer']);
export const ACTIVITY_TYPES = ['sight', 'museum', 'food', 'tour', 'daytrip', 'nature', 'event', 'nightlife', 'shopping', 'rest', 'other'];
export const STATUSES = ['idea', 'maybe', 'yes', 'no', 'planned', 'booked'];
export const SCHEDULED = new Set(['yes', 'planned', 'booked']);
export const VEGAN = ['great', 'options', 'limited', 'none', 'unknown'];
export const DOG = ['yes', 'carrier', 'no', 'unknown'];

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
export const localISO = (utc, tz) => `${localDate(utc, tz)}T${localHM(utc, tz)}`;
export const hmToMin = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

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

/** Rough door-to-door estimate within a city. Straight-line distance x1.3 for real streets. */
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

/** Minutes to be at the station/airport before departure (international flights ~2.5–3h). */
export const bufferMinutes = (it) => (it.type === 'flight' ? it.checkInMinutes ?? 150 : it.type === 'train' || it.type === 'bus' ? it.checkInMinutes ?? 15 : 0);
/** When we must be at the start point of `it` (its start minus the check-in buffer). */
export const readyBy = (it, t) => t.s - bufferMinutes(it) * 60000;

// ---------- cities & routes ----------

const FALLBACK_CITY = { name: '?', short: '?', tz: 'Europe/Warsaw', currency: 'PLN', color: '#888' };

/** Fastest known connection between two catalog cities, or a distance-based estimate. */
export function findRoute(routes, cities, a, b) {
  if (a === b) return { mode: 'none', minutes: 0 };
  const known = routes.filter((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)).sort((x, y) => x.minutes - y.minutes)[0];
  if (known) return known;
  const A = cities[a], B = cities[b];
  if (!hasLoc(A) || !hasLoc(B)) return { mode: 'train', minutes: 240, estimated: true };
  return { mode: 'train', minutes: Math.round((km(A, B) * 1.25 / 90) * 60 + 30), estimated: true, notes: 'Estimated from distance; no timetable data yet.' };
}

/**
 * Turn route.json (arrival, stops, departure) into nightly stays and the transport that connects them.
 * Booked transport in transport.json with a matching `role` replaces the generated placeholder.
 */
export function buildItinerary({ trip, cities, routes, route, transport }) {
  const city = (id) => cities[id] || { ...FALLBACK_CITY, name: id };
  const home = trip.home;
  const homeTz = city(home.city).tz;
  // The gateway is where we fly from (LA), reached by car from home (St. George); without one, home is the airport city.
  const gw = trip.gateway || { city: home.city, airport: home.airport };
  const gwTz = city(gw.city).tz;
  const airport = { ...gw.airport, tz: gwTz };
  const homePlace = { name: home.name, address: home.address, lat: home.lat, lng: home.lng, tz: homeTz };
  const byRole = Object.fromEntries(transport.filter((t) => t.role).map((t) => [t.role, t]));
  const warnings = [];
  const placeOf = (id, kind) => ({ ...(city(id)[kind] || city(id).station || { name: city(id).name, lat: city(id).lat, lng: city(id).lng }), tz: city(id).tz });
  const derived = [];

  const arrCity = route.arrival.city, depCity = route.departure.city;
  const outbound = byRole.outbound || {
    id: 'auto-outbound', role: 'outbound', type: 'flight', auto: true, placeholder: true, status: 'planned', city: 'transit',
    title: `Flight ${airport.code} → ${city(arrCity).name}`,
    description: 'Placeholder times from data/route.json. Once booked, add the real flight to data/transport.json with "role": "outbound".',
    from: { ...airport, time: route.arrival.flight.depart },
    to: { ...placeOf(arrCity, 'airport'), time: route.arrival.flight.arrive },
    price: null,
  };
  const inbound = byRole.return || {
    id: 'auto-return', role: 'return', type: 'flight', auto: true, placeholder: true, status: 'planned', city: depCity,
    title: `Flight ${city(depCity).name} → ${airport.code}`,
    description: 'Placeholder times from data/route.json. Once booked, add the real flight to data/transport.json with "role": "return". Be at the airport about 2.5h before.',
    from: { ...placeOf(depCity, 'airport'), time: route.departure.flight.depart },
    to: { ...airport, time: route.departure.flight.arrive },
    price: null,
  };
  if (!byRole.outbound) derived.push(outbound);
  if (!byRole.return) derived.push(inbound);

  const leaveHome = outbound.from.time.slice(0, 10), arrDate = outbound.to.time.slice(0, 10);
  const depDate = inbound.from.time.slice(0, 10), backHome = inbound.to.time.slice(0, 10);
  const nights = daysBetween(arrDate, depDate);

  // Stays (one per night)
  const stays = [];
  const homeLodging = { name: home.name, address: home.address, lat: home.lat, lng: home.lng, placeholder: home.placeholder };
  const driveOut = gw.toGateway, driveBack = gw.fromGateway;
  const driveOutDate = driveOut ? driveOut.depart.slice(0, 10) : leaveHome;
  const driveBackDate = driveBack ? driveBack.depart.slice(0, 10) : backHome;
  const gwLodging = gw.lodging || { name: city(gw.city).name };
  if (trip.startDate < driveOutDate) stays.push({ id: 'home-before', city: home.city, checkIn: trip.startDate, checkOut: driveOutDate, lodging: homeLodging });
  if (driveOutDate < leaveHome) stays.push({ id: 'gateway-out', city: gw.city, checkIn: driveOutDate, checkOut: leaveHome, lodging: gwLodging });
  if (leaveHome < arrDate) stays.push({ id: 'transit-out', city: 'transit', checkIn: leaveHome, checkOut: arrDate, lodging: { name: 'Overnight flight' } });
  let d = arrDate;
  const stopStays = [];
  route.stops.forEach((s, i) => {
    if (d >= depDate) { warnings.push(`${city(s.city).name} doesn't fit: the trip is out of nights.`); return; }
    let out = addDays(d, s.nights);
    if (out > depDate) { warnings.push(`${city(s.city).name} cut to ${daysBetween(d, depDate)} night(s) to fit before the flight home.`); out = depDate; }
    const area = (city(s.city).stayAreas || []).find((a) => a.id === s.area) || (city(s.city).stayAreas || [])[0];
    const lodging = s.lodging || {
      name: `Stay in ${area ? area.name : city(s.city).name}`, address: `${area ? area.name + ', ' : ''}${city(s.city).name} (to book)`,
      lat: area?.lat ?? city(s.city).lat, lng: area?.lng ?? city(s.city).lng, placeholder: true,
    };
    const stay = { id: `stop-${i}`, stopIndex: i, city: s.city, area: area?.id, checkIn: d, checkOut: out, lodging };
    stays.push(stay);
    stopStays.push(stay);
    d = out;
  });
  if (d < depDate) {
    stays.push({ id: 'unplanned', city: 'unplanned', checkIn: d, checkOut: depDate, lodging: { name: 'Not planned yet' } });
    warnings.push(`${daysBetween(d, depDate)} night(s) aren't assigned to a city yet.`);
  }
  if (depDate < backHome) stays.push({ id: 'transit-back', city: 'transit', checkIn: depDate, checkOut: backHome, lodging: { name: 'Overnight flight' } });
  if (backHome < driveBackDate) stays.push({ id: 'gateway-back', city: gw.city, checkIn: backHome, checkOut: driveBackDate, lodging: gwLodging });
  if (driveBackDate <= trip.endDate) stays.push({ id: 'home-after', city: home.city, checkIn: driveBackDate, checkOut: addDays(trip.endDate, 1), lodging: homeLodging });

  // Drives between home and the gateway
  const drive = (role, leg, from, to, title) => {
    if (!leg || byRole[role]) return;
    const s = zonedToUtc(leg.depart, from.tz);
    derived.push({
      id: `auto-${role}`, role, type: leg.mode || 'car', auto: true, placeholder: true, status: 'planned', city: home.city, title,
      description: `${leg.notes ? leg.notes + ' ' : ''}Placeholder: change the time in data/trip.json → gateway, or add a booked item with "role": "${role}".`,
      from: { ...from, time: leg.depart }, to: { ...to, time: localISO(s + leg.minutes * 60000, to.tz) },
      price: { amount: 70, currency: 'USD', per: 'group', approx: true },
    });
  };
  const gwPlace = { ...gwLodging, tz: gwTz, name: gwLodging.name };
  drive('to-gateway', driveOut, homePlace, gwPlace, `Drive ${city(home.city).name} → ${city(gw.city).name}`);
  drive('from-gateway', driveBack, gwPlace, homePlace, `Drive ${city(gw.city).name} → ${city(home.city).name}`);

  // Ground transport between cities
  const travelAt = route.defaultTravelTime || '10:30';
  const groundLeg = (role, a, b, fromPlace, toPlace, departUtc) => {
    if (byRole[role]) return;
    const r = findRoute(routes, cities, a, b);
    const extra = fromPlace === 'airport' || toPlace === 'airport' ? 30 : 0;
    const from = placeOf(a, fromPlace), to = placeOf(b, toPlace);
    const arriveUtc = departUtc + (r.minutes + extra) * 60000;
    const type = r.mode === 'bus' ? 'bus' : 'train';
    derived.push({
      id: `auto-${role}`, role, type, auto: true, placeholder: true, status: 'planned', city: a,
      title: `${type === 'bus' ? 'Bus' : 'Train'} ${city(a).name} → ${city(b).name}`,
      description: `${r.notes ? r.notes + ' ' : ''}Generated from the route (${r.estimated ? 'estimated' : 'typical'} time). Once booked, add it to data/transport.json with "role": "${role}".`,
      from: { ...from, time: localISO(departUtc, from.tz) }, to: { ...to, time: localISO(arriveUtc, to.tz) },
      price: r.price ? { ...r.price, per: 'person', approx: true } : null,
    });
  };
  if (stopStays.length && stopStays[0].city !== arrCity) {
    groundLeg(`arrival>${stopStays[0].city}`, arrCity, stopStays[0].city, 'airport', 'station', zonedToUtc(outbound.to.time, outbound.to.tz) + 90 * 60000);
  }
  for (let i = 1; i < stopStays.length; i++) {
    const a = stopStays[i - 1].city, b = stopStays[i].city;
    if (a !== b) groundLeg(`${a}>${b}`, a, b, 'station', 'station', zonedToUtc(`${stopStays[i].checkIn}T${travelAt}`, city(a).tz));
  }
  const last = stopStays.at(-1);
  if (last && last.city !== depCity) {
    const r = findRoute(routes, cities, last.city, depCity);
    const mustArrive = zonedToUtc(inbound.from.time, inbound.from.tz) - 150 * 60000;
    groundLeg(`${last.city}>departure`, last.city, depCity, 'station', 'airport', mustArrive - (r.minutes + 30) * 60000);
  }

  // Day pins
  const nightCity = (date) => stays.find((s) => s.checkIn <= date && date < s.checkOut)?.city;
  const pinStatus = (route.pins || []).map((p) => {
    const morning = nightCity(addDays(p.date, -1)), evening = nightCity(p.date);
    const ok = p.date === arrDate ? evening === p.city : p.date === depDate ? morning === p.city : morning === p.city && evening === p.city;
    if (!ok) warnings.push(`Pinned: ${city(p.city).name} on ${p.date}, but the route doesn't have you there all day.`);
    return { ...p, ok };
  });

  const assigned = route.stops.reduce((n, s) => n + s.nights, 0);
  const homeStart = { id: 'home-start', city: home.city, lodging: homeLodging }; // where day one begins
  return { stays, homeStart, transport: [...derived, ...transport], warnings, arrDate, depDate, nights, assigned, pinStatus, outbound, inbound };
}

/**
 * Re-plan the route: keep arrival and departure cities at the ends, optionally reorder the middle stops
 * to minimise train time, and choose nights per stop (close to what was asked) that add up exactly and satisfy pins.
 */
export function regenerateRoute({ route, cities, routes, nights, arrDate }) {
  const report = [];
  const city = (id) => cities[id] || { ...FALLBACK_CITY, name: id };
  let stops = route.stops.map((s) => ({ ...s }));
  const want = (s) => s.nights || city(s.city).nights?.ideal || 2;
  const { city: A } = route.arrival, { city: D } = route.departure;

  // Arrival city first, departure city last.
  if (stops[0]?.city !== A) {
    const i = stops.findIndex((s) => s.city === A);
    if (i > 0 && !(A === D && i === stops.length - 1 && stops.length > 1)) stops.unshift(...stops.splice(i, 1));
    else { stops.unshift({ city: A, nights: city(A).nights?.min || 1 }); report.push(`Added ${city(A).name} at the start (you fly in there).`); }
  }
  if (stops.length < 2 || stops.at(-1).city !== D) {
    const i = stops.findIndex((s, k) => k > 0 && s.city === D);
    if (i > 0) stops.push(...stops.splice(i, 1));
    else { stops.push({ city: D, nights: 1, area: stops.find((s) => s.city === D)?.area }); report.push(`Added 1 night in ${city(D).name} at the end so you're there for the flight home.`); }
  }

  const pins = (route.pins || []).map((p) => ({ ...p, t: daysBetween(arrDate, p.date) })).filter((p) => p.t >= 0 && p.t <= nights);
  const pinOk = (S, n, t) => (t === 0 ? S === 0 : t === nights ? S <= nights - 1 && nights - 1 < S + n : S <= t - 1 && t <= S + n - 1);

  function allocate(order, usePins) {
    const P = usePins ? pins : [];
    const full = (1 << P.length) - 1;
    const memo = new Map();
    const ranges = order.map((s) => (s.lockNights ? [s.nights, s.nights] : [1, Math.max(want(s) * 2, city(s.city).nights?.max || 3)]));
    const best = (k, S, mask) => {
      if (k === order.length) return S === nights && mask === full ? { cost: 0, ns: [] } : null;
      const key = `${k},${S},${mask}`;
      if (memo.has(key)) return memo.get(key);
      let res = null;
      for (let n = ranges[k][0]; n <= ranges[k][1] && S + n <= nights; n++) {
        let m = mask;
        P.forEach((p, i) => { if (p.city === order[k].city && pinOk(S, n, p.t)) m |= 1 << i; });
        const rest = best(k + 1, S + n, m);
        if (!rest) continue;
        const cost = (n - want(order[k])) ** 2 + rest.cost;
        if (!res || cost < res.cost) res = { cost, ns: [n, ...rest.ns] };
      }
      memo.set(key, res);
      return res;
    };
    return best(0, 0, 0);
  }
  const travel = (order) => order.reduce((m, s, i) => (i ? m + findRoute(routes, cities, order[i - 1].city, s.city).minutes : m), 0);

  const middle = stops.slice(1, -1);
  const orders = [];
  if (route.optimizeOrder && middle.length > 1 && middle.length <= 7) {
    const perm = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perm([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
    for (const p of perm(middle)) orders.push([stops[0], ...p, stops.at(-1)]);
  } else orders.push(stops);

  const solve = (usePins) => {
    let bestPick = null;
    for (const o of orders) {
      const a = allocate(o, usePins);
      if (!a) continue;
      const score = travel(o) / 60 + a.cost * 2;
      if (!bestPick || score < bestPick.score) bestPick = { order: o, ns: a.ns, score };
    }
    return bestPick;
  };
  let pick = solve(true);
  if (!pick && pins.length) { report.push('Could not satisfy every pinned day. Ignored the pins; try changing them or the cities.'); pick = solve(false); }
  if (!pick) return { stops: route.stops, report: ['No valid plan: too many cities (or locked nights) for the nights available.'], ok: false };

  const newStops = pick.order.map((s, i) => ({ ...s, nights: pick.ns[i] }));
  const changes = newStops.filter((s, i) => s.nights !== want(stops[stops.indexOf(pick.order[i])])).map((s) => `${city(s.city).name} ${s.nights}n`);
  if (route.optimizeOrder && pick.order.some((s, i) => s !== stops[i])) report.push(`Reordered to save train time: ${newStops.map((s) => city(s.city).name).join(' → ')}.`);
  if (changes.length) report.push(`Adjusted nights: ${changes.join(', ')}.`);
  report.push(`Total intercity travel: about ${Math.round(travel(newStops) / 6) / 10}h.`);
  return { stops: newStops, report, ok: true };
}

// ---------- preferences ----------

/** How an item matches our interests, dislikes, diet and dog. */
export function prefMatch(it, prefs) {
  if (!prefs) return { love: [], avoid: [], diet: null, dog: null, excluded: false };
  const text = [it.title, it.description, it.type, it.notes, ...(it.tags || [])].join(' ').toLowerCase();
  const has = (kw) => { const k = kw.toLowerCase().trim(); return k && (text.includes(k) || (k.length > 4 && k.endsWith('s') && text.includes(k.slice(0, -1)))); };
  const avoid = (prefs.avoid || []).filter(has);
  const love = (prefs.interests || []).filter(has);
  const vegan = (prefs.travelers || []).some((t) => (t.diet || []).map((x) => x.toLowerCase()).includes('vegan'));
  const diet = vegan && it.type === 'food' ? it.vegan || 'unknown' : null;
  // With a dog, "no dogs" isn't a hard exclude (one of us can walk the dog), just flagged.
  const dog = (prefs.pets || []).length && !TRANSPORT.has(it.type) ? it.dog || 'unknown' : null;
  return { love, avoid, diet, dog, excluded: avoid.length > 0 || diet === 'none' };
}

// ---------- the day planner ----------

export function createPlanner({ trip, cities, routes, route, prefs, activities, transport }) {
  const set = trip.settings;
  const itin = buildItinerary({ trip, cities, routes, route, transport });
  const items = [...activities, ...itin.transport];
  const city = (id) => cities[id] || { ...FALLBACK_CITY, name: id || '?' };
  const nightStay = (d) => itin.stays.find((s) => s.checkIn <= d && d < s.checkOut);
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
    const morning = nightStay(addDays(date, -1)) || (date === trip.startDate ? itin.homeStart : evening);
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
    const pushLeg = (from, to, prevEnd, nextStart, before, cur = currency) => {
      if (!hasLoc(from) || !hasLoc(to)) return;
      const est = estimateLeg(from, to, cur);
      if (!est || est.km > 400) return;
      const gap = prevEnd != null && nextStart != null ? (nextStart - prevEnd) / 60000 : null;
      legs.push({ before, from, to, est, gap, tight: gap != null && gap < est.min });
    };
    let prevLoc = morning.lodging, prevEnd = null;
    scheduled.forEach((x, i) => {
      if (x.t.s >= w0) pushLeg(prevLoc, x.it.from || locOf(x.it), prevEnd, readyBy(x.it, x.t), i, city(x.it.city).currency); // priced where the ride happens
      prevLoc = x.it.to || locOf(x.it);
      prevEnd = x.t.e;
    });
    pushLeg(prevLoc, evening.lodging, prevEnd, null, scheduled.length);

    // Totals
    const clip = (t) => Math.max(0, (Math.min(t.e, w1) - Math.max(t.s, w0)) / 60000);
    let activity = 0, transportMin = 0;
    // Transport counts its check-in buffer too (waiting at the airport is not free time).
    for (const x of scheduled) isTransport(x.it) ? (transportMin += clip({ s: readyBy(x.it, x.t), e: x.t.e })) : (activity += clip(x.t));
    const legMin = legs.reduce((n, l) => n + l.est.min, 0);
    // Free time = waking hours minus everything else. Waking hours run from dayStart where we wake up to dayEnd
    // where we go to sleep, so flying west makes a long day; nights spent on a plane don't count.
    const transit = (s) => city(s.city).kind === 'transit';
    const wakeTz = transit(morning) ? eTz : mTz, sleepTz = transit(evening) ? mTz : eTz;
    const a0 = zonedToUtc(`${date}T${set.dayStart}`, wakeTz), a1 = zonedToUtc(`${date}T${set.dayEnd}`, sleepTz);
    const inAwake = (s, e) => Math.max(0, (Math.min(e, a1) - Math.max(s, a0)) / 60000);
    const busy = scheduled.reduce((n, x) => n + inAwake(isTransport(x.it) ? readyBy(x.it, x.t) : x.t.s, x.t.e), 0);
    const rest = Math.max(0, (a1 - a0) / 60000 - busy - legMin);

    let usd = 0;
    for (const x of scheduled) {
      if (localDate(x.t.s, x.t.sTz) !== date) continue;
      const p = x.it.price;
      if (p && p.amount != null) usd += p.amount * (set.fxToUSD[p.currency] ?? 0);
    }
    const ridesUsd = legs.filter((l) => l.est.best === 'uber').reduce((n, l) => n + l.est.fare * (set.fxToUSD[l.est.currency] ?? 0), 0);

    // Warnings
    const warnings = [];
    scheduled.forEach((x, i) => {
      const prev = scheduled[i - 1];
      if (prev && x.t.s < prev.t.e) warnings.push(`“${x.it.title}” overlaps “${prev.it.title}”.`);
      else if (prev && bufferMinutes(x.it) && readyBy(x.it, x.t) < prev.t.e) warnings.push(`“${prev.it.title}” runs into check-in time for “${x.it.title}” (be there ${bufferMinutes(x.it)} min early).`);
      if (x.t.s < w0) return;
      const sHM = localHM(x.t.s, x.t.sTz), eHM = localHM(x.t.e, x.t.eTz);
      const endsNextDay = localDate(x.t.e, x.t.eTz) !== localDate(x.t.s, x.t.sTz);
      if (sHM < set.earliest) warnings.push(`Early start: “${x.it.title}” at ${sHM}.`);
      if (!isTransport(x.it) && (eHM > set.latest || endsNextDay)) warnings.push(`Late finish: “${x.it.title}” ends ${eHM}.`);
      if (x.it.hours && !isTransport(x.it) && (sHM < x.it.hours.open || eHM > x.it.hours.close || endsNextDay)) {
        warnings.push(`“${x.it.title}” is outside its usual hours (${x.it.hours.open}–${x.it.hours.close}).`);
      }
      const pm = prefMatch(x.it, prefs);
      if (pm.avoid.length) warnings.push(`“${x.it.title}” matches something you avoid (${pm.avoid.join(', ')}).`);
      if (pm.diet === 'none') warnings.push(`“${x.it.title}” has no vegan options.`);
      if (pm.dog === 'no') warnings.push(`🐶 No dogs at “${x.it.title}”: one of you walks the dog, or arrange a sitter.`);
    });
    for (const l of legs) {
      if (l.tight) warnings.push(`Tight: about ${Math.round(l.est.min)} min to get to ${l.to.name || 'the next stop'}, but only ${Math.max(0, Math.round(l.gap))} min free.`);
    }
    if (activity > set.maxActivityMinutes) warnings.push(`Packed day: ${Math.round(activity / 60 * 10) / 10}h of activities (aim for ≤ ${set.maxActivityMinutes / 60}h).`);
    else if (activity > 0 && rest < set.minRestMinutes) warnings.push('Not much downtime today. Consider dropping something.');

    const dayCities = [...new Set([morning.city, evening.city])];
    return { date, morning, evening, mTz, eTz, w0, w1, items: scheduled, legs, activity, transport: transportMin, legMin, rest, usd, ridesUsd, warnings, cities: dayCities };
  }

  /** Best start time for `it` on `date`: its preferred time, or the next gap that fits (with travel and opening hours). */
  function findSlot(it, date, pref) {
    const tz = city(it.city).tz;
    const dur = (it.duration || 60) * 60000;
    const loc = locOf(it);
    const busy = dayInfo(date).items
      .filter((x) => x.it.id !== it.id)
      .map((x) => ({ s: readyBy(x.it, x.t), e: x.t.e, a: x.it.from || locOf(x.it), b: x.it.to || locOf(x.it) }));
    const travel = (p, q) => {
      if (!hasLoc(p) || !hasLoc(q)) return 15 * 60000;
      return Math.max(10, estimateLeg(p, q)?.min || 0) * 60000;
    };
    const q15 = (t) => Math.ceil(t / 900000) * 900000;
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

  /** Undecided ideas for the city/cities of `date`: suggested-for-today first, then things matching our interests. */
  function deckFor(date) {
    const dayCities = new Set(dayInfo(date).cities);
    const rank = (it) => (it.suggestedDate === date ? 0 : it.suggestedDate ? 3 : it.status === 'maybe' ? 2 : 1);
    const all = items.filter((it) => !isTransport(it) && dayCities.has(it.city) && (!it.status || it.status === 'idea' || it.status === 'maybe'));
    const hidden = all.filter((it) => prefMatch(it, prefs).excluded);
    const deck = all
      .filter((it) => !hidden.includes(it))
      .sort((a, b) => rank(a) - rank(b) || prefMatch(b, prefs).love.length - prefMatch(a, prefs).love.length || (a.suggestedStart || '99').localeCompare(b.suggestedStart || '99'));
    return Object.assign(deck, { hidden });
  }

  const daysInCity = (cityId) => tripDays(trip).filter((d) => { const s = stayFor(d); return s.morning.city === cityId || s.evening.city === cityId; });
  const travel = (a, b) => findRoute(routes, cities, a, b);

  return { itin, items, city, nightStay, stayFor, locOf, isTransport, timing, dayInfo, findSlot, deckFor, daysInCity, travel, prefMatch: (it) => prefMatch(it, prefs) };
}
