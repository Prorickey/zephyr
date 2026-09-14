// Renders every mark candidate at 160px, 32px and 16px onto one PNG so the
// set can be reviewed at a glance. Output goes to the path given as argv[2].
import sharp from 'sharp';
import { MARKS, markToSvg } from '../lib/marks.js';

const out = process.argv[2] || 'marks-preview.png';
const cell = 260;
const rows = MARKS.length;
const W = 900;
const H = rows * cell;

const items = [];
let y = 0;
for (const mark of MARKS) {
  items.push(`<rect x="0" y="${y}" width="${W}" height="${cell}" fill="${y / cell % 2 ? '#111' : '#0a0a0a'}"/>`);
  items.push(`<text x="20" y="${y + 40}" font-family="Times New Roman" font-size="26" fill="#f7f5f0">${mark.name}</text>`);
  // large on black, no tile
  items.push(`<g transform="translate(40 ${y + 60})">${markToSvg(mark, { size: 160, background: null, padding: 0 }).replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`);
  // favicon tiles at 64 / 32 / 16 on dark
  for (const [i, s] of [64, 32, 16].entries()) {
    const x = 260 + i * 110;
    items.push(`<image x="${x}" y="${y + 90}" width="${s}" height="${s}" href="data:image/svg+xml;base64,${Buffer.from(markToSvg(mark, { size: 64, padding: 8 })).toString('base64')}"/>`);
  }
  // favicon tiles on a light tab strip
  items.push(`<rect x="600" y="${y + 60}" width="280" height="140" rx="8" fill="#e9e7e2"/>`);
  for (const [i, s] of [32, 16].entries()) {
    const x = 630 + i * 90;
    items.push(`<image x="${x}" y="${y + 100}" width="${s}" height="${s}" href="data:image/svg+xml;base64,${Buffer.from(markToSvg(mark, { size: 64, padding: 8 })).toString('base64')}"/>`);
  }
  // nav-size on light next to wordmark
  items.push(`<text x="740" y="${y + 125}" font-family="Times New Roman" font-style="italic" font-size="22" fill="#0a0a0a">Zephyr</text>`);
  items.push(`<g transform="translate(818 ${y + 106})">${markToSvg(mark, { size: 20, background: null, padding: 0, color: '#0a0a0a' }).replace(/<svg[^>]*>|<\/svg>/g, '')}</g>`);
  y += cell;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${items.join('')}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(out);
console.log('wrote', out);
