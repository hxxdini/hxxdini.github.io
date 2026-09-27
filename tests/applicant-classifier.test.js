import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyApplicant } from '../src/normalize.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const labeledSample = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/applicant-classification.json'), 'utf8'));
const perType = new Map();
let correctLabels = 0;
let schoolTruePositives = 0;
let schoolFalsePositives = 0;

for (const sample of labeledSample) {
  const actual = classifyApplicant(sample);
  assert.equal(actual.applicantType, sample.expectedApplicantType, `${sample.id ?? sample.title}: applicant type`);
  assert.equal(actual.schoolEligibleUganda, sample.expectedSchoolEligibleUganda, `${sample.id ?? sample.title}: Uganda school flag`);
  correctLabels += 1;
  const counts = perType.get(actual.applicantType) ?? { predictions: 0, correct: 0 };
  counts.predictions += 1;
  counts.correct += 1;
  perType.set(actual.applicantType, counts);
  if (actual.schoolEligibleUganda) schoolTruePositives += 1;
  if (actual.schoolEligibleUganda && !sample.expectedSchoolEligibleUganda) schoolFalsePositives += 1;
}

const ruleCases = [
  {
    title: 'Uganda School Improvement Grants',
    summary: 'Eligible registered primary and secondary schools in Uganda may apply for school improvement grants.',
    eligibility: [],
    countries: ['Uganda'],
    type: 'grant',
    expectedApplicantType: 'school/institution',
    expectedSchoolEligibleUganda: true,
  },
  {
    title: 'Global Education Institution Grant',
    summary: 'Open to educational institutions worldwide. Educational institutions may apply for funding.',
    eligibility: [],
    countries: [],
    type: 'grant',
    expectedApplicantType: 'school/institution',
    expectedSchoolEligibleUganda: true,
  },
  {
    title: 'School Innovation Grant for Kenyan Schools',
    summary: 'Eligible schools may apply for this school grant.',
    eligibility: [],
    countries: ['Kenya'],
    type: 'grant',
    expectedApplicantType: 'school/institution',
    expectedSchoolEligibleUganda: false,
  },
  {
    title: 'Uganda classroom renovation tender',
    summary: 'Open tender for renovation works at a primary school.',
    eligibility: [],
    countries: ['Uganda'],
    type: 'tender',
    expectedApplicantType: 'firm/consultancy',
    expectedSchoolEligibleUganda: false,
  },
  {
    title: 'Uganda Community Education Grant',
    summary: 'Eligible NGOs and community-based organizations may apply in Uganda.',
    eligibility: ['NGOs/CSOs'],
    countries: ['Uganda'],
    type: 'grant',
    expectedApplicantType: 'NGO',
    expectedSchoolEligibleUganda: false,
  },
  {
    title: 'Uganda Local Government Climate Grant',
    summary: 'Local government authorities are eligible applicants for the grant.',
    eligibility: [],
    countries: ['Uganda'],
    type: 'grant',
    expectedApplicantType: 'government',
    expectedSchoolEligibleUganda: false,
  },
  {
    title: 'Consulting firms invited for MoES services tender',
    summary: 'Consulting firms may submit proposals.',
    eligibility: [],
    countries: ['Uganda'],
    type: 'tender',
    expectedApplicantType: 'firm/consultancy',
    expectedSchoolEligibleUganda: false,
  },
  {
    title: 'Applications & Forms - Maine DHHS',
    summary: "This form allows DHHS to release or obtain a participant's medical, billing or other confidential records. Use this application to apply for SUN Bucks, a federal summer grocery benefit for eligible school-aged children.",
    eligibility: [],
    countries: [],
    type: 'grant',
    expectedApplicantType: 'unknown',
    expectedSchoolEligibleUganda: false,
  },
];

for (const sample of ruleCases) {
  const actual = classifyApplicant(sample);
  assert.equal(actual.applicantType, sample.expectedApplicantType, `${sample.title}: applicant type`);
  assert.equal(actual.schoolEligibleUganda, sample.expectedSchoolEligibleUganda, `${sample.title}: Uganda school flag`);
}

const samplePrecision = correctLabels / labeledSample.length;
const schoolPrecision = schoolTruePositives + schoolFalsePositives === 0
  ? 'not measurable (no positive flags)'
  : `${(schoolTruePositives / (schoolTruePositives + schoolFalsePositives) * 100).toFixed(1)}%`;
console.log(`Labeled sample applicant-type precision: ${(samplePrecision * 100).toFixed(1)}% (${correctLabels}/${labeledSample.length})`);
console.log(`Labeled sample Uganda school-flag precision: ${schoolPrecision}`);
console.log(`Classifier rule cases: ${ruleCases.length} passed`);
console.log(`Labeled sample coverage: ${labeledSample.filter((sample) => sample.dataset === 'live').length} live records, ${labeledSample.filter((sample) => sample.dataset === 'brief').length} brief examples`);
