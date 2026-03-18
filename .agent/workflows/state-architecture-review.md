---
description: MANDATORY pre-implementation checklist for any state-related changes
---

# State Architecture Review — MUST READ BEFORE ANY CODE

## Rule 1: No Code Before Approval
- Investigate the problem thoroughly
- Write a clear proposal with architecture reasoning
- Get explicit user approval
- ONLY THEN implement

## Rule 2: Single Source of Truth Principle
Every function in the system has ONE designated source of truth. Before touching any code:

1. **Identify** which subsystem owns the state for this function
2. **Document** how all other subsystems sync from that source
3. **Never** create parallel local states that can drift out of sync
4. **Never** add band-aid "fallback" checks that mask architectural misalignment

### Known Sources of Truth

| Function | Source of Truth | Sync Mechanism |
|----------|----------------|----------------|
| Simulation state (running, tick, speed) | Client (browser) | Client writes to Supabase periodically |
| Copilot state (enabled, cwf_state, auth) | CWF / Supabase (`copilot_config`) | All client UI reads from Supabase via Realtime subscription |
| Session data | Supabase (`simulation_sessions`) | Client reads via `simulationDataStore` |
| Conveyor parameters | Client store (`simulationDataStore`) | Synced to Supabase by sync service |

## Rule 3: Pre-Implementation Questions
Before tackling ANY state mismatch problem, answer these explicitly:

1. Which subsystem is the source of truth for this state?
2. How do other systems currently sync with the source of truth?
3. Where exactly is the sync breaking down? (Show evidence)
4. Does my proposed fix maintain the single source of truth, or does it introduce a parallel state?

If you cannot answer all four, STOP and investigate further.
