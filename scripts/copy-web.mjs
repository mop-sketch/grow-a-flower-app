// Assembles the static web app into ./www, which Capacitor copies into the
// native Android project. Keeps the source files at the repo root (so the game
// still runs by opening index.html directly) while giving Capacitor a clean
// webDir without node_modules/android/etc.
import { cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

// Files and folders that make up the offline web app.
const entries = [
  'index.html',
  'learn more.html',
  'style.css',
  'fonts.css',
  'script.js',
  'game.js',
  'fonts',
  'flower',
  'music and images',
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of entries) {
  const src = join(root, entry);
  if (!existsSync(src)) {
    console.warn(`! skipped missing: ${entry}`);
    continue;
  }
  await cp(src, join(out, entry), { recursive: true });
  console.log(`copied ${entry}`);
}

console.log(`\nWeb bundle ready at ${out}`);
