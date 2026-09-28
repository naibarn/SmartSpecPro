# Decision log

- 2026-08-30: Use a new skill instead of expanding the generic Special Tie-in
  planner. This keeps product intelligence, story ideation, and media rendering
  boundaries separate.
- 2026-08-30: Generate exactly three cards per run and persist all cards.
- 2026-08-30: Let the skill choose `review` versus `tie_in_solution` by default,
  with an optional forced mode for future UI control.
- 2026-08-30: A selected idea hydrates the existing Special Tie-in dialog; it
  does not create a paid render automatically.
- 2026-08-30: Missing looks/scenes become additive pending requests. No existing
  Character DNA, look, visual state, or approved scene is auto-rewritten.
- 2026-08-30: Quick-plan is promoted to a cross-domain standard implementation
  plan because the work spans skill, runtime/API, schema, managed media, and UI.
