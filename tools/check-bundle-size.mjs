// Initial-JS budget (TDD §14): ≤ 250 KB gzip for scripts referenced by dist/index.html.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = 250;
const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const base = '/weather-report/';
const srcs = [
  ...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="([^"]+\.js)"/g),
].map((m) => m[1]);
let total = 0;
for (const src of new Set(srcs)) {
  const file = join(dist, src.startsWith(base) ? src.slice(base.length) : src);
  const kb = gzipSync(readFileSync(file)).length / 1024;
  total += kb;
  console.log(`${file}: ${kb.toFixed(1)} KB gzip`);
}
console.log(`initial JS: ${total.toFixed(1)} KB gzip (budget ${BUDGET_KB} KB)`);
if (srcs.length === 0) {
  console.error('no scripts found in dist/index.html');
  process.exit(1);
}
if (total > BUDGET_KB) process.exit(1);
