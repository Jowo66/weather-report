# Asset licences

Every model, texture and animation shipped in `public/` must be listed here with its source and
licence. Only **CC0** or **self-made** assets are allowed. No Mixamo, Sims or other game assets.

`pnpm assets:build` fails if a file under `public/models` or `public/textures` is missing from this
table, or if the total exceeds the 4 MB avatar budget (TDD §14).

## Third-party (CC0)

Source: **Universal Base Characters (Standard / free edition)** by [Quaternius](https://quaternius.com),
CC0 1.0 Universal (public domain dedication, per the pack's `License_Standard.txt`). Converted by
`tools/characters/build-ubc.py` (geometry re-packed, textures downsized to WebP and turned into tintable
detail maps). Re-run it with the path to the unzipped pack to regenerate.

| File                            | From the pack                                                                                     | Licence |
| ------------------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| `characters/characters.json`    | Skeletons and mesh layout for everything below                                                    | CC0 1.0 |
| `characters/male.bin`           | `Superhero_Male_FullBody.gltf` (body, eyes)                                                       | CC0 1.0 |
| `characters/female.bin`         | `Superhero_Female_FullBody.gltf` (body, eyes)                                                     | CC0 1.0 |
| `characters/hair.bin`           | `Hairstyles/Rigged to Head Bone`: Buzzed, BuzzedFemale, SimpleParted, Long, Buns, Beard, Eyebrows | CC0 1.0 |
| `characters/male_detail.webp`   | `T_Superhero_Male_Ligh.png` (as a detail map; alpha marks the baked underwear)                    | CC0 1.0 |
| `characters/female_detail.webp` | `T_Superhero_Female_Light_BaseColor.png` (as above)                                               | CC0 1.0 |
| `characters/male_normal.webp`   | `T_Superhero_Male_Normal.png`                                                                     | CC0 1.0 |
| `characters/female_normal.webp` | `T_Superhero_Female_Normal.png`                                                                   | CC0 1.0 |
| `characters/hair_detail.webp`   | `T_Hair_1_BaseColor.png` and `T_Hair_2_BaseColor.png`, side by side                               | CC0 1.0 |
| `characters/eye.webp`           | `T_Eye_Brown.png`                                                                                 | CC0 1.0 |

## Self-made

Garments (cut as shells from the body surface at runtime, `src/scene/character/parts.ts`), eyelids,
the umbrella, poses (`src/scene/animation/clips.ts`), particles and backdrops are generated in code.
