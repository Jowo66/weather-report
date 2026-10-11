// Generates SYNTHETIC Open-Meteo responses (documented format, timeformat=unixtime) for tests.
// They are not real observations. Re-run with: node tools/make-fixtures.mjs
import { writeFileSync } from 'node:fs';

const HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'rain',
  'snowfall',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'shortwave_radiation_instant',
  'direct_normal_irradiance_instant',
  'diffuse_radiation_instant',
  'uv_index',
  'snow_depth',
];

function make({
  name,
  lat,
  lon,
  tz,
  offset,
  start,
  base,
  amp,
  rh,
  wind,
  precip,
  code,
  snowDepth,
  peakGhi,
}) {
  const days = 16;
  const hours = days * 24;
  const h = Object.fromEntries([...HOURLY_VARS, 'precipitation_probability'].map((k) => [k, []]));
  h.time = [];
  for (let i = 0; i < hours; i++) {
    const t = start + i * 3600;
    const localHour = ((((t + offset) / 3600) % 24) + 24) % 24;
    const day = localHour >= 7 && localHour < 18;
    const diurnal = Math.sin(((localHour - 9) / 24) * 2 * Math.PI);
    const temp = +(base + amp * diurnal + Math.sin(i / 37) * 1.5).toFixed(1);
    const sunFrac = day ? Math.sin(((localHour - 7) / 11) * Math.PI) : 0;
    const ghi = Math.round(peakGhi * sunFrac);
    const p = i % 30 < 6 ? precip : 0;
    h.time.push(t);
    h.temperature_2m.push(temp);
    h.relative_humidity_2m.push(Math.round(rh - 10 * diurnal));
    h.apparent_temperature.push(+(temp - wind / 8).toFixed(1));
    h.is_day.push(day ? 1 : 0);
    h.precipitation.push(p);
    h.rain.push(temp > 0 ? p : 0);
    h.snowfall.push(temp <= 0 ? +(p * 0.7).toFixed(2) : 0);
    h.weather_code.push(p > 0 ? (temp <= 0 ? 73 : 63) : code);
    h.cloud_cover.push(p > 0 ? 95 : 40);
    h.wind_speed_10m.push(+(wind + 4 * Math.sin(i / 5)).toFixed(1));
    h.wind_gusts_10m.push(+(wind * 1.6).toFixed(1));
    h.wind_direction_10m.push(270);
    h.shortwave_radiation_instant.push(ghi);
    h.direct_normal_irradiance_instant.push(Math.round(ghi * 0.9));
    h.diffuse_radiation_instant.push(Math.round(ghi * 0.2));
    h.uv_index.push(+(ghi / 100).toFixed(1));
    h.snow_depth.push(snowDepth);
    h.precipitation_probability.push(p > 0 ? 80 : 10);
  }
  const cur = 12; // "now" = 13th hour
  const current = { time: h.time[cur], interval: 900 };
  for (const k of HOURLY_VARS) current[k] = h[k][cur];
  const daily = {
    time: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    precipitation_sum: [],
    precipitation_probability_max: [],
    uv_index_max: [],
    sunrise: [],
    sunset: [],
    wind_speed_10m_max: [],
    weather_code: [],
  };
  for (let d = 0; d < days; d++) {
    const sl = (k) => h[k].slice(d * 24, d * 24 + 24);
    const t0 = h.time[d * 24];
    daily.time.push(t0);
    daily.temperature_2m_max.push(Math.max(...sl('temperature_2m')));
    daily.temperature_2m_min.push(Math.min(...sl('temperature_2m')));
    daily.precipitation_sum.push(
      +sl('precipitation')
        .reduce((a, b) => a + b, 0)
        .toFixed(1),
    );
    daily.precipitation_probability_max.push(Math.max(...sl('precipitation_probability')));
    daily.uv_index_max.push(Math.max(...sl('uv_index')));
    daily.sunrise.push(t0 + 7 * 3600);
    daily.sunset.push(t0 + 18 * 3600);
    daily.wind_speed_10m_max.push(Math.max(...sl('wind_speed_10m')));
    daily.weather_code.push(code);
  }
  return {
    latitude: lat,
    longitude: lon,
    generationtime_ms: 1.2,
    utc_offset_seconds: offset,
    timezone: tz,
    timezone_abbreviation: name,
    elevation: 100,
    current_units: {},
    current,
    hourly_units: {},
    hourly: h,
    daily_units: {},
    daily,
  };
}

// 2026-01-15 05:00 UTC (00:00 Toronto, EST)
writeFileSync(
  'tests/fixtures/forecast-toronto.json',
  JSON.stringify(
    make({
      name: 'EST',
      lat: 43.7,
      lon: -79.42,
      tz: 'America/Toronto',
      offset: -18000,
      start: 1768453200,
      base: -9,
      amp: 4,
      rh: 70,
      wind: 25,
      precip: 0.8,
      code: 3,
      snowDepth: 0.15,
      peakGhi: 300,
    }),
  ),
);
// 2026-07-15 07:00 UTC (00:00 Phoenix, MST)
writeFileSync(
  'tests/fixtures/forecast-phoenix.json',
  JSON.stringify(
    make({
      name: 'MST',
      lat: 33.45,
      lon: -112.07,
      tz: 'America/Phoenix',
      offset: -25200,
      start: 1784098800,
      base: 36,
      amp: 6,
      rh: 25,
      wind: 8,
      precip: 0,
      code: 0,
      snowDepth: 0,
      peakGhi: 950,
    }),
  ),
);
writeFileSync(
  'tests/fixtures/geocoding-toronto.json',
  JSON.stringify({
    results: [
      {
        id: 6167865,
        name: 'Toronto',
        latitude: 43.70011,
        longitude: -79.4163,
        country_code: 'CA',
        timezone: 'America/Toronto',
        country: 'Canada',
        admin1: 'Ontario',
      },
      {
        id: 4176409,
        name: 'Toronto',
        latitude: 40.46423,
        longitude: -80.60091,
        country_code: 'US',
        timezone: 'America/New_York',
        country: 'United States',
        admin1: 'Ohio',
      },
    ],
    generationtime_ms: 0.5,
  }),
);
writeFileSync(
  'tests/fixtures/geocoding-phoenix.json',
  JSON.stringify({
    results: [
      {
        id: 5308655,
        name: 'Phoenix',
        latitude: 33.44838,
        longitude: -112.07404,
        country_code: 'US',
        timezone: 'America/Phoenix',
        country: 'United States',
        admin1: 'Arizona',
      },
    ],
  }),
);
console.log('fixtures written');
