import { useEffect, useState } from 'react';
import { useComfort, useExplanation, useHourlyComfort } from '../../state/selectors';
import { useSettings } from '../../state/settingsStore';
import { useWeather } from '../../state/weatherStore';
import { ExplanationChips } from '../components/ExplanationChips';
import { FlagCards } from '../components/FlagCards';
import { Hero } from '../components/Hero';
import { HourlyStrip } from '../components/HourlyStrip';
import { LiveSummary } from '../components/LiveSummary';
import { SearchBar } from '../components/SearchBar';
import { StatusBanner } from '../components/StatusBanner';
import { STATE_LABEL } from '../lib/comfortCopy';
import { spokenTemp } from '../lib/format';
import { useUrlSync } from '../lib/useUrlSync';

const REFRESH_MS = 15 * 60 * 1000;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function NowRoute() {
  useUrlSync();
  const place = useWeather((s) => s.place);
  const status = useWeather((s) => s.status);
  const forecast = useWeather((s) => s.forecast);
  const refresh = useWeather((s) => s.refresh);
  const view = useComfort();
  const explanation = useExplanation();
  const hours = useHourlyComfort(24);
  const unit = useSettings((s) => s.tempUnit);
  const now = useNow(60_000);

  // Revalidate every 15 min while open (never faster: Open-Meteo fair use).
  useEffect(() => {
    if (!place) return;
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [place, refresh]);

  const summary = view
    ? `You'll feel ${spokenTemp(view.result.perceived, unit)}, ${STATE_LABEL[view.result.state].toLowerCase()}.`
    : '';

  return (
    <div className="now">
      <SearchBar />
      <StatusBanner now={now} />
      {!place && (
        <section className="card empty">
          <h2>How would you actually feel outside?</h2>
          <p>
            Search for a city to see how the weather will feel in what you&rsquo;re wearing, not
            just the forecast&rsquo;s feels-like number.
          </p>
        </section>
      )}
      {place && !view && status !== 'error' && (
        <p className="loading" role="status">
          Loading weather for {place.name}…
        </p>
      )}
      {view && place && (
        <>
          <Hero view={view} placeName={place.name} />
          {explanation && <ExplanationChips explanation={explanation} />}
          <FlagCards flags={view.result.flags} />
          <HourlyStrip hours={hours} timeZone={forecast?.timezone ?? 'UTC'} />
          <p className="reference-note muted">
            Outfit: T-shirt, jeans, socks and sneakers, standing. &ldquo;You&rsquo;ll feel
            14°&rdquo; means you&rsquo;d feel like someone in a T-shirt and jeans does at 14° in the
            shade on a still day.
          </p>
          <LiveSummary text={summary} />
        </>
      )}
    </div>
  );
}
