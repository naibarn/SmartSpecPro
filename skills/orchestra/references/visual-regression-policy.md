# Visual Regression Policy

Use this reference when `visual-diff`, Playwright screenshots, or before/after visual QA is
requested or required by a UI gate.

## Required Artifact Set

For each changed route or major component state, collect:

- before screenshot, when available
- after screenshot
- viewport size
- route/state name
- diff result or manual comparison note
- accepted differences and rationale

## Default Viewports

Use the canonical viewport policy from `ui-browser-verification.md`:

| Tier | Viewport | Size |
|---|---|---:|
| Required | mobile | 390x844 |
| Required | tablet | 768x1024 |
| Required | desktop | 1440x900 |
| Extended | small-mobile | 360x800 |
| Extended | laptop | 1024x768 |
| Extended | wide-desktop | 1280x800 |

## Artifact Naming

Store or report screenshot artifacts with stable names:

```text
artifacts/ui/<surface-slug>/<state>-<viewport>-<before|after|diff>.png
```

Examples:

- `artifacts/ui/dashboard/loading-mobile-before.png`
- `artifacts/ui/dashboard/loading-mobile-after.png`
- `artifacts/ui/dashboard/loading-mobile-diff.png`

If Playwright or a visual-diff tool writes elsewhere, record its actual path in the report.

## Acceptance Policy

Fail the visual regression gate when:

- primary content or action disappears
- text overlaps, clips, or overflows unexpectedly
- layout shifts make the workflow unusable
- dark/light contrast becomes unreadable
- navigation, dialogs, forms, or tables break at a required viewport
- screenshot is blank or the target asset fails to render

Allow differences when:

- they are the intended visual change
- only timestamps, generated IDs, or non-user-visible noise changed
- animation frame differences are expected and documented

## Report Format

```markdown
## Visual Regression Evidence

| Surface | Viewport | Before | After | Result | Notes |
|---|---|---|---|---|---|
| /dashboard | 1440x900 | path | path | pass/fail |  |

Accepted differences:
-

Failures:
-

Skipped checks:
-
```

## Automation-Unavailable Fallback

If visual-diff, Playwright, or a browser cannot run:

1. Mark the affected visual regression rows as `skipped`.
2. Record why automation was unavailable and which command failed or was missing.
3. Add manual code/layout inspection notes.
4. Do not mark skipped visual regression as pass.
