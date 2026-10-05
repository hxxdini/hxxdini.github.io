import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseUmucyoList, mapUmucyoRow, umucyoDate, detailUrl } from '../src/sources/rwanda_umucyo.js';

const html = fs.readFileSync(new URL('./fixtures/umucyo-list.html', import.meta.url), 'utf8');
const rows = parseUmucyoList(html);
assert.equal(rows.length, 3);

const xray = rows.find((r) => /X-ray/.test(r.title));
assert.ok(xray, 'X-ray tender parsed');
assert.equal(xray.title, 'Supply and installation of X-ray machines');
assert.equal(xray.tenderNo, '000001/G/ICB/2026/2027/RBC');
assert.equal(xray.internalRef, '000001/G/ICB/2026/2027/1605000000');
assert.equal(xray.published, '2026-10-03');
assert.equal(xray.deadline, '2026-11-03');
assert.equal(xray.typeCd, 'G');
assert.equal(xray.stageCd, 'O');

const rec = mapUmucyoRow(xray, '2026-10-05');
assert.equal(rec.source, 'Rwanda Umucyo (e-Procurement)');
assert.equal(rec.type, 'tender');
assert.deepEqual(rec.countries, ['Rwanda']);
assert.equal(rec.ea_relevant, true);
assert.equal(rec.url, 'https://www.umucyo.gov.rw/eb/bav/selectAdvertisingDtlInfo.do?tendReferNo=000001%2FG%2FICB%2F2026%2F2027%2F1605000000&tendStageCd=O&tendTypeCd=G');
assert.match(rec.summary, /^RBC — Goods, international competitive bidding/);

// closed, cancelled and junk rows are dropped
assert.equal(mapUmucyoRow({ ...xray, deadline: '2026-10-01' }, '2026-10-05'), null);
assert.equal(mapUmucyoRow({ ...xray, status: 'Cancelled' }, '2026-10-05'), null);
assert.equal(mapUmucyoRow({ ...xray, title: 'abc' }, '2026-10-05'), null);

assert.equal(umucyoDate('21/10/2026 16:00'), '2026-10-21');
assert.equal(umucyoDate(''), null);
assert.ok(detailUrl('a/b', 'O', 'W').endsWith('tendReferNo=a%2Fb&tendStageCd=O&tendTypeCd=W'));

console.log('rwanda-umucyo tests passed');
