import { useEffect, useMemo, useState } from 'react';
import { loadNormals } from '../../services/climateNormals';
import { loadForecast } from '../../services/openMeteo';
import type { Forecast } from '../../services/types';
import { useAvatar } from '../../state/avatarStore';
import type { Trip } from '../../state/travelStore';
import {
  forecastDay,
  normalDay,
  planDay,
  summarize,
  type DayConditions,
} from '../../travel/planner';
import { dateRange, daysBetween, localIsoDate } from '../../travel/time';

export type TripStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Forecast for days ≤ today+15, climate normals beyond (TDD §6.2). */
export function useTripPlan(trip: Trip) {
  const [state, setState] = useState<{
    status: TripStatus;
    days: DayConditions[];
    error: string | null;
    key: string;
  }>({
    status: 'idle',
    days: [],
    error: null,
    key: '',
  });
  const offset = useAvatar((s) => s.personalOffset);
  const valid =
    !!trip.destination &&
    !!trip.start &&
    !!trip.end &&
    daysBetween(trip.start, trip.end) >= 0 &&
    daysBetween(trip.start, trip.end) < 30;
  const key = valid
    ? `${trip.destination!.latitude},${trip.destination!.longitude}|${trip.start}|${trip.end}`
    : '';

  useEffect(() => {
    if (!valid || !trip.destination) return;
    const ctrl = new AbortController();
    const dest = trip.destination;
    let cancelled = false;
    // Debounce: editing dates shouldn't burst archive requests (Open-Meteo fair use).
    const timer = setTimeout(() => void run(), 500);
    const run = async () => {
      setState((s) => ({ ...s, status: 'loading', error: null, key }));
      try {
        const { forecast } = await loadForecast(dest.latitude, dest.longitude, {
          signal: ctrl.signal,
        });
        const tz = forecast.timezone;
        const today = localIsoDate(Date.now() / 1000, tz);
        const dates = dateRange(trip.start, trip.end);
        const fromForecast = new Map<string, DayConditions>();
        for (const d of dates) {
          if (daysBetween(today, d) <= 15 && daysBetween(today, d) >= 0) {
            const c = forecastDay(forecast as Forecast, d);
            if (c) fromForecast.set(d, c);
          }
        }
        const rest = dates.filter((d) => !fromForecast.has(d));
        const normals = rest.length
          ? await loadNormals(dest.latitude, dest.longitude, tz, rest, { signal: ctrl.signal })
          : [];
        const byDate = new Map(normals.map((n) => [n.date, normalDay(n)]));
        const days = dates.map((d) => fromForecast.get(d) ?? byDate.get(d)!).filter(Boolean);
        if (!cancelled) setState({ status: 'ready', days, error: null, key });
      } catch (e) {
        if (cancelled || (e as Error)?.name === 'AbortError') return;
        console.error('Trip plan failed', e);
        setState({
          status: 'error',
          days: [],
          error: 'Could not load conditions for this trip.',
          key,
        });
      }
    };
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const profile = trip.profile;
  const plans = useMemo(
    () =>
      state.status === 'ready' && state.key === key
        ? state.days.map((d) => planDay(d, profile, offset))
        : [],
    [state, key, profile, offset],
  );
  const summary = useMemo(() => (plans.length ? summarize(state.days) : null), [plans, state.days]);
  return { status: valid ? state.status : 'idle', error: state.error, plans, summary, valid };
}
