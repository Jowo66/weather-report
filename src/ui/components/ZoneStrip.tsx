import { ZONE_IDS, type ComfortResult } from '../../engine';
import { useSettings } from '../../state/settingsStore';
import { ZONE_LABEL, ZONE_STATE_LABEL } from '../lib/comfortCopy';
import { formatTemp } from '../lib/format';
import { Icon, ZONE_STATE_ICON } from './Icon';

const FROSTBITE_LABEL = {
  high: 'high',
  very_high: 'very high',
  severe: 'severe',
  extreme: 'extreme',
} as const;

export function ZoneStrip({ result }: { result: ComfortResult }) {
  const unit = useSettings((s) => s.tempUnit);
  return (
    <section className="card" aria-labelledby="zones-title">
      <h2 id="zones-title" className="card-title">
        Body zones
      </h2>
      <ul className="zones" data-testid="zone-strip">
        {ZONE_IDS.map((z) => {
          const r = result.zones[z];
          return (
            <li key={z} className={`zone zone-${r.state}`} data-testid={`zone-${z}`}>
              <span className="zone-name">{ZONE_LABEL[z]}</span>
              <span className="zone-state">
                <Icon name={ZONE_STATE_ICON[r.state]} size={16} />
                {ZONE_STATE_LABEL[r.state]}
              </span>
              <span className="zone-temp muted">
                feels {formatTemp(r.tFelt, unit, { unitLabel: false })}
              </span>
              {r.exposed && <span className="zone-tag">bare</span>}
              {r.wetness > 0.2 && <span className="zone-tag">wet</span>}
              {r.frostbite && (
                <span className="zone-tag zone-tag-danger">
                  frostbite risk {FROSTBITE_LABEL[r.frostbite]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
