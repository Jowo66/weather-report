# Weather Report

> How would I actually feel outside right now, in what I'm wearing?

A static React + TypeScript + Three.js app that turns live
[Open-Meteo](https://open-meteo.com/) weather into an outfit-aware "you'll feel" temperature.
Live at **https://jowo66.github.io/weather-report/**.

- Product spec: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md)
- Technical design: [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md)
- Executable model: [`reference/thermo_ref.py`](reference/thermo_ref.py), ported to [`src/engine/`](src/engine)

## What's in it

| Route               | What                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `#/`                | Now: search a city, "you'll feel" vs forecast feels-like, why, body zones, toggles, outfit, recommendation, hourly strip, 3D avatar |
| `#/wardrobe`        | The 20-garment wardrobe with live number and zones                                                                                  |
| `#/avatar`          | Character creator, "I run cold/hot", motion / 2D / backdrop / high-contrast settings                                                |
| `#/travel`          | Trip planner (forecast ≤ 16 days, 10-year climate normals beyond), daily outfits, packing list with missing items                   |
| `#/compare`         | Up to 3 cities side by side                                                                                                         |
| `#/how-it-works`    | The model, the reference person, and its limits                                                                                     |
| `#/dev/calibration` | Playtest panel: tune heuristic parameters live, log votes, export CSV                                                               |
| `#/dev/avatar-qa`   | Visual QA: any comfort state × skin tone                                                                                            |

## Commands

```sh
pnpm install
pnpm dev          # local dev server
pnpm test         # vitest: unit + golden + property + perf budgets
pnpm e2e          # playwright smoke tests (builds and previews the app)
pnpm build        # production build to dist/ (base: /weather-report/)
pnpm size         # bundle budgets: initial JS ≤ 250 KB, three.js chunk ≤ 200 KB (gzip)
pnpm assets:build # asset licence + 4 MB budget check (avatar is procedural)
pnpm lint && pnpm typecheck && pnpm format:check
python3 reference/thermo_ref.py --checks | --golden | --bands
```

## Engine

`src/engine` is pure TypeScript (no React, DOM, dates, randomness or dependencies; enforced by
ESLint). It reproduces every vector in `reference/golden_vectors.json` (13 named cases, 1,536 grid
points, 240 recommendations). To change the model, edit `thermo_ref.py` first, run `--checks`,
regenerate with `--golden`, bump `ENGINE_VERSION`, then port the change.

Weather data by Open-Meteo.com (CC BY 4.0). Comfort estimates for everyday decisions; not medical
or safety advice.
