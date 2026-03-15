## Planning Depth

- Chosen depth: `standard`

## Reason

- The task crosses multiple modules (`aiPresentationService`, layout engine, shared recipe bindings, tests)
- The behavior is user-visible and regression-prone
- Existing code already has strong targeted test coverage, so a compact TDD-oriented plan is enough without promoting to full `deep-plan`

