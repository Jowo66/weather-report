# Weather Report: Living Human Comfort Simulator
## Product Specification v2.0

| | |
|---|---|
| **Status** | Ready for implementation |
| **URL** | `https://jowo66.github.io/weather-report/` |
| **Companion docs** | [`TECHNICAL_DESIGN.md`](./TECHNICAL_DESIGN.md) is the engineering blueprint. [`../reference/thermo_ref.py`](../reference/thermo_ref.py) is the executable model. |
| **Supersedes** | Product vision v1 (see §20 for what changed and why) |

> **Core question:** *How would I actually feel outside right now, in what I'm wearing?*

---

## 1. Vision

Weather apps give you one "feels like" number for an imaginary person. Weather Report gives you **your** number. It takes live weather, applies it to the clothes you actually have on, and shows the result on a 3D avatar that shivers, sweats, squints and steams the way you would.

The same engine also answers the two follow-up questions:
- *What should I wear?* (outfit recommendation)
- *What should I pack?* (travel planner)

### Product principles
1. **Honest numbers.** Every number comes from a documented, tested physical model. We never invent a value to make the avatar look dramatic.
2. **Explain the "why."** Every result can say what drove it, e.g. "the wind is taking 6°C off" or "your bare hands are the problem."
3. **Inclusive by design.** Every skin tone, body and identity looks right. Skin tone changes how a reaction *looks*. It never changes the comfort maths.
4. **Fun first, never alarming without reason.** Danger states show calm, actionable guidance plus official sources.
5. **Static, private, free.** No accounts, no backend, no API keys. Runs on GitHub Pages.

---

## 2. Users and jobs to be done

| User | Job | Feature |
|---|---|---|
| Commuter | "Do I need the heavy coat or the light jacket today?" | Live weather, outfit check, recommender |
| Newcomer to a cold or hot climate | "What does −15°C with wind actually *mean*?" | Avatar reactions, zone breakdown, explanations |
| Traveller | "What do I pack for Lisbon in 3 weeks?" | Travel planner, packing list |
| Curious learner / student | "Why does wind matter more than temperature?" | Toggles for sun, shade, wind, activity; explanation panel |

---

## 3. Scope and release plan

Each release is a shippable increment with its own acceptance criteria. Claude Code should build them in order (see TDD §15 for the ticket breakdown).

| Release | Contents | Done when |
|---|---|---|
| **R0 Foundations** | Repo scaffold, CI, Pages deploy, engine port, golden tests | All golden vectors pass in CI; empty app deploys to the Pages URL |
| **R1 Weather + Engine** | City search, live conditions, hourly strip, perceived temperature for a default outfit, comfort state, explanation panel | A user can search any city and see "You'll feel X°C, [state], because …" |
| **R2 Clothing + Zones** | Wardrobe UI (20 garments), layering, 6 body zones, outfit recommender, activity / shade / umbrella toggles | Toggling any garment updates the number and zones in < 50 ms |
| **R3 Avatar** | 3D avatar with creator options, garment meshes, animation state machine, skin response, weather particles, 2D fallback | All comfort states are visually distinct, including with reduced motion |
| **R4 Travel** | Destination and dates, forecast or climate-normal conditions, daily outfits, packing list, compare up to 3 cities | A 10-day trip produces a packing list and a per-day outfit |
| **R5 Environments+** | Themed backdrops (city, arctic, beach), day/night, footprints, snow accumulation, polish | Backdrop matches conditions automatically |

### Out of scope for v1
- User accounts, cloud sync, notifications
- Indoor scenes (the model is for outdoors; the v1 "nightclub" backdrop is deferred, see §12)
- Medical or occupational-safety advice
- Real-time cloth physics (garments use skinned meshes plus shader sway)

---

## 4. Live weather

**Source:** [Open-Meteo](https://open-meteo.com/). It's free for non-commercial use, needs no API key, and its data is licensed CC BY 4.0. Attribution is required in the footer. The non-commercial limits are under 10,000 calls a day and 600 a minute, which is ample with caching.

| Shown to user | Open-Meteo variable | Used by engine |
|---|---|---|
| Temperature | `temperature_2m` | ✓ |
| Humidity | `relative_humidity_2m` | ✓ |
| Wind / gusts | `wind_speed_10m`, `wind_gusts_10m` | ✓ (speed) |
| UV index | `uv_index` | Advice only |
| Sun / cloud | `shortwave_radiation`, `direct_normal_irradiance`, `diffuse_radiation`, `is_day`, `cloud_cover` | ✓ (solar load) |
| Rain / snow | `precipitation`, `rain`, `snowfall`, `snow_depth`, `weather_code` | ✓ (wetness, snow glare) |
| Official feels-like | computed: Humidex / Wind Chill (ECCC formulas), plus `apparent_temperature` | Display only |
| Forecast | hourly 48 h + daily 7 to 16 days | Hourly outfit strip, travel |

### Two numbers, clearly labelled
1. **Forecast feels-like**: the familiar official index (Wind Chill when it's 0°C or below, Humidex when it's warm and humid, otherwise air temperature). This anchors credibility.
2. **You'll feel**: the outfit-aware perceived temperature from our engine. This is the product.

When the two differ by more than 5°C, the explanation panel says why, e.g. "Your winter coat blocks most of the wind" or "You're in direct sun."

**Units:** °C / °F and km/h / mph toggles. The default follows the browser locale.
**Location:** search by name (Open-Meteo Geocoding). "Use my location" is opt-in.

---

## 5. Perceived temperature: what the number means

> **"You'll feel 14°C" means: you'll feel the way a person in a T-shirt and jeans feels at 14°C, standing in the shade on a still day.**

That reference person is our yardstick:

| Reference condition | Value |
|---|---|
| Outfit | T-shirt, jeans, socks, sneakers (≈ 0.36 clo) |
| Activity | Standing |
| Sun | Shade |
| Air movement | Light air (0.5 m/s) |
| Humidity | 50% |

So a person in a full winter kit at −15°C can genuinely "feel 22°C." That's the point of the app: clothing changes how the weather feels. Wind, sun, humidity, rain, activity and every garment all move the number through a real heat-balance model. The v1 additive formula (`ambient + clothing + solar − wind …`) is replaced, because those terms interact (wind matters far more when you're under-dressed) and can't simply be summed.

### Worked examples (computed by the reference engine)

| # | Conditions | Outfit | v1 spec said | Engine says | State |
|---|---|---|---|---|---|
| 1 | −5°C, calm, night | Thermal top, thermal bottoms, shirt, jeans | +2°C | **9°C** | Chilly; hands and feet cold |
| 2 | −5°C, calm, night | T-shirt, jeans | −7°C | **−5°C** | Very cold (this *is* the reference outfit) |
| 3 | 32°C, 50% RH, midday sun | Thermal top, sweater, winter coat, jeans | 44°C | **39°C** | Overheated, heat-strain warning |
| 4 | −15°C, 25 km/h, low sun, walking | Full winter kit | n/a | **22°C** | Comfortable; legs cool |
| 5 | Same as 4 but no gloves or toque | | n/a | **14°C** | Chilly; hands freezing |
| 6 | 10°C, rain 3 mm/h, 15 km/h | T-shirt, hoodie, jeans | n/a | **3°C** | Cold; rain-gear prompt |
| 7 | Same as 6 plus rain shell | | n/a | **12°C** | Chilly |
| 8 | 31°C, 70% RH, midday sun | Tank top, shorts | n/a | **36°C** (shade: 31°C) | Overheated (shade: hot) |
| 9 | 36°C, 60% RH, sun, calm | Tank top, shorts | n/a | **41°C** | Dangerous heat |
| 10 | −30°C, 30 km/h, walking | Winter kit and snow pants, no gloves | n/a | **7°C** | Cold, plus a frostbite alert on the hands |

Full inputs and outputs are in `reference/example_output.txt` and `reference/golden_vectors.json`.

---

## 6. Comfort states

| State | Perceived °C | Avatar (summary) | Icon + label (never colour alone) |
|---|---|---|---|
| Dangerous heat | ≥ 40 | Sits down, heavy breathing, safety card | ⚠ flame |
| Overheated | 34 to 40 | Slumped, wiping brow, heavy sweat | flame |
| Hot | 29 to 34 | Fanning self, sweat sheen | sun |
| Warm | 26 to 29 | Relaxed, sleeves pushed, light sheen | sun-small |
| **Comfortable** | 20 to 26 | Relaxed idle, smiling | check |
| Cool | 15 to 20 | Hands in pockets | leaf |
| Chilly | 8 to 15 | Arms crossed, shoulders raised | wind |
| Cold | 0 to 8 | Light shiver, rubbing hands, visible breath | snowflake |
| Very cold | −10 to 0 | Strong shiver, stamping feet | snowflake ×2 |
| Freezing | < −10 | Hunched, violent shiver, frost on hair and brows | ⚠ snowflake |

Warning flags sit on top of states: **heat strain**, **heat danger**, **frostbite risk** (uses Environment and Climate Change Canada's wind-chill tiers for exposed skin), **hypothermia risk** (wet and cold) and **suggest rain gear**. Each flag shows a short, calm "what to do" and a link to an official source.

---

## 7. Clothing

### Insulation values: corrected
The v1 values were roughly 5 to 10 times too high (e.g. "Winter coat 5.0"). A **whole outfit** typically runs from 0.3 clo (summer) to about 2 to 3 clo (heavy winter), and single garments are fractions of that. v2 uses the published garment values in ASHRAE Standard 55 (and ISO 9920 estimates where ASHRAE has none), summed across the outfit.

| Garment | v1 | **v2 (clo)** | Garment | v1 | **v2 (clo)** |
|---|---|---|---|---|---|
| Tank top | 0.2 | **0.06** | Jeans | 1.5 | **0.24** |
| T-shirt | 0.4 | **0.08** | Thermal bottoms | n/a | **0.15** |
| Long sleeve | 0.8 | **0.25** | Snow pants | 4.0 | **0.50** |
| Thermal top | 1.8 | **0.20** | Shorts | n/a | **0.08** |
| Hoodie | 2.0 | **0.34** | Toque / scarf / gloves | n/a | **0.05 / 0.05 / 0.06** |
| Sweater | 2.4 | **0.36** | Socks / wool socks | n/a | **0.02 / 0.06** |
| Light jacket | n/a | **0.30** | Sneakers / winter boots | n/a | **0.02 / 0.10** |
| Rain shell | n/a | **0.15** | Winter coat | 5.0 | **0.70** |

Insulation isn't everything. Each garment also records **which body zones it covers**, **layer position**, **breathability**, **windproof**, **waterproof**, and **how much warmth it loses when wet**. That's why a thin rain shell over a hoodie beats a thicker hoodie alone in the rain (examples 6 and 7). The full schema is in TDD §5.

### Layering rules
- Slots: head, neck, torso (base → mid → insulating → outer), hands, legs (base → outer), feet (socks → footwear).
- One garment per slot-layer. Adding a conflicting item swaps it, with a toast saying so.
- The outermost layer per zone decides windproofing and waterproofing.
- Updates are instant (< 50 ms engine time, avatar re-dresses within one frame budget).

---

## 8. Body zones

Six zones, each with its own felt temperature and state (*ok, cool, cold, freezing, numb* on the cold side; *warm, hot* on the warm side):

| Zone | Share of body surface | Notes |
|---|---|---|
| Head (incl. face, neck) | 9% | Toque, hood, scarf |
| Torso | 37% | |
| Arms | 13% | Added in v2: short vs long sleeves is the most common everyday choice |
| Hands | 5% | Feel cold first (vasoconstriction) |
| Legs | 29% | Tolerate cold better than hands |
| Feet | 7% | Feel cold first |

Bare-skin zones track the official Wind Chill closely (validated to within about 3°C), so "your bare hands feel like −45°C" is credible. Example: "Warm torso, cold hands, cold feet" (example 1) shows exactly that pattern.

---

## 9. Outfit recommendations

The recommender searches the wardrobe for the **lightest sensible outfit** that keeps you at least slightly cool (perceived ≥ 18°C) with no cold body zone. It also respects social norms (no toque recommended at 15°C, no tank top below 25°C). Derived from the engine for a typical overcast day (60% RH, 10 km/h):

| Air temp | Standing / waiting | Walking |
|---|---|---|
| ≤ −20°C | Thermals, sweater, winter coat, snow pants, toque, scarf, gloves, wool socks, boots, plus *limit exposure* | Same as standing |
| −15 to −5°C | Thermal bottoms under jeans, sweater, winter coat or warm jacket, toque, scarf, gloves, boots | Long sleeve, light jacket, thermal bottoms, jeans, toque, gloves, boots |
| 0 to 5°C | Long sleeve, sweater, light jacket, jeans, toque, gloves | Hoodie, jeans, toque, gloves |
| 10°C | Long sleeve, sweater, light jacket, jeans | T-shirt, hoodie, jeans |
| 15°C | T-shirt, hoodie, jeans | Long sleeve, jeans |
| 20°C | Long sleeve, jeans | T-shirt, jeans |
| ≥ 25°C | Tank top, shorts, plus shade, water and sun protection | Same |

Add a rain shell (or umbrella) when precipitation is ≥ 0.5 mm/h, and sun protection when the UV index is ≥ 3. Full output: `reference/bands_output.txt`.

---

## 10. Avatar

### Character creator
| Option | Values | Affects |
|---|---|---|
| Body | Male or female base body (a toggle; the CC0 character pack has no in-between morphs) | Appearance |
| Build | Slim, average, muscular, heavyset (blend) | Appearance |
| Height | Short, average, tall (blend) | Appearance |
| Age look | Young adult, adult, senior | Appearance |
| Skin tone | Continuous, with 10 presets based on the Monk Skin Tone scale | Appearance and skin-response rendering only |
| Hair | 6 styles (side part, buzzed, cropped, long, buns, bald) × colour, on either body | Appearance, wind sway |
| Facial hair | None, moustache, goatee, full beard, on either body | Appearance |
| **"I run cold / hot"** | −3 to +3°C slider | **The only avatar setting that changes the comfort maths** |

Why appearance doesn't change physics: real differences between individuals are larger than differences between body types, and building them in would imply stereotypes. One honest personal-offset slider is more accurate and respectful. The v1 "teen" option becomes "young adult" (people under 18 have different thermoregulation and are outside the model's validity).

### Visual style
Stylised, warm and readable, inspired by life-sim games but **legally distinct**: no copied proportions, UI chrome, plumbob-style indicators, fonts or sounds. It's built from CC0 base assets (TDD §8.2).

---

## 11. Inclusive skin response

v1 had four discrete tone categories. v2 uses **one continuous model**: every reaction exists for every tone, and *how visible* it is depends on the tone, as in real life.

| Reaction | Light skin | Deeply melanated skin | Always also shown by |
|---|---|---|---|
| Cold flushing (nose, ears, cheeks, fingertips) | Clear red/pink | Subtle darkening/purple undertone, **no fake red overlay** | Shiver, posture |
| Pallor in severe cold | Visible blanching | Greyish/ashy desaturation | Frost particles |
| Ashiness (dry cold) | Faint | Clearly visible on knuckles, lips, shins | none needed |
| Heat flushing | Clear redness | Deepened tone, little hue shift | Fanning gesture |
| Sweat sheen | Gloss | Gloss (more visible highlight contrast) | Sweat droplets |
| Frost on brows, lashes, hair | Same for all | Same for all | none needed |

Rule: **no comfort state is conveyed by skin colour alone.** Posture, animation, particles and the text label always carry the message too, which also serves colour-blind users.

---

## 12. Weather reactions and environments

| Condition | Reactions |
|---|---|
| Snow | Falling snow, accumulation on shoulders and toque, footprints, breath vapour when it's ≤ 5°C |
| Rain | Rain particles, darkened wet-fabric shader on unprotected garments, drips, umbrella prop when toggled |
| Wind | Hair and loose-garment sway scaled by wind speed, flags or trees in the backdrop |
| Sun / heatwave | Squint, sunglasses suggestion, heat shimmer when it's ≥ 32°C in sun, sweat droplets |
| Night | Day/night lighting from `is_day` and sun position |

**Backdrops** are chosen automatically from conditions (city by default; arctic when there's snow and it's ≤ −10°C; beach when it's ≥ 28°C and sunny), with a manual override. They're **visual only**. The one environmental toggle that *does* affect comfort is **Sun / Shade**, plus **Umbrella**. The v1 nightclub backdrop is deferred: the model is for outdoors, and showing an indoor scene would be misleading.

---

## 13. Travel planner

**Inputs:** destination(s), start date, end date (up to 30 days), activity profile (mostly walking / mixed / mostly outdoors-static), laundry access (yes/no).

**Conditions source**
- Days within the 16-day forecast window: Open-Meteo forecast.
- Later days: **climate normals**, the same calendar window averaged over the last 10 years (Open-Meteo Historical Weather API). These are clearly labelled "typical, not forecast."

**Outputs**
1. **Conditions summary**, e.g. "Typically 16 to 22°C · moderate humidity · rain on ~4 of 10 days · UV high."
2. **Daily outfit planner**: morning, afternoon and evening outfits via the recommender, with the avatar per day.
3. **Packing list**: garment counts from the daily outfits, laundry rules and a re-wear policy (see TDD §6.3), plus extras (umbrella, sunglasses, sunscreen, gloves).
4. **Visual packing**: suitcase or backpack grid with **missing-item detection** (items needed by some day's outfit but not packed).
5. **Destination comparison**: up to 3 cities side by side, each with its own avatar, outfit and "you'll feel" range.

---

## 14. Safety and honesty
- Footer: "Comfort estimates for everyday decisions. Not medical or safety advice."
- Danger flags link to official guidance (ECCC wind chill and heat pages, or the local equivalent).
- The model's limits are stated in the "How this works" page (TDD §4.13): average adult, steady state after about 30 to 60 minutes outdoors, simplified wetness.

## 15. Accessibility (WCAG 2.2 AA)
- **Reduced motion** (follows `prefers-reduced-motion`, with an in-app toggle): avatar holds a static pose per state, no particles or shimmer, and transitions become cross-fades.
- **High contrast** theme and a fully keyboard-operable wardrobe.
- **Screen readers:** the 3D canvas has a live text equivalent, e.g. "You'll feel 14 degrees, chilly. Hands cold. Suggest gloves." This is announced politely on change.
- **Colour-blind safe:** state = icon + label + pattern. The palette is checked against deuteranopia, protanopia and tritanopia.
- Text scales to 200% without loss. Touch targets are ≥ 44 px.

## 16. Privacy and data
No accounts, no tracking, no cookies. Preferences and wardrobe are kept in `localStorage`. Location is used only on request and never stored beyond the selected city. Open-Meteo is credited in the footer (CC BY 4.0).

## 17. Non-functional requirements
| Area | Target |
|---|---|
| First load (4G, mid-range phone) | Interactive weather view < 3 s; 3D avatar streamed in after |
| 3D performance | 60 fps desktop, ≥ 30 fps mid-range mobile; graceful 2D fallback |
| JS bundle | Initial < 250 KB gzip (Three.js lazy-loaded) |
| Avatar assets | < 4 MB total for base and the v1 garments (compressed glTF) |
| Browsers | Last 2 versions of Chrome, Safari (incl. iOS), Firefox, Edge |
| Offline | Last viewed city works offline (cached weather, marked stale) |

## 18. Success criteria
Users can:
1. Search any city and see live weather in < 3 s.
2. See an outfit-aware "you'll feel" number with a one-line explanation.
3. Toggle any garment and see the number, zones and avatar update instantly.
4. Get a recommended outfit for now and for the next 24 hours.
5. Watch the avatar react visibly and distinctly for every comfort state, across all skin tones.
6. Plan a trip and get a packing list and daily outfits.
7. Compare up to 3 destinations side by side.
8. Understand how clothing changes perceived temperature (the explanation panel and "How this works" page).

Engineering acceptance: 100% of golden vectors pass, all property tests pass, Lighthouse accessibility ≥ 95.

## 19. Open decisions (owner: product)
| # | Decision | Default if undecided |
|---|---|---|
| D1 | Avatar asset route: CC0 human base (MakeHuman/MPFB) vs fully stylised low-poly built in code | **Decided:** Quaternius Universal Base Characters (CC0). The code-built avatar served R1 to R3 and was retired; the 2D avatar remains the fallback |
| D2 | Which official feels-like to show outside Canada (Humidex/Wind Chill vs Open-Meteo apparent temperature vs US Heat Index) | ECCC indices everywhere, with a setting |
| D3 | Expand wardrobe beyond 20 garments in v1 (parka, mittens, balaclava, dress, skirt, sandals) | Ship 20, then add 10 in R5 |
| D4 | Calibration playtest with 10 to 20 people outdoors to tune the heuristic parameters (TDD §4.13) | Yes, before R3 |

## 20. Changes from v1
| Area | v1 | v2 | Why |
|---|---|---|---|
| Thermo formula | Additive sum | Heat-balance model with a defined reference person | Terms interact; the additive version can't be made consistent |
| Clothing values | 0.2 to 5.0 per garment | ASHRAE 55 values (0.02 to 0.70) | v1 values were ~5 to 10× too high |
| Examples | Hand-estimated | Engine-computed and test-locked | Consistency between docs and code |
| Comfort states | Point values (22, 15, 5 …) | Contiguous ranges with flags | Point values leave gaps; flags handle danger |
| Zones | 5 | 6 (added arms) | Sleeves are the most common choice |
| Clothing bands | Hand-written | Model-derived, social-norm filtered | Recommendations now agree with the number shown |
| Skin response | 4 tone buckets | Continuous model + non-colour cues | Avoids hard boundaries; accessibility |
| Avatar physiology | Implied by frame/build/age | Appearance only + "run cold/hot" slider | Accuracy and respect |
| Teen option | Teen | Young adult | Outside the model's validity |
| Nightclub backdrop | Included | Deferred | Indoor scene contradicts the outdoor model |
| Feels-like | One number | Official index **and** "You'll feel" | Credibility and the product hook |
| Travel beyond 16 days | Unspecified | Climate normals (10-year window) | Forecasts stop at 16 days |
| Phasing | Priority list | R0 to R5 releases with acceptance criteria | Clear handoff to Claude Code |
