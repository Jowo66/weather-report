export type ZoneId = 'head' | 'torso' | 'arms' | 'hands' | 'legs' | 'feet';
export type Activity = 'standing' | 'strolling' | 'walking';

export type GarmentId =
  | 'tank_top'
  | 't_shirt'
  | 'long_sleeve'
  | 'thermal_top'
  | 'hoodie'
  | 'sweater'
  | 'light_jacket'
  | 'rain_shell'
  | 'winter_coat'
  | 'shorts'
  | 'jeans'
  | 'thermal_bottoms'
  | 'snow_pants'
  | 'toque'
  | 'scarf'
  | 'gloves'
  | 'socks'
  | 'wool_socks'
  | 'sneakers'
  | 'winter_boots';

export interface Context {
  activity: Activity;
  shade: boolean;
  umbrella: boolean;
  /** "I run cold / hot", °C (−3…+3). The only physiological user input. */
  personalOffset: number;
}

/** Engine-facing weather. SI units: °C, %, km/h (10 m wind), W/m², degrees, mm/h, m. */
export interface EngineWeather {
  tAir: number;
  rh: number;
  windKmh: number;
  ghi: number;
  dni: number;
  dhi: number;
  sunAlt: number;
  precipMmH: number;
  snowDepthM: number;
}

export type ComfortState =
  | 'dangerous_heat'
  | 'overheated'
  | 'hot'
  | 'warm'
  | 'comfortable'
  | 'cool'
  | 'chilly'
  | 'cold'
  | 'very_cold'
  | 'freezing';

export type ZoneState = 'hot' | 'warm' | 'ok' | 'cool' | 'cold' | 'freezing' | 'numb';

export type Flag =
  'heat_strain' | 'heat_danger' | 'frostbite_risk' | 'hypothermia_risk' | 'suggest_rain_gear';

export type FrostbiteRisk = 'high' | 'very_high' | 'severe' | 'extreme' | null;

export interface ZoneResult {
  clo: number;
  wetness: number;
  tFelt: number;
  state: ZoneState;
  exposed: boolean;
  frostbite: FrostbiteRisk;
}

export interface ComfortResult {
  perceived: number;
  state: ComfortState;
  index: number;
  loadWm2: number;
  requiredWettedness: number;
  cloTotal: number;
  cloEffective: number;
  vRel: number;
  tMrt: number;
  wetArea: number;
  humidex: number;
  windChill: number;
  zones: Record<ZoneId, ZoneResult>;
  flags: Flag[];
}

export type Advice = 'umbrella' | 'sun_protection' | 'seek_shade_hydrate' | 'limit_exposure';

export interface Recommendation {
  level: number;
  outfit: GarmentId[];
  perceived: number;
  state: ComfortState;
  metTarget: boolean;
  coldZones: ZoneId[];
  advice: Advice[];
}
