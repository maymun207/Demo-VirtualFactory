# CWF Domain Glossary

## Quality Tiers

This factory uses a TWO-tier quality classification system:

- **First Quality (1st)** — Tiles that pass ALL quality checks at the Sorting station. These are shipped to customers via the Packaging station.
- **Second Quality (2nd)** — Tiles that have minor defects detected by the Sorting station's machine vision. These are diverted to the Second Quality Box instead of being shipped. They can be sold at a discount through secondary channels.
- **Scrap** — Tiles with severe defects that cannot be sold. These are discarded at the station where the defect occurred or routed to the Recycle Bin.

IMPORTANT: There is NO "third quality" in this factory. If a user mentions "third quality," correct them: the system only classifies tiles as First Quality, Second Quality, or Scrap.

## Simulation States

- **Running** — Data flow is active, S-Clock ticking, P-Clock producing tiles, conveyor belt moving.
- **Stopped** — Simulation paused. No tiles move, no clocks tick.
- **Draining** — User clicked Stop while tiles were still on the belt. The conveyor keeps moving to let in-flight tiles finish their journey (ship, scrap, or sort), but NO new tiles are spawned. Once all tiles have exited, the simulation stops.
- **Force Stopped** — User double-clicked Stop during drain mode. Immediately halts everything; in-flight tiles may be abandoned.

## Manual Stop vs. Automatic Stop

- **Manual Stop** — The user clicked the Stop button. This is a deliberate pause and should NOT count as downtime in OEE.
- **Automatic Stop** — The simulation stopped because a work order was completed (target tile count reached). This is also NOT downtime — it means the production goal was met.
- **Jam Stop** — The conveyor stopped due to a detected jam at a station. This IS unplanned downtime and DOES affect OEE through the Performance factor.

## Conveyor Belt States

- **running** — Normal operation, tiles moving along the belt.
- **stopped** — Belt halted, tiles frozen.
- **jam_scrapping** (Phase 1) — A jam has been detected. The belt is still moving while tiles at the jammed station are being scrapped.
- **jammed** (Phase 2) — Scrapping complete. The belt has stopped. A maintenance worker is clearing the jam.

## Station Names

| Station   | Purpose                           | Key Parameters                    |
| --------- | --------------------------------- | --------------------------------- |
| Press     | Forms raw powder into green tiles | pressure_bar, cycle_time_sec      |
| Dryer     | Removes moisture from green tiles | inlet_temperature_c, belt_speed   |
| Glaze     | Applies ceramic glaze coating     | glaze_density, application_weight |
| Printer   | Digital inkjet decoration         | head_temperature, resolution_dpi  |
| Kiln      | High-temperature firing           | max_temperature_c, firing_time    |
| Sorting   | Machine vision quality inspection | camera_resolution, scan_rate      |
| Packaging | Palletizing and wrapping          | stack_count, robot_speed          |

## Clock System

- **S-Clock (System Clock)** — Ticks at a configurable interval (default 500ms). Drives the entire simulation.
- **P-Clock (Production Clock)** — Ticks every N S-Clock ticks (configurable via Station Interval slider). Each P-Clock tick spawns a new tile at the Press station.
- **Sim Tick** — The S-Clock counter value. Used as the time axis for all telemetry and events.
