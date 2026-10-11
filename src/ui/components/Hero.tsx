import { describeWeather } from '../../data/weatherCodes';
import type { ComfortView } from '../../state/selectors';
import { useSettings } from '../../state/settingsStore';
import { STATE_LABEL } from '../lib/comfortCopy';
import { formatTemp, formatWind } from '../lib/format';
import { Icon, STATE_ICON, conditionIcon } from './Icon';

export function Hero({ view, placeName }: { view: ComfortView; placeName: string }) {
  const { tempUnit, windUnit } = useSettings();
  const { sample, result } = view;
  const cond = describeWeather(sample.weatherCode);
  return (
    <section className={`hero state-${result.state}`} aria-labelledby="hero-title">
      <p className="hero-place">
        <Icon name={conditionIcon(cond.icon, sample.isDay)} size={22} />
        <span>
          {placeName} · {cond.label} · {formatTemp(sample.tAir, tempUnit)}
        </span>
      </p>
      <h2 id="hero-title" className="hero-main">
        <span className="hero-lead">You&rsquo;ll feel</span>{' '}
        <strong className="hero-temp" data-testid="perceived">
          {formatTemp(result.perceived, tempUnit)}
        </strong>
      </h2>
      <p className="state-pill" data-testid="comfort-state">
        <Icon name={STATE_ICON[result.state]} size={20} />
        <span>{STATE_LABEL[result.state]}</span>
      </p>
      <p className="hero-official">
        Forecast feels-like{' '}
        <strong data-testid="official">{formatTemp(view.forecastFeelsLike, tempUnit)}</strong>
      </p>
      <dl className="hero-stats">
        <div>
          <dt>Wind</dt>
          <dd>
            {formatWind(sample.windKmh, windUnit)}
            {sample.gustKmh > sample.windKmh + 10 && (
              <span className="muted"> (gusts {formatWind(sample.gustKmh, windUnit)})</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Humidity</dt>
          <dd>{Math.round(sample.rh)}%</dd>
        </div>
        <div>
          <dt>UV index</dt>
          <dd>{Math.round(sample.uvIndex)}</dd>
        </div>
        <div>
          <dt>Precipitation</dt>
          <dd>{sample.precipMmH.toFixed(1)} mm/h</dd>
        </div>
      </dl>
    </section>
  );
}
