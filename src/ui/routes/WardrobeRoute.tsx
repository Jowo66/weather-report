import { useComfort } from '../../state/selectors';
import { useSettings } from '../../state/settingsStore';
import { OutfitAnnouncer } from '../components/Announcer';
import { AvatarPanel } from '../components/AvatarPanel';
import { Icon, STATE_ICON } from '../components/Icon';
import { WardrobeGrid } from '../components/WardrobeGrid';
import { ZoneStrip } from '../components/ZoneStrip';
import { STATE_LABEL } from '../lib/comfortCopy';
import { formatTemp } from '../lib/format';

export function WardrobeRoute() {
  const view = useComfort();
  const unit = useSettings((s) => s.tempUnit);
  return (
    <div>
      <h2>Wardrobe</h2>
      {view ? (
        <div className={`wardrobe-live hero state-${view.result.state}`}>
          <div className="hero-avatar">
            <AvatarPanel result={view.result} />
          </div>
          <div>
            <p className="hero-lead">You&rsquo;ll feel</p>
            <p className="hero-temp" data-testid="perceived">
              {formatTemp(view.result.perceived, unit)}
            </p>
            <p className="state-pill">
              <Icon name={STATE_ICON[view.result.state]} />
              {STATE_LABEL[view.result.state]}
            </p>
          </div>
        </div>
      ) : (
        <p className="muted">Pick a city on the Now screen to see how each outfit feels.</p>
      )}
      <div className="card">
        <WardrobeGrid />
      </div>
      {view && <ZoneStrip result={view.result} />}
      <OutfitAnnouncer />
    </div>
  );
}
