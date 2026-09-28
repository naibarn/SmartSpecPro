# Audit round 03 — workflow ordering and time map

- Checked subtitle-first ordering, dependency rejection, dead-air/manual range collapse, stable camera hold, body-only fusion, and condensation proposals.
- Focused Web shared tests passed; worker stage pure smoke passed.
- Finding: stage editor gap found during this round; requested stages were hard-coded.
- Action: added `SPEAKER_AWARE_STAGE_DEFINITIONS`, enable/disable/reorder controls, dependency warnings, and required manual review gate.
