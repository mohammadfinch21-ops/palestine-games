/**
 * Copy ../app → mobile/www for Capacitor sync, excluding dev/heavy artifacts.
 * Patterns mirror app/.capacitorignore (Capacitor 6 has no built-in ignore file).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(mobileRoot, '../app');
const outRoot = path.resolve(mobileRoot, 'www');

const IGNORE_DIR_NAMES = new Set([
  'node_modules',
  'netlify-deploy',
  '__pycache__',
  '.pytest_cache',
  'scripts',
]);

function shouldIgnore(relPosix) {
  const base = path.basename(relPosix);
  const parts = relPosix.split('/');

  if (parts.some((p) => IGNORE_DIR_NAMES.has(p))) return true;
  if (/\.(py|md|bat|ps1|mjs)$/i.test(base)) return true;
  if (/^(_test_|google.*\.html$)/i.test(base)) return true;
  if (/^prepare-netlify-deploy\./i.test(base)) return true;

  if (/^assets\/pdf-page-.*-preview\.png$/i.test(relPosix)) return true;
  if (/^assets\/pdf-img-p.*\.png$/i.test(relPosix)) return true;
  if (/^assets\/_.*\.png$/i.test(relPosix)) return true;
  if (/^assets\/.*-(log|debug)\.txt$/i.test(relPosix)) return true;
  if (relPosix === 'assets/question-cards-ocr-cache.json') return true;
  if (relPosix === 'assets/pdf-analysis.json') return true;
  if (relPosix === 'assets/map-rules-text.txt') return true;
  if (relPosix === 'assets/images/memory/cards-meta.json') return true;
  if (relPosix === 'assets/images/memory/cards-classified.json') return true;
  if (/^assets\/images\/questions\/map-.*\.png$/i.test(relPosix)) return true;

  return false;
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyTree(srcDir, destDir, rel = '') {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const relChild = rel ? `${rel}/${entry.name}` : entry.name;
    if (shouldIgnore(relChild.replace(/\\/g, '/'))) continue;

    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dest, relChild);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

function dirSize(dir) {
  let total = 0;
  let count = 0;
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        total += fs.statSync(p).size;
        count += 1;
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return { total, count };
}

rmDir(outRoot);
copyTree(appRoot, outRoot);
const { total, count } = dirSize(outRoot);
console.log(`[stage-web] ${outRoot}`);
console.log(`[stage-web] ${count} files, ${(total / 1048576).toFixed(1)} MB (excluded node_modules, netlify-deploy, dev tools)`);
