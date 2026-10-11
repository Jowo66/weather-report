import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useOutfit } from '../../state/outfitStore';
import { useWeather } from '../../state/weatherStore';
import { buildShare, parseShare } from './shareUrl';

/**
 * Two-way sync between the hash query string and the stores (shareable URL).
 * Any URL we didn't write ourselves (first load, a pasted link, back/forward) is applied.
 */
export function useUrlSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const written = useRef<string | null>(null);
  const place = useWeather((s) => s.place);
  const setPlace = useWeather((s) => s.setPlace);
  const worn = useOutfit((s) => s.worn);
  const activity = useOutfit((s) => s.activity);

  // Apply external URL changes.
  useEffect(() => {
    if (location.search === written.current) return;
    const s = parseShare(location.search);
    if (s.outfit) useOutfit.getState().setWorn(s.outfit);
    if (s.activity) useOutfit.getState().setActivity(s.activity);
    const current = useWeather.getState().place;
    if (s.place) {
      const same =
        current &&
        current.latitude.toFixed(2) === s.place.latitude.toFixed(2) &&
        current.longitude.toFixed(2) === s.place.longitude.toFixed(2);
      if (!same || written.current === null) setPlace(same ? current : s.place);
    } else if (current && written.current === null) {
      setPlace(current); // revalidate the persisted place on first load
    }
    written.current = location.search;
  }, [location.search, setPlace]);

  // Reflect state back into the URL.
  useEffect(() => {
    if (written.current === null) return;
    const search = buildShare({ place, outfit: worn, activity });
    if (search !== location.search) {
      written.current = search;
      navigate({ search }, { replace: true });
    }
  }, [place, worn, activity, location.search, navigate]);
}
