/** Calendar helpers for trip planning. Dates are ISO `YYYY-MM-DD` in the destination's local calendar. */

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      f = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      });
    }
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** DST-correct local calendar parts of a unix time in an IANA zone. */
export function localParts(unixS: number, timeZone: string): LocalParts {
  const parts = fmt(timeZone).formatToParts(new Date(unixS * 1000));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24 };
}

export const isoDate = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function localIsoDate(unixS: number, timeZone: string): string {
  const p = localParts(unixS, timeZone);
  return isoDate(p.year, p.month, p.day);
}

export function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Whole days from a to b (b − a), calendar-based (no time zones involved). */
export function daysBetween(a: string, b: string): number {
  const pa = parseIso(a);
  const pb = parseIso(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

export function addDays(iso: string, n: number): string {
  const p = parseIso(iso);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function dateRange(start: string, end: string): string[] {
  const n = daysBetween(start, end);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(start, i));
}

/** Unix seconds for local `iso` at `hour` in `timeZone` (DST-correct by iteration). */
export function localToUnix(iso: string, hour: number, timeZone: string): number {
  const p = parseIso(iso);
  let guess = Date.UTC(p.y, p.m - 1, p.d, hour) / 1000;
  for (let i = 0; i < 3; i++) {
    const lp = localParts(guess, timeZone);
    const diffH =
      (Date.UTC(p.y, p.m - 1, p.d, hour) - Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour)) /
      3_600_000;
    if (diffH === 0) break;
    guess += diffH * 3600;
  }
  return guess;
}
