import type { Explanation } from '../../engine';
import { useSettings } from '../../state/settingsStore';
import { factorText } from '../lib/comfortCopy';
import { Icon, type IconName } from './Icon';

const KIND_ICON: Record<string, IconName> = {
  wind: 'wind',
  sun: 'sun',
  humidity: 'droplet',
  rain: 'rain',
  activity: 'refresh',
  garment: 'shirt',
};

export function ExplanationChips({ explanation }: { explanation: Explanation }) {
  const unit = useSettings((s) => s.tempUnit);
  if (explanation.top.length === 0) {
    return (
      <p className="chips-empty" data-testid="explanation">
        Conditions are close to the reference day: nothing stands out.
      </p>
    );
  }
  return (
    <ul className="chips" aria-label="Why you feel this way" data-testid="explanation">
      {explanation.top.map((f) => (
        <li
          key={f.kind === 'garment' ? `g-${f.garment}` : f.kind}
          className={f.delta > 0 ? 'warmer' : 'colder'}
        >
          <Icon name={KIND_ICON[f.kind] ?? 'check'} size={16} />
          <span>{factorText(f, unit)}</span>
          <span className="visually-hidden">{f.delta > 0 ? '(warmer)' : '(colder)'}</span>
        </li>
      ))}
    </ul>
  );
}
