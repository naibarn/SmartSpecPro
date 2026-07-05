# UI/UX Planning Contract

Use this reference whenever a task changes user-facing UI, flows, visual design,
responsive behavior, accessibility, component states, or in-product help surfaces.
It is the bridge between orchestra routing, visual UI agents, deep-plan,
deep-plan-quick, and deep-implement.

## Required Planning Fields

Every UI-affecting plan or Task Packet must include these fields, either directly in the
plan section or by referencing an artifact that contains them.

| Field | Required content |
|---|---|
| Target user / JTBD | Primary role, user goal, entry point, and success outcome |
| Existing pattern reference | Already-working equivalent flow(s)/component(s) elsewhere in the codebase that solve the same or a similar problem, and a reuse-or-diverge decision (see below) |
| Surface inventory | Routes, pages, dialogs, forms, tables, cards, and navigation affected |
| Component map | Components to create/modify, ownership boundaries, props/API contracts |
| State matrix | Loading, empty, error, success, partial success, disabled, selected, hover, focus |
| Responsive matrix | Mobile, tablet, laptop, desktop behavior and overflow strategy |
| Accessibility acceptance | Keyboard path, focus order, labels, semantics, contrast, reduced motion |
| Visual direction | Density, hierarchy, typography, token strategy, surfaces, motion restraint |
| Copy contract | User-facing copy tone, required Thai/English text, validation/error copy |
| Browser evidence required | Screenshot/E2E/manual evidence from `ui-browser-verification.md` |

If a field is not applicable, write `N/A` with a short reason. Do not omit the field.

## Existing Pattern Reference — MANDATORY Before Drafting New UI

Before writing any new UI/UX design or redesign, search the existing product for a surface
that already solves the same or a closely related interaction problem. Skipping this step is
the single most common cause of wasted rework: a plan that looks complete but ships a UI that
ignores a pattern users (and the rest of the product) already rely on.

**Search first, design second:**

1. If SocratiCode is active, run `codebase_search` for the interaction/feature keyword (e.g.
   "crop image upload", "drag and drop reorder", "multi-step wizard", "prompt preview panel")
   before opening the visual-ui-requirement-analyzer brief. Otherwise use targeted `rg`/grep
   across `apps/web/client/src/components/` and `apps/web/client/src/pages/`.
2. Identify any existing page/component implementing the same or a closely related flow
   (e.g. Media Studio / Storyboard's crop + drag-drop + prompt-preview pattern is the
   canonical reference for any new crop/upload/preview flow).
3. Record what was found — or explicitly record `None found` if a genuine search turned up
   nothing comparable. Do not leave this blank or skip silently.
4. Make an explicit **reuse-or-diverge decision**:
   - **Default: reuse.** Copy the existing component structure, interaction model, and state
     handling rather than inventing a new one.
   - **Diverge only with a stated reason** (e.g. the existing pattern doesn't support a
     required state, a UX reviewer finding requires a different flow). Record the reason in
     the plan/section file so it can be checked against later.
5. If deep-plan/deep-plan-quick was auto-chained for this task, this search happens **before**
   the first section is drafted, not after — a section-writer sub-agent should be told which
   existing pattern to follow (or told "no existing pattern, design fresh") in its Task Packet
   CONTEXT, not left to guess.

This step is required for `small` scope UI edits too, not just `medium`+ — a single-file
redesign that ignores an existing pattern is exactly the kind of "technically complete but
misses the point" result this check exists to prevent.

## Canonical Viewport Policy

Use the same viewport labels across UI plans, browser evidence, responsive review, and visual
regression reports.

| Tier | Label | Size | When required |
|---|---|---:|---|
| Required | mobile | 390x844 | All route-level UI, async UI, responsive, accessibility, or visual-polish work |
| Required | tablet | 768x1024 | All route-level UI, async UI, responsive, accessibility, or visual-polish work |
| Required | desktop | 1440x900 | All route-level UI, async UI, responsive, accessibility, or visual-polish work |
| Extended | small-mobile | 360x800 | Dense layouts, sidebars, tables, or mobile-first risk |
| Extended | laptop | 1024x768 | Multi-panel layouts, navigation changes, or tablet/laptop boundary risk |
| Extended | wide-desktop | 1280x800 | Data-dense dashboards, tables, canvases, or wide desktop regressions |

Do not silently substitute viewport labels. If a product-specific viewport is more relevant,
record the substitution and reason in browser evidence.

## Visual UI Agent Chain

For medium+ UI work, use this default chain:

0. Conductor (or `visual-ui-requirement-analyzer` as its first action) performs the
   **Existing Pattern Reference** search above and records the result before anything
   downstream is drafted.
1. `visual-ui-requirement-analyzer` creates the UI Enhancement Brief, including the existing
   pattern reference and reuse-or-diverge decision from step 0.
2. `visual-ui-direction` chooses the visual direction and token strategy, treating the
   reused pattern's existing tokens/components as the default rather than proposing new ones.
3. `frontend` or `ui-builder` implements, using the routing rule below.
4. `visual-ux-reviewer`, `accessibility-reviewer`, and `responsive-reviewer` review in
   one read-only wave when practical. `visual-ux-reviewer` must also check the shipped UI
   against the recorded existing-pattern decision — flag it if the implementation silently
   diverged from a "reuse" decision.
5. `visual-final-refactor` applies consolidated safe fixes only when review findings need
   code changes.

## Frontend vs UI Builder Routing

Use `frontend` when the primary work is behavior or application wiring:

- routing, hooks, TanStack Query, tRPC consumers, auth-aware client behavior
- new page/component behavior that depends on server contracts
- tests for component logic or data-flow behavior

Use `ui-builder` when the primary work is visual/product UI polish:

- hierarchy, layout, Tailwind/shadcn composition, semantic tokens
- loading/empty/error/disabled/hover/focus state design
- dark/light readability, responsive refinements, visual consistency

Do not dispatch `frontend` and `ui-builder` as parallel writers for the same file. If both
are needed, split the work:

1. `frontend` implements behavior and stable props/contracts.
2. `ui-builder` polishes the same files in a later wave.
3. reviewers inspect after the final writer wave.

## Section Template

Add this block to any UI-affecting section file:

```markdown
## UI/UX Contract

### Target User / JTBD
- Role:
- Goal:
- Entry point:
- Success outcome:

### Existing Pattern Reference
- Searched (SocratiCode/rg query used):
- Found pattern(s): (file paths, or `None found` with search evidence)
- Decision: reuse | diverge
- Reason (required if diverge):

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading |  |  |
| empty |  |  |
| error |  |  |
| success |  |  |
| disabled/focus/hover |  |  |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 |  |  |
| tablet 768x1024 |  |  |
| desktop 1440x900 |  |  |
| small-mobile 360x800 (extended if risky) |  |  |
| laptop 1024x768 (extended if risky) |  |  |
| wide-desktop 1280x800 (extended if risky) |  |  |

### Accessibility Acceptance
- Keyboard path:
- Focus visibility:
- Labels/semantics:
- Contrast:
- Reduced motion:

### Copy Contract
- Tone:
- Primary language(s):
- Required labels:
- Validation/error copy:
- Empty/loading/success copy:
- Localization/fallback notes:

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md`.
```

## Completion Rule

A UI section is not complete until every relevant UI/UX contract field is either verified
or explicitly logged as skipped with a reason. Missing browser tooling is a skip, not a
pass.

The **Existing Pattern Reference** field may never be silently skipped: it must contain
either a found reference + reuse/diverge decision, or an explicit `None found` with the
search query/paths checked. A plan missing this field is incomplete regardless of scope.
