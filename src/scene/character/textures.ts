import { NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { loadCharacter, textureUrl, type Sex } from './data';

export interface CharacterTextures {
  /** Skin detail (albedo ÷ mean, ×0.5); alpha 0 marks the baked underwear. */
  detail: Texture;
  normal: Texture;
  eye: Texture;
  /** Hair detail atlas (hair1 | hair2). */
  hair: Texture;
}

/**
 * Textures are shared by every avatar canvas and kept for the session (a few hundred KB), so they
 * are never disposed with a scene.
 */
const cache = new Map<string, Promise<Texture>>();
const ready = new Map<Sex, CharacterTextures>();

function load(name: string, color: boolean): Promise<Texture> {
  let p = cache.get(name);
  if (!p) {
    p = new TextureLoader().loadAsync(textureUrl(name)).then((t) => {
      t.flipY = false; // glTF UV convention
      t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p;
}

export async function loadCharacterTextures(sex: Sex): Promise<CharacterTextures> {
  const { manifest } = await loadCharacter(sex);
  const b = manifest.bodies[sex];
  const [detail, normal, eye, hair] = await Promise.all([
    load(b.textures.detail, true),
    load(b.textures.normal, false),
    load(manifest.eyeTexture, true),
    load(manifest.hairTexture, true),
  ]);
  const t = { detail, normal, eye, hair };
  ready.set(sex, t);
  return t;
}

export const characterTextures = (sex: Sex): CharacterTextures | null => ready.get(sex) ?? null;
