# Asset licences

Every model, texture and animation shipped in `public/` must be listed here with its source and
licence. Only **CC0** or **self-made** assets are allowed. No Mixamo, Sims or other game assets.

`pnpm assets:build` fails if a file under `public/models` or `public/textures` is missing from this
table, or if the total exceeds the 4 MB avatar budget (TDD §14).

| File     | Source | Licence | Notes                                                                                                                                                                                                                                |
| -------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| _(none)_ | —      | —       | The v1 avatar, all 20 garments, hair, props, poses and particles are generated procedurally in code (`src/scene/rig.ts`, `src/scene/garments3d.ts`, `src/scene/animation/clips.ts`). Self-made, no third-party geometry or textures. |

## Planned (TDD §8.2)

When the CC0 MakeHuman / MPFB2 base body and Blender-authored garments replace the procedural
meshes, add each exported `.glb` / `.ktx2` here with its source URL and licence.
