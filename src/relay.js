// Relay for sources that block GitHub's runner IPs (ReliefWeb).
//
//   node src/relay.js            fetch every relay source on this machine and
//                                write data/relay/<key>.json
//
// A machine that can reach the source (hxxdini's Mac, via launchd:
// ~/code/_scratch/fundradar-relay/run.sh) runs this and pushes only the JSON
// files. The pipeline on GitHub tries the source live first and falls back to
// a relay file younger than RELAY_MAX_AGE_HOURS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchReliefWeb } from './sources/reliefweb.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RELAY_DIR = path.join(ROOT, 'data', 'relay');
export const RELAY_MAX_AGE_HOURS = 12;

export const RELAY_SOURCES = {
  reliefweb: fetchReliefWeb,
};

export function readRelay(key, now = Date.now()) {
  const file = path.join(RELAY_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return { records: null, reason: 'no relay file' };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ageHours = (now - Date.parse(data.fetchedAt)) / 3600000;
  if (!Array.isArray(data.records) || Number.isNaN(ageHours)) return { records: null, reason: 'bad relay file' };
  if (ageHours > RELAY_MAX_AGE_HOURS) return { records: null, reason: `relay file is ${Math.round(ageHours)}h old` };
  return { records: data.records, ageHours };
}

// Wrap a fetcher: live first, relay file second. Both failing throws a
// message carrying both causes, so the run summary shows why.
export function withRelay(key, fetcher) {
  return async () => {
    try {
      return await fetcher();
    } catch (live) {
      const { records, ageHours, reason } = readRelay(key);
      if (!records) throw new Error(`${live.message} | relay: ${reason}`);
      records.partial = `live fetch blocked (${live.message.slice(0, 60)}); used Mac relay from ${ageHours.toFixed(1)}h ago`;
      return records;
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(RELAY_DIR, { recursive: true });
  let failed = 0;
  for (const [key, fetcher] of Object.entries(RELAY_SOURCES)) {
    try {
      const records = await fetcher();
      if (!records.length) throw new Error('0 records');
      fs.writeFileSync(path.join(RELAY_DIR, `${key}.json`), `${JSON.stringify({ fetchedAt: new Date().toISOString(), records })}\n`);
      console.log(`relay ${key}: ${records.length} records`);
    } catch (e) {
      failed++;
      console.log(`relay ${key}: FAILED ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
