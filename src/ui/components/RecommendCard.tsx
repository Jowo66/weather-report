import type { Recommendation } from '../../engine';
import type { WeatherSample } from '../../services/types';
import { useOutfit } from '../../state/outfitStore';
import { sortOutfit } from '../../state/wardrobe';
import { useSettings } from '../../state/settingsStore';
import { GARMENT_LABEL, STATE_LABEL, ZONE_LABEL } from '../lib/comfortCopy';
import { formatTemp } from '../lib/format';

const ADVICE_COPY = {
  umbrella: 'Bring an umbrella or rain shell.',
  sun_protection: 'UV is moderate or higher: sunscreen, sunglasses and a hat.',
  seek_shade_hydrate: 'Seek shade and drink water.',
  limit_exposure: 'Limit time outside: no everyday outfit fully covers this.',
} as const;

/**
 * Advice for display. The engine's reference uses GHI ≥ 500 W/m² as a UV stand-in; here the
 * API's UV index ≥ 3 decides sun protection (TDD §6.1).
 */
export function displayAdvice(
  rec: Recommendation,
  sample: WeatherSample,
): (keyof typeof ADVICE_COPY)[] {
  const base = rec.advice.filter((a) => a !== 'sun_protection');
  return sample.uvIndex >= 3 ? ['sun_protection', ...base] : base;
}

export function whyCopy(rec: Recommendation, unit: 'C' | 'F'): string {
  if (!rec.metTarget) {
    return `Nothing in the wardrobe gets you to comfortable here; this is the warmest sensible option (${formatTemp(rec.perceived, unit)}, ${STATE_LABEL[rec.state].toLowerCase()}).`;
  }
  return `The lightest outfit that keeps you at ${formatTemp(rec.perceived, unit)} (${STATE_LABEL[rec.state].toLowerCase()}) with no cold body zone.`;
}

export function RecommendCard({ rec, sample }: { rec: Recommendation; sample: WeatherSample }) {
  const worn = useOutfit((s) => s.worn);
  const setWorn = useOutfit((s) => s.setWorn);
  const unit = useSettings((s) => s.tempUnit);
  const outfit = sortOutfit(rec.outfit);
  const same = outfit.length === worn.length && outfit.every((g) => worn.includes(g));
  const advice = displayAdvice(rec, sample);
  return (
    <section className="card" aria-labelledby="rec-title" data-testid="recommendation">
      <h2 id="rec-title" className="card-title">
        What to wear now
      </h2>
      <p className="rec-outfit">{outfit.map((g) => GARMENT_LABEL[g]).join(', ')}</p>
      <p className="muted">{whyCopy(rec, unit)}</p>
      {rec.coldZones.length > 0 && (
        <p className="muted">
          Still cold: {rec.coldZones.map((z) => ZONE_LABEL[z].toLowerCase()).join(', ')}.
        </p>
      )}
      {advice.length > 0 && (
        <ul className="advice">
          {advice.map((a) => (
            <li key={a}>{ADVICE_COPY[a]}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setWorn(outfit)}
        disabled={same}
      >
        {same ? 'You’re wearing it' : 'Wear this'}
      </button>
    </section>
  );
}
