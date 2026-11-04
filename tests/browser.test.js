import assert from 'node:assert/strict';
import { parseRobots } from '../src/browser.js';

assert.deepEqual(parseRobots('User-agent: Googlebot\nDisallow: /private\n\nUser-agent: *\nDisallow: /admin # staff\nDisallow:\nAllow: /\n'), ['/admin']);
assert.deepEqual(parseRobots(''), []);
console.log('browser robots tests passed');
