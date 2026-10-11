import { useOutfit } from '../../state/outfitStore';
import { GARMENT_BY_ID } from '../../data/garments';
import { GARMENT_LABEL } from '../lib/comfortCopy';

export function OutfitTray({ onOpenWardrobe }: { onOpenWardrobe: () => void }) {
  const worn = useOutfit((s) => s.worn);
  const toggle = useOutfit((s) => s.toggle);
  return (
    <section className="card" aria-labelledby="tray-title">
      <h2 id="tray-title" className="card-title">
        What you&rsquo;re wearing
      </h2>
      <ul className="tray" data-testid="outfit-tray">
        {worn.length === 0 && <li className="muted">Nothing. Brave.</li>}
        {worn.map((g) => (
          <li key={g}>
            <button
              type="button"
              className="tray-item"
              onClick={() => toggle(g)}
              aria-label={`Take off ${GARMENT_LABEL[g]}`}
            >
              <span
                className="swatch"
                style={{ background: GARMENT_BY_ID[g].tint.default }}
                aria-hidden
              />
              {GARMENT_LABEL[g]}
              <span aria-hidden className="tray-x">
                ×
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="btn btn-small"
            onClick={onOpenWardrobe}
            aria-haspopup="dialog"
          >
            + Add clothes
          </button>
        </li>
      </ul>
    </section>
  );
}
