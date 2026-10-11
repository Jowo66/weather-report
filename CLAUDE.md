# CLAUDE.md: Weather Report

You are building **Weather Report**, a static React + TypeScript + Three.js app deployed to GitHub Pages at `https://jowo66.github.io/weather-report/`.

## Read first, in this order
1. `docs/PRODUCT_SPEC.md`: what we're building and why (releases R0 to R5, acceptance criteria).
2. `docs/TECHNICAL_DESIGN.md`: how (architecture, engine equations, data schemas, animation FSM, avatar pipeline, ticket list in §15).
3. `reference/thermo_ref.py`: **the executable specification of the comfort engine.** Run `python3 reference/thermo_ref.py --checks` to see it pass.

## Ground rules
- Work ticket by ticket from TDD §15, in order. Don't start a release before the previous one meets its acceptance criteria.
- **The engine (`src/engine/`) must reproduce `reference/golden_vectors.json`** within the tolerances in TDD §4.14. If a golden test fails, fix the port; never edit the vectors.
- To change the model: edit `thermo_ref.py` first, run `--checks`, regenerate with `--golden`, bump `ENGINE_VERSION`, then port the change.
- `src/engine` is pure: no React, no DOM, no dates, no randomness, no dependencies.
- Units are SI inside the engine; convert only in the UI.
- Never convey comfort state by colour alone (icon + label + motion/pose).
- Skin tone affects rendering only, never the maths. The only physiological user input is `personalOffset`.
- Assets: CC0 or self-made only, and list every asset in `public/models/LICENSES.md`. No Mixamo, Sims or other game assets.
- Open-Meteo: no API key, ≤ 1 request per city per 15 min, attribution in the footer (CC BY 4.0).
- Pin exact dependency versions and commit the lockfile.

## Commands (create these in T-01)
```
pnpm dev          # local dev
pnpm test         # vitest: unit + golden + property
pnpm e2e          # playwright (mocked Open-Meteo)
pnpm build        # vite build (base: /weather-report/)
pnpm assets:build # glTF optimisation pipeline (R3)
python3 reference/thermo_ref.py --checks | --golden | --bands
```

## Definition of done (every ticket)
Typecheck, lint and all tests green; no bundle-budget regressions (TDD §14); reduced-motion path works for anything animated; a short PR description listing what changed and how it was verified.
