import { makeId, enrich, stripHtml } from '../normalize.js';
import { fetchRetry } from '../http.js';

// Rwanda On-Line E-Procurement System (Umucyo, MINECOFIN / RPPA). Public, no login.
// The advertising list is a server-rendered table sorted by submission deadline,
// newest first, so we page until the first row whose deadline has passed.
// Each row's radio value carries the internal reference, stage and type that the
// public detail page takes as GET params:
//   value="{internalRef}|{name}|{peCode}|{dd/mm/yyyy}|{stageCd}|{method}|{typeCd}|{deadline dd/mm/yyyy hh:mm}|{statusCd}"
// Columns: radio | Tender Name | Tender No | Status | Advertising Date | Deadline | Planned Open | Stage Type
const BASE = 'https://www.umucyo.gov.rw';
const LIST = `${BASE}/eb/bav/selectListAdvertisingListForGU.do`;
const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const TYPES = { G: 'Goods', W: 'Works', C: 'Consultant Services', NC: 'Non Consultant Services' };

// dd/mm/yyyy[ hh:mm] -> yyyy-mm-dd
export function umucyoDate(s) {
  const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function detailUrl(internalRef, stageCd, typeCd) {
  const q = new URLSearchParams({ tendReferNo: internalRef, tendStageCd: stageCd, tendTypeCd: typeCd });
  return `${BASE}/eb/bav/selectAdvertisingDtlInfo.do?${q}`;
}

export function parseUmucyoList(html) {
  const rows = [];
  for (const tr of String(html ?? '').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const radio = tr.match(/name="tenderNo"[\s\S]*?value="([^"]+)"/i)?.[1];
    if (!radio) continue;
    const [internalRef, , peCode, , stageCd, method, typeCd, , statusCd] = radio.split('|');
    const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripHtml(m[1]).replace(/\s+/g, ' ').trim());
    if (cells.length < 6 || !internalRef) continue;
    const [, title, tenderNo, status, advertised, deadline] = cells;
    rows.push({
      internalRef, peCode, stageCd, method, typeCd, statusCd,
      title, tenderNo, status,
      published: umucyoDate(advertised),
      deadline: umucyoDate(deadline),
      deadlineRaw: deadline,
    });
  }
  return rows;
}

export function mapUmucyoRow(row, today) {
  if (!row.title || row.title.length < 8) return null;
  if (!row.deadline || row.deadline < today) return null;
  if (/cancel/i.test(row.status) || row.statusCd === 'C') return null;
  const entity = row.tenderNo.split('/').pop();
  const kind = TYPES[row.typeCd] ?? 'Tender';
  const method = row.method === 'ICB' ? 'international competitive bidding' : row.method === 'NCB' ? 'national competitive bidding' : row.method;
  return enrich({
    id: makeId('rwanda-umucyo', row.internalRef),
    source: 'Rwanda Umucyo (e-Procurement)',
    funder: 'Government of Rwanda',
    title: row.title,
    url: detailUrl(row.internalRef, row.stageCd, row.typeCd),
    summary: `${entity} — ${kind}, ${method} (${row.tenderNo}). Deadline ${row.deadlineRaw}.`,
    type: 'tender',
    deadline: row.deadline,
    published: row.published,
    countries: ['Rwanda'],
    raw: { internalRef: row.internalRef, tenderNo: row.tenderNo, status: row.status, method: row.method, typeCd: row.typeCd, stageCd: row.stageCd },
  });
}

export async function fetchRwandaUmucyo() {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchRetry(LIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `menuId=EB01020100&currentPageNo=${page}&recordCountPerPage=${PAGE_SIZE}`,
    }, { timeoutMs: 60000 });
    if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
    const rows = parseUmucyoList(await res.text());
    // Page 1 always has rows; an empty first page means the layout changed or we're blocked.
    if (!rows.length) {
      if (page === 1) throw new Error('no tender rows on page 1 (layout change or block?)');
      break;
    }
    for (const row of rows) {
      if (seen.has(row.internalRef)) continue;
      seen.add(row.internalRef);
      const rec = mapUmucyoRow(row, today);
      if (rec) out.push(rec);
    }
    // Sorted by deadline desc: once a page reaches past deadlines, the rest are closed.
    if (rows.some((r) => r.deadline && r.deadline < today)) break;
  }
  if (!out.length) throw new Error('0 open tenders parsed');
  return out;
}
