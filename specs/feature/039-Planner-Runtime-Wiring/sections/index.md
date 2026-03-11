<!-- PROJECT_CONFIG
runtime: node-npm
test_command: cd apps/web && npx vitest run
END_PROJECT_CONFIG -->

# Spec 039 — Planner Runtime Wiring: Implementation Sections

<!-- SECTION_MANIFEST
section-01-planner-middleware-and-chat-wiring
section-02-skill-execution-and-structured-llm-wiring
section-03-artifact-routing-and-presentation-wiring
section-04-agency-escalation-and-telemetry
section-05-active-mode-cutover-and-cleanup
END_MANIFEST -->

## Dependencies

- Spec 037 (Task-First Execution Intelligence) — all 5 sections complete
- Database tables `task_runs` and `task_step_attempts` already migrated

## Implementation Order

Sections MUST be implemented in order:
1. **S01** creates the middleware — all other sections depend on it
2. **S02** wires skills (depends on middleware from S01)
3. **S03** wires artifact routing + presentations (depends on S01 middleware)
4. **S04** wires agency + telemetry (depends on S01 middleware)
5. **S05** removes shadow mode (depends on all prior sections being validated)
