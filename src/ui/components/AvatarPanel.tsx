import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { ZONE_IDS, type ComfortResult, type ZoneId, type ZoneState } from '../../engine';
import { chooseBackdrop } from '../../data/backdrops';
import { Avatar2D } from '../../scene/Avatar2D';
import { skinHex } from '../../scene/skinTone';
import type { WeatherSample } from '../../services/types';
import { useAvatar } from '../../state/avatarStore';
import { useOutfit } from '../../state/outfitStore';
import { useSettings } from '../../state/settingsStore';
import { STATE_LABEL, ZONE_LABEL, ZONE_STATE_LABEL } from '../lib/comfortCopy';
import { useReducedMotion } from '../lib/useReducedMotion';
import { canUse3D } from '../lib/webgl';
import { useShallow } from 'zustand/react/shallow';

const AvatarCanvas = lazy(() => import('../../scene/AvatarCanvas'));

export function avatarLabel(result: ComfortResult): string {
  const notable = ZONE_IDS.filter((z) => result.zones[z].state !== 'ok').map(
    (z) => `${ZONE_LABEL[z]} ${ZONE_STATE_LABEL[result.zones[z].state].toLowerCase()}`,
  );
  return `Avatar looking ${STATE_LABEL[result.state].toLowerCase()}.${notable.length ? ` ${notable.join(', ')}.` : ''}`;
}

class Fallback extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function AvatarPanel({
  result,
  sample,
  forceMode,
}: {
  result: ComfortResult;
  sample?: WeatherSample | null;
  forceMode?: '2d' | '3d';
}) {
  const worn = useOutfit((s) => s.worn);
  const { shade, umbrella } = useOutfit(
    useShallow((s) => ({ shade: s.shade, umbrella: s.umbrella })),
  );
  const appearance = useAvatar(
    useShallow((s) => ({
      frame: s.frame,
      build: s.build,
      height: s.height,
      ageLook: s.ageLook,
      melanin: s.melanin,
      undertone: s.undertone,
      hairStyle: s.hairStyle,
      hairColor: s.hairColor,
    })),
  );
  const avatarMode = useSettings((s) => s.avatarMode);
  const backdropPref = useSettings((s) => s.backdrop);
  const backdrop = chooseBackdrop(sample ?? null, backdropPref);
  const reducedMotion = useReducedMotion();
  const [use3D] = useState(() =>
    forceMode ? forceMode === '3d' : avatarMode !== '2d' && canUse3D(),
  );
  const zones = Object.fromEntries(ZONE_IDS.map((z) => [z, result.zones[z].state])) as Record<
    ZoneId,
    ZoneState
  >;
  const wetness = Object.fromEntries(ZONE_IDS.map((z) => [z, result.zones[z].wetness])) as Record<
    ZoneId,
    number
  >;
  const wet = ZONE_IDS.some((z) => wetness[z] > 0.3);
  const label = avatarLabel(result);
  const flat = (
    <Avatar2D
      worn={worn}
      zones={zones}
      state={result.state}
      wet={wet}
      label={label}
      skin={skinHex(appearance.melanin, appearance.undertone)}
      hair={appearance.hairColor}
    />
  );
  if (!use3D) {
    // key re-mounts on state change so the 200 ms cross-fade replays.
    return (
      <div key={result.state} className={reducedMotion ? 'avatar-fade' : undefined}>
        {flat}
      </div>
    );
  }
  return (
    <Fallback fallback={flat}>
      <Suspense fallback={flat}>
        <AvatarCanvas
          label={label}
          appearance={appearance}
          worn={worn}
          perceived={result.perceived}
          state={result.state}
          flags={result.flags}
          zones={zones}
          wetness={wetness}
          shade={shade}
          umbrella={umbrella}
          reducedMotion={reducedMotion}
          backdrop={backdrop}
          weather={
            sample
              ? {
                  tAir: sample.tAir,
                  windKmh: sample.windKmh,
                  gustKmh: sample.gustKmh,
                  precipMmH: sample.precipMmH,
                  snowfallCmH: sample.snowfallCmH,
                  snowDepthM: sample.snowDepthM,
                  isDay: sample.isDay,
                  sunAltDeg: sample.sunAltDeg,
                  sunAzDeg: sample.sunAzDeg,
                  ghi: sample.ghi,
                  cloudCover: sample.cloudCover,
                }
              : null
          }
        />
      </Suspense>
    </Fallback>
  );
}
