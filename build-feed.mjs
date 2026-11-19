// Builds available-soon.json for the nosbaan.com homepage: apartments with a free window of
// 30+ nights starting in the next 45 days. Public output only: no prices, owners, tags, guests or bookings.
// Env: HOSTAWAY_API_KEY (required), HOSTAWAY_ACCOUNT_ID (default 95976), OUT (default available-soon.json).
import { writeFileSync } from 'node:fs';

const API = 'https://api.hostaway.com/v1';
const BOOK = 'https://book.nosbaan.com';
const LOOKAHEAD = 45;      // a free window must start within this many days
const WINDOW = 120;        // calendar days read per apartment
const MIN_NIGHTS = 30;
const MAX_HOMES = 24;
const OUT = process.env.OUT || 'available-soon.json';
const KEY = (process.env.HOSTAWAY_API_KEY || '').trim();
const ACCOUNT = (process.env.HOSTAWAY_ACCOUNT_ID || '95976').trim();
if (!KEY) { console.error('HOSTAWAY_API_KEY is missing'); process.exit(1); }

// BTS Sukhumvit Line stations (approximate), used to name each apartment's area.
const STATIONS = [
  ['Siam', 13.7456, 100.5341], ['Chit Lom', 13.7442, 100.5431], ['Phloen Chit', 13.7430, 100.5490],
  ['Nana', 13.7405, 100.5549], ['Asok', 13.7370, 100.5604], ['Phrom Phong', 13.7305, 100.5697],
  ['Thonglor', 13.7243, 100.5784], ['Ekkamai', 13.7194, 100.5850], ['Phra Khanong', 13.7152, 100.5916],
  ['On Nut', 13.7057, 100.6010], ['Bang Chak', 13.6968, 100.6054],
];
const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r; return Math.hypot(x, y) * 6371; };
// Building names that say their area beat the nearest-station guess.
const AREA_BY_NAME = [
  [/ekkamai|the fine/i, 'Ekkamai'], [/thong ?lo|thonglor|liv@49/i, 'Thonglor'], [/phrom ?phong|emporio/i, 'Phrom Phong'],
  [/sukhumvit 23|noble be ?19|ashton asoke|asok/i, 'Asok'], [/chidlom|chit lom/i, 'Chit Lom'], [/life one wireless|ploenchit|phloen ?chit/i, 'Phloen Chit'],
  [/sky ?walk|sukhumvit 69|ideo mobi/i, 'Phra Khanong'], [/on ?nut/i, 'On Nut'],
];
const area = (lat, lng, name = '') => {
  for (const [re, n] of AREA_BY_NAME) if (re.test(name)) return n;
  if (!lat || !lng) return null;
  let best = null;
  for (const [n, a, b] of STATIONS) { const d = km(+lat, +lng, a, b); if (!best || d < best.d) best = { n, d }; }
  return best && best.d < 2.5 ? best.n : null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bkkToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

async function get(path, token, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token, 'Cache-control': 'no-cache' } });
    if (r.ok) return (await r.json()).result;
    if (i >= tries || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${path.split('?')[0]} -> HTTP ${r.status}`);
    await sleep(1500 * (i + 1));
  }
}

// First day d in [0, LOOKAHEAD] that starts a run of free nights long enough for a 30+ night stay.
export function freeWindow(days, today) {
  const free = days.map((d) => d.isAvailable === 1 || d.isAvailable === true);
  for (let i = 0; i <= LOOKAHEAD && i < days.length; i++) {
    if (!free[i] || (i > 0 && free[i - 1])) continue; // only the start of a run (or today)
    let j = i; while (j < days.length && free[j]) j++;
    const run = j - i, need = Math.max(MIN_NIGHTS, +days[i].minimumStay || 0);
    const open = j >= days.length;
    if (run >= need || open) return { free_from: days[i].date || addDays(today, i), free_nights: open ? null : run, open_ended: open, min_nights: need };
  }
  return null;
}

async function main() {
  const tok = await fetch(API + '/accessTokens', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: ACCOUNT, client_secret: KEY, scope: 'general' }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error('Hostaway token request failed');
  const token = tok.access_token;
  const today = bkkToday(), end = addDays(today, WINDOW - 1);
  const listings = await get('/listings?limit=500', token);

  const found = [];
  for (const l of listings) {
    const days = await get(`/listings/${l.id}/calendar?startDate=${today}&endDate=${end}`, token);
    await sleep(350);
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    const w = freeWindow(days, today);
    if (!w) continue;
    const [building, ...rest] = String(l.name || l.externalListingName || '').split('|').map((s) => s.trim());
    if (w.min_nights > MIN_NIGHTS) continue; // the homepage only shows homes bookable from 30 nights
    const imgs = (l.listingImages || []).slice().sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)).map((i) => i.url).filter(Boolean);
    if (!building || !imgs.length) continue;
    found.push({
      id: l.id,
      title: rest.join(' | ') || building,
      building,
      area: area(l.lat, l.lng, building),
      bedrooms: +l.bedroomsNumber || 0,
      guests: +l.personCapacity || null,
      sqm: +l.squareMeters || null,
      image: imgs[0],
      _imgs: imgs.slice(0, 4),
      ...w,
      price_30: null,
    });
  }
  found.sort((a, b) => (a.free_from < b.free_from ? -1 : a.free_from > b.free_from ? 1 : a.id - b.id));

  // Keep only apartments the booking site actually shows.
  const homes = [];
  for (const h of found) {
    if (homes.length >= MAX_HOMES) break;
    const r = await fetch(`${BOOK}/listings/${h.id}`, { method: 'GET', headers: { 'User-Agent': 'nosbaan-available-soon' } }).catch(() => null);
    if (r && r.ok) {
      // first photo that still exists (photos can be replaced in Hostaway between runs)
      let pic = null;
      for (const u of h._imgs) { const q = await fetch(u, { method: 'HEAD' }).catch(() => null); if (q && q.ok) { pic = u; break; } }
      delete h._imgs;
      if (pic) { h.image = pic; homes.push(h); }
    }
    await sleep(200);
  }
  const out = { updated: new Date().toISOString(), timezone: 'Asia/Bangkok', homes };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`listings ${listings.length}, with a 30+ night window in ${LOOKAHEAD} days: ${found.length}, published: ${homes.length}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('build-feed.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
