import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const dist = join(root, 'dist');
const required = ['index.html', 'favicon.svg'];

if (!existsSync(dist)) {
  console.error('[verify] dist/ does not exist. Run npm run build first.');
  process.exit(1);
}

for (const file of required) {
  const path = join(dist, file);
  if (!existsSync(path) || statSync(path).size === 0) {
    console.error(`[verify] Missing production asset: ${file}`);
    process.exit(1);
  }
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (!html.includes('<div id="root"></div>')) {
  console.error('[verify] dist/index.html is missing the React root.');
  process.exit(1);
}

if (!html.includes('/assets/')) {
  console.warn('[verify] No /assets/ reference found in index.html; verify the Vite output manually.');
}

console.log('[verify] Production output looks valid.');
