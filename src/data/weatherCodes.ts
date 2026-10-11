/** WMO weather interpretation codes as returned by Open-Meteo. */
export type ConditionIcon =
  'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

const CODES: Record<number, [string, ConditionIcon]> = {
  0: ['Clear sky', 'clear'],
  1: ['Mainly clear', 'clear'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'],
  48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'],
  57: ['Heavy freezing drizzle', 'drizzle'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Heavy freezing rain', 'rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Light showers', 'rain'],
  81: ['Showers', 'rain'],
  82: ['Violent showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with hail', 'storm'],
  99: ['Thunderstorm with heavy hail', 'storm'],
};

export function describeWeather(code: number): { label: string; icon: ConditionIcon } {
  const c = CODES[code];
  return c ? { label: c[0], icon: c[1] } : { label: 'Unknown', icon: 'cloudy' };
}
