// Asset pipeline check (TDD §8.2, §14). Validates licensing and the 4 MB avatar budget for every
// file under public/models and public/textures. The character files are produced by
// tools/characters/build-ubc.py; list every shipped file in public/models/LICENSES.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const BUDGET = 4 * 1024 * 1024;
const roots = ['public/models', 'public/textures'].filter((d) => existsSync(d));
const licences = readFileSync('public/models/LICENSES.md', 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = roots.flatMap(walk).filter((f) => !f.endsWith('LICENSES.md'));
let total = 0;
const unlisted = [];
for (const f of files) {
  total += statSync(f).size;
  // LICENSES.md uses forward slashes on every platform.
  const posix = (p) => p.split(sep).join('/');
  const rel = posix(relative('public/models', f));
  if (!licences.includes(rel) && !licences.includes(posix(relative('public', f)))) unlisted.push(f);
}
console.log(
  `${files.length} asset file(s), ${(total / 1024).toFixed(1)} KB (budget ${BUDGET / 1024 / 1024} MB)`,
);
if (unlisted.length) {
  console.error('Not listed in public/models/LICENSES.md:\n  ' + unlisted.join('\n  '));
  process.exit(1);
}
if (total > BUDGET) {
  console.error('Asset budget exceeded');
  process.exit(1);
}
