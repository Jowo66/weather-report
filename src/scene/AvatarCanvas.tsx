import { useEffect, useRef } from 'react';
import { AvatarScene, type AvatarSceneProps } from './AvatarScene';

export { preloadCharacter } from './AvatarScene';

export interface AvatarCanvasProps extends AvatarSceneProps {
  label: string;
  onStateChange?: (state: string) => void;
}

/** Lazily loaded 3D avatar (TDD §8.1). Owns one WebGL context; updates are pushed imperatively. */
export default function AvatarCanvas({ label, onStateChange, ...props }: AvatarCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<AvatarScene | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const mobile = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 600;
    const s = new AvatarScene(el, { mobile });
    scene.current = s;
    (window as unknown as { __wrAvatar?: AvatarScene }).__wrAvatar = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);

  // Rebuilding garments can take tens of ms; apply the latest props after the browser has painted
  // so the comfort number never waits on the 3D scene (TDD §14: toggle → number ≤ 50 ms).
  const latest = useRef(props);
  const pending = useRef(0);
  useEffect(() => {
    latest.current = props;
    if (pending.current) return;
    pending.current = requestAnimationFrame(() => {
      pending.current = window.setTimeout(() => {
        pending.current = 0;
        scene.current?.update(latest.current);
      }, 0);
    });
  });
  useEffect(
    () => () => {
      cancelAnimationFrame(pending.current);
      clearTimeout(pending.current);
    },
    [],
  );

  useEffect(() => {
    const el = host.current;
    if (!el || !onStateChange) return;
    const h = (e: Event) => onStateChange((e as CustomEvent<string>).detail);
    el.addEventListener('wr-anim-state', h);
    return () => el.removeEventListener('wr-anim-state', h);
  }, [onStateChange]);

  return (
    <div
      ref={host}
      className="avatar3d"
      role="img"
      aria-label={label}
      data-testid="avatar-3d"
      data-backdrop={props.backdrop}
    />
  );
}
