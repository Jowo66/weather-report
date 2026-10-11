import type { Activity } from '../../engine';
import { useAvatar } from '../../state/avatarStore';
import { useOutfit } from '../../state/outfitStore';
import { useSettings } from '../../state/settingsStore';
import { formatDelta } from '../lib/format';

const ACTIVITIES: { id: Activity; label: string }[] = [
  { id: 'standing', label: 'Standing' },
  { id: 'strolling', label: 'Strolling' },
  { id: 'walking', label: 'Walking' },
];

export function Toggles() {
  const { activity, shade, umbrella, setActivity, setShade, setUmbrella } = useOutfit();
  const offset = useAvatar((s) => s.personalOffset);
  const setOffset = useAvatar((s) => s.setPersonalOffset);
  const unit = useSettings((s) => s.tempUnit);
  return (
    <section className="card toggles" aria-label="Conditions">
      <fieldset className="segmented">
        <legend>Activity</legend>
        {ACTIVITIES.map((a) => (
          <label key={a.id} className={activity === a.id ? 'on' : undefined}>
            <input
              type="radio"
              name="activity"
              value={a.id}
              checked={activity === a.id}
              onChange={() => setActivity(a.id)}
            />
            {a.label}
          </label>
        ))}
      </fieldset>
      <div className="switches">
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={shade}
            onChange={(e) => setShade(e.target.checked)}
          />
          <span>In the shade</span>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={umbrella}
            onChange={(e) => setUmbrella(e.target.checked)}
          />
          <span>Umbrella</span>
        </label>
      </div>
      <label className="offset">
        <span>
          I run{' '}
          <strong>
            {offset === 0
              ? 'average'
              : offset < 0
                ? `cold (${formatDelta(offset, unit)})`
                : `hot (+${formatDelta(offset, unit)})`}
          </strong>
        </span>
        <input
          type="range"
          min={-3}
          max={3}
          step={0.5}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          aria-valuetext={
            offset === 0
              ? 'average'
              : `${offset > 0 ? 'hot' : 'cold'} by ${Math.abs(offset)} degrees`
          }
        />
        <span className="offset-scale muted" aria-hidden>
          <span>Cold</span>
          <span>Hot</span>
        </span>
      </label>
    </section>
  );
}
