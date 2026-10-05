import { makeId, enrich } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Ethiopia Electronic Government Procurement (e-GP, Federal Public Procurement and
// Property Authority). Public, no login. The portal's own "all active tenders" list
// (egp.gov.et/egp/bids/all) is backed by this JSON endpoint; it is not a documented
// API, so parse defensively and throw on shape changes.
// Pages are capped at 50 items server-side whatever `top` says.
// Items are packages; each carries one or more lots in `result`.
// Per-lot detail pages load through an endpoint that returns nothing anonymously, so
// leads link to the public list and quote the procurement reference to search for.
const API = 'https://egp.gov.et/po-gw/cms-v2/api/sourcing/get-grouped-sourcing';
export const LIST_URL = 'https://egp.gov.et/egp/bids/all';
const PAGE = 50;
const MAX_PAGES = 40;
const MAX_DAYS_AHEAD = 400; // a few lots carry junk deadlines (2125, 2028)
const CATEGORY = { Goods: 'Goods', Works: 'Works', ConsultancyServices: 'Consultancy services', NonConsultancyServices: 'Non-consultancy services' };

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '').trim();

// Titles are sometimes partly Amharic; keep them if there's enough Latin text to read.
export function readableTitle(name) {
  const t = clean(name);
  return (t.match(/[A-Za-z]/g) ?? []).length >= 8 ? t : null;
}

export function mapEgpLot(lot, today) {
  if (!lot || lot.sourceApplication !== 'Tendering') return null; // skip RFQs / quotation purchases
  const deadline = String(lot.submissionDeadline ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline < today || deadline > addDays(today, MAX_DAYS_AHEAD)) return null;
  const title = readableTitle(lot.lotName) ?? readableTitle(lot.packageInformation?.name);
  if (!title) return null;
  const ref = clean(lot.procurementReferenceNo || lot.lotReferenceNo);
  const entity = clean(lot.procuringEntity || lot.packageInformation?.procuring_entity);
  const category = CATEGORY[lot.procurementCategory] ?? clean(lot.procurementCategory);
  const market = String(lot.marketPlace ?? '').toLowerCase();
  const invited = String(lot.invitationDate ?? '').slice(0, 10);
  const published = invited >= addDays(today, -365) && invited <= today ? invited : null;
  const description = clean(lot.lotDescription);
  return enrich({
    id: makeId('ethiopia-egp', lot.lotInPackageId || lot.id),
    source: 'Ethiopia e-GP (PPA)',
    funder: lot.origin === 'federal' ? 'Government of Ethiopia' : clean(lot.originName?.en) || 'Government of Ethiopia',
    title,
    url: LIST_URL,
    summary: [`${entity} — ${category}${market ? `, ${market} ${String(lot.method ?? 'open').toLowerCase()} tender` : ''}.`,
      description && description !== title ? description : null,
      ref ? `Search e-GP for reference ${ref}.` : null].filter(Boolean).join(' '),
    type: 'tender',
    deadline,
    published,
    countries: ['Ethiopia'],
    raw: { lotInPackageId: lot.lotInPackageId, packageId: lot.packageId, ref, entity, category: lot.procurementCategory, market: lot.marketPlace, origin: lot.origin },
  });
}

export async function fetchEthiopiaEgp() {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  let total = Infinity;
  for (let page = 0; page < MAX_PAGES && page * PAGE < total; page++) {
    const url = `${API}?type=all&top=${PAGE}&skip=${page * PAGE}&locale=en`;
    const res = await fetchRetry(url, { headers: { Accept: 'application/json' } }, { timeoutMs: 90000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page + 1}`);
    let data;
    try { data = await res.json(); } catch { throw new Error(`non-JSON response on page ${page + 1}`); }
    if (!Array.isArray(data?.items) || typeof data.total !== 'number') throw new Error('unexpected response shape');
    if (page === 0 && !data.items.length) throw new Error('no active tenders on page 1');
    total = data.total;
    for (const pkg of data.items) {
      for (const lot of pkg.result ?? []) {
        const key = lot.lotInPackageId || lot.id;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const rec = mapEgpLot(lot, today);
        if (rec) out.push(rec);
      }
    }
    if (!data.items.length) break;
    await new Promise((r) => setTimeout(r, 800));
  }
  if (!out.length) throw new Error('0 open tenders parsed');
  return out;
}
