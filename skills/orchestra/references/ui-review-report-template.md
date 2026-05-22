# UI Review Report Template

Use this template for `visual-ux-reviewer`, `accessibility-reviewer`,
`responsive-reviewer`, `visual-final-refactor`, and conductor post-completion UI reports.

```markdown
# UI Review Report

## Scope
- Route/surface:
- Files reviewed:
- User goal:
- Evidence reviewed:
- Evidence artifact paths:
- Skipped because:

## Verdict
- UX: PASS / FIXES_REQUIRED / BLOCKED
- Accessibility: PASS / FIXES_REQUIRED / BLOCKED / SKIPPED
- Responsive: PASS / FIXES_REQUIRED / BLOCKED / SKIPPED
- Browser evidence: PASS / PARTIAL / SKIPPED

## Findings
| Severity | Area | Finding | File/Surface | Recommended Fix |
|---|---|---|---|---|
| HIGH/MEDIUM/LOW | UX/a11y/responsive/state/visual |  |  |  |

## State Coverage
| State | Covered | Notes |
|---|---|---|
| loading | yes/no/n/a |  |
| empty | yes/no/n/a |  |
| error | yes/no/n/a |  |
| success | yes/no/n/a |  |
| disabled/focus/hover/selected | yes/no/n/a |  |

## Viewport Coverage
| Viewport | Result | Evidence |
|---|---|---|
| mobile 390x844 | pass/fail/skipped |  |
| tablet 768x1024 | pass/fail/skipped |  |
| desktop 1440x900 | pass/fail/skipped |  |
| small-mobile 360x800 (extended) | pass/fail/skipped |  |
| laptop 1024x768 (extended) | pass/fail/skipped |  |
| wide-desktop 1280x800 (extended) | pass/fail/skipped |  |

## Required Follow-Up
- [ ] Blocking fixes:
- [ ] Recommended fixes:
- [ ] Skipped checks and why:
```

Reports should be concise and evidence-based. Do not rewrite the UI in review output unless
the Task Packet explicitly assigned implementation.
