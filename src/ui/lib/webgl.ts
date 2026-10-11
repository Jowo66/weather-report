let cached: boolean | null = null;

/** WebGL2 available and the device isn't very low-end (TDD §8.2.7 fallback rules). */
export function canUse3D(): boolean {
  if (cached !== null) return cached;
  try {
    if (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 4) <= 2)
      return (cached = false);
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    cached = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
