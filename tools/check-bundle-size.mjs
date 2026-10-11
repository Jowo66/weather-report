// Bundle budgets (TDD §14): initial JS ≤ 250 KB gzip; the lazy Three.js chunk ≤ 200 KB gzip.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const INITIAL_KB = 250;
const THREE_KB = 200;
const dist = 'dist';
const base = '/weather-report/';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = [
  ...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+\.js)"/g),
].map((m) => (m[1].startsWith(base) ? m[1].slice(base.length) : m[1]));
if (initial.length === 0) {
  console.error('no scripts found in dist/index.html');
  process.exit(1);
}
const kb = (f) => gzipSync(readFileSync(join(dist, f))).length / 1024;
let total = 0;
for (const f of new Set(initial)) {
  const k = kb(f);
  total += k;
  console.log(`initial  ${f}: ${k.toFixed(1)} KB gzip`);
}
console.log(`initial JS: ${total.toFixed(1)} KB gzip (budget ${INITIAL_KB} KB)`);
let fail = total > INITIAL_KB;

const lazy = readdirSync(join(dist, 'assets'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => `assets/${f}`)
  .filter((f) => !initial.includes(f));
for (const f of lazy) {
  const k = kb(f);
  const src = readFileSync(join(dist, f), 'utf8');
  const isThree = src.includes('WebGLRenderer') || src.includes('THREE');
  console.log(
    `lazy     ${f}: ${k.toFixed(1)} KB gzip${isThree ? ` (three.js chunk, budget ${THREE_KB} KB)` : ''}`,
  );
  if (isThree && k > THREE_KB) fail = true;
  if (
    isThree &&
    initial.some((i) => readFileSync(join(dist, i), 'utf8').includes('WebGLRenderer'))
  ) {
    console.error('three.js leaked into the initial bundle');
    fail = true;
  }
}
if (fail) process.exit(1);
