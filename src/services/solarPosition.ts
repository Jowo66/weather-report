const RAD = Math.PI / 180;

export interface SunPosition {
  /** Degrees above the horizon (negative below). */
  altitude: number;
  /** Degrees clockwise from north. */
  azimuth: number;
}

function dayOfYearUTC(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / 86_400_000) + 1;
}

/** NOAA simplified solar position (≈ 0.5° accuracy), TDD §3.4. `unixSeconds` is UTC. */
export function sunPosition(unixSeconds: number, latDeg: number, lonDeg: number): SunPosition {
  const d = new Date(unixSeconds * 1000);
  const hourUTC = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (dayOfYearUTC(d) - 1 + (hourUTC - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const eot =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const trueSolarMin = hourUTC * 60 + eot + 4 * lonDeg;
  const ha = (trueSolarMin / 4 - 180) * RAD;
  const lat = latDeg * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz =
    (Math.sin(decl) - Math.sin(lat) * sinAlt) / Math.max(1e-9, Math.cos(lat) * Math.cos(alt));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / RAD;
  if (Math.sin(ha) > 0) az = 360 - az;
  return { altitude: alt / RAD, azimuth: az };
}

export function sunAltitude(unixSeconds: number, latDeg: number, lonDeg: number): number {
  return sunPosition(unixSeconds, latDeg, lonDeg).altitude;
}
