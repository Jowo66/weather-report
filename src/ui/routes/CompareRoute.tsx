import { useEffect, useMemo, useState } from 'react';
import { evaluate, recommend } from '../../engine';
import { Avatar2D } from '../../scene/Avatar2D';
import { skinHex } from '../../scene/skinTone';
import { placeLabel } from '../../services/geocoding';
import { loadForecast } from '../../services/openMeteo';
import { toEngineWeather, type Forecast, type Place } from '../../services/types';
import { useAvatar } from '../../state/avatarStore';
import { useOutfit } from '../../state/outfitStore';
import { useComfortContext, upcomingHours } from '../../state/selectors';
import { useSettings } from '../../state/settingsStore';
import { MAX_COMPARE, useTravel } from '../../state/travelStore';
import { sortOutfit } from '../../state/wardrobe';
import { Icon, STATE_ICON } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { GARMENT_LABEL, STATE_LABEL } from '../lib/comfortCopy';
import { formatTemp } from '../lib/format';

function useForecast(p: Place) {
  const [f, setF] = useState<{ forecast: Forecast | null; error: boolean }>({
    forecast: null,
    error: false,
  });
  useEffect(() => {
    const ctrl = new AbortController();
    loadForecast(p.latitude, p.longitude, { signal: ctrl.signal })
      .then((r) => setF({ forecast: r.forecast, error: false }))
      .catch((e: unknown) => {
        if ((e as Error)?.name !== 'AbortError') setF({ forecast: null, error: true });
      });
    return () => ctrl.abort();
  }, [p.latitude, p.longitude]);
  return f;
}

function CityColumn({ place, onRemove }: { place: Place; onRemove: () => void }) {
  const { forecast, error } = useForecast(place);
  const worn = useOutfit((s) => s.worn);
  const ctx = useComfortContext();
  const unit = useSettings((s) => s.tempUnit);
  const { melanin, undertone, hairColor } = useAvatar();
  const view = useMemo(() => {
    if (!forecast) return null;
    const now = toEngineWeather(forecast.current);
    const mine = evaluate(now, worn, ctx);
    const rec = recommend(now, ctx);
    const next = upcomingHours(forecast, 24).map(
      (s) => evaluate(toEngineWeather(s), rec.outfit, ctx).perceived,
    );
    return { mine, rec, lo: Math.min(...next), hi: Math.max(...next) };
  }, [forecast, worn, ctx]);
  return (
    <li
      className={`compare-col card${view ? ` state-${view.rec.state}` : ''}`}
      data-testid="compare-col"
    >
      <div className="compare-head">
        <h3>{placeLabel(place)}</h3>
        <button
          type="button"
          className="btn btn-small"
          onClick={onRemove}
          aria-label={`Remove ${place.name}`}
        >
          ×
        </button>
      </div>
      {error && <p role="alert">Couldn&rsquo;t load the weather.</p>}
      {!view && !error && <p className="loading">Loading…</p>}
      {view && forecast && (
        <>
          <div className="compare-avatar">
            <Avatar2D
              worn={sortOutfit(view.rec.outfit)}
              state={view.rec.state}
              label={`Avatar in ${place.name}, dressed in the recommended outfit, ${STATE_LABEL[view.rec.state].toLowerCase()}`}
              skin={skinHex(melanin, undertone)}
              hair={hairColor}
              showZoneTints={false}
            />
          </div>
          <p className="muted">Air {formatTemp(forecast.current.tAir, unit)}</p>
          <p>
            In what you&rsquo;re wearing: <strong>{formatTemp(view.mine.perceived, unit)}</strong>{' '}
            <span className="part-state">
              <Icon name={STATE_ICON[view.mine.state]} size={14} /> {STATE_LABEL[view.mine.state]}
            </span>
          </p>
          <p className="compare-rec">
            Wear:{' '}
            {sortOutfit(view.rec.outfit)
              .map((g) => GARMENT_LABEL[g])
              .join(', ')}
          </p>
          <p>
            You&rsquo;ll feel {formatTemp(view.lo, unit, { unitLabel: false })} to{' '}
            {formatTemp(view.hi, unit)} over the next 24 h in it.
          </p>
        </>
      )}
    </li>
  );
}

export function CompareRoute() {
  const { compare, addCompare, removeCompare } = useTravel();
  return (
    <div className="compare">
      <h2>Compare cities</h2>
      {compare.length < MAX_COMPARE ? (
        <SearchBar
          label={`Add a city (${compare.length}/${MAX_COMPARE})`}
          showLocate={false}
          onSelect={addCompare}
        />
      ) : (
        <p className="muted">Comparing {MAX_COMPARE} cities. Remove one to add another.</p>
      )}
      {compare.length === 0 && (
        <p className="muted">
          Add up to {MAX_COMPARE} cities to see how each would feel side by side.
        </p>
      )}
      <ul className="compare-grid">
        {compare.map((p) => (
          <CityColumn key={String(p.id)} place={p} onRemove={() => removeCompare(p.id)} />
        ))}
      </ul>
    </div>
  );
}
