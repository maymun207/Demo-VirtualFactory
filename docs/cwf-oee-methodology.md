# CWF OEE Methodology

## OEE Model: P × Q (No Availability Factor)

This factory uses a Performance × Quality OEE model. There is NO Availability (A) factor.

OEE is calculated ONLY during active production time. Manual stops (user clicking Stop/Start) are excluded from the calculation entirely.

## Why No Availability?

In a real factory, Availability = Planned Production Time – Downtime. But in this digital twin simulator:

- Manual stops are deliberate user actions (pausing to inspect data, adjust parameters, etc.)
- They do NOT represent machine breakdowns or unplanned downtime
- Including them would penalize OEE unfairly

## Formula

```
MOEE (Machine OEE) = P × Q
  where:
    P (Performance) = actual output / theoretical capacity
    Q (Quality)     = good output / total output (yield)
```

## Hierarchical OEE Structure

### 8 Machine OEEs

Line 1 (Forming & Finishing):

- Press: P = C/A, Q = C/C = 1 usually → MOEE = C/A
- Dryer: P = D²/AC, Q = D/D = 1 usually → MOEE = D²/AC
- Glaze: P = E²/AD, Q = E/E = 1 usually → MOEE = E²/AD
- Printer: P = F²/AE, Q = F/F = 1 usually → MOEE = F²/AE

Line 3 (Conveyor):

- Conveyor: yield only = G_clean / F — measures transit damage

Line 2 (Firing & Dispatch):

- Kiln: P = GH/BG, Q based on kiln output
- Sorting: P = HI/BH, Q based on sort yield
- Packaging: P = IJ/BI, Q based on packaging yield

### 3 Line OEEs (telescoped)

- Line 1 (Forming & Finishing): LOEE = F/A (printer output / press theoretical)
- Line 2 (Firing & Dispatch): LOEE = J/B (packaging output / kiln theoretical)
- Line 3 (Conveyor): LOEE = G_clean/F (clean transit yield)

### Factory OEE

FOEE = J / min(A, B) — anchored to the bottleneck

- A = Press theoretical capacity (12 tiles/min)
- B = Kiln theoretical capacity (8 tiles/min)
- Since B < A, kiln is typically the bottleneck → FOEE ≈ J/B

## Diagnostic Approach

When a user asks about OEE or why OEE dropped:

1. ALWAYS check `simulation_events` first for stop/start patterns
2. If manual stops occurred, note: "The simulation was paused X times. OEE reflects performance during active production time only."
3. Trace: FOEE → weakest LOEE → weakest MOEE → P vs Q
   - Low P = machine is slow, starved, or stopped frequently
   - Low Q = machine is creating defects or losing tiles
   - Conveyor Q < 1.0 = jam damage during transit
4. Check `parameter_change_events` for scenario-induced changes that may explain drops

## Energy Context

- Each machine has a kWh/tile efficiency metric
- Kiln dominates energy consumption (100 kWh base + 100 m³ gas, 80% idle factor)
- Factory energy = sum of all station energies
- Monitor kWh/tile trends to detect inefficiency
