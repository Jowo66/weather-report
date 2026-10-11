import { useMemo, useState } from 'react';
import { DEFAULT_CONFIG, evaluate } from '../../engine';
import { toEngineWeather } from '../../services/types';
import { activeConfig, toCsv, TUNABLES, useCalibration, VOTES } from '../../state/calibrationStore';
import { useOutfit } from '../../state/outfitStore';
import { useComfortContext } from '../../state/selectors';
import { useSettings } from '../../state/settingsStore';
import { useWeather } from '../../state/weatherStore';
import { STATE_LABEL } from '../lib/comfortCopy';
import { formatTemp } from '../lib/format';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Dev / playtest route (T-24): tune EngineConfig live and log how people actually feel. */
export function CalibrationRoute() {
  const cal = useCalibration();
  const place = useWeather((s) => s.place);
  const sample = useWeather((s) => s.forecast?.current ?? null);
  const worn = useOutfit((s) => s.worn);
  const ctx = useComfortContext();
  const unit = useSettings((s) => s.tempUnit);
  const [vote, setVote] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  const cfg = activeConfig({ enabled: true, overrides: cal.overrides });
  const cmp = useMemo(() => {
    if (!sample) return null;
    const w = toEngineWeather(sample);
    return { def: evaluate(w, worn, ctx), cal: evaluate(w, worn, ctx, cfg) };
  }, [sample, worn, ctx, cfg]);

  function log() {
    if (!sample || !place || vote === null || !cmp) return;
    cal.addEntry({
      at: new Date().toISOString(),
      place: place.name,
      lat: place.latitude,
      lon: place.longitude,
      tAir: sample.tAir,
      rh: sample.rh,
      windKmh: sample.windKmh,
      ghi: sample.ghi,
      precipMmH: sample.precipMmH,
      outfit: worn,
      activity: ctx.activity,
      shade: ctx.shade,
      umbrella: ctx.umbrella,
      personalOffset: ctx.personalOffset,
      perceivedDefault: Math.round(cmp.def.perceived * 10) / 10,
      perceivedCalibrated: Math.round(cmp.cal.perceived * 10) / 10,
      stateDefault: cmp.def.state,
      vote,
      minutesOutside: minutes,
      note: note.slice(0, 500),
    });
    setVote(null);
    setNote('');
    setSaved(true);
  }

  return (
    <div className="calibration">
      <h2>Calibration &amp; playtest</h2>
      <p className="muted">
        For the outdoor playtest (PRODUCT_SPEC D4). Tune the heuristic parameters and log how people
        actually feel. Data stays in this browser until you export it.
      </p>

      <section className="card" aria-labelledby="cal-now">
        <h3 id="cal-now" className="card-title">
          Right now
        </h3>
        {cmp && place ? (
          <p data-testid="cal-compare">
            {place.name}: model says <strong>{formatTemp(cmp.def.perceived, unit)}</strong> (
            {STATE_LABEL[cmp.def.state]}
            ); calibrated <strong>{formatTemp(cmp.cal.perceived, unit)}</strong> (
            {STATE_LABEL[cmp.cal.state]}).
          </p>
        ) : (
          <p className="muted">Pick a city on the Now screen first.</p>
        )}
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={cal.enabled}
            onChange={(e) => cal.setEnabled(e.target.checked)}
          />
          <span>Use calibrated values across the app</span>
        </label>
      </section>

      <section className="card" aria-labelledby="cal-params">
        <h3 id="cal-params" className="card-title">
          Parameters
        </h3>
        <div className="tunables">
          {TUNABLES.map((t) => {
            const def = DEFAULT_CONFIG[t.key];
            const v = cal.overrides[t.key] ?? def;
            return (
              <label key={t.key} className="slider">
                <span>
                  {t.label}: <strong>{v}</strong> <span className="muted">(default {def})</span>
                </span>
                <input
                  type="range"
                  min={t.min}
                  max={t.max}
                  step={t.step}
                  value={v}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    cal.setOverride(t.key, Math.abs(n - def) < 1e-9 ? undefined : n);
                  }}
                />
              </label>
            );
          })}
        </div>
        <button type="button" className="btn btn-small" onClick={cal.resetOverrides}>
          Reset to defaults
        </button>
      </section>

      <section className="card" aria-labelledby="cal-vote">
        <h3 id="cal-vote" className="card-title">
          How do you actually feel?
        </h3>
        <fieldset className="segmented">
          <legend>Your vote</legend>
          {VOTES.map((o) => (
            <label key={o.v} className={vote === o.v ? 'on' : undefined}>
              <input
                type="radio"
                name="vote"
                checked={vote === o.v}
                onChange={() => setVote(o.v)}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
        <label className="slider">
          <span>Minutes outside: {minutes}</span>
          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
        <label className="note">
          <span>Note (optional)</span>
          <textarea
            value={note}
            maxLength={500}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={vote === null || !cmp}
            onClick={log}
          >
            Log this
          </button>{' '}
          {saved && <span role="status">Logged.</span>}
        </p>
      </section>

      <section className="card" aria-labelledby="cal-log">
        <h3 id="cal-log" className="card-title">
          Log
        </h3>
        <p data-testid="log-count">{cal.log.length} entries</p>
        <p className="row">
          <button
            type="button"
            className="btn btn-small"
            disabled={cal.log.length === 0}
            onClick={() =>
              download(
                `weather-report-playtest-${new Date().toISOString().slice(0, 10)}.csv`,
                toCsv(cal.log),
              )
            }
          >
            Export CSV
          </button>{' '}
          <button
            type="button"
            className="btn btn-small"
            disabled={cal.log.length === 0}
            onClick={() => {
              if (window.confirm('Delete all logged entries?')) cal.clearLog();
            }}
          >
            Clear log
          </button>
        </p>
      </section>
    </div>
  );
}
