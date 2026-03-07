# OEE Formula Quick Reference Card

## Variables (Tile Counts)

```text
A  = PRESS_THEORETICAL_RATE × elapsed_minutes     (theoretical press output)
B  = KILN_THEORETICAL_RATE × elapsed_minutes      (theoretical kiln output)
C_in = tiles spawned at press                      (press input)
C  = tiles exiting press (scrapped_here=false)     (press output)
D  = tiles exiting dryer (scrapped_here=false)
E  = tiles exiting glaze (scrapped_here=false)
F  = tiles exiting digital (scrapped_here=false)
G  = tiles reaching kiln (any kiln snapshot)       (kiln input = conveyor output)
G' = tiles transiting conveyor WITHOUT jam damage  (conveyor clean output)
H  = tiles exiting kiln (scrapped_here=false)
I  = totalFirstQuality + totalSecondQuality        (sorting usable output)
J  = tiles exiting packaging (scrapped_here=false) (final output)
```

## 8 Machine OEEs

```text
┌───────────┬──────────────┬──────────────┬─────────────────────┐
│ Machine   │ P            │ Q            │ MOEE = P × Q        │
├───────────┼──────────────┼──────────────┼─────────────────────┤
│ Press     │ C_in / A     │ C / C_in     │ → C / A             │
│ Dryer     │ D / A        │ D / C        │ → (D/A)(D/C)        │
│ Glaze     │ E / A        │ E / D        │ → (E/A)(E/D)        │
│ Digital   │ F / A        │ F / E        │ → (F/A)(F/E)        │
│ Conveyor  │ 1.0          │ G' / F       │ → G' / F            │
│ Kiln      │ G / B        │ H / G        │ → (G/B)(H/G)        │
│ Sorting   │ H / B        │ I / H        │ → (H/B)(I/H)        │
│ Packaging │ I / B        │ J / I        │ → (I/B)(J/I)        │
└───────────┴──────────────┴──────────────┴─────────────────────┘
```

## 3 Line OEEs (Telescoped)

```text
Line 1 (Press→Dryer→Glaze→Digital):    LOEE₁ = F / A
Line 2 (Kiln→Sorting→Packaging):       LOEE₂ = J / B
Line 3 (Conveyor):                     LOEE₃ = G' / F
```

## Factory OEE (Bottleneck-Anchored)

```text
FOEE = J / min(A, B)

Typically B < A (kiln bottleneck), so FOEE = J / B = LOEE₂
```

## Scrap Paths

```text
Path A: Tile scrapped AND removed from conveyor at station
        → scrapped_here = true
        → NOT counted in station OUTPUT → reduces Q at that station
        → never reaches next station → reduces next station's INPUT

Path B: Tile defective but stays on conveyor
        → scrapped_here = false, defect_detected = true
        → COUNTED in station OUTPUT (tile survived)
        → graded as scrap at Sorting → reduces Sorting Q (I/H)
```

## Energy Per OEE Level

```text
Machine:  kWh/tile = cumulative_station_kWh / tiles_processed_at_station
Line:     kWh/tile = Σ(station kWh in line) / line_output_tiles
Factory:  kWh/tile = Σ(all station kWh) / J
```
