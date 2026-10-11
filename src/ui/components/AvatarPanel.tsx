import { Avatar2D } from '../../scene/Avatar2D';
import { ZONE_IDS, type ComfortResult, type ZoneId, type ZoneState } from '../../engine';
import { useOutfit } from '../../state/outfitStore';
import { STATE_LABEL, ZONE_LABEL, ZONE_STATE_LABEL } from '../lib/comfortCopy';

export function avatarLabel(result: ComfortResult): string {
  const notable = ZONE_IDS.filter((z) => result.zones[z].state !== 'ok').map(
    (z) => `${ZONE_LABEL[z]} ${ZONE_STATE_LABEL[result.zones[z].state].toLowerCase()}`,
  );
  return `Avatar looking ${STATE_LABEL[result.state].toLowerCase()}.${notable.length ? ` ${notable.join(', ')}.` : ''}`;
}

export function AvatarPanel({ result }: { result: ComfortResult }) {
  const worn = useOutfit((s) => s.worn);
  const zones = Object.fromEntries(ZONE_IDS.map((z) => [z, result.zones[z].state])) as Record<
    ZoneId,
    ZoneState
  >;
  const wet = ZONE_IDS.some((z) => result.zones[z].wetness > 0.3);
  return (
    <Avatar2D
      worn={worn}
      zones={zones}
      state={result.state}
      wet={wet}
      label={avatarLabel(result)}
    />
  );
}
