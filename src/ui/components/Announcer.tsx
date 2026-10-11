import { useEffect, useState } from 'react';
import { useOutfit, type OutfitState } from '../../state/outfitStore';
import { GARMENT_LABEL } from '../lib/comfortCopy';

export function changeMessage(change: OutfitState['lastChange']): string | null {
  if (!change) return null;
  if (change.added && change.replaced.length) {
    return `Replaced ${change.replaced.map((g) => GARMENT_LABEL[g]).join(' and ')} with ${GARMENT_LABEL[change.added]}.`;
  }
  if (change.added) return `Put on ${GARMENT_LABEL[change.added]}.`;
  if (change.removed) return `Took off ${GARMENT_LABEL[change.removed]}.`;
  return null;
}

/** Toast + polite announcement for wardrobe changes ("Replaced T-shirt with Thermal top."). */
export function OutfitAnnouncer() {
  const change = useOutfit((s) => s.lastChange);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  useEffect(() => {
    if (!change) return;
    const t = setTimeout(() => setDismissedAt(change.at), 3500);
    return () => clearTimeout(t);
  }, [change]);
  const msg = change && change.at !== dismissedAt ? changeMessage(change) : null;
  return (
    <div className="toast-region" aria-live="polite" role="status">
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
