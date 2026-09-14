// Generates the favicon / touch icon files from the active brand mark.
//   node scripts/build-icon.mjs            -> uses ACTIVE_MARK from lib/marks.js
//   node scripts/build-icon.mjs <mark-id>  -> uses a specific candidate
// Writes app/icon.svg (favicon) and app/apple-icon.png (180px touch icon);
// Next.js picks both up automatically via the app/ file conventions.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { getMark, markToSvg } from '../lib/marks.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mark = getMark(process.argv[2]);

const favicon = markToSvg(mark, { size: 64, padding: 8, radius: 14 });
writeFileSync(resolve(root, 'app/icon.svg'), favicon + '\n');

const touch = markToSvg(mark, { size: 180, padding: 28, radius: 0 });
await sharp(Buffer.from(touch)).png().toFile(resolve(root, 'app/apple-icon.png'));

console.log(`icon files built from mark "${mark.id}" (${mark.name})`);
