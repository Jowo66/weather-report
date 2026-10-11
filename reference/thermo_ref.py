"""Weather Report - reference thermoregulation engine ("WR Comfort Model", v3.0).

Executable specification for src/engine/. The TypeScript port must reproduce
golden_vectors.json within the tolerances in TECHNICAL_DESIGN.md section 4.11.

Model summary (details + citations in TECHNICAL_DESIGN.md section 4):
  * Steady-state human heat balance per body zone (ISO 7730 / ISO 9920 / ASHRAE Fundamentals ch. 9
    formulation), with explicit evaporative capacity through clothing, so heavy clothing in
    heat correctly makes you hotter.
  * Solar load via ASHRAE 55-2023 Appendix C (SolarCal), adapted outdoors.
  * Perceived temperature = the air temperature at which a REFERENCE PERSON (standing, T-shirt and
    jeans, in the shade, 4.8 km/h breeze, 50% RH) would carry the same thermal load:
      cold side -> same heat deficit (W/m2); warm side -> same required skin wettedness.
  * Zone felt temperatures use the same reference, with skin-tissue resistance, so bare skin
    tracks the Environment and Climate Change Canada wind chill.

Pure python, no dependencies.  python thermo_ref.py [--golden] [--checks]
"""
from __future__ import annotations
import json, math, sys
from dataclasses import dataclass, asdict, field

ENGINE_VERSION = "3.0.0"

# ------------------------------------------------------------------ constants
ZONES = {"head": 0.09, "torso": 0.37, "arms": 0.13, "hands": 0.05, "legs": 0.29, "feet": 0.07}
CLO = 0.155                  # m2K/W per clo
LR = 16.5                    # Lewis relation, K/kPa
H_R = 4.7                    # linear radiative coefficient, W/m2K
SIGMA_SKIN_DIFF = 0.06       # minimum skin wettedness (insensible diffusion)
WIND_HEIGHT_FACTOR = 0.67    # 10 m wind -> ~1.1 m (log profile, open terrain)
V_MIN = 0.5                  # m/s outdoor air-movement floor (outdoors is never still; cf. UTCI 0.5 m/s minimum)
I_M_SKIN = 1.0               # bare skin vapour permeability (no clothing resistance anyway)

# reference person
REF_V = 0.5                  # m/s light air (= V_MIN, so a calm day is the reference day)
REF_V_ZONE = 1.34            # m/s = 4.8 km/h ECCC wind-chill reference walking speed (zone model)
REF_RH = 50.0
REF_MET = 1.2
REF_OUTFIT = ["t_shirt", "jeans", "socks", "sneakers"]

# zone model
R_TISSUE = 0.09              # m2K/W skin/tissue resistance (Osczevski & Bluestein 2005 face model ~0.091)
VASO_START, VASO_GAIN, VASO_MAX = 17.0, 0.3, 5.0   # hand/foot vasoconstriction (heuristic)

# precipitation / wind heuristics (calibrate in playtests; all exposed in engine config)
WET_SATURATION_MM_H = 2.0    # precip rate that fully soaks unprotected fabric (steady state)
SNOW_WETTING_FACTOR = 0.3    # dry snow soaks less than rain (T < -1 C)
UMBRELLA_UPPER_FACTOR = 0.2  # precip still reaching head/torso/arms under an umbrella
RAIN_EVAP_EFFICIENCY = 0.3   # share of evaporating rain-water heat drawn from the body
WIND_PENETRATION = 0.4       # max insulation loss of air-permeable layers at >=10 m/s (ISO 9920 order of magnitude)
WIND_PENETRATION_WP = 0.1    # same for zones under a windproof outer layer

ACTIVITY = {"standing": (1.2, 0.0), "strolling": (1.6, 0.6), "walking": (2.0, 0.9)}  # met, walking m/s (ASHRAE 55 Table 5.2.1.2)

# ------------------------------------------------------------------ garments
@dataclass(frozen=True)
class Garment:
    id: str
    clo: float               # ASHRAE 55-2023 garment insulation (whole-body clo)
    coverage: dict            # zone -> fraction covered
    layer: int                # 1 base ... 5 outer/accessory (draw order + "outermost" logic)
    i_m: float = 0.38         # vapour permeability index (ISO 9920 typical woven/knit ~0.38)
    windproof: bool = False
    waterproof: bool = False
    wet_loss: float = 0.4     # fraction of insulation lost when fully soaked

GARMENTS = {g.id: g for g in [
    Garment("tank_top",        0.06, {"torso": 0.8}, 1),
    Garment("t_shirt",         0.08, {"torso": 1.0, "arms": 0.2}, 1),
    Garment("long_sleeve",     0.25, {"torso": 1.0, "arms": 1.0}, 2),
    Garment("thermal_top",     0.20, {"torso": 1.0, "arms": 1.0}, 1, wet_loss=0.25),
    Garment("hoodie",          0.34, {"torso": 1.0, "arms": 1.0, "head": 0.3}, 3),
    Garment("sweater",         0.36, {"torso": 1.0, "arms": 1.0}, 3, wet_loss=0.3),
    Garment("light_jacket",    0.30, {"torso": 1.0, "arms": 1.0}, 4, i_m=0.25, windproof=True),
    Garment("rain_shell",      0.15, {"torso": 1.0, "arms": 1.0, "head": 0.6}, 5, i_m=0.15, windproof=True, waterproof=True, wet_loss=0.0),
    Garment("winter_coat",     0.70, {"torso": 1.0, "arms": 1.0, "legs": 0.25}, 5, i_m=0.20, windproof=True),
    Garment("shorts",          0.08, {"legs": 0.4}, 2),
    Garment("jeans",           0.24, {"legs": 1.0}, 2, wet_loss=0.5),
    Garment("thermal_bottoms", 0.15, {"legs": 1.0}, 1, wet_loss=0.25),
    Garment("snow_pants",      0.50, {"legs": 1.0}, 5, i_m=0.18, windproof=True, waterproof=True, wet_loss=0.0),
    Garment("toque",           0.05, {"head": 0.6}, 5, wet_loss=0.25),
    Garment("scarf",           0.05, {"head": 0.3}, 5),
    Garment("gloves",          0.06, {"hands": 1.0}, 5, i_m=0.25, windproof=True),
    Garment("socks",           0.02, {"feet": 1.0}, 1),
    Garment("wool_socks",      0.06, {"feet": 1.0}, 1, wet_loss=0.2),
    Garment("sneakers",        0.02, {"feet": 1.0}, 5, i_m=0.25),
    Garment("winter_boots",    0.10, {"feet": 1.0}, 5, i_m=0.15, windproof=True, waterproof=True, wet_loss=0.0),
]}

def local_clo(g: Garment, zone: str) -> float:
    """Redistribute whole-body garment clo onto covered zones (area-weighted)."""
    a = sum(ZONES[z] * c for z, c in g.coverage.items())
    return g.clo / a * g.coverage.get(zone, 0.0)

# ------------------------------------------------------------------ inputs
@dataclass
class Weather:
    t_air: float
    rh: float
    wind_kmh: float
    ghi: float = 0.0
    dni: float = 0.0
    dhi: float = 0.0
    sun_alt: float = 0.0
    precip_mm_h: float = 0.0
    snow_depth_m: float = 0.0

@dataclass
class Context:
    activity: str = "standing"
    shade: bool = False
    umbrella: bool = False
    personal_offset: float = 0.0   # "I run cold/hot" (-3..+3 C), added to perceived and zone temps

# ------------------------------------------------------------------ psychrometrics & indices
def p_sat(t: float) -> float:
    """kPa, Magnus-Tetens over water."""
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))

def ec_wind_chill(t: float, wind_kmh: float) -> float:
    """ECCC wind chill index (reported when T <= 0 C and wind >= 5 km/h)."""
    if t > 0 or wind_kmh < 5:
        return t
    v = wind_kmh ** 0.16
    return 13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v

def ec_humidex(t: float, rh: float) -> float:
    e = 6.112 * 10 ** (7.5 * t / (237.7 + t)) * rh / 100.0   # hPa
    return t + 0.5555 * (e - 10.0)

def frostbite_risk(wc: float):
    """ECCC wind-chill risk tiers for exposed skin (canada.ca wind-chill index page)."""
    if wc > -28: return None
    if wc > -40: return "high"        # exposed skin can freeze in 10-30 min
    if wc > -48: return "very_high"   # 5-10 min
    if wc > -55: return "severe"      # 2-5 min
    return "extreme"                  # < 2 min

# ------------------------------------------------------------------ solar
def solar_delta_tmrt(w: Weather, ctx: Context) -> float:
    """ASHRAE 55-2023 Appendix C SolarCal, outdoor variant (f_svv, f_bes from shade/umbrella)."""
    if w.ghi <= 0 or w.sun_alt <= 0:
        return 0.0
    f_eff, h_r, a_sw, a_lw = 0.725, 6.012, 0.67, 0.95
    f_svv = 0.5 if ctx.shade else 1.0
    f_bes = 0.0 if ctx.shade else (0.2 if ctx.umbrella else 1.0)
    albedo = 0.7 if w.snow_depth_m > 0.01 else 0.2
    b = min(w.sun_alt, 90.0)
    f_p = 0.308 * math.cos(math.radians(b * (0.998 - b * b / 50000.0)))   # standing person
    erf = (0.5 * f_eff * f_svv * (w.dhi + w.ghi * albedo) + f_p * f_eff * f_bes * w.dni) * (a_sw / a_lw)
    return erf / (f_eff * h_r)

# ------------------------------------------------------------------ core balance
def h_conv(v: float, dt: float = 0.0) -> float:
    """ISO 7730: max(forced 12.1*sqrt(v), natural 2.38*|t_cl - t_a|^0.25)."""
    return max(12.1 * math.sqrt(max(v, 0.1)), 2.38 * abs(dt) ** 0.25)

def wetness_by_zone(w: Weather, ctx: Context, outfit) -> dict:
    rate = w.precip_mm_h * (SNOW_WETTING_FACTOR if w.t_air < -1 else 1.0)
    out = {}
    for z in ZONES:
        r = rate * (UMBRELLA_UPPER_FACTOR if ctx.umbrella and z in ("head", "torso", "arms") else 1.0)
        shielded = any(g.waterproof and g.coverage.get(z, 0) >= 0.5 for g in outfit)
        out[z] = 0.0 if shielded else min(1.0, r / WET_SATURATION_MM_H)
    return out

def zone_clothing(outfit, z: str, wet_z: float, v: float):
    """Effective local clo and vapour permeability for zone z."""
    items = [g for g in outfit if g.coverage.get(z, 0) > 0]
    if not items:
        return 0.0, I_M_SKIN, False
    windproof = any(g.windproof and g.coverage[z] >= 0.5 for g in items)
    f_wind = 1 - (WIND_PENETRATION_WP if windproof else WIND_PENETRATION) * min(v, 10.0) / 10.0
    clo = sum(local_clo(g, z) * (1 - g.wet_loss * wet_z) for g in items) * f_wind
    # series vapour resistance: sum(R_cl,i / i_m,i) -> effective i_m
    r = sum(local_clo(g, z) for g in items)
    re = sum(local_clo(g, z) / g.i_m for g in items)
    i_m = r / re if re > 0 else I_M_SKIN
    return clo, i_m, windproof

def heat_balance(t_air, t_mrt, v, rh, met, outfit, wet=None):
    """Returns per-zone fluxes and whole-body load terms (W/m2)."""
    wet = wet or {z: 0.0 for z in ZONES}
    m = met * 58.15
    t_sk = 35.7 - 0.0275 * m                      # Fanger comfort skin temperature
    p_a = rh / 100.0 * p_sat(t_air)
    p_sk = p_sat(t_sk)
    # natural convection uses the skin-air difference scaled to a typical clothing surface (0.6), no iteration
    h_c = h_conv(v, 0.6 * (t_sk - t_air))
    t_op = (H_R * t_mrt + h_c * t_air) / (H_R + h_c)
    zones, dry, emax, rain_evap = {}, 0.0, 0.0, 0.0
    for z, a in ZONES.items():
        clo, i_m, wp = zone_clothing(outfit, z, wet[z], v)
        f_cl = 1 + 0.31 * clo
        r_cl = clo * CLO
        r_a = 1 / (f_cl * (h_c + H_R))
        q = (t_sk - t_op) / (r_cl + r_a)
        r_e = r_cl / (i_m * LR) + 1 / (LR * f_cl * h_c)
        e_max = max(0.0, (p_sk - p_a)) / r_e
        # evaporation of rain from the outer fabric draws some heat from the body
        e_rain = RAIN_EVAP_EFFICIENCY * wet[z] * max(0.0, p_sat(t_air) - p_a) * LR * f_cl * h_c
        zones[z] = dict(clo=clo, i_m=i_m, q=q, e_max=e_max, windproof=wp)
        dry += a * q
        emax += a * e_max
        rain_evap += a * e_rain
    resp = 0.0014 * m * (34 - t_air) + 0.0173 * m * (5.87 - p_a)
    e_dif = SIGMA_SKIN_DIFF * emax
    load = m - dry - resp - e_dif - rain_evap      # heat that still has to go (sweat) or is a deficit
    return dict(load=load, dry=dry, resp=resp, e_max=emax, e_dif=e_dif, rain_evap=rain_evap,
                t_sk=t_sk, t_op=t_op, h_c=h_c, zones=zones)

def strain_index(hb) -> float:
    """Cold side: heat deficit (W/m2, negative). Warm side: required regulatory wettedness x 100."""
    if hb["load"] <= 0:
        return hb["load"]
    return 100.0 * hb["load"] / max((1 - SIGMA_SKIN_DIFF) * hb["e_max"], 1e-6)

_REF_OUTFIT = [GARMENTS[i] for i in REF_OUTFIT]
def reference_index(t: float) -> float:
    return strain_index(heat_balance(t, t, REF_V, REF_RH, REF_MET, _REF_OUTFIT))

# reference table, -80..+70 C every 0.5 C (strictly increasing; asserted in --checks)
REF_TABLE = [(x / 2.0, reference_index(x / 2.0)) for x in range(-160, 141)]

def index_to_temperature(idx: float) -> float:
    tab = REF_TABLE
    if idx <= tab[0][1]:
        (t0, s0), (t1, s1) = tab[0], tab[1]
    elif idx >= tab[-1][1]:
        (t0, s0), (t1, s1) = tab[-2], tab[-1]
    else:
        lo, hi = 0, len(tab) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if tab[mid][1] <= idx: lo = mid
            else: hi = mid
        (t0, s0), (t1, s1) = tab[lo], tab[hi]
    return t0 + (idx - s0) * (t1 - t0) / (s1 - s0)

# ------------------------------------------------------------------ bands
BANDS = [  # perceived (C) lower bounds -> state. Derived from the reference person's PMV, see TDD 4.8
    (40.0, "dangerous_heat"), (34.0, "overheated"), (29.0, "hot"), (26.0, "warm"),
    (20.0, "comfortable"), (15.0, "cool"), (8.0, "chilly"), (0.0, "cold"),
    (-10.0, "very_cold"), (-math.inf, "freezing"),
]
def band(t: float) -> str:
    return next(s for lo, s in BANDS if t >= lo)

ZONE_BANDS = [(34.0, "hot"), (28.0, "warm"), (10.0, "ok"), (0.0, "cool"), (-10.0, "cold"), (-25.0, "freezing"), (-math.inf, "numb")]
ZONE_TOLERANCE = {"hands": -3.0, "feet": -3.0, "head": 0.0, "torso": 0.0, "arms": 3.0, "legs": 3.0}  # applied on the cold side only
def zone_band(t: float, z: str) -> str:
    if t < 10:
        t += ZONE_TOLERANCE[z]
    return next(s for lo, s in ZONE_BANDS if t >= lo)

# ------------------------------------------------------------------ evaluate
def evaluate(w: Weather, outfit_ids, ctx: Context = Context()) -> dict:
    outfit = [GARMENTS[i] for i in outfit_ids]
    met, v_walk = ACTIVITY[ctx.activity]
    v_body = max(V_MIN, WIND_HEIGHT_FACTOR * w.wind_kmh / 3.6)
    v_rel = math.hypot(v_body, v_walk)
    d_tmrt = solar_delta_tmrt(w, ctx)
    t_mrt = w.t_air + d_tmrt
    wet = wetness_by_zone(w, ctx, outfit)
    hb = heat_balance(w.t_air, t_mrt, v_rel, w.rh, met, outfit, wet)
    idx = strain_index(hb)
    perceived = index_to_temperature(idx) + ctx.personal_offset

    # zones: same reference person, with tissue resistance
    h_c_ref = h_conv(REF_V_ZONE)
    vaso = min(VASO_MAX, max(0.0, VASO_GAIN * (VASO_START - perceived)))
    wc = ec_wind_chill(w.t_air, w.wind_kmh)
    zones = {}
    for z in ZONES:
        zz = hb["zones"][z]
        clo_ref = sum(local_clo(g, z) for g in _REF_OUTFIT)
        f_cl = 1 + 0.31 * zz["clo"]
        f_cl_ref = 1 + 0.31 * clo_ref
        r_act = R_TISSUE + zz["clo"] * CLO + 1 / (f_cl * (hb["h_c"] + H_R))
        r_ref = R_TISSUE + clo_ref * CLO + 1 / (f_cl_ref * (h_c_ref + H_R))
        t_felt = hb["t_sk"] - (hb["t_sk"] - hb["t_op"]) * r_ref / r_act
        if wet[z] > 0:
            t_felt -= 2.0 * wet[z]                              # wet-fabric chill (heuristic)
        if z in ("hands", "feet"):
            t_felt -= vaso
        t_felt += ctx.personal_offset
        exposed = zz["clo"] < 0.1
        zones[z] = dict(clo=round(zz["clo"], 3), wetness=round(wet[z], 3), t_felt=round(t_felt, 2),
                        state=zone_band(t_felt, z), exposed=exposed,
                        frostbite=frostbite_risk(wc) if exposed and z in ("head", "hands") else None)

    w_req = hb["load"] / max(hb["e_max"], 1e-6) if hb["load"] > 0 else 0.0
    flags = []
    if perceived >= 34 and w_req > 0.5: flags.append("heat_strain")
    if perceived >= 40 or w_req >= 1.0: flags.append("heat_danger")      # sweat can no longer evaporate fast enough
    if any(v["frostbite"] for v in zones.values()): flags.append("frostbite_risk")
    wet_area = sum(ZONES[z] * wet[z] for z in ZONES)
    if w.t_air < 10 and wet_area >= 0.4 and perceived < 5: flags.append("hypothermia_risk")
    if w.precip_mm_h >= 0.5 and not ctx.umbrella and not any(g.waterproof for g in outfit): flags.append("suggest_rain_gear")

    return dict(
        perceived=round(perceived, 2), state=band(perceived), index=round(idx, 3),
        load_w_m2=round(hb["load"], 2), required_wettedness=round(w_req, 3),
        clo_total=round(sum(g.clo for g in outfit), 3),
        clo_effective=round(sum(ZONES[z] * hb["zones"][z]["clo"] for z in ZONES), 3),
        v_rel=round(v_rel, 3), t_mrt=round(t_mrt, 2), wet_area=round(wet_area, 3),
        humidex=round(ec_humidex(w.t_air, w.rh), 1), wind_chill=round(wc, 1),
        zones=zones, flags=flags,
    )

# ------------------------------------------------------------------ scenarios
BASE = ["socks", "sneakers"]
WINTER_KIT = ["thermal_top", "sweater", "winter_coat", "thermal_bottoms", "jeans", "toque", "scarf", "gloves", "wool_socks", "winter_boots"]
SUN_HIGH = dict(ghi=800, dni=850, dhi=120, sun_alt=60)
SUN_LOW = dict(ghi=250, dni=500, dhi=80, sun_alt=20)
CASES = [
    ("E1", "-5C, calm, night | thermal top + thermal bottoms + long-sleeve shirt + jeans",
     Weather(-5, 80, 0), ["thermal_top", "thermal_bottoms", "long_sleeve", "jeans"] + BASE, Context()),
    ("E2", "-5C, calm, night | t-shirt + jeans",
     Weather(-5, 80, 0), ["t_shirt", "jeans"] + BASE, Context()),
    ("E3", "32C, 50% RH, midday sun | thermal top + sweater + winter coat + jeans",
     Weather(32, 50, 5, **SUN_HIGH), ["thermal_top", "sweater", "winter_coat", "jeans"] + BASE, Context()),
    ("E4", "22C, 50% RH, shade, light air | reference outfit (t-shirt + jeans) -> must equal 22",
     Weather(22, 50, 2.7), REF_OUTFIT, Context(shade=True)),
    ("E5", "-15C, 25 km/h, low sun, snow on ground, walking | full winter kit",
     Weather(-15, 70, 25, **SUN_LOW, snow_depth_m=0.2), WINTER_KIT, Context(activity="walking")),
    ("E6", "E5 without gloves and toque",
     Weather(-15, 70, 25, **SUN_LOW, snow_depth_m=0.2), [g for g in WINTER_KIT if g not in ("gloves", "toque")], Context(activity="walking")),
    ("E7", "10C, rain 3 mm/h, 15 km/h, overcast | t-shirt + hoodie + jeans",
     Weather(10, 95, 15, ghi=50, dhi=50, sun_alt=30, precip_mm_h=3), ["t_shirt", "hoodie", "jeans"] + BASE, Context()),
    ("E8", "E7 + rain shell",
     Weather(10, 95, 15, ghi=50, dhi=50, sun_alt=30, precip_mm_h=3), ["t_shirt", "hoodie", "rain_shell", "jeans"] + BASE, Context()),
    ("E9", "31C, 70% RH, 8 km/h, midday sun | tank top + shorts",
     Weather(31, 70, 8, **SUN_HIGH), ["tank_top", "shorts"] + BASE, Context()),
    ("E10", "E9 in the shade",
     Weather(31, 70, 8, **SUN_HIGH), ["tank_top", "shorts"] + BASE, Context(shade=True)),
    ("E11", "36C, 60% RH, 3 km/h, midday sun | tank top + shorts (heatwave)",
     Weather(36, 60, 3, **SUN_HIGH), ["tank_top", "shorts"] + BASE, Context()),
    ("E12", "-30C, 30 km/h, walking | winter kit + snow pants, NO gloves",
     Weather(-30, 70, 30), ["thermal_top", "sweater", "winter_coat", "thermal_bottoms", "snow_pants", "toque", "scarf", "wool_socks", "winter_boots"],
     Context(activity="walking")),
    ("E13", "15C, 60% RH, 10 km/h, low sun, walking | long-sleeve + light jacket + jeans",
     Weather(15, 60, 10, **SUN_LOW), ["long_sleeve", "light_jacket", "jeans"] + BASE, Context(activity="walking")),
]

def golden_grid():
    outfits = {"summer": ["tank_top", "shorts"] + BASE, "reference": REF_OUTFIT,
               "autumn": ["long_sleeve", "hoodie", "jeans"] + BASE, "winter": WINTER_KIT}
    out = []
    for t in (-30, -15, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40):
        for rh in (30, 80):
            for wind in (0, 20):
                for sun in (False, True):
                    for prec in (0.0, 2.5):
                        for name, o in outfits.items():
                            for act in ("standing", "walking"):
                                w = Weather(t, rh, wind, **(SUN_HIGH if sun else {}), precip_mm_h=prec)
                                c = Context(activity=act)
                                out.append({"input": {"weather": asdict(w), "outfit": o, "context": asdict(c)},
                                            "expected": evaluate(w, o, c)})
    return out

# ------------------------------------------------------------------ property checks
def checks():
    fails = []
    ok = all(REF_TABLE[i + 1][1] > REF_TABLE[i][1] for i in range(len(REF_TABLE) - 1))
    print("reference table strictly increasing:", ok); ok or fails.append("ref")
    r = evaluate(Weather(22, 50, REF_V / WIND_HEIGHT_FACTOR * 3.6), REF_OUTFIT, Context(shade=True))
    print("reference person in reference conditions ->", r["perceived"], "(expect 22.0)")
    outfits = [["tank_top", "shorts"] + BASE, REF_OUTFIT, ["long_sleeve", "hoodie", "jeans"] + BASE, WINTER_KIT]
    n = bad = 0
    for o in outfits:                                          # warmer air -> never feels colder
        for act in ACTIVITY:
            for wind in (0, 10, 30, 60):
                for rh in (10, 50, 95):
                    for sun in (False, True):
                        prev = -1e9
                        for t in range(-40, 47):
                            p = evaluate(Weather(t, rh, wind, **(SUN_HIGH if sun else {})), o, Context(activity=act))["perceived"]
                            n += 1
                            if p < prev - 0.01: bad += 1
                            prev = p
    print(f"monotone in air temperature: {n - bad}/{n}"); bad and fails.append("T")
    n = bad = 0
    for o in outfits:                                          # windier -> never warmer (below 34 C)
        for t in (-30, -10, 0, 10, 20, 30):
            prev = 1e9
            for wind in range(0, 81, 4):
                p = evaluate(Weather(t, 50, wind), o)["perceived"]; n += 1
                if p > prev + 0.01: bad += 1
                prev = p
    print(f"monotone in wind (T<=30): {n - bad}/{n}"); bad and fails.append("wind")
    n = bad = 0
    for t in (20, 25, 30, 35, 40):                             # more humid -> never cooler (warm side)
        for o in outfits[:3]:
            prev = -1e9
            for rh in range(5, 101, 5):
                p = evaluate(Weather(t, rh, 5), o)["perceived"]; n += 1
                if p < prev - 0.01: bad += 1
                prev = p
    print(f"monotone in humidity (T>=20): {n - bad}/{n}"); bad and fails.append("rh")
    ladder = [[], ["t_shirt"], ["t_shirt", "jeans"], ["t_shirt", "jeans"] + BASE, ["t_shirt", "long_sleeve", "jeans"] + BASE,
              ["t_shirt", "long_sleeve", "sweater", "jeans"] + BASE, ["thermal_top", "long_sleeve", "sweater", "winter_coat", "jeans"] + BASE,
              WINTER_KIT, WINTER_KIT + ["snow_pants"]]
    n = bad = 0
    for t in (-30, -10, 0, 10, 20, 25, 30, 33):               # adding layers -> never colder (below skin temp)
        for act in ACTIVITY:
            prev = -1e9
            for o in ladder:
                p = evaluate(Weather(t, 50, 10), o, Context(activity=act))["perceived"]; n += 1
                if p < prev - 0.01: bad += 1
                prev = p
    print(f"monotone in clothing (T<=33): {n - bad}/{n}"); bad and fails.append("clo")
    n = bad = 0
    for t in (-20, 0, 10, 20, 30):                            # more activity -> never colder
        for o in outfits:
            ps = [evaluate(Weather(t, 50, 10), o, Context(activity=a))["perceived"] for a in ("standing", "strolling", "walking")]
            n += 1
            if not (ps[0] <= ps[1] + 0.01 and ps[1] <= ps[2] + 0.01): bad += 1
    print(f"monotone in activity: {n - bad}/{n}"); bad and fails.append("act")
    n = bad = 0
    for t in (-10, 10, 25, 35):                               # sun -> never colder, shade -> never warmer than sun
        for o in outfits:
            a = evaluate(Weather(t, 50, 10), o)["perceived"]
            b = evaluate(Weather(t, 50, 10, **SUN_HIGH), o)["perceived"]
            c = evaluate(Weather(t, 50, 10, **SUN_HIGH), o, Context(shade=True))["perceived"]
            n += 1
            if not (b >= c - 0.01 and c >= a - 0.01): bad += 1
    print(f"sun >= shade >= night: {n - bad}/{n}"); bad and fails.append("sun")
    n = bad = 0
    for t in (0, 5, 10, 15):                                  # rain -> never warmer; rain shell -> never colder than without
        o = ["t_shirt", "hoodie", "jeans"] + BASE
        dry = evaluate(Weather(t, 90, 10), o)["perceived"]
        wet = evaluate(Weather(t, 90, 10, precip_mm_h=3), o)["perceived"]
        shell = evaluate(Weather(t, 90, 10, precip_mm_h=3), o + ["rain_shell"])["perceived"]
        n += 1
        if not (wet <= dry + 0.01 and shell >= wet - 0.01): bad += 1
    print(f"rain effects: {n - bad}/{n}"); bad and fails.append("rain")
    # bare-skin zone vs ECCC wind chill
    print("bare hands (standing, no sun) vs ECCC wind chill:")
    for t, wind in ((-10, 20), (-20, 30), (-30, 40), (-5, 10)):
        z = evaluate(Weather(t, 60, wind), [g for g in WINTER_KIT if g != "gloves"])["zones"]["hands"]
        z = z["t_felt"] + min(VASO_MAX, max(0.0, VASO_GAIN * (VASO_START - evaluate(Weather(t, 60, wind), [g for g in WINTER_KIT if g != "gloves"])["perceived"])))
        print(f"   {t:4}C {wind:2} km/h: zone {z:6.1f}  wind chill {ec_wind_chill(t, wind):6.1f}")
    print("FAILED: " + ", ".join(fails) if fails else "ALL PROPERTY CHECKS PASSED")
    return not fails

# ------------------------------------------------------------------ outfit recommender (TDD section 6)
TORSO_LADDER = [
    ["tank_top"], ["t_shirt"], ["long_sleeve"], ["t_shirt", "hoodie"], ["long_sleeve", "light_jacket"],
    ["long_sleeve", "sweater", "light_jacket"], ["thermal_top", "long_sleeve", "winter_coat"],
    ["thermal_top", "sweater", "winter_coat"],
]
LEGS_LADDER = [["shorts"], ["jeans"], ["thermal_bottoms", "jeans"], ["thermal_bottoms", "snow_pants"]]
COMFORT_LOW, COMFORT_HIGH = 18.0, 26.0   # recommender target: people prefer slightly cool to overdressed
COLD_ZONE = ("cold", "freezing", "numb")

ACCESSORY_SETS = [[], ["gloves", "toque"], ["gloves", "toque", "scarf"]]
# social-norm eligibility (people don't wear a toque at 15 C even if it would "help")
ELIGIBLE_MAX_T = {"gloves": 8.0, "toque": 8.0, "scarf": 2.0, "winter_coat": 10.0, "snow_pants": -5.0, "thermal_bottoms": 5.0, "thermal_top": 8.0}
ELIGIBLE_MIN_T = {"tank_top": 25.0, "shorts": 21.0}

def eligible(o, t):
    return all(t <= ELIGIBLE_MAX_T.get(g, 99) and t >= ELIGIBLE_MIN_T.get(g, -99) for g in o)

def recommend(w: Weather, ctx: Context = Context()) -> dict:
    """Cheapest outfit (TDD 6.1) that reaches COMFORT_LOW with no cold zone.
    cost = torso level + 0.5 per accessory; legs/feet are fixed up per candidate. <= 24 candidates."""
    winter_feet = w.t_air <= 0 or w.snow_depth_m > 0.01
    rain = ["rain_shell"] if w.precip_mm_h >= 0.5 and not ctx.umbrella else []
    candidates = []
    for t_lvl, torso in enumerate(TORSO_LADDER):
        for acc in ACCESSORY_SETS:
            legs_lvl = 0 if w.t_air >= ELIGIBLE_MIN_T["shorts"] else 1
            feet = ["wool_socks", "winter_boots"] if winter_feet else ["socks", "sneakers"]
            while True:
                o = torso + LEGS_LADDER[legs_lvl] + feet + acc + rain
                r = evaluate(w, o, ctx)
                zs = {z: v["state"] for z, v in r["zones"].items()}
                if zs["legs"] in COLD_ZONE and legs_lvl < len(LEGS_LADDER) - 1 and eligible(LEGS_LADDER[legs_lvl + 1], w.t_air):
                    legs_lvl += 1; continue
                if zs["feet"] in COLD_ZONE and "winter_boots" not in feet:
                    feet = ["wool_socks", "winter_boots"]; continue
                break
            ok = r["perceived"] >= COMFORT_LOW and not any(s in COLD_ZONE for s in zs.values()) \
                 and zs["hands"] != "cool" and zs["head"] != "cool"
            if eligible(o, w.t_air):
                candidates.append((t_lvl + 0.5 * len(acc) + 0.25 * legs_lvl, ok, t_lvl, o, r))
    if not candidates:   # nothing socially eligible (e.g. extreme heat edge cases): evaluate the lightest kit
        o = TORSO_LADDER[0] + LEGS_LADDER[0] + ["socks", "sneakers"]
        candidates.append((0, False, 0, o, evaluate(w, o, ctx)))
    good = [c for c in candidates if c[1]]
    cost, ok, t_lvl, o, r = min(good, key=lambda c: c[0]) if good else max(candidates, key=lambda c: c[4]["perceived"])
    return {"level": t_lvl, "outfit": o, "perceived": r["perceived"], "state": r["state"], "met_target": ok,
            "cold_zones": [z for z, v in r["zones"].items() if v["state"] in COLD_ZONE],
            "advice": (["umbrella"] if w.precip_mm_h >= 0.5 else [])
                      + (["sun_protection"] if w.ghi >= 500 else [])
                      + (["seek_shade_hydrate"] if r["perceived"] >= 29 else [])
                      + (["limit_exposure"] if not ok or r["flags"] else [])}

if __name__ == "__main__":
    if "--checks" in sys.argv:
        sys.exit(0 if checks() else 1)
    if "--golden" in sys.argv:
        data = {"engine_version": ENGINE_VERSION,
                "reference_table": REF_TABLE,
                "cases": [{"id": cid, "description": d, "input": {"weather": asdict(w), "outfit": o, "context": asdict(c)},
                           "expected": evaluate(w, o, c)} for cid, d, w, o, c in CASES],
                "grid": golden_grid(),
                "recommend": [{"input": {"weather": asdict(wx), "context": asdict(cx)}, "expected": recommend(wx, cx)}
                              for wx, cx in [(Weather(t, rh, wind, **sun), Context(activity=act))
                                             for t in range(-30, 41, 5) for rh in (40, 85) for wind in (5, 25)
                                             for sun in ({}, SUN_HIGH) for act in ("standing", "walking")]]}
        with open("golden_vectors.json", "w") as f:
            json.dump(data, f, separators=(",", ":"))
        print(f"wrote {len(data['cases'])} cases + {len(data['grid'])} grid vectors + {len(data['recommend'])} recommender vectors")
        sys.exit(0)
    if "--bands" in sys.argv:
        for act in ("standing", "walking"):
            print(f"\n{act}: 60% RH, 10 km/h, overcast daylight")
            for t in range(-30, 36, 5):
                rec = recommend(Weather(t, 60, 10, ghi=150, dhi=150, sun_alt=30), Context(activity=act))
                print(f"  {t:4}C  L{rec['level']}  {rec['perceived']:5.1f} {rec['state']:<11} {', '.join(rec['outfit'])}"
                      + (f"   cold: {rec['cold_zones']}" if rec['cold_zones'] else ""))
        sys.exit(0)
    for cid, d, w, o, c in CASES:
        r = evaluate(w, o, c)
        zs = "  ".join(f"{z} {v['t_felt']:.0f} {v['state']}" for z, v in r["zones"].items())
        print(f"{cid:4} {d}\n     perceived {r['perceived']:6.1f} [{r['state']}]  load {r['load_w_m2']:7.1f}  w_req {r['required_wettedness']:.2f}"
              f"  clo {r['clo_total']:.2f}/{r['clo_effective']:.2f}  Tmrt {r['t_mrt']:.1f}  humidex {r['humidex']}  windchill {r['wind_chill']}  {r['flags']}\n     {zs}")

