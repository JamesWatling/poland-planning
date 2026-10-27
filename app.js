// Poland trip planner UI. Vanilla JS, no build step. Data lives in /data (see AGENTS.md).
import { TRANSPORT, ACTIVITY_TYPES, SCHEDULED, createPlanner, tripDays, addDays, localHM, zonedToUtc, hasLoc, estimateLeg } from './planner.js';

const ICON = {
  sight: '🏛️', museum: '🖼️', food: '🍽️', tour: '🧭', daytrip: '🚌', nature: '🌳', event: '🎄', nightlife: '🎷', shopping: '🛍️', rest: '😴', other: '📌',
  flight: '✈️', train: '🚆', bus: '🚌', uber: '🚕', taxi: '🚕', car: '🚗', ferry: '⛴️', transfer: '🚐',
};
const MODE = { walk: ['🚶', 'walk', 'walking'], transit: ['🚋', 'transit', 'transit'], uber: ['🚕', 'Uber/Bolt', 'driving'] };
const LS = { overrides: 'pp.overrides', added: 'pp.added', name: 'pp.name', ui: 'pp.ui', images: 'pp.images' };

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const S = {
  trip: null, base: [], items: [], byId: {}, P: null,
  overrides: store.get(LS.overrides, {}),
  added: store.get(LS.added, []),
  ui: { view: 'trip', date: null, ideaCity: 'all', ideaStatus: 'undecided', ...store.get(LS.ui, {}) },
};

// ---------- formatting ----------

const fmtDay = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const fmtHM = (hm) => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtTime = (utc, tz) => fmtHM(localHM(utc, tz));
const fmtDur = (min) => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; };
const tzAbbr = (utc, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(utc)).find((p) => p.type === 'timeZoneName')?.value || '';
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
function priceText(p) {
  if (!p || p.amount == null) return '';
  if (p.amount === 0) return 'Free';
  const fx = S.trip.settings.fxToUSD[p.currency];
  const conv = p.currency !== 'USD' && fx ? ` ≈ ${usd(p.amount * fx)}` : '';
  return `${p.approx ? '~' : ''}${p.amount} ${p.currency}${conv}${p.per === 'group' ? '' : ' pp'}`;
}
const cityChip = (id) => { const c = S.P.city(id); return `<span class="chip city" style="--c:${c.color}">${esc(c.name)}</span>`; };
const mapsUrl = (a) => hasLoc(a) ? `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.address || a.name || '')}`;
const dirUrl = (a, b, mode) => `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=${mode}`;

// ---------- data ----------

async function getJSON(path) {
  const r = await fetch(`${path}?v=${Date.now()}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function load() {
  S.trip = await getJSON('data/trip.json');
  const files = [S.trip.transportFile, ...Object.values(S.trip.cities).map((c) => c.file)].filter(Boolean);
  S.base = (await Promise.all(files.map(getJSON))).flat();
  rebuild();
  const days = tripDays(S.trip);
  if (!days.includes(S.ui.date)) S.ui.date = days.includes(todayISO()) ? todayISO() : days[0];
}

function rebuild() {
  const baseIds = new Set(S.base.map((i) => i.id));
  S.items = [...S.base, ...S.added.filter((a) => !baseIds.has(a.id))].map((it) => ({ ...it, ...(S.overrides[it.id] || {}) }));
  S.byId = Object.fromEntries(S.items.map((i) => [i.id, i]));
  S.P = createPlanner(S.trip, S.items);
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const changeCount = () => Object.keys(S.overrides).length + S.added.length;
function persist() {
  store.set(LS.overrides, S.overrides);
  store.set(LS.added, S.added);
  rebuild();
}

function whoAmI() {
  let name = store.get(LS.name, '');
  if (!name) {
    name = (prompt('Who is making changes? (so you two can tell your picks apart)', '') || '').trim() || 'Someone';
    store.set(LS.name, name);
  }
  return name;
}

/** Apply a patch to an item; returns an undo function. */
function patchItem(id, patch) {
  const snap = JSON.stringify({ o: S.overrides, a: S.added });
  const meta = { updatedBy: whoAmI(), updatedAt: new Date().toISOString() };
  const i = S.added.findIndex((a) => a.id === id);
  if (i >= 0) S.added[i] = { ...S.added[i], ...patch, ...meta };
  else S.overrides[id] = { ...(S.overrides[id] || {}), ...patch, ...meta };
  persist();
  render();
  return () => { const { o, a } = JSON.parse(snap); S.overrides = o; S.added = a; persist(); render(); };
}

function sayYes(id, date, start) {
  const it = S.byId[id];
  const slot = start ? { start, shifted: false, conflict: false } : S.P.findSlot(it, date);
  const undo = patchItem(id, { status: 'yes', date, start: slot.start });
  const note = slot.conflict ? ' ⚠️ no free gap, it overlaps' : slot.shifted ? ' (moved to fit)' : '';
  toast(`✓ ${it.title}: ${fmtDay(date)} ${fmtHM(slot.start)}${note}`, undo);
}
function sayNo(id) { const it = S.byId[id]; toast(`✕ Skipped ${it.title}`, patchItem(id, { status: 'no', date: null, start: null })); }
function sayMaybe(id) { const it = S.byId[id]; toast(`? Maybe: ${it.title}`, patchItem(id, { status: 'maybe', date: null, start: null })); }
function unschedule(id) { const it = S.byId[id]; toast(`Removed ${it.title} from the day`, patchItem(id, { status: 'idea', date: null, start: null })); }

// ---------- images (Wikipedia thumbnails, cached) ----------

const imgCache = store.get(LS.images, {});
async function wikiImage(title) {
  if (title in imgCache) return imgCache[title];
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const j = r.ok ? await r.json() : {};
    imgCache[title] = (j.thumbnail?.source || '').replace(/\/\d+px-/, '/640px-');
  } catch { imgCache[title] = ''; }
  store.set(LS.images, imgCache);
  return imgCache[title];
}
const media = (it) => `${ICON[it.type] || '📌'}${it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" onerror="this.remove()">` : it.wiki ? `<img data-wiki="${esc(it.wiki)}" alt="" hidden>` : ''}`;
function hydrateImages(root = document) {
  for (const img of $$('img[data-wiki]', root)) {
    const title = img.dataset.wiki;
    img.removeAttribute('data-wiki');
    wikiImage(title).then((src) => { if (src) { img.onerror = () => img.remove(); img.src = src; img.hidden = false; } else img.remove(); });
  }
}

// ---------- rendering ----------

function render() {
  const t = S.trip;
  $('#title').textContent = t.name;
  $('#subtitle').textContent = `${fmtDay(t.startDate)} – ${fmtDay(t.endDate)} · ${tripDays(t).length} days`;
  const n = changeCount();
  $('#badge').hidden = !n;
  $('#badge').textContent = n;
  for (const b of $$('.tabs button')) b.classList.toggle('active', b.dataset.view === S.ui.view);
  store.set(LS.ui, S.ui);
  const main = $('#main');
  main.innerHTML = { trip: viewTrip, day: viewDay, swipe: viewSwipe, ideas: viewIdeas }[S.ui.view]();
  hydrateImages(main);
  if (S.ui.view === 'swipe') bindSwipe();
}

function go(view, date) {
  S.ui.view = view;
  if (date) S.ui.date = date;
  render();
  window.scrollTo({ top: 0 });
}

// Trip overview: calendar + stays + timeline
function viewTrip() {
  const days = tripDays(S.trip);
  const infos = Object.fromEntries(days.map((d) => [d, S.P.dayInfo(d)]));
  const yes = S.items.filter((i) => i.status === 'yes').length;
  const undecided = S.items.filter((i) => !TRANSPORT.has(i.type) && (i.status === 'idea' || i.status === 'maybe' || !i.status)).length;

  const first = days[0], last = days.at(-1);
  let d = addDays(first, -new Date(`${first}T12:00Z`).getUTCDay());
  const stop = addDays(last, 6 - new Date(`${last}T12:00Z`).getUTCDay());
  let cells = '';
  for (; d <= stop; d = addDays(d, 1)) {
    const info = infos[d];
    const dayNum = +d.slice(8);
    const label = dayNum === 1 || d === first ? `${fmtDay(d, { month: 'short' })} ${dayNum}` : dayNum;
    if (!info) { cells += `<div class="cell out" style="--c:transparent;--c2:transparent"><span class="num">${label}</span></div>`; continue; }
    const m = S.P.city(info.morning.city), e = S.P.city(info.evening.city);
    const icons = info.items.map((x) => ICON[x.it.type] || '📌').join('');
    cells += `<button class="cell ${d === todayISO() ? 'today' : ''}" style="--c:${m.color};--c2:${e.color}" data-go-day="${d}">
      <span class="num">${label}</span><span class="code">${m.short === e.short ? esc(e.short) : `${esc(m.short)}→${esc(e.short)}`}</span>
      <span class="icons">${icons}</span>${info.activity ? `<span class="hrs">${fmtDur(info.activity)}</span>` : ''}
      ${info.warnings.length ? '<span class="dot" title="Has warnings"></span>' : ''}</button>`;
  }

  const stays = S.trip.stays.map((s) => {
    const c = S.P.city(s.city);
    const nights = (Date.parse(s.checkOut) - Date.parse(s.checkIn)) / 864e5;
    return `<div class="stay" style="--c:${c.color}"><span class="swatch"></span><div class="grow">
      <div class="row between"><b>${esc(c.name)}</b><span class="muted small">${fmtDay(s.checkIn, { month: 'short', day: 'numeric' })} → ${fmtDay(s.checkOut, { month: 'short', day: 'numeric' })} · ${nights} night${nights > 1 ? 's' : ''}</span></div>
      <div class="small">${esc(s.lodging?.name || '')} ${s.lodging?.placeholder ? '<span class="chip ph">to book</span>' : ''}</div></div></div>`;
  }).join('');

  return `
    <div class="card">
      <div class="row between"><h2>Overview</h2><span class="muted small">${yes} planned · ${undecided} ideas to review</span></div>
      <div class="row wrap" style="margin-top:8px">${Object.keys(S.trip.cities).filter((id) => S.trip.cities[id].file).map(cityChip).join('')}</div>
    </div>
    <div class="card"><div class="cal">${'SMTWTFS'.split('').map((x) => `<div class="dow">${x}</div>`).join('')}${cells}</div>
      <p class="muted tiny" style="margin:8px 0 0">Tap a day to plan it. A yellow dot means that day has a warning.</p></div>
    <div class="section-title">Where we sleep</div>
    <div class="card">${stays}</div>
    <div class="section-title">Timeline (6 AM – midnight)</div>
    <div class="card">${axis()}${days.map((dd) => timelineRow(infos[dd])).join('')}</div>`;
}

const AXIS_START = 6, AXIS_HOURS = 18;
function axis() {
  const marks = [6, 9, 12, 15, 18, 21, 24].map((h) => `<span style="left:${((h - AXIS_START) / AXIS_HOURS) * 100}%">${h === 12 ? '12p' : h === 24 ? '12a' : h > 12 ? `${h - 12}p` : `${h}a`}</span>`).join('');
  return `<div class="bar-axis"><span></span><div class="labels">${marks}</div></div>`;
}
function dayBar(info) {
  // Axis is 6 AM–midnight in the time zone where the day ends.
  const base = zonedToUtc(`${info.date}T${String(AXIS_START).padStart(2, '0')}:00`, info.eTz);
  const span = AXIS_HOURS * 60;
  const segs = info.items.map((x) => {
    const a = Math.max(0, (x.t.s - base) / 60000), b = Math.min(span, (x.t.e - base) / 60000);
    if (b <= 0 || a >= span || b <= a) return '';
    const c = S.P.city(x.it.city).color;
    return `<span class="seg ${TRANSPORT.has(x.it.type) ? 'transport' : ''}" style="left:${(a / span) * 100}%;width:${((b - a) / span) * 100}%;--c:${c}" title="${esc(x.it.title)}"></span>`;
  }).join('');
  const ticks = [3, 6, 9, 12, 15].map((h) => `<span class="tick" style="left:${(h / AXIS_HOURS) * 100}%"></span>`).join('');
  return `<div class="bar">${ticks}${segs}</div>`;
}
function timelineRow(info) {
  const c = S.P.city(info.evening.city);
  return `<button class="tl-row" data-go-day="${info.date}"><span class="tl-label"><b>${fmtDay(info.date, { weekday: 'short', day: 'numeric' })}</b><span style="color:${c.color}">${esc(c.short)}</span></span>${dayBar(info)}</button>`;
}

function dayNav() {
  const days = tripDays(S.trip);
  const i = days.indexOf(S.ui.date);
  const opts = days.map((d) => { const s = S.P.stayFor(d); return `<option value="${d}" ${d === S.ui.date ? 'selected' : ''}>${fmtDay(d)} · ${esc(S.P.city(s.evening.city).name)}</option>`; }).join('');
  return `<div class="daynav"><button class="icon-btn" data-day-step="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Previous day">◀</button>
    <select id="daySelect" aria-label="Choose day">${opts}</select>
    <button class="icon-btn" data-day-step="1" ${i >= days.length - 1 ? 'disabled' : ''} aria-label="Next day">▶</button></div>`;
}

function statsBlock(info) {
  const cost = info.usd ? `${usd(info.usd)}` : '–';
  return `<div class="stats">
    <div class="stat"><b>${fmtDur(info.activity)}</b><span>activities</span></div>
    <div class="stat"><b>${fmtDur(info.transport + info.legMin)}</b><span>travel</span></div>
    <div class="stat"><b>${fmtDur(info.rest)}</b><span>free / rest</span></div>
    <div class="stat"><b>${cost}</b><span>pp${info.ridesUsd ? ` + ~${usd(info.ridesUsd)} rides` : ''}</span></div></div>`;
}

function viewDay() {
  const info = S.P.dayInfo(S.ui.date);
  const m = S.P.city(info.morning.city), e = S.P.city(info.evening.city);
  const deck = S.P.deckFor(S.ui.date).length;
  const where = m === e ? cityChip(info.evening.city) : `${cityChip(info.morning.city)} → ${cityChip(info.evening.city)}`;
  const maybes = S.items.filter((i) => i.status === 'maybe' && info.cities.includes(i.city));

  let flow = endpoint('🌅', 'Start', info.morning.lodging);
  info.items.forEach((x, i) => {
    flow += legsBefore(info, i);
    flow += itemCard(x, info);
  });
  flow += legsBefore(info, info.items.length);
  flow += endpoint('🌙', 'End', info.evening.lodging);

  return `${dayNav()}
    <div class="card">
      <div class="row between wrap"><h2>${fmtDay(S.ui.date, { weekday: 'long', month: 'short', day: 'numeric' })}</h2><div class="row">${where}</div></div>
      ${statsBlock(info)}
      <div style="margin-top:12px">${dayBar(info)}</div>
    </div>
    ${info.warnings.length ? `<div class="warnings">${info.warnings.map((w) => `<div>⚠️ ${esc(w)}</div>`).join('')}</div>` : ''}
    <div class="row" style="margin-bottom:12px">
      <button class="btn primary grow" data-go="swipe">💘 Swipe ideas for this day${deck ? ` (${deck})` : ''}</button>
      <button class="btn" data-add>＋ Add</button>
    </div>
    <div class="stack">${flow}</div>
    ${maybes.length ? `<div class="section-title">Maybes for ${esc(e.name)}</div>${maybes.map(ideaRow).join('')}` : ''}`;
}

function endpoint(icon, label, lodging) {
  if (!lodging) return '';
  return `<div class="endpoint"><span style="font-size:20px">${icon}</span><div class="grow"><div><b>${label}:</b> ${esc(lodging.name)} ${lodging.placeholder ? '<span class="chip ph">to book</span>' : ''}</div>
    ${lodging.address ? `<a class="small" href="${mapsUrl(lodging)}" target="_blank" rel="noopener">${esc(lodging.address)}</a>` : ''}</div></div>`;
}

function legsBefore(info, i) {
  return info.legs.filter((l) => l.before === i).map((l) => {
    const [ic, label, gmode] = MODE[l.est.best];
    const alt = Object.entries(l.est.opts).filter(([k]) => k !== l.est.best).map(([k, v]) => `${MODE[k][0]} ${fmtDur(v)}`).join(' · ');
    const fare = l.est.best === 'uber' ? ` · ~${l.est.fare} ${l.est.currency}` : '';
    return `<div class="leg ${l.tight ? 'tight' : ''}"><span class="best">${ic} ~${fmtDur(l.est.min)} ${label}${fare}</span> · ${l.est.km.toFixed(1)} km${l.gap != null ? ` · ${fmtDur(Math.max(0, l.gap))} gap` : ''}<br>
      <span>${alt}</span> · <a href="${dirUrl(l.from, l.to, gmode)}" target="_blank" rel="noopener">Directions ↗</a></div>`;
  }).join('');
}

function itemCard(x, info) {
  const { it, t } = x;
  const c = S.P.city(it.city);
  const transport = TRANSPORT.has(it.type);
  const dur = (t.e - t.s) / 60000;
  const showTz = t.sTz !== info.eTz || t.eTz !== info.eTz;
  const when = `${fmtTime(t.s, t.sTz)}${showTz ? ` ${tzAbbr(t.s, t.sTz)}` : ''}<span>→ ${fmtTime(t.e, t.eTz)}${showTz ? ` ${tzAbbr(t.e, t.eTz)}` : ''}</span><span>${fmtDur(dur)}</span>`;
  const place = transport ? `${esc(it.from?.name || '')} → ${esc(it.to?.name || '')}` : it.address ? `<a href="${mapsUrl(it)}" target="_blank" rel="noopener">📍 ${esc(it.address)}</a>` : '';
  return `<div class="item" style="--c:${c.color}">
    <div class="when">${when}</div>
    <div>
      <div class="row between"><h3>${ICON[it.type] || '📌'} ${esc(it.title)}</h3></div>
      <div class="small muted">${place}</div>
      <div class="row wrap small" style="margin-top:4px">${it.placeholder ? '<span class="chip ph">placeholder times</span>' : ''}${priceText(it.price) ? `<span class="chip">💰 ${esc(priceText(it.price))}</span>` : ''}${it.maxDuration ? `<span class="chip">max ${fmtDur(it.maxDuration)}</span>` : ''}${it.updatedBy ? `<span class="chip">by ${esc(it.updatedBy)}</span>` : ''}</div>
      <div class="actions">
        <button class="btn small" data-detail="${esc(it.id)}">Details</button>
        ${transport ? `<button class="btn small" data-edit="${esc(it.id)}">Edit</button>` : `<button class="btn small" data-time="${esc(it.id)}">🕐 Time</button><button class="btn small" data-unschedule="${esc(it.id)}">Remove</button>`}
      </div>
    </div></div>`;
}

// Swipe view
function viewSwipe() {
  const info = S.P.dayInfo(S.ui.date);
  const deck = S.P.deckFor(S.ui.date);
  const head = `${dayNav()}<div class="row between small" style="margin-bottom:6px"><span>${info.cities.map(cityChip).join(' ')}</span>
    <span class="muted">${fmtDur(info.activity)} planned · ${fmtDur(info.rest)} free</span></div>`;
  if (!deck.length) {
    return `${head}<div class="card empty"><div class="big">🎉</div><h3>No more ideas for this day</h3>
      <p class="muted">Add your own, or look at the day plan.</p>
      <div class="row" style="justify-content:center"><button class="btn primary" data-add>＋ Add an idea</button><button class="btn" data-go="day">See the day</button></div></div>`;
  }
  const cards = deck.slice(0, 2).reverse().map((it, i, arr) => swipeCard(it, info, i === arr.length - 1)).join('');
  return `${head}
    <div class="deck">${cards}</div>
    <div class="swipe-actions">
      <button class="round no" data-swipe="no" aria-label="Not interested">✕</button>
      <button class="round sm maybe" data-swipe="maybe" aria-label="Maybe later">?</button>
      <button class="round sm time" data-swipe="time" aria-label="Yes, at a different time">🕐</button>
      <button class="round yes" data-swipe="yes" aria-label="Yes">✓</button>
    </div>
    <p class="muted small" style="text-align:center">Swipe right = yes · left = no · up = pick a time<br>${deck.length} idea${deck.length > 1 ? 's' : ''} left for ${fmtDay(S.ui.date)}</p>`;
}

function swipeCard(it, info, top) {
  const c = S.P.city(it.city);
  const base = info.morning.lodging?.lat ? info.morning.lodging : info.evening.lodging;
  const leg = hasLoc(base) && hasLoc(it) ? estimateLeg(base, it, c.currency) : null;
  const legText = leg ? `${MODE[leg.best][0]} ~${fmtDur(leg.min)} from ${esc(base.name.replace(/ \(TBD\)/, ''))}` : '';
  const slot = S.P.findSlot(it, S.ui.date);
  return `<div class="swipe-card ${top ? 'top' : 'back'}" style="--c:${c.color}" data-id="${esc(it.id)}">
    <span class="stamp yes">Yes</span><span class="stamp no">Nope</span><span class="stamp time">Pick time</span>
    <div class="media">${media(it)}<span class="tag chip">${ICON[it.type] || '📌'} ${esc(it.type)}</span></div>
    <div class="body">
      <h2>${esc(it.title)}</h2>
      <div class="row wrap">
        <span class="chip">⏱ ${fmtDur(it.duration || 60)}${it.maxDuration ? ` (max ${fmtDur(it.maxDuration)})` : ''}</span>
        <span class="chip">🕙 ${fmtHM(slot.start)}${slot.shifted ? ' (next free)' : ''}${slot.conflict ? ' ⚠️ full' : ''}</span>
        ${priceText(it.price) ? `<span class="chip">💰 ${esc(priceText(it.price))}</span>` : ''}
        ${legText ? `<span class="chip">${legText}</span>` : ''}
        ${it.suggestedDate && it.suggestedDate !== S.ui.date ? `<span class="chip ph">best on ${fmtDay(it.suggestedDate)}</span>` : ''}
        ${it.status === 'maybe' ? '<span class="chip status maybe">maybe</span>' : ''}
      </div>
      <p>${esc(it.description || '')}</p>
      <div class="row between small"><span class="muted grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📍 ${esc(it.address || 'No address yet')}</span><button class="btn small" data-detail="${esc(it.id)}">More</button></div>
    </div></div>`;
}

function bindSwipe() {
  const card = $('.swipe-card.top');
  if (!card) return;
  const id = card.dataset.id;
  let x0 = 0, y0 = 0, dx = 0, dy = 0, active = false;
  const reset = () => { card.style.transform = ''; card.dataset.hint = ''; };
  const fly = (dir) => {
    card.style.transform = dir === 'no' ? 'translate(-130vw, 40px) rotate(-25deg)' : 'translate(130vw, 40px) rotate(25deg)';
    card.style.opacity = '0';
    setTimeout(() => (dir === 'no' ? sayNo(id) : sayYes(id, S.ui.date)), 180);
  };
  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a,button')) return;
    active = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0;
    card.setPointerCapture(e.pointerId);
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!active) return;
    dx = e.clientX - x0; dy = e.clientY - y0;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    card.dataset.hint = dx > 60 ? 'yes' : dx < -60 ? 'no' : dy < -60 ? 'time' : '';
  });
  const end = () => {
    if (!active) return;
    active = false;
    card.style.transition = '';
    if (dx > 110) fly('yes');
    else if (dx < -110) fly('no');
    else if (dy < -110) { reset(); openTime(id, S.ui.date); }
    else reset();
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
  card._fly = fly;
}

// Ideas list
function viewIdeas() {
  const f = S.ui;
  const cityIds = Object.keys(S.trip.cities).filter((id) => S.items.some((i) => i.city === id && !TRANSPORT.has(i.type)));
  const statusFilters = { undecided: 'To review', yes: 'Yes', maybe: 'Maybe', no: 'No', all: 'All' };
  const match = (i) => !TRANSPORT.has(i.type) && (f.ideaCity === 'all' || i.city === f.ideaCity) && (
    f.ideaStatus === 'all' || (f.ideaStatus === 'undecided' ? (!i.status || i.status === 'idea') : i.status === f.ideaStatus));
  const list = S.items.filter(match).sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || a.city.localeCompare(b.city) || a.title.localeCompare(b.title));
  return `
    <div class="row between" style="margin-bottom:8px"><h2>Ideas</h2><button class="btn primary" data-add>＋ Add idea</button></div>
    <div class="filters">${['all', ...cityIds].map((id) => `<span class="chip ${f.ideaCity === id ? 'on' : ''}" data-filter-city="${id}">${id === 'all' ? 'All cities' : esc(S.P.city(id).name)}</span>`).join('')}</div>
    <div class="filters">${Object.entries(statusFilters).map(([k, v]) => `<span class="chip ${f.ideaStatus === k ? 'on' : ''}" data-filter-status="${k}">${v} (${S.items.filter((i) => !TRANSPORT.has(i.type) && (f.ideaCity === 'all' || i.city === f.ideaCity) && (k === 'all' || (k === 'undecided' ? (!i.status || i.status === 'idea') : i.status === k))).length})</span>`).join('')}</div>
    ${list.length ? list.map(ideaRow).join('') : '<div class="card empty muted">Nothing here.</div>'}`;
}

function ideaRow(it) {
  const c = S.P.city(it.city);
  const st = it.status || 'idea';
  const when = it.status === 'yes' && it.date ? `${fmtDay(it.date)} ${it.start ? fmtHM(it.start) : ''}` : it.suggestedDate ? `best ${fmtDay(it.suggestedDate)}` : '';
  return `<div class="idea" style="--c:${c.color}">
    <div class="thumb" data-detail="${esc(it.id)}">${media(it)}</div>
    <div style="min-width:0">
      <h3 data-detail="${esc(it.id)}">${esc(it.title)}</h3>
      <div class="small muted">${esc(c.name)} · ${fmtDur(it.duration || 60)}${priceText(it.price) ? ` · ${esc(priceText(it.price))}` : ''}${when ? ` · ${when}` : ''}</div>
      <div class="quick">
        <button class="yes ${st === 'yes' ? 'on' : ''}" data-quick-yes="${esc(it.id)}">✓ Yes</button>
        <button class="maybe ${st === 'maybe' ? 'on' : ''}" data-quick-maybe="${esc(it.id)}">?</button>
        <button class="no ${st === 'no' ? 'on' : ''}" data-quick-no="${esc(it.id)}">✕</button>
      </div>
    </div></div>`;
}

// ---------- sheets ----------

function openSheet(html, onMount) {
  const wrap = $('#sheet');
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  wrap.hidden = false;
  document.body.style.overflow = 'hidden';
  hydrateImages(wrap);
  onMount?.($('.sheet', wrap));
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; }
const sheetHead = (title) => `<div class="sheet-head"><h2>${title}</h2><button class="close" data-close aria-label="Close">✕</button></div>`;

function openDetail(id) {
  const it = S.byId[id];
  const c = S.P.city(it.city);
  const transport = TRANSPORT.has(it.type);
  const t = S.P.timing(it);
  const rows = [
    ['Status', `<span class="status ${it.status}">${esc(it.status || 'idea')}</span>${it.updatedBy ? ` <span class="muted small">by ${esc(it.updatedBy)}</span>` : ''}`],
    t && ['When', `${fmtDay(new Date(t.s).toLocaleDateString('en-CA', { timeZone: t.sTz }))} ${fmtTime(t.s, t.sTz)} ${tzAbbr(t.s, t.sTz)} → ${fmtTime(t.e, t.eTz)} ${tzAbbr(t.e, t.eTz)}`],
    transport && ['Route', `${esc(it.from?.name)} → ${esc(it.to?.name)}`],
    !transport && ['Duration', `${fmtDur(it.duration || 60)}${it.maxDuration ? ` (max ${fmtDur(it.maxDuration)})` : ''}`],
    it.suggestedStart && !transport && ['Best time', fmtHM(it.suggestedStart)],
    it.suggestedDate && ['Best day', fmtDay(it.suggestedDate)],
    it.hours && ['Usual hours', `${it.hours.open}–${it.hours.close} (check before going)`],
    priceText(it.price) && ['Price', esc(priceText(it.price))],
    it.address && ['Address', `<a href="${mapsUrl(it)}" target="_blank" rel="noopener">${esc(it.address)}</a>`],
    it.url && ['Link', `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40))}</a>`],
    it.tags?.length && ['Tags', it.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ')],
    it.notes && ['Notes', esc(it.notes)],
  ].filter(Boolean);
  openSheet(`
    <div class="hero" style="--c:${c.color}">${media(it)}</div>
    ${sheetHead(esc(it.title))}
    <div class="row wrap">${cityChip(it.city)}<span class="chip">${ICON[it.type] || '📌'} ${esc(it.type)}</span>${it.placeholder ? '<span class="chip ph">placeholder</span>' : ''}</div>
    <p>${esc(it.description || '')}</p>
    <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${transport ? '' : `<div class="grid2" style="margin-bottom:10px">
      <button class="btn primary" data-time="${esc(id)}">✓ Yes, choose day/time</button>
      <button class="btn" data-quick-maybe="${esc(id)}">? Maybe</button>
      <button class="btn" data-quick-no="${esc(id)}">✕ Not interested</button>
      ${it.status === 'yes' ? `<button class="btn" data-unschedule="${esc(id)}">Remove from day</button>` : '<span></span>'}</div>`}
    <button class="btn block" data-edit="${esc(id)}">✏️ Edit details</button>`);
}

function openTime(id, date) {
  const it = S.byId[id];
  const days = S.P.daysInCity(it.city);
  const best = days.includes(date) ? date : it.date && days.includes(it.date) ? it.date : it.suggestedDate && days.includes(it.suggestedDate) ? it.suggestedDate
    : [...days].sort((a, b) => S.P.dayInfo(a).activity - S.P.dayInfo(b).activity)[0];
  if (!best) { toast('No days in this city yet. Edit the stays in data/trip.json.'); return; }
  const startFor = (d) => (it.date === d && it.start) || S.P.findSlot(it, d).start;
  openSheet(`${sheetHead(`🕐 ${esc(it.title)}`)}
    <div class="grid2">
      <label class="field"><span>Day</span><select name="date">${days.map((d) => `<option value="${d}" ${d === best ? 'selected' : ''}>${fmtDay(d)}</option>`).join('')}</select></label>
      <label class="field"><span>Start</span><input type="time" name="start" value="${startFor(best)}" step="900"></label>
    </div>
    <label class="field"><span>Duration (minutes)${it.maxDuration ? `, max ${it.maxDuration}` : ''}</span><input type="number" name="duration" min="15" step="15" value="${it.duration || 60}"></label>
    <div class="fit" id="fit"></div>
    <button class="btn primary block" data-save-time>Save</button>`, (sheet) => {
    const form = { date: $('[name=date]', sheet), start: $('[name=start]', sheet), duration: $('[name=duration]', sheet) };
    const check = () => {
      const d = form.date.value, trial = { ...it, date: d, start: form.start.value, duration: +form.duration.value, status: 'yes' };
      const P = createPlanner(S.trip, S.items.map((x) => (x.id === id ? trial : x)));
      const info = P.dayInfo(d);
      const mine = info.warnings.filter((w) => w.includes(it.title) || w.startsWith('Packed') || w.startsWith('Not much') || w.startsWith('Tight'));
      const fit = $('#fit', sheet);
      fit.className = `fit ${mine.length ? 'bad' : 'ok'}`;
      fit.innerHTML = mine.length ? mine.map((w) => `⚠️ ${esc(w)}`).join('<br>') : `✓ Fits. That day would have ${fmtDur(info.activity)} of activities and ${fmtDur(info.rest)} free.`;
      if (mine.length) {
        const alts = days.filter((x) => x !== d && !S.P.findSlot(it, x).conflict && S.P.dayInfo(x).activity + (it.duration || 60) <= S.trip.settings.maxActivityMinutes).slice(0, 3);
        if (alts.length) fit.innerHTML += `<div style="margin-top:8px">Fits better on: ${alts.map((x) => `<button class="btn small" type="button" data-alt="${x}">${fmtDay(x)}</button>`).join(' ')}</div>`;
        $$('[data-alt]', fit).forEach((b) => (b.onclick = () => { form.date.value = b.dataset.alt; form.date.onchange(); }));
      }
    };
    form.date.onchange = () => { form.start.value = startFor(form.date.value); check(); };
    form.start.oninput = check;
    form.duration.oninput = check;
    check();
    $('[data-save-time]', sheet).onclick = () => {
      if (+form.duration.value !== (it.duration || 60)) patchItem(id, { duration: +form.duration.value });
      closeSheet();
      sayYes(id, form.date.value, form.start.value);
    };
  });
}

function openEdit(id, defaults = {}) {
  const it = id ? S.byId[id] : { type: 'sight', city: S.P.stayFor(S.ui.date).evening.city, duration: 90, price: { amount: null, currency: 'PLN' }, ...defaults };
  const days = tripDays(S.trip);
  const types = [...ACTIVITY_TYPES, ...TRANSPORT];
  const isNew = !id;
  const cities = Object.entries(S.trip.cities);
  const time = it.start || it.suggestedStart || '';
  openSheet(`${sheetHead(isNew ? '＋ New idea' : '✏️ Edit')}
    <label class="field"><span>Title *</span><input name="title" value="${esc(it.title)}" placeholder="e.g. Ice skating at the Old Town rink" required></label>
    <div class="grid2">
      <label class="field"><span>Type</span><select name="type">${types.map((t) => `<option value="${t}" ${t === it.type ? 'selected' : ''}>${ICON[t] || ''} ${t}</option>`).join('')}</select></label>
      <label class="field"><span>City</span><select name="city">${cities.map(([cid, c]) => `<option value="${cid}" ${cid === it.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Day (blank = just an idea)</span><select name="date"><option value="">Any day</option>${days.map((d) => `<option value="${d}" ${d === it.date ? 'selected' : ''}>${fmtDay(d)}</option>`).join('')}</select></label>
      <label class="field"><span>Start / best time</span><input type="time" name="time" value="${esc(time)}" step="900"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Duration (min)</span><input type="number" name="duration" min="15" step="15" value="${it.duration || ''}"></label>
      <label class="field"><span>Max duration (min)</span><input type="number" name="maxDuration" min="15" step="15" value="${it.maxDuration || ''}"></label>
    </div>
    <div class="transport-only">
      <div class="grid2">
        <label class="field"><span>From</span><input name="fromName" value="${esc(it.from?.name)}" placeholder="e.g. Kraków Główny"></label>
        <label class="field"><span>To</span><input name="toName" value="${esc(it.to?.name)}" placeholder="e.g. Wrocław Główny"></label>
      </div>
      <p class="muted tiny">Flights across time zones: ask Claude to add them to data/transport.json so both time zones are right.</p>
    </div>
    <label class="field activity-only"><span>Address</span><div class="row"><input name="address" value="${esc(it.address)}" placeholder="Street, city"><button class="btn small" type="button" data-geocode>📍 Find</button></div></label>
    <p class="muted tiny activity-only" id="geo">${hasLoc(it) ? `Location set (${it.lat.toFixed(4)}, ${it.lng.toFixed(4)}). Travel times will be estimated.` : 'Tap “Find” to look up the address so travel times can be estimated.'}</p>
    <div class="grid2">
      <label class="field"><span>Price per person</span><input type="number" name="price" min="0" step="1" value="${it.price?.amount ?? ''}"></label>
      <label class="field"><span>Currency</span><select name="currency">${['PLN', 'USD', 'EUR'].map((c) => `<option ${c === (it.price?.currency || 'PLN') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Short description</span><textarea name="description">${esc(it.description)}</textarea></label>
    <label class="field"><span>Link (tickets, website)</span><input name="url" type="url" value="${esc(it.url)}" placeholder="https://"></label>
    <label class="field"><span>Image URL (optional)</span><input name="image" type="url" value="${esc(it.image)}" placeholder="https://…jpg"></label>
    <label class="field"><span>Notes</span><input name="notes" value="${esc(it.notes)}"></label>
    <button class="btn primary block" data-save-edit>${isNew ? 'Add idea' : 'Save'}</button>
    ${!isNew && S.added.some((a) => a.id === id) ? '<button class="btn block" style="margin-top:8px;color:var(--no)" data-delete>Delete this idea</button>' : ''}`, (sheet) => {
    const v = (n) => $(`[name=${n}]`, sheet).value.trim();
    let geo = hasLoc(it) ? { lat: it.lat, lng: it.lng } : null;
    const syncType = () => {
      const tr = TRANSPORT.has(v('type'));
      $$('.transport-only', sheet).forEach((el) => (el.hidden = !tr));
      $$('.activity-only', sheet).forEach((el) => (el.hidden = tr));
    };
    $('[name=type]', sheet).onchange = syncType;
    syncType();
    $('[name=address]', sheet).oninput = () => { geo = null; $('#geo', sheet).textContent = 'Address changed. Tap “Find” to update the location.'; };
    $('[data-geocode]', sheet).onclick = async () => {
      const q = `${v('address')}, ${S.P.city(v('city')).name}`;
      $('#geo', sheet).textContent = 'Looking up…';
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
        const [hit] = await r.json();
        if (!hit) throw new Error('not found');
        geo = { lat: +(+hit.lat).toFixed(5), lng: +(+hit.lon).toFixed(5) };
        $('#geo', sheet).textContent = `📍 Found: ${hit.display_name.slice(0, 90)}`;
      } catch { $('#geo', sheet).textContent = 'Could not find that address. Try a simpler one (street + number).'; }
    };
    $('[data-save-edit]', sheet).onclick = () => {
      if (!v('title')) { $('[name=title]', sheet).focus(); return; }
      const date = v('date') || null, tm = v('time') || null;
      const transport = TRANSPORT.has(v('type'));
      const patch = {
        title: v('title'), type: v('type'), city: v('city'),
        duration: +v('duration') || 60, maxDuration: +v('maxDuration') || null,
        description: v('description'), url: v('url') || null, image: v('image') || null, notes: v('notes') || null,
        price: v('price') === '' ? null : { amount: +v('price'), currency: v('currency'), per: 'person' },
      };
      if (transport) {
        if (!it.from?.time) { patch.from = { ...(it.from || {}), name: v('fromName') }; patch.to = { ...(it.to || {}), name: v('toName') }; }
      } else {
        patch.address = v('address');
        patch.lat = geo?.lat ?? null; patch.lng = geo?.lng ?? null;
      }
      if (date && tm) Object.assign(patch, { date, start: tm, status: SCHEDULED.has(it.status) ? it.status : (transport ? 'planned' : 'yes') });
      else Object.assign(patch, { date: null, start: null, suggestedStart: tm, suggestedDate: date || it.suggestedDate || null, status: it.status && !SCHEDULED.has(it.status) ? it.status : 'idea' });
      if (it.from?.time) { delete patch.date; delete patch.start; delete patch.status; delete patch.suggestedStart; delete patch.suggestedDate; }
      if (isNew) {
        const nid = `${v('city').slice(0, 3)}-${v('title').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)}-${Math.random().toString(36).slice(2, 6)}`;
        const meta = { addedBy: whoAmI(), updatedBy: whoAmI(), updatedAt: new Date().toISOString() };
        S.added.push({ id: nid, ...patch, ...meta });
        persist();
        closeSheet();
        render();
        toast(`Added “${patch.title}”`);
      } else {
        closeSheet();
        const undo = patchItem(id, patch);
        toast('Saved', undo);
      }
    };
    $('[data-delete]', sheet)?.addEventListener('click', () => {
      if (!confirm('Delete this idea?')) return;
      S.added = S.added.filter((a) => a.id !== id);
      delete S.overrides[id];
      persist(); closeSheet(); render();
    });
  });
}

// ---------- sharing changes ----------

const b64e = (s) => { let bin = ''; new TextEncoder().encode(s).forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));
const exportData = () => ({ type: 'poland-planner-changes', version: 1, exportedBy: store.get(LS.name, 'Someone'), exportedAt: new Date().toISOString(), overrides: S.overrides, added: S.added });

function mergeChanges(data) {
  if (data?.type !== 'poland-planner-changes') throw new Error('That does not look like a planner export.');
  let n = 0;
  const newer = (a, b) => !b || (a.updatedAt || '') > (b.updatedAt || '');
  for (const [id, o] of Object.entries(data.overrides || {})) if (newer(o, S.overrides[id])) { S.overrides[id] = o; n++; }
  for (const a of data.added || []) {
    const i = S.added.findIndex((x) => x.id === a.id);
    if (i < 0) { S.added.push(a); n++; } else if (newer(a, S.added[i])) { S.added[i] = a; n++; }
  }
  persist();
  return n;
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function openMenu() {
  const n = changeCount();
  const name = store.get(LS.name, '');
  openSheet(`${sheetHead('Menu')}
    <p class="small">You are <b>${esc(name || 'not set')}</b>. This device has <b>${n}</b> change${n === 1 ? '' : 's'} that aren’t saved to the shared plan yet.</p>
    <p class="muted small">Picks are stored on this phone. To share them, send a link to your partner (it merges with their picks), or download the file and ask Claude to save it to the repo (see AGENTS.md).</p>
    <div class="menu-list">
      <button data-menu="share">🔗 Share my picks as a link</button>
      <button data-menu="download">⬇️ Download changes (.json)</button>
      <button data-menu="copy">📋 Copy changes (paste to Claude)</button>
      <button data-menu="import">⬆️ Import a changes file</button>
      <button data-menu="name">🙋 Change my name</button>
      <button data-menu="images">🖼️ Reload images</button>
      <button data-menu="reset" style="color:var(--no)">🗑️ Clear this device’s changes</button>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>`, (sheet) => {
    const file = $('#importFile', sheet);
    file.onchange = async () => {
      try { const n2 = mergeChanges(JSON.parse(await file.files[0].text())); closeSheet(); render(); toast(`Imported ${n2} change${n2 === 1 ? '' : 's'}`); } catch (e) { alert(e.message); }
    };
    sheet.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-menu]')?.dataset.menu;
      if (!act) return;
      const json = JSON.stringify(exportData(), null, 2);
      if (act === 'share') {
        const url = `${location.origin}${location.pathname}#changes=${b64e(JSON.stringify(exportData()))}`;
        if (navigator.share) { try { await navigator.share({ title: 'My Poland trip picks', url }); } catch { /* cancelled */ } }
        else { await navigator.clipboard.writeText(url); toast('Link copied'); }
      }
      if (act === 'download') download(`changes-${(name || 'someone').toLowerCase()}-${todayISO()}.json`, json);
      if (act === 'copy') { await navigator.clipboard.writeText(`Please apply these Poland planner changes (save as data/inbox/changes.json and run node scripts/apply-changes.mjs):\n\n${json}`); toast('Copied'); }
      if (act === 'import') file.click();
      if (act === 'name') { store.set(LS.name, ''); whoAmI(); closeSheet(); openMenu(); }
      if (act === 'images') { for (const k of Object.keys(imgCache)) delete imgCache[k]; store.set(LS.images, {}); closeSheet(); render(); }
      if (act === 'reset' && confirm('Clear all picks and added ideas on this device? (Export first if you want to keep them.)')) {
        S.overrides = {}; S.added = []; persist(); closeSheet(); render();
      }
    });
  });
}

// ---------- toast ----------

let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Undo</button>' : ''}`;
  el.hidden = false;
  if (undo) $('button', el).onclick = () => { undo(); el.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

// ---------- events ----------

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-view],[data-go],[data-go-day],[data-day-step],[data-add],[data-detail],[data-edit],[data-time],[data-unschedule],[data-quick-yes],[data-quick-no],[data-quick-maybe],[data-swipe],[data-filter-city],[data-filter-status],[data-close]');
  if (!t) { if (e.target.id === 'sheet') closeSheet(); return; }
  const d = t.dataset;
  const inSheet = !!t.closest('#sheet');
  const closeIf = () => { if (inSheet && !('edit' in d) && !('time' in d)) closeSheet(); };
  if ('close' in d) return closeSheet();
  if (d.view) return go(d.view);
  if (d.go) return go(d.go);
  if (d.goDay) return go('day', d.goDay);
  if (d.dayStep) { const days = tripDays(S.trip); S.ui.date = days[Math.min(days.length - 1, Math.max(0, days.indexOf(S.ui.date) + +d.dayStep))]; return render(); }
  if ('add' in d) return openEdit(null);
  if (d.detail) return openDetail(d.detail);
  if (d.edit) return openEdit(d.edit);
  if (d.time) return openTime(d.time, S.ui.view === 'ideas' ? null : S.ui.date);
  if (d.unschedule) { closeIf(); return unschedule(d.unschedule); }
  if (d.quickYes) return openTime(d.quickYes, null);
  if (d.quickNo) { closeIf(); return sayNo(d.quickNo); }
  if (d.quickMaybe) { closeIf(); return sayMaybe(d.quickMaybe); }
  if (d.filterCity) { S.ui.ideaCity = d.filterCity; return render(); }
  if (d.filterStatus) { S.ui.ideaStatus = d.filterStatus; return render(); }
  if (d.swipe) {
    const card = $('.swipe-card.top');
    if (!card) return;
    const id = card.dataset.id;
    if (d.swipe === 'yes' || d.swipe === 'no') return card._fly(d.swipe);
    if (d.swipe === 'maybe') return sayMaybe(id);
    if (d.swipe === 'time') return openTime(id, S.ui.date);
  }
});
document.addEventListener('change', (e) => { if (e.target.id === 'daySelect') { S.ui.date = e.target.value; render(); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if (S.ui.view !== 'swipe' || !$('#sheet').hidden || e.target.matches('input,select,textarea')) return;
  const card = $('.swipe-card.top');
  if (!card) return;
  if (e.key === 'ArrowRight') card._fly('yes');
  if (e.key === 'ArrowLeft') card._fly('no');
  if (e.key === 'ArrowUp') openTime(card.dataset.id, S.ui.date);
});
$('#menuBtn').addEventListener('click', openMenu);

// ---------- boot ----------

(async function boot() {
  try {
    await load();
    const m = location.hash.match(/changes=([^&]+)/);
    if (m) {
      try {
        const data = JSON.parse(b64d(m[1]));
        const count = Object.keys(data.overrides || {}).length + (data.added || []).length;
        if (confirm(`Import ${count} pick${count === 1 ? '' : 's'} from ${data.exportedBy || 'someone'}? Newer changes win.`)) toast(`Imported ${mergeChanges(data)} changes`);
      } catch { alert('That share link looks broken.'); }
      history.replaceState(null, '', location.pathname);
    }
    render();
  } catch (err) {
    $('#main').innerHTML = `<div class="card"><h2>Could not load the trip</h2><p class="muted">${esc(err.message)}</p><p class="small">If you opened index.html directly, run a local server instead: <code>python3 -m http.server</code></p></div>`;
  }
})();
