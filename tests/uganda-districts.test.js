import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UGANDA_DISTRICTS, UGANDA_CITIES, districtSlug, entityFromRecord, parseUgandaDistrict } from '../src/uganda-districts.js';
import { mapGppNotice } from '../src/sources/uganda_gpp.js';

// Real procuring-entity names seen on the eGP and GPP portals, plus common variants.
const cases = [
  ['Terego District Local Government', 'Terego', 'West Nile'],
  ['Nebbi District Local Government', 'Nebbi', 'West Nile'],
  ['Buikwe District Local Government', 'Buikwe', 'Buganda'],
  ['Bushenyi District Local Government', 'Bushenyi', 'Ankole'],
  ['Isingiro District Local Government', 'Isingiro', 'Ankole'],
  ['Bunyangabo DLG', 'Bunyangabu', 'Tooro'],
  ['Mubende Municipal Council', 'Mubende', 'Buganda'],
  ['Kampala Capital City Authority', 'Kampala', 'Kampala'],
  ['KCCA', 'Kampala', 'Kampala'],
  ['Arua Distriict Local Government', 'Arua', 'West Nile'],
  ['Arua City Council', 'Arua', 'West Nile'],
  ['Gulu City', 'Gulu', 'Acholi'],
  ['Mbarara City Council', 'Mbarara', 'Ankole'],
  ['Fort Portal City Council', 'Kabarole', 'Tooro'],
  ['Entebbe Municipal Council', 'Wakiso', 'Buganda'],
  ['Madi-Okollo District Local Government', 'Madi-Okollo', 'West Nile'],
  ['Luweero District Local Government', 'Luwero', 'Buganda'],
  ['Busia Muncipal Council', 'Busia', 'Bukedi'],
  ['Kabale District LG', 'Kabale', 'Kigezi'],
  ['Pakwach Town Council', 'Pakwach', 'West Nile'],
];
for (const [entity, district, region] of cases) {
  assert.deepEqual(parseUgandaDistrict(entity), { district, region }, entity);
}

// National agencies: no district, even when the name contains a place or "Local Government".
for (const entity of [
  'Uganda Civil Aviation Authority', 'Ministry of Water & Environment', 'Parliament of Uganda',
  'Ministry of Local Government', 'Uganda Electricity Distribution Company', 'Directorate of Public Prosecutions',
  'Directorate of Citizenship and Immigration Control', 'National Water & Sewerage Corporation',
  'Makerere University Business School', 'Gulu University', 'Office of the President',
  'Public Procurement and Disposal of the Public Assets Authority', 'Uganda Revenue Authority', '', null,
]) {
  assert.equal(parseUgandaDistrict(entity), null, String(entity));
}

// Lookup table: 136 districts (incl. Kampala) + 10 cities, unique names and slugs, every one parseable.
assert.equal(UGANDA_DISTRICTS.length, 136);
assert.equal(Object.keys(UGANDA_CITIES).length, 10);
assert.equal(new Set(UGANDA_DISTRICTS.map((d) => districtSlug(d.name))).size, UGANDA_DISTRICTS.length);
for (const { name, region } of UGANDA_DISTRICTS) {
  assert.deepEqual(parseUgandaDistrict(`${name} District Local Government`), { district: name, region }, name);
}
for (const [city, district] of Object.entries(UGANDA_CITIES)) {
  assert.equal(parseUgandaDistrict(`${city} City Council`)?.district, district, city);
}

// Older eGP rows keep the entity only in the summary, after the reference number.
assert.equal(entityFromRecord({ raw: '{"noticeId":"1","cells":[]}', summary: 'KCCA/SUPLS/2026-2027/00287 Kampala Capital City Authority — Supplies tender' }), 'Kampala Capital City Authority');
assert.equal(entityFromRecord({ raw: { entity: 'Terego District Local Government' }, summary: 'x' }), 'Terego District Local Government');
assert.equal(entityFromRecord({ summary: 'Nebbi District Local Government — Works tender' }), 'Nebbi District Local Government');

// Normalisation stores the district on the record and keeps the record ID unchanged.
const gpp = mapGppNotice({ id: 42, title: 'Construction of a seed secondary school', entity: 'Terego District Local Government', deadline: '2099-01-01' }, '2026-11-25');
assert.equal(gpp.id, mapGppNotice({ id: 42, title: 'Construction of a seed secondary school', entity: 'Ministry of Health', deadline: '2099-01-01' }, '2026-11-25').id);
assert.equal(gpp.district, 'Terego');
assert.equal(gpp.region, 'West Nile');
assert.equal(mapGppNotice({ id: 43, title: 'Supply of medical equipment', entity: 'Ministry of Health', deadline: '2099-01-01' }, '2026-11-25').district, undefined);

// Generated site: district index exists, and every district page is either indexed with tenders or noindex with the empty state.
const docs = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const districtDir = path.join(docs, 'tenders', 'uganda');
if (fs.existsSync(path.join(districtDir, 'index.html'))) {
  const sitemap = fs.readFileSync(path.join(docs, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /tenders\/uganda\/index\.html/);
  for (const file of fs.readdirSync(districtDir).filter((name) => name.endsWith('.html') && name !== 'index.html')) {
    const html = fs.readFileSync(path.join(districtDir, file), 'utf8');
    const inSitemap = sitemap.includes(`/tenders/uganda/${file}<`);
    if (html.includes('No open tenders right now.')) {
      assert.match(html, /name="robots" content="noindex,follow"/, file);
      assert.equal(inSitemap, false, file);
    } else {
      assert.equal(inSitemap, true, file);
    }
  }
}

console.log(`Uganda district parser verified: ${cases.length} local governments, ${UGANDA_DISTRICTS.length} districts`);
