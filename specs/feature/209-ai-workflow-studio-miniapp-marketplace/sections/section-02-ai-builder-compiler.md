# Section 02 — AI Builder and Compiler

Implement natural-language intent → bounded execution options → candidate graph
→ static/policy/schema/cost validation → diff/accept. Inspect authorized Runner,
tool and Skill readiness; show ready/setup-required/unavailable with actionable
reasons. Persist only after acceptance and never persist transient runtime IDs.
Tests cover invalid graph/option, readiness states, deterministic validation,
diff and idempotent acceptance.

## UI/UX Contract

### Target User / JTBD
Users describe a workflow, compare options and accept a safe plan.
### Surface Inventory
Builder prompt, execution-option preview, readiness badges and change preview.
### Component Map
Prompt owns intent; option list owns readiness; diff owns acceptance.
### State Matrix
Empty, generating, ready, setup-required, unavailable, validation error and accepted.
### Responsive Matrix
Desktop option panel, tablet sheet, mobile stacked cards.
### Accessibility Acceptance
Prompt label, keyboard option selection, status text and visible focus.
### Copy Contract
Localized recommendation, user choice, setup and denial copy.
### Browser Evidence Required
Verify option preview/acceptance at 1440x900, 768x1024 and 390x844.
