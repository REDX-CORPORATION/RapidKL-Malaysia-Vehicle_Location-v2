// Shared helpers. Used in the browser AND by scripts/build-data.mjs, so keep it dependency-free.

const KEEP_UPPER = new Set([
  'LRT', 'MRT', 'BRT', 'KTM', 'KL', 'PJ', 'KLCC', 'KLIA', 'USJ', 'UKM', 'UPM', 'UM', 'UIA', 'UTM',
  'TTDI', 'IOI', 'PPR', 'LDP', 'DBKL', 'MBPJ', 'MBSA', 'MPAJ', 'MPSJ', 'MPK', 'SS', 'SK', 'SMK',
  'SJK', 'SMJK', 'SRA', 'SRK', 'SRJK', 'SA', 'JKR', 'JPJ', 'KPJ', 'HKL', 'PKNS', 'KWSP', 'LHDN',
  'TNB', 'ATM', 'KFC', 'AEON', 'IKEA', 'MMU', 'KDU', 'ILP', 'IKBN', 'FRIM', 'LEP', 'NPE', 'BRP',
  'PNB', 'LTAT', 'MARA', 'HQ', 'II', 'III', 'IV', 'TV', 'ECO', 'UEM', 'UOA', 'SP', 'PKNS', 'MAEPS',
  'UITM', 'UNITEN', 'KDEB', 'TM', 'MAS', 'LCCT', 'KLCC', 'SMART', 'BHP', 'JB', 'SPC', 'MPPP',
]);
const SPECIAL = { UITM: 'UiTM' };

/**
 * "KG BARU SG BULOH (OPP)" -> "Kg Baru Sg Buloh (Opp)".
 * Works token by token: ALL-CAPS tokens are converted, mixed-case tokens (e.g. "UiTM") are trusted as-is.
 * Well-known acronyms and anything containing a digit stay upper-case.
 */
export function titleCase(input) {
  if (!input) return '';
  return String(input).trim().replace(/[A-Za-z0-9]+/g, (w) => {
    if (w !== w.toUpperCase()) return w;           // mixed or lower case: leave alone
    if (SPECIAL[w]) return SPECIAL[w];
    if (KEEP_UPPER.has(w)) return w;
    if (/\d/.test(w) || w.length === 1) return w;
    return w[0] + w.slice(1).toLowerCase();
  });
}

/** Splits GTFS names like "KL869 LRT/MRT MALURI PINTU D" into { code, name }. Only known operator prefixes count as codes ("SS2 PETALING JAYA" is a place, not a code). */
export function splitStopName(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\([A-Za-z]{1,2}\)\s+)?((?:KL|AJ|SL|PJ|SA|SJ|KJ|PPJ|BD|KS|LG|SP)\d{1,5})\s+(.+)$/);
  if (m) return { code: m[2], name: titleCase(m[3] + (m[1] ? ' ' + m[1].trim() : '')) };
  return { code: null, name: titleCase(s) };
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'route';
}

/** Natural sort for route names: 300, 750, T350, T350A, BRT ... numbers before letters. */
export function compareRoutes(a, b) {
  const na = parseInt(String(a).replace(/\D+/, ''), 10);
  const nb = parseInt(String(b).replace(/\D+/, ''), 10);
  const da = /^\d/.test(a), db = /^\d/.test(b);
  if (da !== db) return da ? -1 : 1;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/** The kiosk lists some routes as "750 (OS)"; the live feed calls them "750". Compare on the base name. */
export const normRoute = (s) => String(s == null ? '' : s).replace(/\s*\(OS\)\s*$/i, '').trim().toUpperCase();
