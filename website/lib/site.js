// Shared site data used by the taskbar, hero, and footer.

export const NAV_LINKS = [
  { id: 'overview', num: '01', label: 'Project Overview' },
  { id: 'autonomy', num: '02', label: 'Autonomous AI Implementation' },
  { id: 'design', num: '03', label: 'Electric Scooter Design' },
  { id: 'app', num: '04', label: 'Zephyr Mobile App' },
];

// Portraits are pulled from each person's own site and stored in
// public/people (downscaled to a small square for the avatar circles).
export const PEOPLE = [
  {
    name: 'Joshua Chilukuri',
    url: 'https://joshuachilukuri.com',
    image: '/people/joshua.png',
  },
  {
    name: 'Trevor Bedson',
    url: 'https://bedson.tech',
    image: '/people/trevor.png',
  },
];
