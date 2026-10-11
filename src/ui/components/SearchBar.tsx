import { useEffect, useId, useRef, useState } from 'react';
import { placeLabel, searchPlaces } from '../../services/geocoding';
import type { Place } from '../../services/types';
import { useWeather } from '../../state/weatherStore';
import { Icon } from './Icon';

export function SearchBar({
  onSelect,
  label = 'Search for a city',
  showLocate = true,
}: {
  onSelect?: (p: Place) => void;
  label?: string;
  showLocate?: boolean;
} = {}) {
  const setWeatherPlace = useWeather((s) => s.setPlace);
  const setPlace = onSelect ?? setWeatherPlace;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<'idle' | 'searching' | 'error' | 'empty'>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setStatus('searching');
      searchPlaces(q, { signal: ctrl.signal })
        .then((r) => {
          setResults(r);
          setActive(r.length ? 0 : -1);
          setStatus(r.length ? 'idle' : 'empty');
          setOpen(true);
        })
        .catch((e: unknown) => {
          if ((e as Error)?.name !== 'AbortError') setStatus('error');
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  function choose(p: Place) {
    setPlace(p);
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      const p = results[active];
      if (p) {
        e.preventDefault();
        choose(p);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  function useMyLocation() {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Location is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        choose({
          id: `geo:${latitude.toFixed(2)},${longitude.toFixed(2)}`,
          name: 'My location',
          latitude,
          longitude,
        });
      },
      () => setGeoError('Could not get your location.'),
      { maximumAge: 10 * 60 * 1000, timeout: 15000 },
    );
  }

  const showList = open && query.trim().length >= 2;
  return (
    <div className="search">
      <div className="search-row">
        <label className="search-field">
          <Icon name="search" />
          <span className="visually-hidden">{label}</span>
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            placeholder={label}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) {
                setResults([]);
                setStatus('idle');
              }
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </label>
        {showLocate && (
          <button type="button" className="btn btn-ghost" onClick={useMyLocation}>
            <Icon name="location" />
            <span className="btn-label">Use my location</span>
          </button>
        )}
      </div>
      {showList && (
        <ul id={listId} role="listbox" className="search-results">
          {status === 'searching' && results.length === 0 && (
            <li className="search-note" role="presentation">
              Searching…
            </li>
          )}
          {status === 'empty' && (
            <li className="search-note" role="presentation">
              No places found.
            </li>
          )}
          {status === 'error' && (
            <li className="search-note" role="presentation">
              Search is unavailable right now.
            </li>
          )}
          {results.map((p, i) => (
            <li
              key={`${p.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
            >
              {placeLabel(p)}
            </li>
          ))}
        </ul>
      )}
      {geoError && (
        <p className="search-note" role="status">
          {geoError}
        </p>
      )}
    </div>
  );
}
