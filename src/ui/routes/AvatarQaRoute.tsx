import { useLocation } from 'react-router';
import {
  ZONE_IDS,
  isGarmentId,
  type ComfortResult,
  type ComfortState,
  type GarmentId,
  type ZoneId,
  type ZoneResult,
  type ZoneState,
} from '../../engine';
import { presetMelanin } from '../../scene/skinTone';
import { useAvatar } from '../../state/avatarStore';
import { useOutfit } from '../../state/outfitStore';
import { AvatarPanel } from '../components/AvatarPanel';
import { useEffect } from 'react';

const STATE_SETUP: Record<
  ComfortState,
  { perceived: number; zone: ZoneState; hands?: ZoneState; outfit: GarmentId[] }
> = {
  freezing: {
    perceived: -15,
    zone: 'freezing',
    hands: 'numb',
    outfit: ['t_shirt', 'jeans', 'socks', 'sneakers'],
  },
  very_cold: {
    perceived: -5,
    zone: 'cold',
    hands: 'freezing',
    outfit: ['long_sleeve', 'jeans', 'socks', 'sneakers'],
  },
  cold: {
    perceived: 4,
    zone: 'cool',
    hands: 'cold',
    outfit: ['t_shirt', 'hoodie', 'jeans', 'socks', 'sneakers'],
  },
  chilly: { perceived: 11, zone: 'cool', outfit: ['long_sleeve', 'jeans', 'socks', 'sneakers'] },
  cool: { perceived: 17, zone: 'ok', outfit: ['t_shirt', 'jeans', 'socks', 'sneakers'] },
  comfortable: { perceived: 23, zone: 'ok', outfit: ['t_shirt', 'jeans', 'socks', 'sneakers'] },
  warm: { perceived: 27, zone: 'warm', outfit: ['t_shirt', 'shorts', 'socks', 'sneakers'] },
  hot: { perceived: 31, zone: 'warm', outfit: ['tank_top', 'shorts', 'socks', 'sneakers'] },
  overheated: { perceived: 37, zone: 'hot', outfit: ['tank_top', 'shorts', 'socks', 'sneakers'] },
  dangerous_heat: {
    perceived: 42,
    zone: 'hot',
    outfit: ['tank_top', 'shorts', 'socks', 'sneakers'],
  },
};

/** Synthetic comfort result for visual QA (TDD §8.4 matrix). */
export function qaResult(state: ComfortState): ComfortResult {
  const s = STATE_SETUP[state];
  const zones = Object.fromEntries(
    ZONE_IDS.map((z): [ZoneId, ZoneResult] => [
      z,
      {
        clo: 0.2,
        wetness: 0,
        tFelt: s.perceived,
        state: z === 'hands' && s.hands ? s.hands : s.zone,
        exposed: false,
        frostbite: null,
      },
    ]),
  ) as Record<ZoneId, ZoneResult>;
  return {
    perceived: s.perceived,
    state,
    index: 0,
    loadWm2: 0,
    requiredWettedness: 0,
    cloTotal: 0,
    cloEffective: 0,
    vRel: 0.5,
    tMrt: s.perceived,
    wetArea: 0,
    humidex: s.perceived,
    windChill: s.perceived,
    zones,
    flags: state === 'dangerous_heat' ? ['heat_danger'] : [],
  };
}

/** Dev/QA route: #/dev/avatar-qa?state=hot&skin=7&o=tank_top,shorts&mode=3d */
export function AvatarQaRoute() {
  const q = new URLSearchParams(useLocation().search);
  const state = (q.get('state') ?? 'comfortable') as ComfortState;
  const skin = Number(q.get('skin') ?? 4);
  const outfitParam = q.get('o');
  const setAppearance = useAvatar((s) => s.setAppearance);
  useEffect(() => {
    setAppearance({ melanin: presetMelanin(Math.max(0, Math.min(9, skin))) });
  }, [skin, setAppearance]);
  const setup = STATE_SETUP[state] ?? STATE_SETUP.comfortable;
  const outfit = outfitParam
    ? outfitParam.split(',').filter((x): x is GarmentId => isGarmentId(x))
    : setup.outfit;
  useEffect(() => {
    // The panel reads the outfit store; mirror the QA outfit into it.
    useOutfit.getState().setWorn(outfit);
  }, [outfit.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="qa" data-testid="qa">
      <AvatarPanel result={qaResult(state)} forceMode={q.get('mode') === '2d' ? '2d' : '3d'} />
    </div>
  );
}
