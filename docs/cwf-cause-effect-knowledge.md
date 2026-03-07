# Virtual Factory — Machine Parameter Cause & Effect Knowledge Base

## Overview

This document describes the cause-and-effect relationships between machine operating parameters and tile defects in the Virtual Factory ceramic tile production line. When a parameter deviates outside its **safe operating range**, specific defect types are triggered, affecting tile quality grades (First Quality, Second Quality, or Scrap) and factory KPIs (OEE, FTQ, Scrap Rate, Energy).

The production line has **7 stations** with **45 monitored parameters**. Each parameter has a defined normal range — deviations outside this range can cause defects.

---

## Defect Classification

Defects fall into two categories:

### Scrap (Tile Discarded)

Structural/irreversible damage — tile is unusable and must be discarded:

- **crack_press** — Fracture during pressing (insufficient pressure or excessive moisture)
- **lamination** — Layer separation within the tile body
- **explosion_dry** — Tile shatters during rapid drying (steam pressure buildup)
- **crack_kiln** — Fracture during firing from thermal stress
- **thermal_shock_crack** — Crack from excessively rapid heating or cooling
- **crush_damage** — Tile crushed during packaging (low wrap tension or overloading)
- **conveyor_jam_damage** — Physical damage from a conveyor belt jam event

### Second Quality (Tile Downgraded)

Cosmetic or functional impairments — tile is usable but not first quality. Any defect NOT in the scrap list above is classified as second quality (e.g., color variance, pinholes, blur, edge buildup).

### Sorting Station Auto-Scrap

The Sorting station's dimensional scanner automatically scraps tiles with these detectable warp/size defects:

- **warp_kiln** — Warped from uneven kiln cooling
- **warp_dry** — Warped from uneven dryer airflow
- **size_variance_kiln** — Dimensions outside tolerance (kiln issue)
- **dimension_variance** — Dimensions outside tolerance (press issue)

---

## Station 1: PRESS (Hydraulic Press)

Forms raw ceramic powder into green (unfired) tiles.

| Parameter                 | Optimal Value | Safe Range | What Happens When Out of Range                       |             Defect Types             |  KPIs Affected  |
| ------------------------- | :-----------: | :--------: | ---------------------------------------------------- | :----------------------------------: | :-------------: |
| **Pressure** (bar)        |      365      |  280–450   | Insufficient compaction → low tile density, cracking |    crack_press, density_variance     | OEE, FTQ, Scrap |
| **Cycle Time** (sec)      |       6       |    4–8     | Irregular compaction → thickness variance            | density_variance, dimension_variance |    OEE, FTQ     |
| **Mold Temperature** (°C) |      50       |   40–60    | Mold adhesion → surface roughness, sticking          |    surface_defect, mold_sticking     |   FTQ, Scrap    |
| **Powder Moisture** (%)   |       6       |    5–7     | Excess moisture → steam explosion, cracking          |       crack_press, lamination        | FTQ, Scrap, OEE |
| **Fill Amount** (g)       |     1650      |  800–2500  | Weight/dimensional deviation → unbalanced tile       | dimension_variance, density_variance |   FTQ, Scrap    |
| **Mold Wear** (%)         |       0       |    0–30    | Worn mold → edge defects, size deviation             |   edge_defect, dimension_variance    |   FTQ, Scrap    |

### Press — Key Insight

The most critical press parameter is **Pressure**. Too low → tiles crack under handling (scrap). Too high → over-compacted body causes firing issues downstream. **Powder Moisture** is equally dangerous — excess moisture creates steam pockets that literally explode tiles during drying.

---

## Station 2: DRYER (Horizontal Dryer)

Removes residual moisture from green tiles using hot air circulation.

| Parameter                   | Optimal Value | Safe Range | What Happens When Out of Range                             |           Defect Types           |      KPIs Affected      |
| --------------------------- | :-----------: | :--------: | ---------------------------------------------------------- | :------------------------------: | :---------------------: |
| **Inlet Temperature** (°C)  |      200      |  150–250   | Excess heat → drying explosion, surface cracks             | explosion_dry, surface_crack_dry | OEE, FTQ, Scrap, Energy |
| **Outlet Temperature** (°C) |      100      |   80–120   | Uneven drying profile → internal stress                    |   warp_dry, surface_crack_dry    |       FTQ, Scrap        |
| **Belt Speed** (m/min)      |       3       |    1–5     | Drying time deviation → uneven moisture profile            |   warp_dry, surface_crack_dry    |    OEE, FTQ, Energy     |
| **Drying Time** (min)       |      45       |   30–60    | Under/over-drying → internal stress buildup                |     warp_dry, explosion_dry      |   FTQ, Scrap, Energy    |
| **Exit Moisture** (%)       |      1.0      |  0.5–1.5   | High residual moisture → impairs glaze adhesion downstream |    pinhole_glaze, glaze_peel     |       FTQ, Scrap        |
| **Fan Frequency** (Hz)      |      40       |   30–50    | Insufficient air circulation → uneven drying               |   warp_dry, moisture_variance    |       FTQ, Scrap        |

### Dryer — Key Insight

The dryer is a major **energy consumer**. Inlet temperature deviations affect both energy costs AND quality. Too hot → tiles explode (explosion_dry = scrap). The **Exit Moisture** parameter has a downstream cascade effect — if tiles leave the dryer too wet, the glaze station produces pinholes and peeling.

---

## Station 3: GLAZE (Glaze Application)

Sprays ceramic glaze coating onto dried tiles.

| Parameter                     | Optimal Value | Safe Range | What Happens When Out of Range                     |                 Defect Types                  |  KPIs Affected  |
| ----------------------------- | :-----------: | :--------: | -------------------------------------------------- | :-------------------------------------------: | :-------------: |
| **Glaze Density** (g/cm³)     |     1.45      | 1.35–1.55  | Insufficient glaze layer → color inconsistency     |      color_tone_variance, pinhole_glaze       |   FTQ, Scrap    |
| **Viscosity** (sec)           |      26       |   18–35    | Glaze dripping or uneven coating                   |     glaze_drip, glaze_thickness_variance      | FTQ, Scrap, OEE |
| **Application Weight** (g/m²) |      450      |  300–600   | Glaze thickness deviation → pinholes, color issues |      pinhole_glaze, color_tone_variance       |   FTQ, Scrap    |
| **Cabin Pressure** (bar)      |     0.75      |  0.3–1.2   | Spray pressure imbalance → uneven distribution     |    glaze_thickness_variance, pinhole_glaze    |   FTQ, Scrap    |
| **Nozzle Angle** (°)          |      30       |   15–45    | Spray distribution disrupted → edge buildup        |        edge_buildup, line_defect_glaze        |   FTQ, Scrap    |
| **Belt Speed** (m/min)        |      25       |   15–35    | Application time deviation → thickness imbalance   | glaze_thickness_variance, color_tone_variance |    OEE, FTQ     |
| **Glaze Temperature** (°C)    |      25       |   20–30    | Heat alters viscosity → coating quality drops      |        glaze_drip, color_tone_variance        |       FTQ       |

### Glaze — Key Insight

Glaze defects like **pinhole_glaze** and **color_tone_variance** are typically second quality (cosmetic). However, they cascade: tiles with uneven glaze develop more pronounced issues during kiln firing. Monitor **Viscosity** closely — it's the root cause of most glaze defects.

---

## Station 4: DIGITAL PRINTER (Inkjet Decoration)

Applies decoration patterns via piezoelectric inkjet heads.

| Parameter                 | Optimal Value | Safe Range | What Happens When Out of Range                    |              Defect Types              | KPIs Affected |
| ------------------------- | :-----------: | :--------: | ------------------------------------------------- | :------------------------------------: | :-----------: |
| **Head Temperature** (°C) |      40       |   35–45    | Ink evaporation → nozzle clogging                 |     line_defect_print, white_spot      |  FTQ, Scrap   |
| **Ink Viscosity** (mPa·s) |     11.5      |    8–15    | Ink spray uneven → white spots                    |     white_spot, line_defect_print      |  FTQ, Scrap   |
| **Drop Size** (pL)        |      43       |    6–80    | Resolution loss → color saturation deviation      |       blur, saturation_variance        |      FTQ      |
| **Resolution** (dpi)      |      540      |  360–720   | Blurry patterns and banding artifacts             |             blur, banding              |      FTQ      |
| **Belt Speed** (m/min)    |      32       |   20–45    | Print stretching/compression → pattern distortion | pattern_distortion, dimension_variance |   OEE, FTQ    |
| **Head Gap** (mm)         |     2.75      |  1.5–4.0   | Wide gap reduces print sharpness                  |       blur, saturation_variance        |      FTQ      |
| **Active Nozzles** (%)    |      98       |   95–100   | Print lines and white spots appear                |     line_defect_print, white_spot      |  FTQ, Scrap   |

### Printer — Key Insight

Most printer defects are cosmetic (second quality), not scrap. The exception: **Active Nozzles** dropping below 95% creates visible line defects that may be visually unacceptable. **Head Temperature** is critical — too high evaporates ink in the nozzles, causing permanent clogging.

---

## Station 5: KILN (Roller Kiln)

Fires glazed tiles at high temperature to vitrify the ceramic body.

| Parameter                      | Optimal Value |  Safe Range  | What Happens When Out of Range                 |           Defect Types            |  KPIs Affected  |
| ------------------------------ | :-----------: | :----------: | ---------------------------------------------- | :-------------------------------: | :-------------: |
| **Max Temperature** (°C)       |     1160      |  1100–1220   | Thermal stress cracks, under-firing, warping   | crack_kiln, color_fade, warp_kiln | OEE, FTQ, Scrap |
| **Firing Time** (min)          |      47       |    35–60     | Dimensional and strength variance              |   size_variance_kiln, warp_kiln   |   FTQ, Scrap    |
| **Preheat Gradient** (°C/min)  |      27       |    15–40     | Rapid preheating → thermal shock cracks        |  thermal_shock_crack, crack_kiln  |   FTQ, Scrap    |
| **Cooling Gradient** (°C/min)  |      35       |    20–50     | Thermal shock cracks and warping               |  thermal_shock_crack, warp_kiln   | OEE, FTQ, Scrap |
| **Belt Speed** (m/min)         |       2       |     1–3      | Prolonged/short heat exposure → size deviation |   size_variance_kiln, warp_kiln   |   OEE, Energy   |
| **Atmosphere Pressure** (mbar) |       0       | -0.5 to +0.5 | Gas escape blocked → pinhole formation         |           pinhole_kiln            |   FTQ, Scrap    |
| **O₂ Level** (%)               |       5       |     2–8      | Insufficient oxidation → color degradation     |     color_fade, pinhole_kiln      |   FTQ, Scrap    |

### Kiln — Key Insight

The kiln is the **highest-risk station** for scrap. It produces the most destructive defect types: **crack_kiln** (structural fracture = scrap), **thermal_shock_crack** (scrap), and **warp_kiln** (auto-scrapped at sorting). The **Preheat** and **Cooling Gradients** together control thermal shock — both must stay within range. The kiln is also the **largest energy consumer** in the factory.

---

## Station 6: SORTING (Quality Inspection)

Machine vision inspection and automatic grading of fired tiles.

| Parameter                   | Optimal Value | Safe Range | What Happens When Out of Range              |          Defect Types           | KPIs Affected |
| --------------------------- | :-----------: | :--------: | ------------------------------------------- | :-----------------------------: | :-----------: |
| **Camera Resolution** (MP)  |      12       |    5–20    | Low resolution misses small defects         |    missed_defect, false_pass    |      FTQ      |
| **Scan Rate** (tiles/min)   |      40       |   20–60    | Speed deviation reduces inspection accuracy |    missed_defect, false_pass    |   OEE, FTQ    |
| **Size Tolerance** (mm)     |      0.5      |  0.3–1.0   | Loose tolerance passes oversized tiles      | dimension_variance, false_pass  |      FTQ      |
| **Color Tolerance** (ΔE)    |      1.0      |  0.5–2.0   | Loose tolerance passes discolored tiles     | color_tone_variance, false_pass |      FTQ      |
| **Flatness Tolerance** (mm) |      0.3      |  0.1–0.5   | Loose tolerance passes warped tiles         |      warp_pass, false_pass      |      FTQ      |
| **Defect Threshold** (mm²)  |      1.5      |  0.5–3.0   | High threshold allows small defects to pass |    missed_defect, false_pass    |      FTQ      |

### Sorting — Key Insight

Sorting doesn't CREATE defects — it DETECTS them. When sorting parameters deviate, the consequence is **false_pass**: defective tiles pass through to packaging and reach the customer. This is a quality gate failure. The sorting station also automatically scraps tiles with warp_kiln, warp_dry, size_variance_kiln, and dimension_variance defects.

---

## Station 7: PACKAGING (Palletizing & Wrapping)

Stacks, boxes, palletizes, and shrink-wraps finished tiles.

| Parameter                    | Optimal Value | Safe Range | What Happens When Out of Range                        |         Defect Types         | KPIs Affected |
| ---------------------------- | :-----------: | :--------: | ----------------------------------------------------- | :--------------------------: | :-----------: |
| **Tiles/Box**                |       8       |    4–12    | Package instability → handling damage                 |      chip, crush_damage      |  Scrap, OEE   |
| **Seal Pressure** (bar)      |      3.5      |    2–5     | Weak seal → transport damage                          |    chip, edge_crack_pack     |     Scrap     |
| **Pallet Capacity** (m²)     |      60       |   40–80    | Overloading → pallet crushing, tile damage            |      crush_damage, chip      |     Scrap     |
| **Wrap Tension** (%)         |      225      |  150–300   | Loose wrap → pallet instability                       |      crush_damage, chip      |     Scrap     |
| **Robot Speed** (cycles/min) |      10       |    6–15    | Speed deviation → placement errors, collision         |    chip, edge_crack_pack     |  OEE, Scrap   |
| **Label Accuracy** (%)       |     99.5      |   99–100   | Label errors → traceability loss, customer complaints | mislabel, customer_complaint |      FTQ      |

### Packaging — Key Insight

Packaging defects like **crush_damage** are scrap-worthy — a crushed tile cannot be recovered. **Wrap Tension** is the most impactful parameter: too loose → pallets shift during transport → mass tile damage. **Label Accuracy** doesn't damage tiles but creates serious traceability issues.

---

## Alarm Thresholds

The factory triggers alarms when KPIs breach these thresholds:

- **OEE Alert** (Critical): Factory OEE drops below **60%**
- **FTQ Alert** (Warning): First Time Quality drops below **85%**
- **Scrap Alert** (Warning): Scrap rate exceeds **15%**
- **Energy Alert** (Warning): Energy consumption exceeds **18 kWh per tick**

---

## Cross-Station Cascade Effects

Some defects cascade across stations:

1. **Press → Dryer**: High powder moisture at press creates tiles with excessive internal water → these tiles are more likely to explode in the dryer (explosion_dry)
2. **Dryer → Glaze**: High exit moisture from dryer → glaze fails to bond properly → pinholes and peeling at glaze station
3. **Dryer/Kiln → Sorting**: Warped tiles from dryer (warp_dry) or kiln (warp_kiln) are automatically detected and scrapped at sorting
4. **All Stations → Sorting**: Any visually detectable defect from upstream stations is caught at sorting — but only if sorting parameters are within range
5. **Sorting → Packaging**: If sorting tolerance is too loose (false_pass), defective tiles reach packaging and are shipped to customers

---

## Summary Statistics

- **Total Stations**: 7 (Press, Dryer, Glaze, Printer, Kiln, Sorting, Packaging)
- **Total Parameters**: 45
- **Scrap Defect Types**: 7 (crack_press, lamination, explosion_dry, crack_kiln, thermal_shock_crack, crush_damage, conveyor_jam_damage)
- **Auto-Scrapped at Sorting**: 4 (warp_kiln, warp_dry, size_variance_kiln, dimension_variance)
- **Second Quality Defect Types**: All others (cosmetic/functional but not structural)
- **Default Scrap Probability**: 2% (configurable 0–3%)
- **Highest Risk Station**: Kiln (3 scrap-worthy defect types + 2 auto-scrapped)
- **Largest Energy Consumer**: Kiln, followed by Dryer
