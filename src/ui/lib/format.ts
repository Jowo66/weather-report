import type { TempUnit, WindUnit } from '../../state/settingsStore';

export const cToF = (c: number) => (c * 9) / 5 + 32;
/** Temperature differences convert without the offset. */
export const dCToDF = (d: number) => (d * 9) / 5;
export const kmhToMph = (k: number) => k / 1.609344;

export function formatTemp(c: number, unit: TempUnit, opts: { unitLabel?: boolean } = {}): string {
  const v = Math.round(unit === 'F' ? cToF(c) : c);
  // Avoid "-0°".
  const s = `${Object.is(v, -0) ? 0 : v}°`;
  return opts.unitLabel === false ? s : `${s}${unit}`;
}

export function formatDelta(dc: number, unit: TempUnit): string {
  const v = Math.round(Math.abs(unit === 'F' ? dCToDF(dc) : dc));
  return `${v}°${unit}`;
}

export function formatWind(kmh: number, unit: WindUnit): string {
  return unit === 'mph' ? `${Math.round(kmhToMph(kmh))} mph` : `${Math.round(kmh)} km/h`;
}

export function spokenTemp(c: number, unit: TempUnit): string {
  const v = Math.round(unit === 'F' ? cToF(c) : c);
  return `${Object.is(v, -0) ? 0 : v} degrees ${unit === 'F' ? 'Fahrenheit' : 'Celsius'}`;
}

function formatter(timeZone: string | undefined, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone });
  } catch {
    return new Intl.DateTimeFormat(undefined, opts);
  }
}

export function formatHour(unixS: number, timeZone?: string): string {
  return formatter(timeZone, { hour: 'numeric' }).format(new Date(unixS * 1000));
}

export function formatDay(unixS: number, timeZone?: string): string {
  return formatter(timeZone, { weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(unixS * 1000),
  );
}

export function formatAge(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
