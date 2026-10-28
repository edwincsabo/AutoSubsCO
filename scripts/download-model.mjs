import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadModel } from '../src/models.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let previous = -1;
await downloadModel(path.join(root, 'models'), process.argv[2] ?? 'base', { progress: p => {
  const percent = Math.floor(p.percent / 10) * 10;
  if (percent !== previous) { console.log(`${p.message}: ${percent}%`); previous = percent; }
} });
