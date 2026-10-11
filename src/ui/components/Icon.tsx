import type { ComfortState, ZoneState } from '../../engine';
import type { ConditionIcon } from '../../data/weatherCodes';

export type IconName =
  | 'flame'
  | 'flame-warn'
  | 'sun'
  | 'sun-small'
  | 'check'
  | 'leaf'
  | 'wind'
  | 'snowflake'
  | 'snowflake-2'
  | 'snowflake-warn'
  | 'cloud'
  | 'cloud-sun'
  | 'fog'
  | 'rain'
  | 'drizzle'
  | 'snow'
  | 'storm'
  | 'moon'
  | 'warning'
  | 'location'
  | 'search'
  | 'droplet'
  | 'umbrella'
  | 'shirt'
  | 'refresh';

const P: Record<string, string> = {
  flame: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5 1-1 1-3 0-9z',
  sun: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  'sun-small':
    'M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21',
  check: 'M4 12.5l5 5L20 6.5',
  leaf: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15M5 19l8-8',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  snowflake: 'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5',
  cloud: 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z',
  'cloud-sun':
    'M8 4v1.5M3.5 8H5M4.8 4.8l1 1M8 7a3 3 0 0 0-2.6 4.5M9 19h8a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A2.9 2.9 0 0 0 9 19z',
  fog: 'M4 9h16M3 13h18M5 17h14',
  rain: 'M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  drizzle: 'M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14zM9 18v1M15 18v1M12 19v1',
  snow: 'M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14zM8 18h.01M12 20h.01M16 18h.01',
  storm: 'M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 14zM13 14l-3 4h4l-3 4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  warning: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  location:
    'M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12zM12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L21 21',
  droplet: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  umbrella: 'M3 12a9 9 0 0 1 18 0zM12 12v7a2 2 0 0 1-4 0',
  shirt: 'M8 3l4 2 4-2 5 4-3 3-2-1v12H8V9l-2 1-3-3z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
};

export function Icon({
  name,
  size = 20,
  title,
  className,
}: {
  name: IconName;
  size?: number;
  title?: string;
  className?: string;
}) {
  const base = name.replace(/-(warn|2)$/, '') as keyof typeof P;
  const warn = name.endsWith('-warn');
  const double = name === 'snowflake-2';
  const d = P[name] ?? P[base] ?? '';
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {double ? (
        <g transform="translate(-3 0) scale(0.75)">
          <path d={d} />
          <path d={d} transform="translate(12 8)" />
        </g>
      ) : (
        <path d={d} />
      )}
      {warn && <path d="M19 15l4 7h-8zM19 18v1.5" strokeWidth={1.5} />}
    </svg>
  );
}

export const STATE_ICON: Record<ComfortState, IconName> = {
  dangerous_heat: 'flame-warn',
  overheated: 'flame',
  hot: 'sun',
  warm: 'sun-small',
  comfortable: 'check',
  cool: 'leaf',
  chilly: 'wind',
  cold: 'snowflake',
  very_cold: 'snowflake-2',
  freezing: 'snowflake-warn',
};

export const ZONE_STATE_ICON: Record<ZoneState, IconName> = {
  hot: 'flame',
  warm: 'sun-small',
  ok: 'check',
  cool: 'leaf',
  cold: 'snowflake',
  freezing: 'snowflake-2',
  numb: 'snowflake-warn',
};

export function conditionIcon(icon: ConditionIcon, isDay: boolean): IconName {
  switch (icon) {
    case 'clear':
      return isDay ? 'sun' : 'moon';
    case 'partly':
      return isDay ? 'cloud-sun' : 'cloud';
    default:
      return icon === 'cloudy' ? 'cloud' : icon;
  }
}
