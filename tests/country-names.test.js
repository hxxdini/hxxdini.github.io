import assert from 'node:assert/strict';
import { canonicalCountry, canonicalCountries, enrich } from '../src/normalize.js';

for (const [input, expected] of [
  ['Tanzania, United Republic of', 'Tanzania'], ['United Republic of Tanzania', 'Tanzania'], ['Tanzania', 'Tanzania'],
  ['Congo, Democratic Republic of', 'DR Congo'], ['Congo, The Democratic Republic of the', 'DR Congo'],
  ['Democratic Republic of the Congo', 'DR Congo'], ['DRC', 'DR Congo'], ['DR Congo', 'DR Congo'],
  ['Somalia, Federal Republic of', 'Somalia'], ['Somalia', 'Somalia'], ['Kenya', 'Kenya'], ['South Sudan', 'South Sudan'],
  ['Congo, Republic of', null], ['Congo', null], ['Thailand', null], ['', null],
]) assert.equal(canonicalCountry(input), expected, input);

assert.deepEqual(canonicalCountries(['Somalia, Federal Republic of', 'Somalia', 'Tanzania, United Republic of', 'Thailand']), ['Somalia', 'Tanzania']);
const rec = enrich({ title: 'Supply of desks in Tanzania', summary: '', countries: ['Tanzania, United Republic of'] });
assert.deepEqual(rec.countries, ['Tanzania']);
console.log('country name tests passed');
