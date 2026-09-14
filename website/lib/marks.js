// Zephyr brand mark candidates. Each mark is drawn on a 64x64 grid as a
// monoline stroke (round caps/joins) so it renders in the site's white
// stroke style and still reads at favicon size. Shapes are plain data so
// the same source can be rendered as JSX (components/ZephyrMark.js) or
// serialized to a standalone SVG file (scripts/build-icon.mjs).

export const MARK_VIEWBOX = 64;
export const MARK_STROKE = 5;

// The mark used for the favicon, taskbar, and footer. Change this id (and
// re-run `node scripts/build-icon.mjs`) after picking one on /icons.
export const ACTIVE_MARK = 'wheel';

export const MARKS = [
  {
    id: 'zgust',
    name: 'Z-gust',
    blurb:
      'The letter Z drawn as a gust of wind: both bars trail off into curls, the diagonal is the cut of the breeze. Reads as a Z at 16px and as wind at 160px.',
    shapes: [['path', { d: 'M19 11a7 7 0 1 0-7 7h38L14 46h38a7 7 0 1 0-7-7' }]],
  },
  {
    id: 'breeze',
    name: 'Breeze',
    blurb:
      'Three gust lines of uneven length with curled tails, the dictionary definition of a zephyr. Quiet and editorial; the most literal option.',
    shapes: [
      ['path', { d: 'M14 19h24a6.5 6.5 0 1 0-6.5-6.5' }],
      ['path', { d: 'M8 32h38a7.5 7.5 0 1 1-7.5 7.5' }],
      ['path', { d: 'M18 45h12a5.5 5.5 0 1 0-5.5-5.5' }],
    ],
  },
  {
    id: 'wheel',
    name: 'Wheel',
    blurb:
      'A scooter wheel with three speed lines trailing behind it. Pairs directly with the hero line drawing; reads as motion even when tiny.',
    shapes: [
      ['circle', { cx: 41, cy: 34, r: 15 }],
      ['circle', { cx: 41, cy: 34, r: 3, fill: true }],
      ['path', { d: 'M8 25h11' }],
      ['path', { d: 'M4 34h14' }],
      ['path', { d: 'M8 43h11' }],
    ],
  },
  {
    id: 'route',
    name: 'Route',
    blurb:
      'The summon gesture: a dot where you are, a curve, and a ring where the scooter is headed. Speaks to the autonomy story rather than the wind.',
    shapes: [
      ['circle', { cx: 13, cy: 51, r: 4, fill: true }],
      ['path', { d: 'M13 51C38 51 27 14 44 14' }],
      ['circle', { cx: 50, cy: 14, r: 6 }],
    ],
  },
  {
    id: 'wave',
    name: 'Wave',
    blurb:
      'A single breeze line passing through a wheel. The refined version of the ⌁ glyph currently in the taskbar: one continuous stroke, one circle.',
    shapes: [
      ['circle', { cx: 32, cy: 32, r: 22 }],
      ['path', { d: 'M11 32c7-13 13-13 21 0s14 13 21 0' }],
    ],
  },
  {
    id: 'stamp',
    name: 'Stamp',
    blurb:
      'An italic Times Z inside a thin ring, like a colophon stamp. Most typographic and closest to the wordmark, least descriptive of the product.',
    shapes: [
      ['circle', { cx: 32, cy: 32, r: 27, strokeWidth: 3 }],
      ['text', { x: 32, y: 45, size: 38, text: 'Z' }],
    ],
  },
];

export function getMark(id = ACTIVE_MARK) {
  return MARKS.find((m) => m.id === id) ?? MARKS[0];
}

// Serialize a mark to standalone SVG markup (used for the favicon files).
export function markToSvg(mark, { size = 64, color = '#f7f5f0', background = '#0a0a0a', padding = 8, radius = 14 } = {}) {
  const inner = MARK_VIEWBOX;
  const scale = (size - padding * 2) / inner;
  const parts = mark.shapes.map(([type, a]) => {
    if (type === 'path') {
      return `<path d="${a.d}" fill="none" stroke="${color}" stroke-width="${a.strokeWidth ?? MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (type === 'circle') {
      return a.fill
        ? `<circle cx="${a.cx}" cy="${a.cy}" r="${a.r}" fill="${color}"/>`
        : `<circle cx="${a.cx}" cy="${a.cy}" r="${a.r}" fill="none" stroke="${color}" stroke-width="${a.strokeWidth ?? MARK_STROKE}"/>`;
    }
    if (type === 'text') {
      return `<text x="${a.x}" y="${a.y}" font-family="'Times New Roman', Times, serif" font-style="italic" font-size="${a.size}" text-anchor="middle" fill="${color}">${a.text}</text>`;
    }
    return '';
  });
  const bg = background ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    bg +
    `<g transform="translate(${padding} ${padding}) scale(${scale})">${parts.join('')}</g>` +
    `</svg>`
  );
}
