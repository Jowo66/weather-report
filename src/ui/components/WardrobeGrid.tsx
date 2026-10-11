import { useRef, useState } from 'react';
import { GARMENT_DEFS, SLOT_LABEL, SLOT_ORDER } from '../../data/garments';
import type { GarmentId } from '../../engine';
import { useOutfit } from '../../state/outfitStore';
import { GARMENT_LABEL } from '../lib/comfortCopy';

const ORDERED: GarmentId[] = [...GARMENT_DEFS]
  .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.layer - b.layer)
  .map((g) => g.id);

const COLS = 2;

/** Roving-tabindex grid of toggle buttons (TDD §11). Arrow keys move, Space/Enter toggles. */
export function WardrobeGrid() {
  const worn = useOutfit((s) => s.worn);
  const toggle = useOutfit((s) => s.toggle);
  const [focus, setFocus] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(next: number) {
    const i = Math.max(0, Math.min(ORDERED.length - 1, next));
    setFocus(i);
    refs.current[i]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const map: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + COLS,
      ArrowUp: i - COLS,
      Home: 0,
      End: ORDERED.length - 1,
    };
    const next = map[e.key];
    if (next !== undefined) {
      e.preventDefault();
      move(next);
    }
  }

  return (
    <div className="wardrobe" role="group" aria-label="Wardrobe" data-testid="wardrobe">
      {ORDERED.map((id, i) => {
        const g = GARMENT_DEFS.find((x) => x.id === id)!;
        const on = worn.includes(id);
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className={`wardrobe-item${on ? ' on' : ''}`}
            aria-pressed={on}
            tabIndex={i === focus ? 0 : -1}
            onFocus={() => setFocus(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => toggle(id)}
          >
            <span className="swatch" style={{ background: g.tint.default }} aria-hidden />
            <span className="wardrobe-name">{GARMENT_LABEL[id]}</span>
            <span className="wardrobe-meta muted">
              {SLOT_LABEL[g.slot]} · {g.clo.toFixed(2)} clo
              {g.windproof ? ' · windproof' : ''}
              {g.waterproof ? ' · waterproof' : ''}
            </span>
            <span className="wardrobe-check" aria-hidden>
              {on ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
