# Weather Report

> How would I actually feel outside right now, in what I'm wearing?

A static React + TypeScript app (Three.js avatar coming in R3) that turns live
[Open-Meteo](https://open-meteo.com/) weather into an outfit-aware "you'll feel" temperature.
Live at **https://jowo66.github.io/weather-report/**.

- Product spec: [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md)
- Technical design: [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md)
- Executable model: [`reference/thermo_ref.py`](reference/thermo_ref.py), ported to [`src/engine/`](src/engine)

## Commands

```sh
pnpm install
pnpm dev          # local dev server
pnpm test         # vitest: unit + golden + property + perf budgets
pnpm e2e          # playwright smoke tests (builds and previews the app)
pnpm build        # production build to dist/ (base: /weather-report/)
pnpm size         # initial-JS gzip budget check (≤ 250 KB)
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
