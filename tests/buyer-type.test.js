import assert from 'node:assert/strict';
import { buyerType, classifyBuyerName, BUYER_TYPES } from '../src/buyer-type.js';

// Single-buyer sources are labelled by source, whatever the funder says.
assert.deepEqual(buyerType({ source: 'Uganda eGP (PPDA)', funder: 'Arua City Council' }), { key: 'government', label: 'Government' });
assert.deepEqual(buyerType({ source: 'Tanzania NeST (PPRA)', funder: null }), { key: 'government', label: 'Government' });
assert.deepEqual(buyerType({ source: 'World Bank Procurement', funder: 'World Bank' }), { key: 'government', label: 'Government (World Bank-financed)' });
assert.equal(buyerType({ source: 'UNGM (UN agencies)', funder: 'UNICEF' }).key, 'donor');
assert.equal(buyerType({ source: 'African Union Commission', funder: '' }).key, 'regional');
assert.equal(buyerType({ source: 'Welthungerhilfe', funder: 'Welthungerhilfe' }).label, 'NGO');

// Mixed sources fall back to the buyer's name (real funders from the DB, 2026-11-28).
const cases = [
  ['Federal Government Of Somalia', 'government'],
  ['Government Of Somaliland (GoSL)', 'government'],
  ['Dept of the Army -- Materiel Command', 'government'],
  ['UNHCR', 'donor'],
  ['GIZ', 'donor'],
  ['United Nations Population Fund', 'donor'],
  ['United Nations Development Programme (UNDP) and Tencent Charity Foundation', 'donor'],
  ['European Commission', 'donor'],
  ['High Commission of Canada in Australia', 'donor'],
  ['UK Foreign, Commonwealth & Development Office (FCDO)', 'donor'],
  ['Save The Childrens International', 'ngo'],
  ['Nordic International Support Foundation (NIS)', 'ngo'],
  ['WARDI Relief &Amp; Development Initiatives', 'ngo'],
  ['Somaliland National Youth Organizations (SONYO)', 'ngo'],
  ['Refugee Consortium of Kenya', 'ngo'],
  ['Norwegian Refugee Council', 'ngo'],
  ['World Vision International (WVI)', 'ngo'],
  ['Central Bank Of Somalia', 'government'],
  ['Kampala Breweries Limited', 'private'],
  ['Acme Supplies Ltd', 'private'],
];
for (const [name, key] of cases) assert.equal(classifyBuyerName(name), key, name);

// Unknown or empty names get no label rather than a guess.
for (const name of [null, '', 'Tiko', 'Media in Cooperation and Transition', 'Screenwest', 'CORE Group', 'Global Emergency Group']) assert.equal(classifyBuyerName(name), null, String(name));
assert.equal(buyerType({ source: 'Web Radar (unverified lead)', funder: null }), null);
assert.equal(buyerType({ source: 'SomaliJobs tenders', funder: 'UNHCR' }).key, 'donor');

// "UN" must be a word, not a prefix of another word.
assert.equal(classifyBuyerName('Universal Builders'), null);
assert.equal(Object.keys(BUYER_TYPES).length, 5);
console.log('buyer-type: ok');
