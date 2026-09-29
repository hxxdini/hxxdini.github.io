import { makeId, enrich, stripHtml, EA_COUNTRIES } from '../normalize.js';
import { fetchRetry } from '../http.js';

const API = 'https://www.ungm.org/Public/Notice/Search';

// UNGM — procurement notices across all UN agencies. POST returns HTML rows.
export async function fetchUngm({ pages = 20 } = {}) {
  const landing = await fetchRetry('https://www.ungm.org/Public/Notice');
  if (!landing.ok) throw new Error(`ungm landing HTTP ${landing.status}`);
  const landingHtml = await landing.text();
  const token = landingHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)?.[1];
  const cookies = landing.cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
  if (!token || !cookies.includes('__RequestVerificationToken=')) throw new Error('ungm search session unavailable');
  const out = [];
  for (let page = 0; page < pages; page++) {
    const res = await fetchRetry(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; FundRadar/0.1)', RequestVerificationToken: token, Cookie: cookies },
      body: JSON.stringify({
        PageIndex: page, PageSize: 15,
        Title: '', Description: '', Reference: '',
        PublishedFrom: '', PublishedTo: '', DeadlineFrom: '', DeadlineTo: '',
        Countries: [], Agencies: [], UNSPSCs: [], NoticeTypes: [],
        SortField: 'DatePublished', SortAscending: false,
        isPicker: false, NoticeDisplayType: null,
        IsSustainable: false, IsActive: true,
        NoticeSearchTotalLabelId: 'noticeSearchTotal', TypeOfCompetitions: [],
      }),

    });
    if (!res.ok) throw new Error(`ungm HTTP ${res.status}`);
    const html = await res.text();

    const rows = html.split(/data-noticeid="/).slice(1);
    if (rows.length === 0) break;

    for (const row of rows) {
      const noticeId = row.match(/^(\d+)"/)?.[1];
      if (!noticeId) continue;

      const title = stripHtml(row.match(/ungm-title ungm-title--small">([\s\S]*?)<\/span>/)?.[1] ?? '');
      const agency = stripHtml(row.match(/resultAgency">\s*<span>([\s\S]*?)<\/span>/)?.[1] ?? '');
      // Country is the text of the last plain tableCell span in the row
      const cellTexts = [...row.matchAll(/<div role="cell" class="tableCell">\s*<span>([\s\S]*?)<\/span>/g)]
        .map((m) => stripHtml(m[1])).filter(Boolean);
      const country = cellTexts[cellTexts.length - 1] ?? '';
      if (!title || !EA_COUNTRIES.some((c) => country.includes(c.split(',')[0]))) continue;

      let deadline = null;
      const remaining = row.match(/remainingDaysToDeadline"[^>]*>([\d.]+)</)?.[1];
      if (remaining) {
        deadline = new Date(Date.now() + Number(remaining) * 86400000).toISOString().slice(0, 10);
      }
      const reference = stripHtml(row.match(/data-description="Reference">\s*<span>([\s\S]*?)<\/span>/)?.[1] ?? '');

      out.push(enrich({
        id: makeId('ungm', noticeId),
        source: 'UNGM (UN agencies)',
        funder: agency || 'UN',
        title: title.slice(0, 300),
        url: `https://www.ungm.org/Public/Notice/${noticeId}`,
        summary: [agency, reference, country].filter(Boolean).join(' — '),
        type: 'tender',
        deadline,
        countries: [country],
        raw: { noticeId, reference },
      }));
    }
    if (rows.length < 15) break;
  }
  return out;
}
