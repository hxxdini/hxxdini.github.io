import crypto from 'node:crypto';

export const EA_COUNTRIES = [
  'Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi',
  'South Sudan', 'Ethiopia', 'Somalia', 'Congo, Democratic Republic of',
];

const COUNTRY_ALIASES = {
  'Uganda': ['uganda', 'ugandan'],
  'Kenya': ['kenya', 'kenyan'],
  'Tanzania': ['tanzania', 'tanzanian'],
  'Rwanda': ['rwanda', 'rwandan'],
  'Burundi': ['burundi'],
  'South Sudan': ['south sudan'],
  'Ethiopia': ['ethiopia', 'ethiopian'],
  'Somalia': ['somalia', 'somali '],
  'Congo, Democratic Republic of': ['democratic republic of congo', 'dr congo', 'drc'],
};

const REGION_HINTS = [
  'east africa', 'eastern africa', 'sub-saharan africa', 'sub saharan africa',
  'africa', 'african', 'developing countries', 'global south', 'low- and middle-income',
  'low and middle income', 'lmic', 'acp countries', 'worldwide', 'global',
];

const SECTOR_KEYWORDS = {
  'Agriculture & Food': ['agricultur', 'farmer', 'food security', 'agri-', 'agribusiness', 'livestock', 'crop', 'fisheries', 'nutrition'],
  'Health': ['health', 'medical', 'disease', 'hiv', 'malaria', 'tuberculosis', 'vaccine', 'maternal', 'sanitation'],
  'Education': ['education', 'school', 'teacher', 'learner', 'literacy', 'scholarship', 'curriculum', 'student'],
  'Climate & Environment': ['climate', 'environment', 'biodiversity', 'conservation', 'renewable', 'resilience', 'adaptation', 'carbon', 'forest'],
  'Water & WASH': ['water', 'wash ', 'hygiene', 'irrigation', 'borehole'],
  'Governance & Rights': ['governance', 'human rights', 'democracy', 'justice', 'accountability', 'anti-corruption', 'rule of law', 'civic'],
  'Gender & Inclusion': ['gender', 'women', 'girls', 'gbv', 'inclusion', 'disability', 'lgbt'],
  'Youth': ['youth', 'young people', 'adolescent'],
  'Energy': ['energy', 'solar', 'electrification', 'off-grid'],
  'Digital & ICT': ['digital', 'ict', 'technology', 'innovation', 'internet', ' ai ', 'data '],
  'Humanitarian': ['humanitarian', 'refugee', 'displacement', 'emergency', 'crisis response'],
  'Livelihoods & Economic Dev': ['livelihood', 'economic', 'entrepreneur', 'sme', 'business development', 'employment', 'financial inclusion', 'microfinance', 'trade'],
  'Media & Journalism': ['journalis', 'media', 'press freedom', 'reporting'],
};

const ELIGIBILITY_KEYWORDS = {
  'NGOs/CSOs': ['ngo', 'civil society', 'cso', 'non-profit', 'nonprofit', 'community-based', 'community organisations', 'community organizations'],
  'Local/national organizations': ['local organi', 'national organi', 'grassroots', 'locally led', 'local partners'],
  'SMEs/Startups': ['sme', 'startup', 'start-up', 'enterprise', 'business'],
  'Individuals': ['individual', 'fellowship', 'scholarship', 'artist', 'writer', 'student'],
  'Researchers/Academia': ['research', 'universit', 'academic', 'scientist'],
  'Journalists': ['journalist', 'media professional'],
  'Government': ['government', 'ministry', 'public sector', 'municipal'],
};

export function makeId(source, key) {
  return crypto.createHash('sha256').update(`${source}::${key}`).digest('hex').slice(0, 24);
}

export function stripHtml(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectCountries(text) {
  const t = ` ${text.toLowerCase()} `;
  const hits = [];
  for (const [country, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) hits.push(country);
  }
  return hits;
}

export function detectRegionHint(text) {
  const t = text.toLowerCase();
  return REGION_HINTS.some((r) => t.includes(r));
}

export function detectSectors(text) {
  const t = ` ${text.toLowerCase()} `;
  const hits = [];
  for (const [sector, kws] of Object.entries(SECTOR_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) hits.push(sector);
  }
  return hits;
}

export function detectEligibility(text) {
  const t = ` ${text.toLowerCase()} `;
  const hits = [];
  for (const [group, kws] of Object.entries(ELIGIBILITY_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) hits.push(group);
  }
  return hits;
}

const SCHOOL_APPLICANT_PATTERNS = [
  /\b(?:(?:registered|accredited|licensed|public|private|primary|secondary|elementary|high|local|ugandan)\s+)*schools?\s+(?:are\s+)?(?:eligible(?:\s+to\s+apply)?|may\s+apply|can\s+apply|are\s+invited\s+to\s+apply|can\s+submit\s+(?:an?\s+)?applications?)\b/i,
  /\b(?:eligible|qualifying)\s+(?:(?:registered|accredited|licensed|public|private|primary|secondary|elementary|high|local|ugandan)\s+)*(?:schools?|educational institutions?)(?![-\w])\b/i,
  /\b(?:eligible|qualifying)\s+(?:registered\s+)?(?:primary and secondary|primary|secondary|public|private)\s+schools?\b/i,
  /\b(?:applications?|grants?|funding)\b.{0,45}\b(?:open|available)\b.{0,45}\b(?:schools?|educational institutions?)\b/i,
  /\bapplications?\s+from\s+(?:(?:registered|accredited|public|private|primary|secondary|local|ugandan)\s+)*(?:schools?|educational institutions?)\b/i,
  /\beligible applicants?\s+(?:include|may include|are)\b[^.;]{0,80}\b(?:schools?|educational institutions?)\b/i,
  /\b(?:educational|education) institutions?\s+(?:may|can|are invited to)\s+apply\b/i,
  /\bschools?\s+(?:are eligible to receive|may receive|can receive)\s+(?:a\s+)?(?:grant|funding|financial support)\b/i,
];

function textList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {}
  return [value.trim()];
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyApplicant({ title = '', summary = '', description = '', eligibility = [], countries = [], type = '' } = {}) {
  const sourceText = `${title} ${summary} ${description}`;
  const text = sourceText
    .replace(/funds\s*for\s*ngos/gi, ' ')
    .replace(/\bthe post\b[\s\S]*?\bfirst appeared on\b[\s\S]*$/i, ' ')
    .toLowerCase();
  const eligibilityLabels = textList(eligibility).map((value) => value.toLowerCase());
  const countryLabels = textList(countries).map((value) => value.toLowerCase());
  const typeLabel = String(type ?? '').toLowerCase();
  const eligibilityText = eligibilityLabels.join(' ');
  const allText = `${text} ${eligibilityText}`;

  const schoolApplicant = hasAny(allText, SCHOOL_APPLICANT_PATTERNS);
  const universityStaff = hasAny(allText, [
    /\b(?:university|universities|academic)\s+(?:staff|faculty|employees|research staff)\b/i,
    /\b(?:staff|faculty members|academics)\b.{0,55}\b(?:university|universities|makerere)\b/i,
    /\bmakerere\b.{0,55}\b(?:staff|faculty)\b/i,
  ]);
  const individualApplicant = hasAny(allText, [
    /\bindividual\s+(?:applicants?|consultants?|consultancy)\b/i,
    /\bindividuals?\s+(?:may|can)\s+apply\b/i,
    /\bapply\s+as\s+(?:an?\s+)?individual\b/i,
    /\b(?:fellowships?|fellows?|scholarships?)\b/i,
    /\b(?:students?|teachers?)\s+(?:may|can|are eligible to)\s+apply\b/i,
    /\byouth[- ]led innovators?\b/i,
  ]) || eligibilityLabels.some((label) => /^individuals?$/.test(label));
  const governmentApplicant = hasAny(allText, [
    /\b(?:governments?|ministries|local authorities|municipalities|public agencies)\b.{0,70}\b(?:eligible|applicants?|may apply|can apply|invited to apply|apply)\b/i,
    /\b(?:eligible applicants?|applicants?|applications? from|proposals? from|open to)\b.{0,70}\b(?:governments?|ministries|local authorities|municipalities|public agencies)\b/i,
  ]);
  const ngoApplicant = hasAny(allText, [
    /\b(?:ngos?|csos?|civil society organizations?|nonprofits?|non-profit organizations?|community-based organizations?)\b.{0,70}\b(?:eligible|applicants?|may apply|can apply|apply|applications?|proposals?)\b/i,
    /\b(?:eligible applicants?|applicants?|applications? from|proposals? from|open to)\b.{0,70}\b(?:ngos?|csos?|civil society organizations?|nonprofits?|non-profit organizations?|community-based organizations?)\b/i,
  ]) || (
    eligibilityLabels.some((label) => /^(?:ngos\/csos|local\/national organizations)$/.test(label))
    && !/funds\s*for\s*ngos/i.test(sourceText)
    && !individualApplicant
  );
  const individualConsultancy = /\bindividual\s+(?:consultant|consultancy)\b/i.test(allText);
  const firmApplicant = !individualConsultancy && (
    hasAny(allText, [
      /\b(?:consulting firms?|consultancies|consultants?|contractors?|suppliers?|vendors?|companies|firms|businesses|smes|start-?ups?)\b/i,
    ]) || eligibilityLabels.some((label) => /^smes\/startups$/.test(label))
  );

  let applicantType = 'unknown';
  if (schoolApplicant) applicantType = 'school/institution';
  else if (universityStaff) applicantType = 'university staff';
  else if (individualApplicant) applicantType = 'individual/fellow';
  else if (governmentApplicant) applicantType = 'government';
  else if (ngoApplicant) applicantType = 'NGO';
  else if (firmApplicant || typeLabel === 'tender') applicantType = 'firm/consultancy';

  const hasUgandaScope = countryLabels.some((country) => /\buganda\b/.test(country))
    || /\b(?:uganda|ugandan|worldwide|globally|global applicants|international applicants|african countries|across (?:east africa|africa|sub[- ]?saharan africa)|throughout (?:east africa|africa))\b/i.test(text);
  const fundingCall = typeLabel === 'grant' || (
    !['tender', 'fellowship', 'prize'].includes(typeLabel)
    && /\b(?:grants?|funding|financial support)\b/i.test(allText)
  );

  return {
    applicantType,
    schoolEligibleUganda: schoolApplicant && hasUgandaScope && fundingCall && typeLabel !== 'tender',
  };
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Extract a deadline date from free text: "Deadline: 12 August 2026", "(Deadline: July 31, 2026)", "12-Aug-26", "31/07/2026"
export function extractDeadline(text) {
  if (!text) return null;
  const t = text.replace(/ /g, ' ');

  // "Deadline: <something>" windows first, else scan whole text
  const windowMatch = t.match(/deadline[^a-z0-9]{0,5}(?:date)?[^a-z0-9]{0,5}([^.;|]{4,60})/i);
  const scan = windowMatch ? windowMatch[1] : t;

  // 12 August 2026 / August 12, 2026 / 12-Aug-2026 / 12 Aug 26
  let m = scan.match(/(\d{1,2})[\s\-/]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/,]*(\d{2,4})/i);
  if (m) return toIso(m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], m[1]);
  m = scan.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/]*(\d{1,2})(?:st|nd|rd|th)?[\s\-/,]*(\d{2,4})/i);
  if (m) return toIso(m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], m[2]);
  // 31/07/2026 or 31-07-2026 (day-first, the regional convention)
  m = scan.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return toIso(m[3], Number(m[2]) - 1, m[1]);
  // ISO already
  m = scan.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function toIso(y, monthIdx, d) {
  let year = Number(y);
  if (year < 100) year += 2000;
  const day = Number(d);
  if (monthIdx == null || monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return null;
  if (year < 2020 || year > 2035) return null;
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Extract an amount like "$50,000", "USD 100,000", "€2 million", "UGX 20,000,000"
export function extractAmount(text) {
  if (!text) return null;
  const m = text.match(/(?:USD|EUR|GBP|UGX|KES|TZS|\$|€|£)\s?[\d,.]+(?:\s?(?:million|m|billion|k))?/i);
  return m ? m[0].trim() : null;
}

// A record is EA-relevant if it names an EA country, or is Africa/global-scoped
export function isEaRelevant(countries, text) {
  if (countries.length > 0) return true;
  return detectRegionHint(text);
}

export function enrich(base) {
  const text = `${base.title} ${base.summary ?? ''}`;
  // Merge explicit source countries (authoritative) with text detection
  const countries = [...new Set([...(base.countries ?? []), ...detectCountries(text)])];
  return {
    ...base,
    countries,
    sectors: detectSectors(text),
    eligibility: detectEligibility(text),
    deadline: base.deadline ?? extractDeadline(text),
    amount: base.amount ?? extractAmount(text),
    ea_relevant: isEaRelevant(countries, text),
  };
}
