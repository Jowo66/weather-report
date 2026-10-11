import { useMemo } from 'react';
import { GARMENT_BY_ID } from '../../data/garments';
import { Avatar2D } from '../../scene/Avatar2D';
import { skinHex } from '../../scene/skinTone';
import { placeLabel } from '../../services/geocoding';
import { useAvatar } from '../../state/avatarStore';
import { useSettings } from '../../state/settingsStore';
import { MAX_TRIP_DAYS, useTravel } from '../../state/travelStore';
import { sortOutfit } from '../../state/wardrobe';
import { packingList, shortfalls, type ExtraId } from '../../travel/packing';
import { DAY_PARTS, type DayPlan, type TripProfile } from '../../travel/planner';
import { addDays, daysBetween } from '../../travel/time';
import { Icon, STATE_ICON } from '../components/Icon';
import { SearchBar } from '../components/SearchBar';
import { GARMENT_LABEL, STATE_LABEL } from '../lib/comfortCopy';
import { formatDay, formatTemp } from '../lib/format';
import { useTripPlan } from '../lib/useTripPlan';

const PROFILES: { id: TripProfile; label: string }[] = [
  { id: 'walking', label: 'Mostly walking' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'static', label: 'Mostly outdoors, still' },
];
const PART_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } as const;
const EXTRA_LABEL: Record<ExtraId, string> = {
  umbrella: 'Umbrella',
  sunscreen: 'Sunscreen',
  sunglasses: 'Sunglasses',
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dayLabel = (iso: string) => formatDay(Date.parse(`${iso}T12:00:00Z`) / 1000, 'UTC');

function DayCard({ plan, short }: { plan: DayPlan; short: boolean }) {
  const unit = useSettings((s) => s.tempUnit);
  const { melanin, undertone, hairColor } = useAvatar();
  const pm = plan.parts.afternoon;
  return (
    <li className={`day card state-${pm.state}${short ? ' day-short' : ''}`} data-testid="trip-day">
      <div className="day-avatar">
        <Avatar2D
          worn={sortOutfit(plan.outfit)}
          state={pm.state}
          label={`Avatar dressed for ${dayLabel(plan.date)}, ${STATE_LABEL[pm.state].toLowerCase()} in the afternoon`}
          skin={skinHex(melanin, undertone)}
          hair={hairColor}
          showZoneTints={false}
        />
      </div>
      <div className="day-body">
        <h3 className="day-title">
          {dayLabel(plan.date)}{' '}
          <span className={`badge ${plan.source === 'normal' ? 'badge-normal' : ''}`}>
            {plan.source === 'normal' ? 'Typical, not forecast' : 'Forecast'}
          </span>
          {short && <span className="badge badge-short">Missing items</span>}
        </h3>
        <p className="day-outfit">
          {sortOutfit(plan.outfit)
            .map((g) => GARMENT_LABEL[g])
            .join(', ')}
        </p>
        <ul className="day-parts">
          {DAY_PARTS.map((part) => {
            const p = plan.parts[part];
            const range =
              Math.round(p.perceivedLow) === Math.round(p.perceivedHigh)
                ? formatTemp(p.perceived, unit)
                : `${formatTemp(p.perceivedLow, unit, { unitLabel: false })} to ${formatTemp(p.perceivedHigh, unit)}`;
            return (
              <li key={part}>
                <span className="muted">{PART_LABEL[part]}</span> {range}{' '}
                <span className="part-state">
                  <Icon name={STATE_ICON[p.state]} size={14} /> {STATE_LABEL[p.state]}
                </span>
              </li>
            );
          })}
        </ul>
        {plan.notes.map((n) => (
          <p key={n.part} className="muted small">
            {PART_LABEL[n.part]}:{' '}
            {n.add.length
              ? `add ${n.add.map((g) => GARMENT_LABEL[g].toLowerCase()).join(', ')}`
              : ''}
            {n.add.length && n.remove.length ? '; ' : ''}
            {n.remove.length
              ? `skip ${n.remove.map((g) => GARMENT_LABEL[g].toLowerCase()).join(', ')}`
              : ''}
          </p>
        ))}
        {plan.precipProbability >= 0.4 && (
          <p className="small">Rain likely ({Math.round(plan.precipProbability * 100)}%).</p>
        )}
      </div>
    </li>
  );
}

export function TravelRoute() {
  const { trip, setTrip, packed, setPacked, clearPacked } = useTravel();
  const unit = useSettings((s) => s.tempUnit);
  const { status, error, plans, summary, valid } = useTripPlan(trip);
  const list = useMemo(
    () => (plans.length ? packingList(plans, { laundry: trip.laundry }) : null),
    [plans, trip.laundry],
  );
  const missing = useMemo(() => (list ? shortfalls(list, packed) : []), [list, packed]);
  const shortDays = new Set(missing.flatMap((m) => m.days));
  const today = todayIso();
  const tooLong = trip.start && trip.end && daysBetween(trip.start, trip.end) >= MAX_TRIP_DAYS;
  const backwards = trip.start && trip.end && daysBetween(trip.start, trip.end) < 0;

  return (
    <div className="travel">
      <h2>Plan a trip</h2>
      <section className="card trip-form" aria-label="Trip details">
        {trip.destination ? (
          <p className="trip-dest">
            <Icon name="location" /> <strong>{placeLabel(trip.destination)}</strong>{' '}
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setTrip({ destination: null })}
            >
              Change
            </button>
          </p>
        ) : (
          <SearchBar
            label="Destination"
            showLocate={false}
            onSelect={(p) => setTrip({ destination: p })}
          />
        )}
        <div className="trip-dates">
          <label>
            <span>Start</span>
            <input
              type="date"
              value={trip.start}
              min={today}
              onChange={(e) => {
                const start = e.target.value;
                setTrip({
                  start,
                  end: trip.end && trip.end >= start ? trip.end : addDays(start, 6),
                });
              }}
            />
          </label>
          <label>
            <span>End</span>
            <input
              type="date"
              value={trip.end}
              min={trip.start || today}
              max={trip.start ? addDays(trip.start, MAX_TRIP_DAYS - 1) : undefined}
              onChange={(e) => setTrip({ end: e.target.value })}
            />
          </label>
        </div>
        {tooLong && <p role="alert">Trips can be up to {MAX_TRIP_DAYS} days.</p>}
        {backwards && <p role="alert">The end date is before the start date.</p>}
        <fieldset className="segmented">
          <legend>Activity</legend>
          {PROFILES.map((p) => (
            <label key={p.id} className={trip.profile === p.id ? 'on' : undefined}>
              <input
                type="radio"
                name="profile"
                checked={trip.profile === p.id}
                onChange={() => setTrip({ profile: p.id })}
              />
              {p.label}
            </label>
          ))}
        </fieldset>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={trip.laundry}
            onChange={(e) => setTrip({ laundry: e.target.checked })}
          />
          <span>Laundry access</span>
        </label>
      </section>

      {!valid && !tooLong && !backwards && (
        <p className="muted">Pick a destination and dates (up to {MAX_TRIP_DAYS} days).</p>
      )}
      {status === 'loading' && (
        <p role="status" className="loading">
          Working out the conditions…
        </p>
      )}
      {status === 'error' && <p role="alert">{error}</p>}

      {summary && (
        <section className="card" aria-labelledby="summary-title" data-testid="trip-summary">
          <h3 id="summary-title" className="card-title">
            Conditions
          </h3>
          <p>
            {summary.anyNormals ? 'Typically' : 'Forecast'}{' '}
            {formatTemp(summary.tLow, unit, { unitLabel: false })} to{' '}
            {formatTemp(summary.tHigh, unit)} · {summary.humidity} humidity · rain on ~
            {summary.rainyDays} of {summary.totalDays} days · UV {summary.uv}
          </p>
          {summary.anyNormals && (
            <p className="muted small">
              Days more than 15 days away use the last 10 years of weather for those dates: typical,
              not forecast.
            </p>
          )}
        </section>
      )}

      {list && (
        <section className="card" aria-labelledby="pack-title" data-testid="packing-list">
          <h3 id="pack-title" className="card-title">
            Packing list
          </h3>
          <p className="muted small">
            Mark what you&rsquo;ve packed.{' '}
            {trip.laundry ? 'With laundry, counts cover a week at most.' : ''}
          </p>
          <ul className="pack">
            {list.items.map((item) => {
              const have = packed[item.id] ?? 0;
              const ok = have >= item.needed;
              return (
                <li key={item.id} className={ok ? 'packed' : undefined}>
                  <span
                    className="swatch"
                    style={{ background: GARMENT_BY_ID[item.id].tint.default }}
                    aria-hidden
                  />
                  <span className="pack-name">
                    {GARMENT_LABEL[item.id]} <span className="muted">× {item.needed}</span>
                  </span>
                  <span className="stepper">
                    <button
                      type="button"
                      className="btn btn-small"
                      aria-label={`One fewer ${GARMENT_LABEL[item.id]}`}
                      onClick={() => setPacked(item.id, have - 1)}
                    >
                      −
                    </button>
                    <span aria-live="polite" aria-label={`${GARMENT_LABEL[item.id]} packed`}>
                      {have}
                    </span>
                    <button
                      type="button"
                      className="btn btn-small"
                      aria-label={`One more ${GARMENT_LABEL[item.id]}`}
                      onClick={() => setPacked(item.id, have + 1)}
                    >
                      +
                    </button>
                  </span>
                  <span className="pack-status">
                    {ok ? '✓ packed' : `${item.needed - have} to go`}
                  </span>
                </li>
              );
            })}
            {list.extras.map((x) => {
              const have = (packed[x] ?? 0) > 0;
              return (
                <li key={x} className={have ? 'packed' : undefined}>
                  <label className="pack-extra">
                    <input
                      type="checkbox"
                      checked={have}
                      onChange={(e) => setPacked(x, e.target.checked ? 1 : 0)}
                    />
                    {EXTRA_LABEL[x]}
                  </label>
                </li>
              );
            })}
          </ul>
          {missing.length > 0 ? (
            <div className="missing" data-testid="missing">
              <h4>Still missing</h4>
              <ul>
                {missing.map((m) => (
                  <li key={m.id}>
                    {GARMENT_LABEL[m.id]}: {m.needed - m.packed} more, short from{' '}
                    {dayLabel(m.days[0]!)}
                    {m.days.length > 1 ? ` (${m.days.length} days)` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p data-testid="all-packed">
              <Icon name="check" /> Everything&rsquo;s packed.
            </p>
          )}
          <button type="button" className="btn btn-small" onClick={clearPacked}>
            Clear packed
          </button>
        </section>
      )}

      {plans.length > 0 && (
        <section aria-labelledby="days-title">
          <h3 id="days-title">Day by day</h3>
          <ol className="days">
            {plans.map((p) => (
              <DayCard key={p.date} plan={p} short={shortDays.has(p.date)} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
