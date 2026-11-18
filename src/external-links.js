// Make every off-site link in generated HTML open in a new tab.
// Applied to each page as it is written, so new templates are covered too.
const OWN_HOSTS = new Set(['hxxdini.github.io']);

export function externalLinksNewTab(html) {
  return html.replace(/<a\b([^>]*)>/gi, (tag, attrs) => {
    const href = /\shref\s*=\s*"([^"]*)"/i.exec(attrs);
    if (!href) return tag;
    let url;
    try { url = new URL(href[1]); } catch { return tag; }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || OWN_HOSTS.has(url.hostname)) return tag;
    if (/\starget\s*=/i.test(attrs)) return tag;
    let out = attrs + ' target="_blank"';
    const rel = /\srel\s*=\s*"([^"]*)"/i.exec(out);
    if (!rel) out += ' rel="noopener noreferrer"';
    else if (!/\bnoopener\b/i.test(rel[1])) out = out.replace(rel[0], ` rel="${`${rel[1]} noopener`.trim()}"`);
    return `<a${out}>`;
  });
}
