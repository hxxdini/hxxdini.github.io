import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RELAY_DIR, readRelay, withRelay } from '../src/relay.js';

const key = `test-${process.pid}`;
const file = path.join(RELAY_DIR, `${key}.json`);
fs.mkdirSync(RELAY_DIR, { recursive: true });
const blocked = async () => { throw new Error('not a feed (0 bytes)'); };
try {
  assert.equal(readRelay(key).records, null);
  await assert.rejects(withRelay(key, blocked)(), /not a feed .*relay: no relay file/);

  fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date(Date.now() - 2 * 3600000).toISOString(), records: [{ id: 'a' }] }));
  const records = await withRelay(key, blocked)();
  assert.equal(records.length, 1);
  assert.match(records.partial, /used Mac relay from 2\.0h ago/);
  assert.deepEqual(await withRelay(key, async () => [{ id: 'live' }])(), [{ id: 'live' }]);

  fs.writeFileSync(file, JSON.stringify({ fetchedAt: new Date(Date.now() - 20 * 3600000).toISOString(), records: [{ id: 'a' }] }));
  await assert.rejects(withRelay(key, blocked)(), /relay file is 20h old/);
} finally {
  fs.rmSync(file, { force: true });
}
console.log('relay tests passed');
