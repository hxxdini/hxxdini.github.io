// Real-browser fetch for sources that only work in a normal browser: pages
// rendered by JavaScript, or sites that turn away plain HTTP clients.
// Runs on hxxdini's Mac through the relay (src/relay.js); GitHub runners don't
// have the browser, so browser sources are relay-only.
//
// Rules: public pages only, no logins, no CAPTCHA solving, one page at a time
// with a pause between pages, and respect robots.txt Disallow rules.
//
// Env: FUNDRADAR_CHROME = path to a Chromium/Chrome binary.
const DEFAULT_CHROME = '/Users/stordy/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

let browserPromise = null;

async function launch() {
  const { chromium } = await import('playwright-core');
  return chromium.launch({ executablePath: process.env.FUNDRADAR_CHROME || DEFAULT_CHROME, headless: true });
}

const robotsCache = new Map();
export async function allowedByRobots(url) {
  const { origin, pathname } = new URL(url);
  if (!robotsCache.has(origin)) {
    let rules = [];
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
      if (res.ok) rules = parseRobots(await res.text());
    } catch {}
    robotsCache.set(origin, rules);
  }
  return !robotsCache.get(origin).some((rule) => rule && pathname.startsWith(rule));
}

// Disallow lines from the "User-agent: *" group
export function parseRobots(text) {
  const out = [];
  let star = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(key)) star = value === '*';
    else if (star && /^disallow$/i.test(key) && value) out.push(value);
  }
  return out;
}

// Load a page like a normal visitor and return its final HTML.
export async function browserFetch(url, { waitFor, timeoutMs = 60000, pauseMs = 1500 } = {}) {
  if (!(await allowedByRobots(url))) throw new Error(`robots.txt disallows ${url}`);
  browserPromise ??= launch();
  const browser = await browserPromise;
  const context = await browser.newContext({ userAgent: UA, locale: 'en-GB', viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: timeoutMs });
    else await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
    const html = await page.content();
    await new Promise((r) => setTimeout(r, pauseMs));
    return { status: res?.status() ?? 0, html };
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) (await browserPromise).close().catch(() => {});
  browserPromise = null;
}
