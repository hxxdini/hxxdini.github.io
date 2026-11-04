import assert from 'node:assert/strict';
import { detectTenderCategory, tenderCategoryLabel } from '../src/normalize.js';

const cases = [
  ['PROPOSED CONSTRUCTION OF MORUERIS DISPENSARY AT MORUERIS IN KAALENG/KAIKOR WARD', 'construction'],
  ['Procurement of Deep Water Well Drilling Works', 'construction'],
  ['Procurement of a consultant to conduct a National Digital Skills Training Programme', 'consultancy'],
  ['Final Independent Evaluation of Better Regional Migration Management II Programme', 'consultancy'],
  ['ITB for Procurement of IT Equipments', 'ict'],
  ['different kind of toner', 'ict'],
  ['Procurement of Medical Supplies, Laboratory Reagents and Chemicals', 'medical'],
  ['Procurement of Fuel and Lubricants', 'vehicles'],
  ['Procurement of Tyre', 'vehicles'],
  ['Procurement of Food and Beverages', 'hospitality'],
  ['RETURN AIR TICKET FOR BOARD MEMBERS', 'hospitality'],
  ['Procurement of Loading Unloading Service', 'facilities'],
  ['DRC-ITB OF SECURITY SERVICE', 'facilities'],
  ['Supply of Solar Panels and their Accessories for Selected Milk Collection Centres', 'energy'],
  ['Procurement of Agricultural Inputs', 'agriculture'],
  ['Procurement of Printing and Publishing Services', 'printing'],
  ['Procurement of Stationary Materials', 'supplies'],
  ['Supply of Furniture (Desks, Tables Chairs) on Framework Contract', 'supplies'],
  ['SPECIALLY PERMITTED PROCUREMENT PROCEDURE', 'other'],
];

for (const [title, expected] of cases) {
  assert.equal(detectTenderCategory(title), expected, title);
}
// Summary is the fallback when the title says nothing
assert.equal(detectTenderCategory('Tender No. 12/2026', 'Construction of a two-classroom block'), 'construction');
assert.equal(tenderCategoryLabel('ict'), 'ICT, Computers & Electronics');
assert.equal(tenderCategoryLabel('other'), 'Other Goods & Services');
console.log('tender-category tests passed');
