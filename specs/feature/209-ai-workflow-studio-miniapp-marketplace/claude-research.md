# Spec 209 Research

## Repository evidence

Targeted shell discovery was used because SocratiCode was unavailable. Current
code contains partial Feature 195/196/197/198/199/200/208 building blocks,
legacy workflow tables and Python workflow models, but no canonical Spec 209
Workflow Studio router/page/runtime. `/workflows` is retired and must not be
revived. Existing Marketplace and Skill pages are pattern references only.

The package contains three normative mockups:

- `mockups/01-main-builder-top-down.png`: left nav, breadcrumb/header, top-down
  canvas, right inspector and bottom run/debug drawer.
- `mockups/02-subflow-data-binding.png`: subflow breadcrumb, typed bindings,
  compatible source list, output preview and same inspector/drawer structure.
- `mockups/03-run-debug-mini-app.png`: separate Run experience with input form,
  run progress, step details, activity log, artifacts and latest preview.

These are the source of truth for hierarchy and interaction model. They are not
permission to invent a new dashboard/card composition.

## Technical decisions

- Use `@xyflow/react` already present in the workspace for graph presentation;
  the persisted semantic definition remains independent from view coordinates.
- Use existing tRPC/router/auth patterns, Drizzle schema and Feature 195 Job
  gateway. Do not copy legacy workflow execution tables into a new queue.
- Use typed schemas for node inputs/outputs/bindings and validate server-side.
- Use semantic tokens/existing shadcn-style primitives and the app's i18n
  namespaces. No raw visual redesign or unapproved reset.

## Testing

Use focused Vitest tests for services/routers/components, migration tests for
Drizzle changes, and Playwright/browser evidence for the builder, subflow and
Run surfaces when the app environment is available. Do not run repository-wide
TypeScript typecheck under `AGENTS.md`.

