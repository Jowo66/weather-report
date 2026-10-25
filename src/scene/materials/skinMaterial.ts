import {
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type IUniform,
  type Texture,
} from 'three';
import { ZONE_IDS } from '../../engine';
import type { SkinResponse } from './skinResponse';

const HASH = /* glsl */ `
float wrHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`;

export interface SkinUniforms {
  uMelanin: IUniform<number>;
  uUnderwear: IUniform<Color>;
  uColdFlush: IUniform<number[]>;
  uPallor: IUniform<number[]>;
  uAsh: IUniform<number[]>;
  uHeatFlush: IUniform<number[]>;
  uSweat: IUniform<number[]>;
}

const six = () => [0, 0, 0, 0, 0, 0];

/**
 * Skin response shader (TDD §8.4): MeshPhysicalMaterial + onBeforeCompile with per-zone
 * uniforms indexed by the `zone` vertex attribute. The same reaction exists for every tone;
 * melanin only changes how visible it is (no fake red overlay on dark skin).
 *
 * `detail` is the character's albedo divided by its mean (×0.5, see tools/characters/build-ubc.py),
 * so `colour × 2 × detail` gives the chosen tone with the painted shading. Its alpha marks the baked
 * underwear (0), which is re-tinted. A `hide` vertex attribute discards skin under garments.
 */
export function createSkinMaterial(
  baseHex: string,
  maps: { detail: Texture; normal: Texture | null },
): {
  material: MeshPhysicalMaterial;
  uniforms: SkinUniforms;
} {
  const uniforms: SkinUniforms = {
    uMelanin: { value: 0.5 },
    uUnderwear: { value: new Color('#2b2d33') },
    uColdFlush: { value: six() },
    uPallor: { value: six() },
    uAsh: { value: six() },
    uHeatFlush: { value: six() },
    uSweat: { value: six() },
  };
  const material = new MeshPhysicalMaterial({
    color: new Color(baseHex).multiplyScalar(2),
    map: maps.detail,
    normalMap: maps.normal,
    roughness: 0.55,
    clearcoat: 0.001, // enables USE_CLEARCOAT; the shader sets the real value from sweat
    clearcoatRoughness: 0.25,
    sheen: 0.25,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float zone;\nattribute float hide;\nvarying float vZone;\nvarying float vHide;\nvarying vec3 vNoisePos;',
      )
      .replace(
        '#include <skinning_vertex>',
        '#include <skinning_vertex>\nvZone = zone;\nvHide = hide;\nvNoisePos = transformed;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vZone;
varying float vHide;
varying vec3 vNoisePos;
uniform float uMelanin;
uniform vec3 uUnderwear;
uniform float uColdFlush[6];
uniform float uPallor[6];
uniform float uAsh[6];
uniform float uHeatFlush[6];
uniform float uSweat[6];
${HASH}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vHide > 0.999) discard;
int zi = int(vZone + 0.5);
float skinA = sampledDiffuseColor.a;
vec3 sk = diffuseColor.rgb;
// Visible red flush fades quickly with melanin: deeper skin shows subtle darkening / purple, never red paint.
float mel = smoothstep(0.0, 0.62, uMelanin);
// Light skin: additive red/pink. Deep skin: multiplicative darkening with a slight purple cast.
sk += uColdFlush[zi] * (1.0 - mel) * vec3(0.34, -0.09, -0.07);
sk *= mix(vec3(1.0), vec3(0.88, 0.84, 0.96), uColdFlush[zi] * mel);
sk += uHeatFlush[zi] * (1.0 - mel) * vec3(0.26, -0.06, -0.06);
sk *= mix(vec3(1.0), vec3(0.97, 0.88, 0.84), uHeatFlush[zi] * mel);
float lum = dot(sk, vec3(0.299, 0.587, 0.114));
sk = mix(sk, vec3(lum) * 1.05, uPallor[zi] * (0.6 + 0.3 * uMelanin));
float ashN = smoothstep(0.55, 0.95, wrHash(floor(vNoisePos * 140.0)));
sk = mix(sk, sk + vec3(0.07), uAsh[zi] * (0.2 + 0.8 * uMelanin) * ashN);
sk = clamp(sk, 0.0, 1.0);
diffuseColor.rgb = mix(uUnderwear * sampledDiffuseColor.rgb * 2.0, sk, skinA);
diffuseColor.a = 1.0;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, uSweat[zi]);',
      )
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat = uSweat[zi] * 0.6;\n#endif',
      );
  };
  material.customProgramCacheKey = () => 'wr-skin-v2';
  return { material, uniforms };
}

export function applySkinResponse(u: SkinUniforms, r: SkinResponse, melanin: number) {
  u.uMelanin.value = melanin;
  ZONE_IDS.forEach((z, i) => {
    u.uColdFlush.value[i] = r[z].coldFlush;
    u.uPallor.value[i] = r[z].pallor;
    u.uAsh.value[i] = r[z].ash;
    u.uHeatFlush.value[i] = r[z].heatFlush;
    u.uSweat.value[i] = r[z].sweat;
  });
}

/**
 * Hair / brows with a frost overlay (TDD §8.4: white sparkle on brows, lashes, hair tips).
 * Colour comes from vertex colours × 2 × the hair detail atlas (same convention as the skin).
 */
export function createHairMaterial(detail: Texture | null): {
  material: MeshStandardMaterial;
  frost: IUniform<number>;
} {
  const frost: IUniform<number> = { value: 0 };
  const material = new MeshStandardMaterial({
    color: new Color(detail ? 2 : 1, detail ? 2 : 1, detail ? 2 : 1),
    map: detail,
    vertexColors: true,
    roughness: 0.7,
    side: 2,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFrost = frost;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNoisePos;')
      .replace(
        '#include <skinning_vertex>',
        '#include <skinning_vertex>\nvNoisePos = transformed;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vNoisePos;\nuniform float uFrost;\n${HASH}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float sparkle = step(0.82, wrHash(floor(vNoisePos * 900.0)));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.95, 1.0), uFrost * (0.45 + 0.2 * sparkle));`,
      );
  };
  material.customProgramCacheKey = () => 'wr-hair-v1';
  return { material, frost };
}
