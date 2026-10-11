import type {
  ComfortState,
  ExplanationFactor,
  Flag,
  GarmentId,
  ZoneId,
  ZoneState,
} from '../../engine';
import type { TempUnit } from '../../state/settingsStore';
import { formatDelta } from './format';

export const STATE_LABEL: Record<ComfortState, string> = {
  dangerous_heat: 'Dangerous heat',
  overheated: 'Overheated',
  hot: 'Hot',
  warm: 'Warm',
  comfortable: 'Comfortable',
  cool: 'Cool',
  chilly: 'Chilly',
  cold: 'Cold',
  very_cold: 'Very cold',
  freezing: 'Freezing',
};

export const ZONE_LABEL: Record<ZoneId, string> = {
  head: 'Head',
  torso: 'Torso',
  arms: 'Arms',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
};

export const ZONE_STATE_LABEL: Record<ZoneState, string> = {
  hot: 'Hot',
  warm: 'Warm',
  ok: 'OK',
  cool: 'Cool',
  cold: 'Cold',
  freezing: 'Freezing',
  numb: 'Numb',
};

export const GARMENT_LABEL: Record<GarmentId, string> = {
  tank_top: 'Tank top',
  t_shirt: 'T-shirt',
  long_sleeve: 'Long-sleeve shirt',
  thermal_top: 'Thermal top',
  hoodie: 'Hoodie',
  sweater: 'Sweater',
  light_jacket: 'Light jacket',
  rain_shell: 'Rain shell',
  winter_coat: 'Winter coat',
  shorts: 'Shorts',
  jeans: 'Jeans',
  thermal_bottoms: 'Thermal bottoms',
  snow_pants: 'Snow pants',
  toque: 'Toque',
  scarf: 'Scarf',
  gloves: 'Gloves',
  socks: 'Socks',
  wool_socks: 'Wool socks',
  sneakers: 'Sneakers',
  winter_boots: 'Winter boots',
};

/** Garments named in the plural ("your jeans add …"). */
const PLURAL: ReadonlySet<GarmentId> = new Set([
  'shorts',
  'jeans',
  'thermal_bottoms',
  'snow_pants',
  'gloves',
  'socks',
  'wool_socks',
  'sneakers',
  'winter_boots',
]);

export function factorText(f: ExplanationFactor, unit: TempUnit): string {
  const d = formatDelta(f.delta, unit);
  const warms = f.delta > 0;
  switch (f.kind) {
    case 'wind':
      return warms ? `The breeze adds ${d}` : `Wind is taking ${d} off`;
    case 'sun':
      return warms ? `The sun adds ${d}` : `Losing ${d} to the sky`;
    case 'humidity':
      return warms ? `Humidity adds ${d}` : `Dry air takes ${d} off`;
    case 'rain':
      return warms ? `Rain adds ${d}` : `Getting wet takes ${d} off`;
    case 'activity':
      return warms ? `Moving adds ${d}` : `Moving takes ${d} off`;
    case 'garment': {
      const name = GARMENT_LABEL[f.garment].toLowerCase();
      const plural = PLURAL.has(f.garment);
      return warms
        ? `Your ${name} ${plural ? 'add' : 'adds'} ${d}`
        : `Your ${name} ${plural ? 'take' : 'takes'} ${d} off`;
    }
  }
}

export interface FlagCopy {
  title: string;
  body: string;
  link?: { href: string; label: string };
  severity: 'info' | 'warning' | 'danger';
}

export const FLAG_COPY: Record<Flag, FlagCopy> = {
  heat_danger: {
    title: 'Dangerous heat',
    body: 'Your body can no longer shed heat fast enough. Get to shade or air conditioning, drink water and rest. Watch for dizziness, nausea or confusion.',
    link: {
      href: 'https://www.canada.ca/en/health-canada/services/sun-safety/extreme-heat-heat-waves.html',
      label: 'Extreme heat guidance (Health Canada)',
    },
    severity: 'danger',
  },
  heat_strain: {
    title: 'Heat strain',
    body: 'You will sweat heavily. Lighten your clothing, find shade and drink water regularly.',
    link: {
      href: 'https://www.canada.ca/en/health-canada/services/sun-safety/extreme-heat-heat-waves.html',
      label: 'Extreme heat guidance (Health Canada)',
    },
    severity: 'warning',
  },
  frostbite_risk: {
    title: 'Frostbite risk on exposed skin',
    body: 'Cover your face and hands. Frostbite happens faster with sustained wind over 50 km/h.',
    link: {
      href: 'https://www.canada.ca/en/environment-climate-change/services/weather-health/wind-chill-cold-weather.html',
      label: 'Wind chill and cold weather (ECCC)',
    },
    severity: 'danger',
  },
  hypothermia_risk: {
    title: 'Wet and cold',
    body: 'Being soaked in cold weather can lead to hypothermia. Put on waterproof layers and get dry when you can.',
    link: {
      href: 'https://www.canada.ca/en/environment-climate-change/services/weather-health/wind-chill-cold-weather.html',
      label: 'Cold weather guidance (ECCC)',
    },
    severity: 'warning',
  },
  suggest_rain_gear: {
    title: 'Rain gear suggested',
    body: 'It is wet out. A rain shell or umbrella keeps your clothes dry and warm.',
    severity: 'info',
  },
};
