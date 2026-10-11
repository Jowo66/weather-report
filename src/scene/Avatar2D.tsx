import { memo } from 'react';
import { GARMENT_BY_ID } from '../data/garments';
import type { ComfortState, GarmentId, ZoneId, ZoneState } from '../engine';

export type Pose2D =
  'relaxed' | 'pockets' | 'crossed' | 'hug' | 'hunched' | 'fan' | 'slumped' | 'sit';

export function poseForState(state: ComfortState): Pose2D {
  switch (state) {
    case 'cool':
      return 'pockets';
    case 'chilly':
      return 'crossed';
    case 'cold':
    case 'very_cold':
      return 'hug';
    case 'freezing':
      return 'hunched';
    case 'hot':
      return 'fan';
    case 'overheated':
      return 'slumped';
    case 'dangerous_heat':
      return 'sit';
    default:
      return 'relaxed';
  }
}

/** Arm rotation (deg, + = toward body centre) for upper arm and forearm, per pose. */
const ARM: Record<Pose2D, { l: [number, number]; r: [number, number] }> = {
  relaxed: { l: [4, 0], r: [4, 0] },
  pockets: { l: [-6, 18], r: [-6, 18] },
  crossed: { l: [18, 95], r: [18, 95] },
  hug: { l: [28, 110], r: [28, 110] },
  hunched: { l: [34, 120], r: [34, 120] },
  fan: { l: [4, 0], r: [-30, -125] },
  slumped: { l: [0, 0], r: [0, 0] },
  sit: { l: [10, 20], r: [10, 20] },
};

const ZONE_TINT: Partial<Record<ZoneState, string>> = {
  hot: '#e4572e',
  warm: '#f3a712',
  cool: '#7fb7e6',
  cold: '#3c7fc4',
  freezing: '#1d3f8f',
  numb: '#ffffff',
};

export interface Avatar2DProps {
  worn: readonly GarmentId[];
  zones?: Partial<Record<ZoneId, ZoneState>>;
  state?: ComfortState;
  skin?: string;
  hair?: string;
  wet?: boolean;
  label: string;
  /** Show tint overlays for zone states. */
  showZoneTints?: boolean;
}

const has = (worn: readonly GarmentId[], id: GarmentId) => worn.includes(id);
const tint = (id: GarmentId) => GARMENT_BY_ID[id].tint.default;

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)} ${c((n >> 8) & 255)} ${c(n & 255)})`;
}

/** Sleeve length per torso garment: 0 none, 1 short, 2 full. */
const SLEEVE: Partial<Record<GarmentId, 1 | 2>> = {
  t_shirt: 1,
  long_sleeve: 2,
  thermal_top: 2,
  hoodie: 2,
  sweater: 2,
  light_jacket: 2,
  rain_shell: 2,
  winter_coat: 2,
};
const TORSO_ORDER: GarmentId[] = [
  'thermal_top',
  'tank_top',
  't_shirt',
  'long_sleeve',
  'sweater',
  'hoodie',
  'light_jacket',
  'winter_coat',
  'rain_shell',
];
const LEG_ORDER: GarmentId[] = ['thermal_bottoms', 'shorts', 'jeans', 'snow_pants'];

function Arm({
  side,
  angles,
  worn,
  skin,
  zoneTint,
}: {
  side: 'l' | 'r';
  angles: [number, number];
  worn: readonly GarmentId[];
  skin: string;
  zoneTint: { arms?: string; hands?: string };
}) {
  const s = side === 'l' ? 1 : -1;
  const sx = side === 'l' ? 64 : 136;
  const sy = 100;
  const [upper, fore] = angles;
  const sleeves = TORSO_ORDER.filter((g) => has(worn, g) && SLEEVE[g]);
  return (
    <g transform={`rotate(${-s * upper} ${sx} ${sy})`}>
      {/* upper arm */}
      <rect x={sx - 9} y={sy - 4} width={18} height={56} rx={9} fill={skin} />
      {sleeves.map((g) => (
        <rect
          key={`u-${g}`}
          x={sx - 10.5}
          y={sy - 6}
          width={21}
          height={SLEEVE[g] === 1 ? 30 : 58}
          rx={10}
          fill={tint(g)}
          stroke={shade(tint(g), 0.75)}
          strokeWidth={1}
        />
      ))}
      {zoneTint.arms && (
        <rect
          x={sx - 10}
          y={sy - 4}
          width={20}
          height={56}
          rx={10}
          fill={zoneTint.arms}
          opacity={0.35}
        />
      )}
      <g transform={`rotate(${-s * fore} ${sx} ${sy + 50})`}>
        <rect x={sx - 8} y={sy + 46} width={16} height={52} rx={8} fill={skin} />
        {sleeves
          .filter((g) => SLEEVE[g] === 2)
          .map((g) => (
            <rect
              key={`f-${g}`}
              x={sx - 9.5}
              y={sy + 44}
              width={19}
              height={50}
              rx={9}
              fill={tint(g)}
              stroke={shade(tint(g), 0.75)}
              strokeWidth={1}
            />
          ))}
        {zoneTint.arms && (
          <rect
            x={sx - 9}
            y={sy + 46}
            width={18}
            height={50}
            rx={9}
            fill={zoneTint.arms}
            opacity={0.35}
          />
        )}
        <circle cx={sx} cy={sy + 104} r={10} fill={has(worn, 'gloves') ? tint('gloves') : skin} />
        {zoneTint.hands && (
          <circle cx={sx} cy={sy + 104} r={11} fill={zoneTint.hands} opacity={0.45} />
        )}
      </g>
    </g>
  );
}

function Avatar2DImpl({
  worn,
  zones = {},
  state = 'comfortable',
  skin = '#c68e64',
  hair = '#3b2a20',
  wet = false,
  label,
  showZoneTints = true,
}: Avatar2DProps) {
  const pose = poseForState(state);
  const arm = ARM[pose];
  const zt = (z: ZoneId) => {
    const st = zones[z];
    return showZoneTints && st ? ZONE_TINT[st] : undefined;
  };
  const sit = pose === 'sit';
  const hunch = pose === 'hunched' || pose === 'slumped';
  const torsoItems = TORSO_ORDER.filter((g) => has(worn, g));
  const legItems = LEG_ORDER.filter((g) => has(worn, g));
  const coat = has(worn, 'winter_coat');
  const fabricFilter = wet ? 'url(#wr-wet)' : undefined;

  const legLen = sit ? 0 : 1;
  return (
    <svg viewBox="0 0 200 420" className={`avatar2d pose-${pose}`} role="img" aria-label={label}>
      <defs>
        <filter id="wr-wet">
          <feColorMatrix
            type="matrix"
            values="0.75 0 0 0 0  0 0.75 0 0 0  0 0 0.8 0 0  0 0 0 1 0"
          />
        </filter>
      </defs>
      {/* ground shadow */}
      <ellipse cx={100} cy={404} rx={58} ry={8} fill="currentColor" opacity={0.12} />
      <g transform={`translate(0 ${sit ? 70 : hunch ? 6 : 0})`}>
        {/* hood behind head */}
        {has(worn, 'hoodie') && !has(worn, 'rain_shell') && (
          <path d="M66 70 Q100 28 134 70 L128 98 L72 98 Z" fill={shade(tint('hoodie'), 0.85)} />
        )}
        {/* legs */}
        <g filter={fabricFilter}>
          {sit ? (
            <>
              <rect x={70} y={196} width={60} height={28} rx={12} fill={skin} />
              <rect x={72} y={220} width={22} height={60} rx={10} fill={skin} />
              <rect x={106} y={220} width={22} height={60} rx={10} fill={skin} />
            </>
          ) : (
            <>
              <rect x={74} y={196} width={24} height={160 * legLen} rx={11} fill={skin} />
              <rect x={102} y={196} width={24} height={160 * legLen} rx={11} fill={skin} />
            </>
          )}
          {!sit &&
            legItems.map((g) => {
              const h = g === 'shorts' ? 62 : g === 'thermal_bottoms' ? 154 : 150;
              const wide = g === 'snow_pants' ? 3 : 1.5;
              return (
                <g key={g} fill={tint(g)} stroke={shade(tint(g), 0.75)} strokeWidth={1}>
                  <rect x={72 - wide} y={192} width={56 + 2 * wide} height={30} rx={8} />
                  <rect x={72 - wide} y={196} width={27 + wide} height={h} rx={10} />
                  <rect x={101} y={196} width={27 + wide} height={h} rx={10} />
                </g>
              );
            })}
          {!sit && zt('legs') && (
            <g fill={zt('legs')} opacity={0.35}>
              <rect x={73} y={196} width={26} height={156} rx={11} />
              <rect x={101} y={196} width={26} height={156} rx={11} />
            </g>
          )}
          {/* feet */}
          {!sit && (
            <g>
              {[86, 114].map((cx) => (
                <g key={cx}>
                  {(has(worn, 'socks') || has(worn, 'wool_socks')) && (
                    <rect
                      x={cx - 11}
                      y={344}
                      width={22}
                      height={18}
                      rx={6}
                      fill={tint(has(worn, 'wool_socks') ? 'wool_socks' : 'socks')}
                    />
                  )}
                  {has(worn, 'winter_boots') ? (
                    <path
                      d={`M${cx - 13} 336 h26 v22 q8 2 8 10 v6 h-42 z`}
                      fill={tint('winter_boots')}
                    />
                  ) : has(worn, 'sneakers') ? (
                    <path
                      d={`M${cx - 12} 352 h22 q12 2 12 10 v4 h-34 z`}
                      fill={tint('sneakers')}
                      stroke="#9aa0a6"
                      strokeWidth={1}
                    />
                  ) : (
                    <ellipse cx={cx + 2} cy={364} rx={14} ry={7} fill={skin} />
                  )}
                  {zt('feet') && (
                    <ellipse cx={cx + 2} cy={362} rx={16} ry={9} fill={zt('feet')} opacity={0.4} />
                  )}
                </g>
              ))}
            </g>
          )}
        </g>

        {/* torso */}
        <g transform={hunch ? 'rotate(4 100 200)' : undefined} filter={fabricFilter}>
          <path d="M66 96 Q100 86 134 96 L130 200 L70 200 Z" fill={skin} />
          {torsoItems.map((g) => {
            const long =
              g === 'winter_coat' ? 64 : g === 'rain_shell' ? 40 : g === 'light_jacket' ? 14 : 0;
            const d =
              g === 'tank_top'
                ? 'M76 98 L86 96 Q100 110 114 96 L124 98 L128 204 L72 204 Z'
                : `M63 94 Q100 84 137 94 L${133 + long / 8} ${204 + long} L${67 - long / 8} ${204 + long} Z`;
            return (
              <path key={g} d={d} fill={tint(g)} stroke={shade(tint(g), 0.7)} strokeWidth={1.2} />
            );
          })}
          {(has(worn, 'light_jacket') || coat || has(worn, 'rain_shell')) && (
            <line
              x1={100}
              y1={92}
              x2={100}
              y2={coat ? 266 : 214}
              stroke="rgb(0 0 0 / 35%)"
              strokeWidth={1.5}
            />
          )}
          {zt('torso') && (
            <path d="M66 96 Q100 86 134 96 L130 200 L70 200 Z" fill={zt('torso')} opacity={0.3} />
          )}
        </g>

        {/* neck + head */}
        <rect x={91} y={76} width={18} height={20} rx={6} fill={skin} />
        <g transform={hunch ? 'translate(0 8)' : undefined}>
          <circle cx={100} cy={52} r={29} fill={skin} />
          {/* hair */}
          {!has(worn, 'toque') && !has(worn, 'rain_shell') && (
            <path
              d="M71 50 Q72 20 100 20 Q130 20 129 50 Q120 34 100 34 Q82 34 71 50 Z"
              fill={hair}
            />
          )}
          {/* face */}
          <g fill="#2a2a2a">
            <circle cx={90} cy={52} r={2.6} />
            <circle cx={110} cy={52} r={2.6} />
          </g>
          <path
            d={
              state === 'comfortable' || state === 'warm' || state === 'cool'
                ? 'M90 64 Q100 71 110 64'
                : state === 'dangerous_heat' || state === 'overheated' || state === 'freezing'
                  ? 'M92 67 Q100 62 108 67'
                  : 'M92 66 L108 66'
            }
            stroke="#2a2a2a"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
          {has(worn, 'toque') && (
            <g>
              <path d="M70 46 Q72 16 100 16 Q128 16 130 46 Z" fill={tint('toque')} />
              <rect x={68} y={40} width={64} height={10} rx={4} fill={shade(tint('toque'), 0.8)} />
              <circle cx={100} cy={14} r={6} fill={shade(tint('toque'), 1.2)} />
            </g>
          )}
          {has(worn, 'rain_shell') && (
            <path
              d="M68 58 Q66 18 100 18 Q134 18 132 58 L126 58 Q126 30 100 30 Q74 30 74 58 Z"
              fill={tint('rain_shell')}
              stroke={shade(tint('rain_shell'), 0.75)}
            />
          )}
          {zt('head') && <circle cx={100} cy={52} r={30} fill={zt('head')} opacity={0.3} />}
        </g>
        {has(worn, 'scarf') && (
          <g fill={tint('scarf')}>
            <rect x={82} y={78} width={36} height={16} rx={7} />
            <rect x={104} y={88} width={12} height={34} rx={5} />
          </g>
        )}

        {/* arms on top so crossed poses read in front of the body */}
        <g filter={fabricFilter}>
          <Arm
            side="l"
            angles={arm.l}
            worn={worn}
            skin={skin}
            zoneTint={{ arms: zt('arms'), hands: zt('hands') }}
          />
          <Arm
            side="r"
            angles={arm.r}
            worn={worn}
            skin={skin}
            zoneTint={{ arms: zt('arms'), hands: zt('hands') }}
          />
        </g>
      </g>
      {sit && (
        <rect x={50} y={346} width={100} height={14} rx={4} fill="currentColor" opacity={0.25} />
      )}
    </svg>
  );
}

export const Avatar2D = memo(Avatar2DImpl);
