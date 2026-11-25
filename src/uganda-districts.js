// Uganda districts and cities, and a parser that reads the district from a
// procuring entity name ("Terego District Local Government", "Mubende Municipal
// Council", "Kampala Capital City Authority").
//
// Only local governments get a district: district local governments, city,
// municipal, town and sub-county councils, and KCCA. National agencies
// (ministries, authorities, Parliament, universities, referral hospitals) get
// null, even when their name contains a place, because they buy for the whole
// country. Cities and municipalities map to the district they sit in
// (Fort Portal City -> Kabarole, Entebbe Municipal Council -> Wakiso).
//
// 136 districts (including Kampala) + 10 cities = 146 local governments.
// Sub-regions follow the usual UBOS grouping.

const SUBREGIONS = {
  'West Nile': ['Adjumani', 'Arua', 'Koboko', 'Madi-Okollo', 'Maracha', 'Moyo', 'Nebbi', 'Obongi', 'Pakwach', 'Terego', 'Yumbe', 'Zombo'],
  Acholi: ['Agago', 'Amuru', 'Gulu', 'Kitgum', 'Lamwo', 'Nwoya', 'Omoro', 'Pader'],
  Lango: ['Alebtong', 'Amolatar', 'Apac', 'Dokolo', 'Kole', 'Kwania', 'Lira', 'Otuke', 'Oyam'],
  Karamoja: ['Abim', 'Amudat', 'Kaabong', 'Karenga', 'Kotido', 'Moroto', 'Nabilatuk', 'Nakapiripirit', 'Napak'],
  Teso: ['Amuria', 'Bukedea', 'Kaberamaido', 'Kalaki', 'Kapelebyong', 'Katakwi', 'Kumi', 'Ngora', 'Serere', 'Soroti'],
  Bugisu: ['Bududa', 'Bulambuli', 'Manafwa', 'Mbale', 'Namisindwa', 'Sironko'],
  Sebei: ['Bukwo', 'Kapchorwa', 'Kween'],
  Bukedi: ['Budaka', 'Busia', 'Butaleja', 'Butebo', 'Kibuku', 'Pallisa', 'Tororo'],
  Busoga: ['Bugiri', 'Bugweri', 'Buyende', 'Iganga', 'Jinja', 'Kaliro', 'Kamuli', 'Luuka', 'Mayuge', 'Namayingo', 'Namutumba'],
  Bunyoro: ['Buliisa', 'Hoima', 'Kagadi', 'Kakumiro', 'Kibaale', 'Kikuube', 'Kiryandongo', 'Masindi'],
  Tooro: ['Bundibugyo', 'Bunyangabu', 'Kabarole', 'Kamwenge', 'Kasese', 'Kitagwenda', 'Kyegegwa', 'Kyenjojo', 'Ntoroko'],
  Ankole: ['Buhweju', 'Bushenyi', 'Ibanda', 'Isingiro', 'Kazo', 'Kiruhura', 'Mbarara', 'Mitooma', 'Ntungamo', 'Rubirizi', 'Rwampara', 'Sheema'],
  Kigezi: ['Kabale', 'Kanungu', 'Kisoro', 'Rubanda', 'Rukiga', 'Rukungiri'],
  Buganda: ['Buikwe', 'Bukomansimbi', 'Butambala', 'Buvuma', 'Gomba', 'Kalangala', 'Kalungu', 'Kassanda', 'Kayunga', 'Kiboga', 'Kyankwanzi', 'Kyotera', 'Luwero', 'Lwengo', 'Lyantonde', 'Masaka', 'Mityana', 'Mpigi', 'Mubende', 'Mukono', 'Nakaseke', 'Nakasongola', 'Rakai', 'Sembabule', 'Wakiso'],
  Kampala: ['Kampala'],
};

export const UGANDA_DISTRICTS = Object.entries(SUBREGIONS)
  .flatMap(([region, names]) => names.map((name) => ({ name, region })))
  .sort((a, b) => a.name.localeCompare(b.name));

// Cities (2020) and the district each sits in.
export const UGANDA_CITIES = {
  Arua: 'Arua', Gulu: 'Gulu', Lira: 'Lira', Soroti: 'Soroti', Mbale: 'Mbale', Jinja: 'Jinja',
  Masaka: 'Masaka', Mbarara: 'Mbarara', Hoima: 'Hoima', 'Fort Portal': 'Kabarole',
};

// Other spellings, and towns/municipalities whose name is not a district name.
const ALIASES = {
  luweero: 'Luwero', ssembabule: 'Sembabule', kasanda: 'Kassanda', 'madi okollo': 'Madi-Okollo',
  bunyangabo: 'Bunyangabu', busiia: 'Busia', kibale: 'Kibaale', bulisa: 'Buliisa', kaliiro: 'Kaliro',
  'fort portal': 'Kabarole', fortportal: 'Kabarole',
  entebbe: 'Wakiso', nansana: 'Wakiso', kira: 'Wakiso', 'makindye ssabagabo': 'Wakiso', 'makindye sabagabo': 'Wakiso', kasangati: 'Wakiso',
  njeru: 'Buikwe', lugazi: 'Buikwe', 'bushenyi ishaka': 'Bushenyi', ishaka: 'Bushenyi',
  bweyale: 'Kiryandongo', kigumba: 'Kiryandongo', busembatia: 'Bugweri', nkokonjeru: 'Buikwe',
  kampala: 'Kampala', kcca: 'Kampala',
};

const BY_KEY = new Map(UGANDA_DISTRICTS.map((d) => [d.name.toLowerCase().replace(/-/g, ' '), d]));
const REGION_OF = new Map(UGANDA_DISTRICTS.map((d) => [d.name, d.region]));
for (const [key, name] of Object.entries(ALIASES)) BY_KEY.set(key, { name, region: REGION_OF.get(name) });

export function districtSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function districtRegion(name) {
  return REGION_OF.get(name) ?? null;
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

// Local-government keywords, tolerant of typos such as "Distriict" or "Muncipal".
function keywordKind(token) {
  if (['dlg', 'lg', 'mc', 'tc', 'dist'].includes(token)) return 'lg';
  if (token.startsWith('d') && editDistance(token, 'district') <= 2) return 'lg';
  if (token.startsWith('m') && (editDistance(token, 'municipal') <= 2 || editDistance(token, 'municipality') <= 2)) return 'lg';
  if (token === 'city' || token === 'town') return 'lg';
  if (token === 'subcounty' || token === 'sub') return 'lg';
  return null;
}

function lookup(phrase) {
  const exact = BY_KEY.get(phrase);
  if (exact) return exact;
  if (phrase.length < 6 || phrase.includes(' ')) return null;
  // One-letter typos in longer names ("Bunyangabo", "Kyenjonjo"), only when unambiguous.
  const close = [...BY_KEY.entries()].filter(([key]) => !key.includes(' ') && editDistance(key, phrase) <= 1);
  const names = new Set(close.map(([, d]) => d.name));
  return names.size === 1 ? close[0][1] : null;
}

// Pulls the procuring entity out of a stored record. Older eGP rows have no
// raw.entity, but their summary is "<REF> <Entity> — <type> tender".
export function entityFromRecord({ raw, summary } = {}) {
  let data = raw;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = null; } }
  if (data?.entity) return String(data.entity).trim();
  const head = String(summary ?? '').split(' — ')[0].trim();
  return head.replace(/^\S*\/\S*\s+/, '').trim() || null;
}

// Returns { district, region } or null.
export function parseUgandaDistrict(entity) {
  const text = String(entity ?? '').toLowerCase().replace(/&/g, ' and ');
  if (!text.trim()) return null;
  if (/\bkampala\s+capital\s+city\b|\bkcca\b|\bkampala\s+city\s+council\b/.test(text)) return { district: 'Kampala', region: 'Kampala' };
  const tokens = text.replace(/sub[\s-]+county/g, 'subcounty').split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (!keywordKind(tokens[i])) continue;
    for (const size of [2, 1]) {
      if (i - size < 0) continue;
      const hit = lookup(tokens.slice(i - size, i).join(' '));
      if (hit) return { district: hit.name, region: hit.region ?? null };
    }
  }
  return null;
}
