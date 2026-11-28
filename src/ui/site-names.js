export const SITE_NAMES = Object.freeze({ N: 'AVN', H: 'His' });
export const siteName = id => SITE_NAMES[id] ?? id;
