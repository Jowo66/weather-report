import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Activity, ComfortState, EngineConfig, GarmentId } from '../engine';
import { jsonStorage } from './persist';

/** Heuristic parameters to tune in the D4 playtest (TDD §4.13). */
export const TUNABLES = [
  {
    key: 'WET_SATURATION_MM_H',
    label: 'Rain rate that soaks fabric (mm/h)',
    min: 0.5,
    max: 6,
    step: 0.1,
  },
  {
    key: 'RAIN_EVAP_EFFICIENCY',
    label: 'Rain evaporation drawn from body',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'WIND_PENETRATION',
    label: 'Wind penetration, permeable layers',
    min: 0,
    max: 0.8,
    step: 0.05,
  },
  {
    key: 'WIND_PENETRATION_WP',
    label: 'Wind penetration, under windproof',
    min: 0,
    max: 0.4,
    step: 0.02,
  },
  {
    key: 'WIND_HEIGHT_FACTOR',
    label: '10 m → body-height wind factor',
    min: 0.4,
    max: 1,
    step: 0.01,
  },
  { key: 'V_MIN', label: 'Outdoor air-movement floor (m/s)', min: 0.1, max: 1.5, step: 0.05 },
  { key: 'VASO_START', label: 'Vasoconstriction starts below (°C)', min: 5, max: 25, step: 0.5 },
  { key: 'VASO_GAIN', label: 'Vasoconstriction gain', min: 0, max: 1, step: 0.05 },
  { key: 'VASO_MAX', label: 'Vasoconstriction max (°C)', min: 0, max: 10, step: 0.5 },
  { key: 'WET_CHILL', label: 'Wet-fabric chill per soaked zone (°C)', min: 0, max: 6, step: 0.25 },
  { key: 'R_TISSUE', label: 'Skin tissue resistance (m²K/W)', min: 0.03, max: 0.15, step: 0.005 },
] as const satisfies readonly {
  key: keyof EngineConfig;
  label: string;
  min: number;
  max: number;
  step: number;
}[];
export type TunableKey = (typeof TUNABLES)[number]['key'];

export const VOTES = [
  { v: -3, label: 'Cold' },
  { v: -2, label: 'Cool' },
  { v: -1, label: 'Slightly cool' },
  { v: 0, label: 'Neutral' },
  { v: 1, label: 'Slightly warm' },
  { v: 2, label: 'Warm' },
  { v: 3, label: 'Hot' },
] as const;

export interface PlaytestEntry {
  at: string;
  place: string;
  lat: number;
  lon: number;
  tAir: number;
  rh: number;
  windKmh: number;
  ghi: number;
  precipMmH: number;
  outfit: GarmentId[];
  activity: Activity;
  shade: boolean;
  umbrella: boolean;
  personalOffset: number;
  perceivedDefault: number;
  perceivedCalibrated: number;
  stateDefault: ComfortState;
  vote: number;
  minutesOutside: number;
  note: string;
}

export interface CalibrationState {
  enabled: boolean;
  overrides: Partial<Record<TunableKey, number>>;
  log: PlaytestEntry[];
  setEnabled: (v: boolean) => void;
  setOverride: (k: TunableKey, v: number | undefined) => void;
  resetOverrides: () => void;
  addEntry: (e: PlaytestEntry) => void;
  clearLog: () => void;
}

export const useCalibration = create<CalibrationState>()(
  persist(
    (set) => ({
      enabled: false,
      overrides: {},
      log: [],
      setEnabled: (enabled) => set({ enabled }),
      setOverride: (k, v) =>
        set((s) => {
          const o = { ...s.overrides };
          if (v === undefined) delete o[k];
          else o[k] = v;
          return { overrides: o };
        }),
      resetOverrides: () => set({ overrides: {} }),
      addEntry: (e) => set((s) => ({ log: [...s.log, e].slice(-2000) })),
      clearLog: () => set({ log: [] }),
    }),
    { name: 'wr:calibration:v1', version: 1, storage: jsonStorage },
  ),
);

/** Active engine overrides (undefined when calibration is off). */
export function activeConfig(
  s: Pick<CalibrationState, 'enabled' | 'overrides'>,
): Partial<EngineConfig> | undefined {
  return s.enabled && Object.keys(s.overrides).length
    ? (s.overrides as Partial<EngineConfig>)
    : undefined;
}

const CSV_COLUMNS: (keyof PlaytestEntry)[] = [
  'at',
  'place',
  'lat',
  'lon',
  'tAir',
  'rh',
  'windKmh',
  'ghi',
  'precipMmH',
  'outfit',
  'activity',
  'shade',
  'umbrella',
  'personalOffset',
  'perceivedDefault',
  'perceivedCalibrated',
  'stateDefault',
  'vote',
  'minutesOutside',
  'note',
];

function csvCell(v: unknown): string {
  const s = Array.isArray(v) ? v.join(' ') : String(v ?? '');
  // Neutralise spreadsheet formula injection and quote as needed.
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(log: readonly PlaytestEntry[]): string {
  return (
    [
      CSV_COLUMNS.join(','),
      ...log.map((e) => CSV_COLUMNS.map((c) => csvCell(e[c])).join(',')),
    ].join('\n') + '\n'
  );
}
