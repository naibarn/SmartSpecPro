# Section 01 — Skill Contract

Own the new skill bundle and `verticalDramaShotSceneIntent.ts`.

Implement a versioned, bounded Zod contract with role sets, communication mode,
visual plan, per-line routing, reason codes, confidence, and review state. Keep
the skill instructions in the bundle; the service only assembles facts, validates
output, loads the skill, and performs safe projection. Never infer a character
from a prose mention in TypeScript.

Tests must cover every communication mode and reject unknown/overlapping refs.
