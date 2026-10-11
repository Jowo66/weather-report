import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useOutfit } from '../../state/outfitStore';
import { useWeather } from '../../state/weatherStore';
import { buildShare, parseShare } from './shareUrl';

/** Two-way sync between the hash query string and the stores (shareable URL). */
export function useUrlSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const applied = useRef(false);
  const place = useWeather((s) => s.place);
  const setPlace = useWeather((s) => s.setPlace);
  const worn = useOutfit((s) => s.worn);
  const activity = useOutfit((s) => s.activity);

  // Apply the URL once on load.
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    const s = parseShare(location.search);
    if (s.outfit) useOutfit.getState().setWorn(s.outfit);
    if (s.activity) useOutfit.getState().setActivity(s.activity);
    const current = useWeather.getState().place;
    if (s.place) {
      const same =
        current &&
        current.latitude.toFixed(2) === s.place.latitude.toFixed(2) &&
        current.longitude.toFixed(2) === s.place.longitude.toFixed(2);
      setPlace(same ? current : s.place);
    } else if (current) {
      setPlace(current);
    }
  }, [location.search, setPlace]);

  // Reflect state back into the URL.
  useEffect(() => {
    if (!applied.current) return;
    const search = buildShare({ place, outfit: worn, activity });
    if (search !== location.search) navigate({ search }, { replace: true });
  }, [place, worn, activity, location.search, navigate]);
}
