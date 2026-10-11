import type { Flag } from '../../engine';
import { FLAG_COPY } from '../lib/comfortCopy';
import { Icon } from './Icon';

const ORDER: Flag[] = [
  'heat_danger',
  'frostbite_risk',
  'hypothermia_risk',
  'heat_strain',
  'suggest_rain_gear',
];

export function FlagCards({ flags }: { flags: Flag[] }) {
  const shown = ORDER.filter(
    (f) => flags.includes(f) && !(f === 'heat_strain' && flags.includes('heat_danger')),
  );
  if (shown.length === 0) return null;
  return (
    <div className="flags">
      {shown.map((f) => {
        const c = FLAG_COPY[f];
        return (
          <aside key={f} className={`flag flag-${c.severity}`} data-testid={`flag-${f}`}>
            <Icon name={c.severity === 'info' ? 'umbrella' : 'warning'} size={22} />
            <div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              {c.link && (
                <p>
                  <a href={c.link.href} target="_blank" rel="noopener noreferrer">
                    {c.link.label}
                  </a>
                </p>
              )}
            </div>
          </aside>
        );
      })}
    </div>
  );
}
