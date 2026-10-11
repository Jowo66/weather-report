import { describe, expect, it } from 'vitest';
import {
  aggregateNormals,
  archiveUrl,
  loadNormals,
  quantile,
  withYear,
  type ArchiveResponse,
} from '../../src/services/climateNormals';
import { SwrCache } from '../../src/services/cache';
import { normalDay, planDay, summarize, type DayConditions } from '../../src/travel/planner';
import { packingList, shortfalls } from '../../src/travel/packing';
import { addDays, dateRange, daysBetween, localParts, localToUnix } from '../../src/travel/time';

/** Synthetic archive: temperature = base + year offset + diurnal; rain on even days. */
function archive(start: string, end: string, tz = 'UTC', base = 15): ArchiveResponse {
  const time: number[] = [];
  const temperature_2m: number[] = [];
  const precipitation: number[] = [];
  const shortwave_radiation: number[] = [];
  const y = Number(start.slice(0, 4));
  for (const d of dateRange(start, end)) {
    for (let h = 0; h < 24; h++) {
      time.push(localToUnix(d, h, tz));
      temperature_2m.push(base + (y % 10) * 0.2 + 5 * Math.sin(((h - 9) / 24) * 2 * Math.PI));
      precipitation.push(Number(d.slice(8)) % 2 === 0 && h === 15 ? 2 : 0);
      shortwave_radiation.push(h >= 7 && h <= 18 ? 600 * Math.sin(((h - 7) / 11) * Math.PI) : 0);
    }
  }
  const n = time.length;
  return {
    latitude: 38.7,
    longitude: -9.1,
    timezone: tz,
    utc_offset_seconds: 0,
    hourly: {
      time,
      temperature_2m,
      precipitation,
      shortwave_radiation,
      relative_humidity_2m: Array(n).fill(65),
      wind_speed_10m: Array(n).fill(12),
      direct_normal_irradiance: shortwave_radiation.map((g) => g * 0.8),
      diffuse_radiation: shortwave_radiation.map((g) => g * 0.2),
      snow_depth: Array(n).fill(0),
      cloud_cover: Array(n).fill(30),
    },
  };
}

describe('calendar helpers', () => {
  it('handles ranges and DST-correct local times', () => {
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
    const t = localToUnix('2026-07-01', 14, 'America/Toronto');
    expect(localParts(t, 'America/Toronto')).toMatchObject({ month: 7, day: 1, hour: 14 });
    const w = localToUnix('2026-01-15', 8, 'Europe/Lisbon');
    expect(localParts(w, 'Europe/Lisbon').hour).toBe(8);
  });
  it('maps Feb 29 to Feb 28 in non-leap years', () => {
    expect(withYear('2028-02-29', 2027)).toBe('2027-02-28');
    expect(withYear('2028-02-29', 2024)).toBe('2024-02-29');
  });
});

describe('climate normals (TDD §6.2)', () => {
  it('builds archive URLs without a key', () => {
    const u = new URL(archiveUrl(38.7, -9.1, '2025-06-01', '2025-06-10'));
    expect(u.hostname).toBe('archive-api.open-meteo.com');
    expect(u.searchParams.get('start_date')).toBe('2025-06-01');
    expect(u.searchParams.get('timeformat')).toBe('unixtime');
  });

  it('aggregates percentiles over ±3 days × years and rain probability', () => {
    const responses = Array.from({ length: 10 }, (_, i) =>
      archive(`${2016 + i}-05-28`, `${2016 + i}-06-14`),
    );
    const days = aggregateNormals(responses, ['2026-06-02', '2026-06-03'], 38.7, -9.1, 'UTC');
    expect(days).toHaveLength(2);
    const pm = days[0]!.parts.afternoon;
    expect(pm.n).toBe(70); // 7 days × 10 years
    expect(pm.t25).toBeLessThanOrEqual(pm.t50);
    expect(pm.t50).toBeLessThanOrEqual(pm.t75);
    expect(days[0]!.parts.morning.t50).toBeLessThan(pm.t50);
    expect(days[0]!.precipProbability).toBe(1); // June 2 is an even day
    expect(days[1]!.precipProbability).toBe(0);
    expect(days[0]!.uvMaxEstimate).toBeCloseTo(6, 0);
  });

  it('makes one request per year and caches for 30 days', async () => {
    const urls: string[] = [];
    const fetchImpl = async (u: string | URL | Request) => {
      urls.push(String(u));
      const q = new URL(String(u)).searchParams;
      return new Response(JSON.stringify(archive(q.get('start_date')!, q.get('end_date')!)));
    };
    const cache = new SwrCache<never>('t:', 5, null) as never;
    const now = () => Date.UTC(2026, 9, 11);
    const dates = dateRange('2026-12-20', '2026-12-29');
    const a = await loadNormals(38.7, -9.1, 'UTC', dates, {
      fetchImpl: fetchImpl as typeof fetch,
      now,
      cache,
    });
    expect(urls).toHaveLength(10);
    expect(new URL(urls[0]!).searchParams.get('start_date')).toBe('2025-12-17');
    expect(new URL(urls[0]!).searchParams.get('end_date')).toBe('2026-01-01');
    await loadNormals(38.7, -9.1, 'UTC', dates, {
      fetchImpl: fetchImpl as typeof fetch,
      now,
      cache,
    });
    expect(urls).toHaveLength(10);
    expect(a).toHaveLength(10);
  });

  it('quantile interpolates', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });
});

function coldDay(date: string, t: number, rainP = 0): DayConditions {
  const w = {
    tAir: t,
    rh: 70,
    windKmh: 15,
    ghi: 0,
    dni: 0,
    dhi: 0,
    sunAlt: 0,
    precipMmH: 0,
    snowDepthM: 0,
  };
  const part = { weather: w, tLow: t - 2, tHigh: t + 2, uvIndex: 1 };
  return {
    date,
    source: 'normal',
    parts: {
      morning: { ...part, weather: { ...w, tAir: t - 4 } },
      afternoon: part,
      evening: { ...part, weather: { ...w, tAir: t - 3 } },
    },
    precipProbability: rainP,
    uvMax: 1,
  };
}

describe('planner + packing (TDD §6.2–6.3)', () => {
  const days = dateRange('2026-11-01', '2026-11-10').map((d, i) =>
    coldDay(d, 8 + (i % 3), i % 2 ? 0.6 : 0),
  );
  const plans = days.map((d) => planDay(d, 'mixed'));

  it('plans three day parts with layering notes', () => {
    const p = plans[0]!;
    expect(Object.keys(p.parts)).toEqual(['morning', 'afternoon', 'evening']);
    expect(p.outfit.length).toBeGreaterThan(3);
    expect(p.parts.morning.perceivedLow).toBeLessThanOrEqual(p.parts.morning.perceivedHigh);
    for (const g of p.parts.morning.outfit) expect(p.items).toContain(g);
    expect(p.outfit.filter((g) => g === 'jeans' || g === 'shorts').length).toBeLessThanOrEqual(1);
  });

  it('a 10-day trip produces a packing list with re-wear rules', () => {
    const list = packingList(plans, { laundry: false });
    const sock = list.items.find((i) => i.id === 'socks' || i.id === 'wool_socks')!;
    expect(sock.needed).toBe(10);
    const jeans = list.items.find((i) => i.id === 'jeans')!;
    expect(jeans.needed).toBe(Math.ceil(jeans.garmentDays / 3));
    const shoes = list.items.find((i) => i.id === 'sneakers' || i.id === 'winter_boots')!;
    expect(shoes.needed).toBe(1);
    expect(list.extras).toContain('umbrella');
    expect(list.extras).not.toContain('sunscreen');
  });

  it('laundry caps counts at a week', () => {
    const many = dateRange('2026-11-01', '2026-11-30').map((d) => planDay(coldDay(d, 9), 'mixed'));
    const list = packingList(many, { laundry: true });
    expect(list.items.find((i) => i.id === 'socks' || i.id === 'wool_socks')!.needed).toBe(7);
  });

  it('detects missing items by day', () => {
    const list = packingList(plans, { laundry: false });
    const sock = list.items.find((i) => i.id === 'socks' || i.id === 'wool_socks')!;
    const short = shortfalls(list, { [sock.id]: 7 });
    const s = short.find((x) => x.id === sock.id)!;
    expect(s.days).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
    expect(shortfalls(list, Object.fromEntries(list.items.map((i) => [i.id, i.needed])))).toEqual(
      [],
    );
  });

  it('summarises conditions', () => {
    const s = summarize(days);
    expect(s.totalDays).toBe(10);
    expect(s.rainyDays).toBe(3);
    expect(s.humidity).toBe('moderate');
    expect(s.anyNormals).toBe(true);
  });

  it('normalDay falls back gracefully when data is missing', () => {
    const nan = {
      t25: NaN,
      t50: NaN,
      t75: NaN,
      rh: NaN,
      windKmh: NaN,
      ghi: NaN,
      dni: NaN,
      dhi: NaN,
      precipMmH: NaN,
      snowDepthM: NaN,
      cloudCover: NaN,
      sunAltDeg: 10,
      sunAzDeg: 180,
      n: 0,
    };
    const d = normalDay({
      date: '2026-01-01',
      parts: { morning: nan, afternoon: nan, evening: nan },
      precipProbability: 0,
      uvMaxEstimate: 0,
    });
    expect(Number.isFinite(planDay(d, 'walking').parts.afternoon.perceived)).toBe(true);
  });
});
