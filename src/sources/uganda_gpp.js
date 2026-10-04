import { makeId, enrich } from '../normalize.js';
import { fetchRetry } from '../http.js';

// PPDA Government Procurement Portal (gpp.ppda.go.ug). The public site is an Angular
// app; its bid-invitations page reads this JSON API:
//   GET https://cdn.ppda.go.ug/api/tender/notices?fy=YYYY-YYYY
//   → { success, data: [{ id, title, estimatedValue, entity, procurement_type, sector, deadline, financial_year }] }
// The API returns 500 without `fy`, so we ask for the current and previous financial
// year (Uganda's FY runs July–June; notices from last FY can still be open).
const API = 'https://cdn.ppda.go.ug/api/tender/notices';
const NOTICE_URL = 'https://gpp.ppda.go.ug/public/bid-invitations/tender-notice';
const SOURCE = 'Uganda GPP (PPDA)';

export function financialYears(today) {
  const [y, m] = today.split('-').map(Number);
  const start = m >= 7 ? y : y - 1;
  return [`${start}-${start + 1}`, `${start - 1}-${start}`];
}

export function mapGppNotice(n, today) {
  const title = String(n?.title ?? '').replace(/\s+/g, ' ').trim();
  if (!n?.id || title.length < 8) return null;
  const deadline = /^\d{4}-\d{2}-\d{2}/.test(n.deadline ?? '') ? n.deadline.slice(0, 10) : null;
  if (!deadline || deadline < today) return null;

  const value = Number(n.estimatedValue);
  const amount = value > 0 ? `UGX ${value.toLocaleString('en-US')} (estimate)` : null;
  const parts = [n.entity, n.procurement_type && `${n.procurement_type} tender`, n.sector && `sector: ${n.sector}`].filter(Boolean);

  return enrich({
    id: makeId('uganda-gpp', String(n.id)),
    source: SOURCE,
    funder: 'Government of Uganda',
    title,
    url: `${NOTICE_URL}/${n.id}`,
    summary: parts.join(' — '),
    type: 'tender',
    deadline,
    amount,
    countries: ['Uganda'],
    raw: {
      noticeId: n.id,
      entity: n.entity ?? null,
      entityId: n.entity_id ?? null,
      procurementType: n.procurement_type ?? null,
      sector: n.sector ?? null,
      estimatedValue: Number.isFinite(value) ? value : null,
      financialYear: n.financial_year ?? null,
    },
  });
}

export async function fetchUgandaGpp() {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  let okYears = 0;

  for (const fy of financialYears(today)) {
    let body;
    try {
      const res = await fetchRetry(`${API}?fy=${fy}`, { headers: { Accept: 'application/json' } }, { timeoutMs: 90000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (e) {
      console.error(`  ! uganda-gpp fy=${fy}: ${e.message}`);
      continue;
    }
    if (!body?.success || !Array.isArray(body.data)) {
      console.error(`  ! uganda-gpp fy=${fy}: unexpected response shape`);
      continue;
    }
    okYears++;
    for (const n of body.data) {
      if (seen.has(n?.id)) continue;
      const rec = mapGppNotice(n, today);
      if (!rec) continue;
      seen.add(n.id);
      out.push(rec);
    }
  }
  // Both years failing is a source outage, not "no tenders" — surface it as a failure.
  if (okYears === 0) throw new Error('all financial-year requests failed');
  return out;
}
