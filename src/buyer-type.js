// Buyer type: who is buying (tenders) or funding (grants). Suppliers filter on
// this ("only government tenders", "only NGO work"), so a wrong label costs
// trust: when we can't tell, return null and show nothing.
//
// Most sources have one kind of buyer, so the source decides. Mixed sources
// (job boards, aggregators) fall back to the funder / procuring entity name.

export const BUYER_TYPES = {
  government: 'Government',
  donor: 'UN / donor',
  regional: 'Regional body',
  ngo: 'NGO',
  private: 'Private company',
};

const BY_SOURCE = {
  'Uganda eGP (PPDA)': 'government',
  'Uganda GPP (PPDA)': 'government',
  'Rwanda Umucyo (e-Procurement)': 'government',
  'Ethiopia e-GP (PPA)': 'government',
  'Kenya PPIP (tenders.go.ke)': 'government',
  'Tanzania NeST (PPRA)': 'government',
  // World Bank notices are issued by the borrowing government's project unit.
  'World Bank Procurement': 'government',
  'UNGM (UN agencies)': 'donor',
  'EU Funding & Tenders': 'donor',
  'Enabel (Belgian development agency)': 'donor',
  'AECF (Africa Enterprise Challenge Fund)': 'donor',
  'UK International Development Funding Finder': 'donor',
  'Grants.gov': 'donor',
  'IGAD (Intergovernmental Authority on Development)': 'regional',
  'African Union Commission': 'regional',
  'Danish Refugee Council (DRC)': 'ngo',
  'Kenya Red Cross Society': 'ngo',
  'Prosper Global (formerly Mercy Corps)': 'ngo',
  'GOAL Global': 'ngo',
  'Amref Health Africa': 'ngo',
  'Welthungerhilfe': 'ngo',
};

const SOURCE_LABELS = { 'World Bank Procurement': 'Government (World Bank-financed)' };

// "Group" and plain "Bank" are left out: CORE Group is an NGO network and
// central banks are government.
// Checked in order: donor names often contain "Commission"/"Agency", so donor
// and regional patterns run before the generic government words.
const NAME_RULES = [
  ['donor', /\b(United Nations|UN|UNICEF|UNDP|UNHCR|UNFPA|UNOPS|UNESCO|UNEP|UN[- ]Women|UN[- ]Habitat|WFP|FAO|WHO|IOM|ILO|IFAD|World Bank|IFC|African Development Bank|AfDB|European (Union|Commission)|EU|GIZ|KfW|USAID|FCDO|JICA|KOICA|AFD|Sida|Enabel|Embassy|High Commission|Global Fund)\b/i],
  ['regional', /\b(IGAD|African Union|East African Community|EAC|COMESA|SADC)\b/i],
  ['government', /\b(Government|Central Bank|Reserve Bank|Revenue Authority|Ministry|Minist[eè]re|District (Local Government|Council)|City Council|Municipal(ity)?|County|Federal|Authority|Dept|Department|Bureau)\b/i],
  ['ngo', /\b(NGO|Foundation|Trust|Charit(y|able)|Relief|Refugee|Red Cross|Red Crescent|Save the Child\w*|World Vision|Oxfam|Plan International|Sightsavers|Mercy Corps|Trocaire|Hilfe|Initiatives?|Organi[sz]ations?|Association|Consortium|Society|Forum)\b/i],
  ['private', /\b(Ltd|Limited|PLC|Inc|LLC|Company|Corporation)\b/i],
];

export function classifyBuyerName(name) {
  const s = String(name || '').replace(/&amp;/gi, '&').trim();
  if (!s) return null;
  for (const [key, re] of NAME_RULES) if (re.test(s)) return key;
  return null;
}

// row needs { source, funder }. Returns { key, label } or null.
export function buyerType(row) {
  const key = BY_SOURCE[row?.source] ?? classifyBuyerName(row?.funder);
  if (!key) return null;
  return { key, label: SOURCE_LABELS[row.source] ?? BUYER_TYPES[key] };
}
