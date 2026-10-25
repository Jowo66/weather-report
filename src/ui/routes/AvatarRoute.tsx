import { useMemo } from 'react';
import { evaluate } from '../../engine';
import { MONK_SCALE, presetMelanin } from '../../scene/skinTone';
import { toEngineWeather } from '../../services/types';
import {
  useAvatar,
  type AgeLook,
  type BuildPreset,
  type FacialHair,
  type HairStyle,
  type Sex,
} from '../../state/avatarStore';
import { useComfortContext } from '../../state/selectors';
import { useOutfit } from '../../state/outfitStore';
import { useSettings, type AvatarMode, type MotionPref } from '../../state/settingsStore';
import type { BackdropPref } from '../../data/backdrops';
import { useWeather } from '../../state/weatherStore';
import { AvatarPanel } from '../components/AvatarPanel';
import { formatDelta } from '../lib/format';
import { qaResult } from './AvatarQaRoute';

const BUILDS: { id: BuildPreset; label: string }[] = [
  { id: 'slim', label: 'Slim' },
  { id: 'average', label: 'Average' },
  { id: 'muscular', label: 'Muscular' },
  { id: 'heavy', label: 'Heavyset' },
];
const AGES: { id: AgeLook; label: string }[] = [
  { id: 'young_adult', label: 'Young adult' },
  { id: 'adult', label: 'Adult' },
  { id: 'senior', label: 'Senior' },
];
const SEXES: { id: Sex; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];
const HAIR: { id: HairStyle; label: string }[] = [
  { id: 'side_part', label: 'Side part' },
  { id: 'buzzed', label: 'Buzzed' },
  { id: 'cropped', label: 'Cropped' },
  { id: 'long', label: 'Long' },
  { id: 'buns', label: 'Buns' },
  { id: 'bald', label: 'Bald' },
];
const FACIAL_HAIR: { id: FacialHair; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'moustache', label: 'Moustache' },
  { id: 'goatee', label: 'Goatee' },
  { id: 'beard', label: 'Full beard' },
];
const HAIR_COLORS = [
  '#1c1410',
  '#3b2a20',
  '#6b4423',
  '#a0703c',
  '#d8b26e',
  '#b5452d',
  '#8d8d8d',
  '#e8e4dc',
];

function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="segmented">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className={value === o.id ? 'on' : undefined}>
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function AvatarRoute() {
  const a = useAvatar();
  const settings = useSettings();
  const sample = useWeather((s) => s.forecast?.current ?? null);
  const worn = useOutfit((s) => s.worn);
  const ctx = useComfortContext();
  const result = useMemo(
    () => (sample ? evaluate(toEngineWeather(sample), worn, ctx) : qaResult('comfortable')),
    [sample, worn, ctx],
  );
  const buildPreset = (Object.entries(a.build).find(([, v]) => v === 1)?.[0] ??
    null) as BuildPreset | null;
  const presetIndex = MONK_SCALE.findIndex((_, i) => Math.abs(presetMelanin(i) - a.melanin) < 0.01);

  return (
    <div className="creator">
      <h2>Your avatar</h2>
      <div className="creator-grid">
        <div className="creator-preview card">
          <AvatarPanel result={result} sample={sample} />
        </div>
        <div className="creator-controls">
          <section className="card">
            <h3 className="card-title">Comfort</h3>
            <label className="offset">
              <span>
                I run{' '}
                <strong>
                  {a.personalOffset === 0
                    ? 'average'
                    : a.personalOffset < 0
                      ? `cold (${formatDelta(a.personalOffset, settings.tempUnit)})`
                      : `hot (+${formatDelta(a.personalOffset, settings.tempUnit)})`}
                </strong>
              </span>
              <input
                type="range"
                min={-3}
                max={3}
                step={0.5}
                value={a.personalOffset}
                onChange={(e) => a.setPersonalOffset(Number(e.target.value))}
                aria-valuetext={
                  a.personalOffset === 0
                    ? 'average'
                    : `${a.personalOffset > 0 ? 'hot' : 'cold'} by ${Math.abs(a.personalOffset)} degrees`
                }
              />
            </label>
            <p className="muted small">
              This is the only setting that changes the numbers. Everything below changes how the
              avatar looks, never how warm it feels: real differences between people are bigger than
              differences between body types.
            </p>
          </section>

          <section className="card creator-section">
            <h3 className="card-title">Body</h3>
            <Segmented
              legend="Body"
              name="sex"
              options={SEXES}
              value={a.sex}
              onChange={(v) => a.setAppearance({ sex: v })}
            />
            <Segmented
              legend="Build"
              name="build"
              options={BUILDS}
              value={buildPreset}
              onChange={(b) => a.setBuildPreset(b)}
            />
            <label className="slider">
              <span>Height</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={a.height}
                onChange={(e) => a.setAppearance({ height: Number(e.target.value) })}
                aria-valuetext={a.height < -0.33 ? 'short' : a.height > 0.33 ? 'tall' : 'average'}
              />
              <span className="slider-scale muted" aria-hidden>
                <span>Short</span>
                <span>Tall</span>
              </span>
            </label>
            <Segmented
              legend="Age look"
              name="age"
              options={AGES}
              value={a.ageLook}
              onChange={(v) => a.setAppearance({ ageLook: v })}
            />
          </section>

          <section className="card creator-section">
            <h3 className="card-title">Skin</h3>
            <fieldset className="swatches">
              <legend>Skin tone presets (Monk Skin Tone scale)</legend>
              {MONK_SCALE.map((hex, i) => (
                <label
                  key={hex}
                  className={presetIndex === i ? 'on' : undefined}
                  title={`Tone ${i + 1}`}
                >
                  <input
                    type="radio"
                    name="skin"
                    checked={presetIndex === i}
                    onChange={() => a.setAppearance({ melanin: presetMelanin(i) })}
                  />
                  <span className="swatch-lg" style={{ background: hex }} aria-hidden />
                  <span className="visually-hidden">Tone {i + 1}</span>
                </label>
              ))}
            </fieldset>
            <label className="slider">
              <span>Fine tune</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={a.melanin}
                onChange={(e) => a.setAppearance({ melanin: Number(e.target.value) })}
              />
            </label>
            <Segmented
              legend="Undertone"
              name="undertone"
              options={[
                { id: 'cool', label: 'Cool' },
                { id: 'neutral', label: 'Neutral' },
                { id: 'warm', label: 'Warm' },
              ]}
              value={a.undertone}
              onChange={(v) => a.setAppearance({ undertone: v })}
            />
          </section>

          <section className="card creator-section">
            <h3 className="card-title">Hair</h3>
            <Segmented
              legend="Style"
              name="hair"
              options={HAIR}
              value={a.hairStyle}
              onChange={(v) => a.setAppearance({ hairStyle: v })}
            />
            <fieldset className="swatches">
              <legend>Colour</legend>
              {HAIR_COLORS.map((hex) => (
                <label key={hex} className={a.hairColor === hex ? 'on' : undefined}>
                  <input
                    type="radio"
                    name="hairColor"
                    checked={a.hairColor === hex}
                    onChange={() => a.setAppearance({ hairColor: hex })}
                  />
                  <span className="swatch-lg" style={{ background: hex }} aria-hidden />
                  <span className="visually-hidden">Hair colour {hex}</span>
                </label>
              ))}
            </fieldset>
            <Segmented
              legend="Facial hair"
              name="facialHair"
              options={FACIAL_HAIR}
              value={a.facialHair}
              onChange={(v) => a.setAppearance({ facialHair: v })}
            />
          </section>

          <section className="card creator-section">
            <h3 className="card-title">Display</h3>
            <Segmented<MotionPref>
              legend="Motion"
              name="motion"
              options={[
                { id: 'system', label: 'Follow system' },
                { id: 'reduce', label: 'Reduce' },
                { id: 'full', label: 'Full' },
              ]}
              value={settings.motion}
              onChange={settings.setMotion}
            />
            <Segmented<AvatarMode>
              legend="Avatar"
              name="avatarMode"
              options={[
                { id: 'auto', label: '3D when available' },
                { id: '2d', label: 'Always 2D' },
              ]}
              value={settings.avatarMode}
              onChange={settings.setAvatarMode}
            />
            <Segmented<BackdropPref>
              legend="Backdrop"
              name="backdrop"
              options={[
                { id: 'auto', label: 'Match the weather' },
                { id: 'city', label: 'City' },
                { id: 'arctic', label: 'Arctic' },
                { id: 'beach', label: 'Beach' },
              ]}
              value={settings.backdrop}
              onChange={settings.setBackdrop}
            />
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={settings.highContrast}
                onChange={(e) => settings.setHighContrast(e.target.checked)}
              />
              <span>High contrast</span>
            </label>
            <p>
              <button type="button" className="btn btn-small" onClick={a.reset}>
                Reset appearance
              </button>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
