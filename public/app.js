// Charger map (Stage 2b). Plain browser JavaScript, no build step.
// Data comes from our API; the basemap is Google Maps (required because
// Google Places data will be shown on it later).

const CATEGORY_LABELS = {
  dc: 'Fast DC: fits your car',
  dc_unconfirmed: 'DC: plug type not stated',
  ac: 'AC only (slow)',
  incompatible: "Can't use",
};
const INCOMPATIBLE_REASONS = {
  tesla_only: 'Tesla vehicles only',
  no_plug_data: 'No plug data',
  no_compatible_plug: 'No plug that fits your car',
};
// Draw order: usable chargers on top of grey ones.
const Z = { dc: 4, dc_unconfirmed: 3, ac: 2, incompatible: 1 };

// Sydney to Melbourne, the trip this app is for.
const START_BOUNDS = { south: -38.1, west: 144.6, north: -33.6, east: 151.3 };
const PREFS_KEY = 'evmap.categories';
// Below this zoom, markers are plain dots and grey ones are hidden (see app.css .compact).
const LABEL_ZOOM = 9;

const state = {
  map: null,
  infoWindow: null,
  markers: new Map(),   // site id -> { marker, data }
  requestSeq: 0,
  config: null,
};

main().catch((err) => setStatus(err.message, true));

async function main() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(`Config failed: ${(await res.json()).error ?? res.status}`);
  state.config = await res.json();
  document.getElementById('vehicle').textContent = state.config.vehicle.name;

  restoreCategoryPrefs();
  loadAttribution();

  await loadGoogleMaps(state.config.googleMapsApiKey);
  const { Map, InfoWindow } = await google.maps.importLibrary('maps');
  await google.maps.importLibrary('marker');

  state.map = new Map(document.getElementById('map'), {
    mapId: state.config.googleMapsMapId,
    gestureHandling: 'greedy',
    clickableIcons: false,     // don't open Google's own place popups
    streetViewControl: false,
  });
  const fromUrl = viewFromHash();
  if (fromUrl) {
    state.map.setCenter(fromUrl.center);
    state.map.setZoom(fromUrl.zoom);
  } else {
    state.map.fitBounds(START_BOUNDS);
  }
  state.infoWindow = new InfoWindow();

  // 'idle' fires after every pan/zoom settles: reload markers for the view,
  // and record the view in the URL (#lat,lng,zoom) so a refresh keeps it.
  state.map.addListener('idle', debounce(() => { saveViewToHash(); refresh(); }, 250));
  // Markers live inside #map, so one class there restyles them all at once.
  const applyZoomStyle = () =>
    document.getElementById('map').classList.toggle('compact', state.map.getZoom() < LABEL_ZOOM);
  state.map.addListener('zoom_changed', applyZoomStyle);
  applyZoomStyle();
  document.querySelectorAll('[data-category]').forEach((cb) =>
    cb.addEventListener('change', () => { saveCategoryPrefs(); refresh(); }));
}

// Loads the Maps script once; resolves when Google calls back.
function loadGoogleMaps(key) {
  return new Promise((resolve, reject) => {
    window.__evmapMapsReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
      key, v: 'weekly', loading: 'async', callback: '__evmapMapsReady',
    });
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps failed to load (check the Maps key restrictions)'));
    document.head.append(s);
  });
}

function enabledCategories() {
  return [...document.querySelectorAll('[data-category]')].filter((cb) => cb.checked).map((cb) => cb.dataset.category);
}

async function refresh() {
  const bounds = state.map.getBounds();
  if (!bounds) return;
  const categories = enabledCategories();
  const seq = ++state.requestSeq;   // ignore responses that arrive out of order

  if (!categories.length) return reconcile([]);

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const params = new URLSearchParams({
    bbox: [sw.lng(), sw.lat(), ne.lng(), ne.lat()].map((n) => n.toFixed(5)).join(','),
    categories: categories.join(','),
    vehicle: state.config.vehicle.id,
  });
  try {
    const res = await fetch(`/api/chargers?${params}`);
    if (!res.ok) throw new Error(`Charger load failed (${res.status})`);
    const body = await res.json();
    if (seq !== state.requestSeq) return;
    reconcile(body.markers);
    const zoomHint = state.map.getZoom() < LABEL_ZOOM ? '. Zoom in for kW labels and greyed-out chargers' : '';
    setStatus(body.truncated
      ? `Showing the first ${body.markers.length} chargers: zoom in to see all`
      : `${body.markers.length} chargers in view${zoomHint}`, body.truncated);
  } catch (err) {
    setStatus(err.message, true);
  }
}

// Add new markers and remove ones no longer in view; keep the rest as they are.
function reconcile(list) {
  const keep = new Set(list.map((m) => m.id));
  for (const [id, entry] of state.markers) {
    if (!keep.has(id)) { entry.marker.map = null; state.markers.delete(id); }
  }
  for (const data of list) {
    const existing = state.markers.get(data.id);
    if (existing && existing.data.category === data.category
        && existing.data.others.length === data.others.length) continue;
    if (existing) existing.marker.map = null;
    state.markers.set(data.id, { marker: makeMarker(data), data });
  }
}

function makeMarker(data) {
  const el = document.createElement('div');
  el.className = `mk mk-${data.category}`;
  if (data.tesla === 'open_to_all' && data.category !== 'incompatible') el.classList.add('mk-tesla');
  if (data.category !== 'incompatible') el.textContent = data.kw === null ? '?' : String(Math.round(data.kw));
  if (data.others.length) el.append(h('span', 'mk-more', `+${data.others.length}`));

  const title = data.others.length
    ? `${data.name}: ${CATEGORY_LABELS[data.category]} (+${data.others.length} more here)`
    : `${data.name}: ${CATEGORY_LABELS[data.category]}`;
  const marker = new google.maps.marker.AdvancedMarkerElement({
    map: state.map,
    position: { lat: data.lat, lng: data.lng },
    content: el,
    title,
    // Usable categories on top; within a category, faster chargers on top.
    zIndex: Z[data.category] * 10000 + Math.round(data.kw ?? 0),
    gmpClickable: true,
  });
  // Everything at this spot, best first; the popup can switch between them.
  const members = [{ id: data.id, name: data.name, category: data.category, kw: data.kw }, ...data.others];
  marker.addListener('click', () => showDetail(data.id, marker, members));
  return marker;
}

async function showDetail(id, marker, members) {
  const res = await fetch(`/api/chargers/${encodeURIComponent(id)}?vehicle=${encodeURIComponent(state.config.vehicle.id)}`);
  if (!res.ok) return setStatus(`Couldn't load charger details (${res.status})`, true);
  const view = detailView(await res.json());

  const others = members.filter((m) => m.id !== id);
  if (others.length) {
    const box = h('div', 'group');
    box.append(h('p', 'group-title', 'Also at this spot:'));
    for (const other of others) {
      const kw = other.kw === null ? '? kW' : `${Math.round(other.kw)} kW`;
      const btn = h('button', 'group-item', `${other.name} · ${kw} · ${CATEGORY_LABELS[other.category]}`);
      btn.type = 'button';
      btn.addEventListener('click', () => showDetail(other.id, marker, members));
      box.append(btn);
    }
    view.append(box);
  }
  state.infoWindow.setContent(view);
  state.infoWindow.open({ map: state.map, anchor: marker });
}

// Builds the info window with DOM nodes and textContent only: names and
// addresses come from open data and must never be treated as HTML.
function detailView(d) {
  const root = h('div', 'info');
  root.append(h('h3', null, d.name));
  const sub = [d.operator, d.address].filter(Boolean).join(' · ');
  if (sub) root.append(h('p', 'sub', sub));

  let cat = CATEGORY_LABELS[d.category];
  if (d.category === 'incompatible' && d.incompatibleReason) cat += `: ${INCOMPATIBLE_REASONS[d.incompatibleReason]}`;
  root.append(h('span', `cat cat-${d.category === 'dc_unconfirmed' ? 'dc' : d.category}`, cat));

  if (d.connectors.length) {
    const table = h('table');
    for (const c of d.connectors) {
      const row = h('tr');
      row.append(h('td', null, plugName(c.standard)), h('td', null, c.count ? `× ${c.count}` : ''),
        h('td', null, c.kw === null ? 'kW unknown' : `${c.kw} kW`));
      table.append(row);
    }
    root.append(table);
  }

  const dl = h('dl');
  const add = (k, v) => { if (v) dl.append(h('dt', null, k), h('dd', null, v)); };
  if (d.vehicleMaxKw) {
    add('Max power', d.kw === null
      ? 'Unknown (assume 50 kW, estimate)'
      : `${d.kw} kW (your car takes up to ${d.vehicleMaxKw} kW)`);
  }
  add('Fee', d.fee === 'paid' ? 'Paid' : 'Unknown');
  add('Status', d.status === 'operational' ? 'Operational' : 'Unknown');
  if (d.access && d.access !== 'unknown') add('Access', d.access);
  add('Hours', d.openingHours);
  root.append(dl);

  if (d.warnings.length) {
    const ul = h('ul', 'warnings');
    for (const w of d.warnings) ul.append(h('li', null, `⚠ ${w}`));
    root.append(ul);
  }

  const src = h('p', 'sources', 'Sources: ');
  d.sources.forEach((s, i) => {
    if (i) src.append(', ');
    if (s.url?.startsWith('https://')) {
      const a = h('a', null, s.id);
      a.href = s.url; a.target = '_blank'; a.rel = 'noopener';
      src.append(a);
    } else {
      src.append(s.id);
    }
  });
  root.append(src);
  return root;
}

function plugName(standard) {
  return { DCUnspecified: 'DC (plug not stated)', ACUnspecified: 'AC (plug not stated)', TeslaProprietary: 'Tesla' }[standard] ?? standard;
}

async function loadAttribution() {
  const el = document.getElementById('attribution');
  try {
    const sources = await (await fetch('/api/sources')).json();
    const newest = sources.map((s) => s.fetchedAt).filter(Boolean).sort().at(-1);
    el.textContent = 'Charger data: ';
    sources.forEach((s, i) => {
      if (i) el.append(' · ');
      if (s.licenceUrl) {
        const a = h('a', null, s.attribution);
        a.href = s.licenceUrl; a.target = '_blank'; a.rel = 'noopener'; a.title = s.licence ?? '';
        el.append(a);
      } else {
        el.append(s.attribution);
      }
    });
    if (newest) {
      el.append(` · Updated ${new Date(newest).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`);
    }
  } catch {
    el.textContent = 'Charger data: open data sources (attribution failed to load)';
  }
}

// Remember which categories are ticked. Storage can be unavailable (private
// mode), so failures are ignored and the page defaults still work.
function saveCategoryPrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(enabledCategories())); } catch {}
}
function restoreCategoryPrefs() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(PREFS_KEY)); } catch {}
  if (!Array.isArray(saved)) return;
  document.querySelectorAll('[data-category]').forEach((cb) => { cb.checked = saved.includes(cb.dataset.category); });
}

function viewFromHash() {
  const [lat, lng, zoom] = location.hash.slice(1).split(',').map(Number);
  if (![lat, lng, zoom].every(Number.isFinite) || Math.abs(lat) > 90 || zoom < 1 || zoom > 22) return null;
  return { center: { lat, lng }, zoom };
}

function saveViewToHash() {
  const c = state.map.getCenter();
  // replaceState: update the URL without adding a browser-history entry per pan.
  history.replaceState(null, '', `#${c.lat().toFixed(4)},${c.lng().toFixed(4)},${state.map.getZoom()}`);
}

function setStatus(text, warn = false) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.classList.toggle('warn', warn);
}

function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
