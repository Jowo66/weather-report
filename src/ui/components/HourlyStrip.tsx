import { describeWeather } from '../../data/weatherCodes';
import type { HourView } from '../../state/selectors';
import { useSettings } from '../../state/settingsStore';
import { STATE_LABEL } from '../lib/comfortCopy';
import { formatHour, formatTemp } from '../lib/format';
import { Icon, STATE_ICON, conditionIcon } from './Icon';

function sameOutfit(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

export function HourlyStrip({ hours, timeZone }: { hours: HourView[]; timeZone: string }) {
  const unit = useSettings((s) => s.tempUnit);
  if (hours.length === 0) return null;
  return (
    <section aria-labelledby="hourly-title" className="card">
      <h2 id="hourly-title" className="card-title">
        Next {hours.length} hours in what you&rsquo;re wearing
      </h2>
      <ol className="hourly" tabIndex={0} aria-label="Hourly forecast">
        {hours.map((h, i) => {
          const cond = describeWeather(h.sample.weatherCode);
          const prev = hours[i - 1];
          const change = prev && !sameOutfit(prev.recommendation.outfit, h.recommendation.outfit);
          return (
            <li key={h.sample.time} className={`hour state-${h.result.state}`}>
              <span className="hour-time">
                {i === 0 ? 'Now' : formatHour(h.sample.time, timeZone)}
              </span>
              <Icon name={conditionIcon(cond.icon, h.sample.isDay)} title={cond.label} />
              <span className="hour-temp">
                {formatTemp(h.result.perceived, unit, { unitLabel: false })}
              </span>
              <span className="hour-state">
                <Icon name={STATE_ICON[h.result.state]} size={14} />
                <span>{STATE_LABEL[h.result.state]}</span>
              </span>
              <span className="hour-air muted">
                air {formatTemp(h.sample.tAir, unit, { unitLabel: false })}
              </span>
              {change && (
                <span className="hour-change" title="Recommended outfit changes">
                  <Icon name="shirt" size={14} />
                  <span className="visually-hidden">Recommended outfit changes</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
