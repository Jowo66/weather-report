import { useSyncExternalStore } from 'react';
import { useSettings } from '../../state/settingsStore';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null;
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}
const systemPref = () =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false;

/** prefers-reduced-motion is the default; the in-app setting overrides it (TDD §11). */
export function useReducedMotion(): boolean {
  const system = useSyncExternalStore(subscribe, systemPref, () => false);
  const motion = useSettings((s) => s.motion);
  return motion === 'reduce' ? true : motion === 'full' ? false : system;
}
