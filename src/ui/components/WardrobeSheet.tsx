import { useEffect, useRef } from 'react';
import { WardrobeGrid } from './WardrobeGrid';

/** Modal sheet built on <dialog> (focus trap, Esc to close come from the platform). */
export function WardrobeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onCancel={onClose}
    >
      <div className="sheet-head">
        <h2 id="sheet-title">Wardrobe</h2>
        <button type="button" className="btn btn-small" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="muted sheet-hint">
        Tap to put on or take off. One item per slot: a new one swaps out the old.
      </p>
      {open && <WardrobeGrid />}
    </dialog>
  );
}
