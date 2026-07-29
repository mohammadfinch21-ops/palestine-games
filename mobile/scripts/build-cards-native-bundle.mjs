/**
 * Embed train + memory JSON into a classic script for synchronous native WebView load.
 * Output: app/js/cards-native-bundle.js (window.__PT_TRAIN_DECK / __PT_MEMORY_PAIRS)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJs = path.resolve(__dirname, '../../app/js');

const trainPath = path.join(appJs, 'train-questions-by-level.json');
const memoryPath = path.join(appJs, 'memory-pairs-data.json');
const outPath = path.join(appJs, 'cards-native-bundle.js');

const train = JSON.parse(fs.readFileSync(trainPath, 'utf8'));
const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));

const banner = `/** Auto-generated — do not edit. Run: npm run build:cards-bundle (mobile/) */\n`;
const body = `${banner}window.__PT_TRAIN_DECK = ${JSON.stringify(train)};\nwindow.__PT_MEMORY_PAIRS = ${JSON.stringify(memory)};\n`;

fs.writeFileSync(outPath, body, 'utf8');
const kb = (Buffer.byteLength(body, 'utf8') / 1024).toFixed(1);
console.log(`[build-cards-native-bundle] ${outPath} (${kb} KB)`);
