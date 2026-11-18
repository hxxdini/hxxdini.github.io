import assert from 'node:assert/strict';
import { externalLinksNewTab as f } from '../src/external-links.js';

assert.equal(f('<a href="https://wa.me/1" rel="noopener">x</a>'), '<a href="https://wa.me/1" rel="noopener" target="_blank">x</a>');
assert.equal(f('<a class="cta" href="https://egp.gov.et/t">x</a>'), '<a class="cta" href="https://egp.gov.et/t" target="_blank" rel="noopener noreferrer">x</a>');
assert.equal(f('<a href="https://x.org" rel="nofollow">x</a>'), '<a href="https://x.org" rel="nofollow noopener" target="_blank">x</a>');
// left alone: internal, relative, own host, already targeted, non-http
for (const t of ['<a href="./lead/1.html">', '<a href="/for-you.html">', '<a href="#main">', '<a href="https://hxxdini.github.io/a.html">',
  '<a href="https://x.org" target="_self">', '<a href="mailto:a@b.c">', '<a href="tel:+256">', '<a name="x">']) assert.equal(f(t), t);
console.log('external-links: ok');
