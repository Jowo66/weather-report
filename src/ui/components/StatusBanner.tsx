import { useWeather } from '../../state/weatherStore';
import { formatAge } from '../lib/format';
import { Icon } from './Icon';

export function StatusBanner({ now }: { now: number }) {
  const { status, error, offline, forecast, refresh } = useWeather();
  const age = forecast ? now - forecast.fetchedAt : 0;
  if (status === 'error') {
    return (
      <div className="banner banner-error" role="alert">
        <Icon name="warning" />
        <span>
          {error}
          {forecast ? ` Showing data from ${formatAge(age)}.` : ''}
        </span>
        <button type="button" className="btn btn-small" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }
  if (offline || (forecast && age > 60 * 60 * 1000)) {
    return (
      <div className="banner" role="status">
        <Icon name="refresh" />
        <span>
          {offline ? 'Offline. ' : ''}Updated {formatAge(age)}.
        </span>
      </div>
    );
  }
  return null;
}
