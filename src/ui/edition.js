// Build editions. `node scripts/build.mjs --edition <id>` replaces EDITION_ID below.
//   full         every world, both views (dist/counterpoint.html)
//   circulation  a shareable preview with Circulation alone (creator request 2026-11-27):
//                no other worlds or links to them, Network view only (dist/counterpoint-circulation.html)
export const EDITION_ID = 'full';

const EDITIONS = {
  full: { id: 'full', worlds: null, views: null, title: null, storageSuffix: '' },
  circulation: {
    id: 'circulation',
    worlds: ['circulation'],
    views: ['network'],
    title: 'Counterpoint · Circulation',
    storageSuffix: '.circulation',
  },
};

export const EDITIONS_LIST = Object.freeze(Object.keys(EDITIONS));
export const EDITION = Object.freeze(EDITIONS[EDITION_ID]);
export const editionAllows = (list, value) => list === null || list.includes(value);
