import { isGarmentId, type Activity, type GarmentId } from '../../engine';
import type { Place } from '../../services/types';

export interface ShareState {
  place?: Place;
  outfit?: GarmentId[];
  activity?: Activity;
}

const ACTIVITIES: readonly Activity[] = ['standing', 'strolling', 'walking'];

/** Parse `?c=43.65,-79.38&n=Toronto&o=t_shirt,jeans&a=walking` (TDD §9). Invalid parts are ignored. */
export function parseShare(search: string): ShareState {
  const p = new URLSearchParams(search);
  const out: ShareState = {};
  const c = p.get('c');
  if (c) {
    const [lat, lon] = c.split(',').map(Number);
    if (
      lat !== undefined &&
      lon !== undefined &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      const name = p.get('n')?.slice(0, 80) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      out.place = {
        id: `share:${lat.toFixed(2)},${lon.toFixed(2)}`,
        name,
        latitude: lat,
        longitude: lon,
      };
    }
  }
  const o = p.get('o');
  if (o !== null) {
    const ids = o.split(',').filter((x): x is GarmentId => isGarmentId(x));
    out.outfit = [...new Set(ids)];
  }
  const a = p.get('a');
  if (a && (ACTIVITIES as readonly string[]).includes(a)) out.activity = a as Activity;
  return out;
}

export function buildShare(
  s: Required<Pick<ShareState, 'outfit' | 'activity'>> & { place: Place | null },
): string {
  const p = new URLSearchParams();
  if (s.place) {
    p.set('c', `${s.place.latitude.toFixed(2)},${s.place.longitude.toFixed(2)}`);
    p.set('n', s.place.name);
  }
  p.set('o', s.outfit.join(','));
  p.set('a', s.activity);
  return `?${p.toString().replace(/%2C/g, ',')}`;
}
