---
name: visual-diff
description: "Visual Regression Testing — screenshot comparison before and after changes. Use when user wants to check for visual regressions, compare UI changes, or verify CSS/layout changes didn't break anything."
---

## Codex Compatibility Notes

This is a Codex-adapted portable skill. Tool commands use local assets under `${CODEX_HOME:-$HOME/.codex}/skills/visual-diff/tools/`. Use Codex shell/file tools such as `exec_command`, `apply_patch`, `rg`, and targeted file reads instead of platform-specific tool names. Do not assume platform-specific slash commands or browser MCP tools exist.

External side effects such as deploys, pushes, tags, npm publishes, production smoke tests with credentials, or destructive fixes require explicit user confirmation immediately before execution. For read-only scans, proceed normally.

# Visual Regression Testing

Automated screenshot comparison using Playwright. Catch visual bugs before they ship.

## Process

### Phase 1: Determine Test Scope

Ask the user:
1. **What URL(s) to test?** (localhost, staging, or production)
2. **What changed?** (CSS update, component refactor, dependency upgrade, etc.)

If the user already described what changed, skip asking.

### Phase 2: Take "Before" Screenshots

If comparing against the current state (before making changes):

Use Playwright if available in this Codex environment, or run a local Playwright script/test command if the repo provides one:

1. Navigate to the URL:
   - Navigate to the target URL with Playwright or the repo's browser test tooling

2. Take full-page screenshot:
   - Capture a full-page screenshot using Playwright or the repo's screenshot command

3. Capture key viewports:
   - Desktop (1920x1080), tablet (768x1024), and mobile (375x812): resize the viewport and capture screenshots with the available browser tooling

4. Save screenshots with descriptive names noting they are "before" state.

### Phase 3: Make Changes

Let the user make their changes, or make them yourself if that's the task.

### Phase 4: Take "After" Screenshots

Repeat the same screenshot process for the same URLs and viewports.

### Phase 5: Visual Comparison

Compare before and after screenshots:

1. **Layout shifts** — did any elements move unexpectedly?
2. **Color changes** — did colors, gradients, or shadows change?
3. **Typography** — did font sizes, weights, or spacing change?
4. **Responsive issues** — does it look correct on all viewports?
5. **Missing elements** — did anything disappear?
6. **Overflow issues** — is content clipping or overflowing?

If browser snapshot tooling is unavailable, compare saved screenshots plus DOM/accessibility output from the project's Playwright tests or a targeted script.

### Phase 6: Report

Present findings in a clear format:

**No Visual Regressions Found:**
- "All pages look identical across desktop, tablet, and mobile viewports."

**Regressions Detected:**
For each regression:
- **Page:** URL where the issue appears
- **Viewport:** Which screen size is affected
- **What changed:** Description of the visual difference
- **Severity:** Critical (broken layout), High (noticeable shift), Medium (minor difference), Low (pixel-level)
- **Suggested fix:** How to resolve the regression

### Phase 7: Targeted Testing

For specific component changes, also test:
- Hover states, click interactions, and form states using Playwright or the repo's browser automation helpers
- Dark mode (if applicable)
- Loading states
- Error states
- Empty states

## Key Pages to Always Test

When the user doesn't specify pages, test these by default:
1. Homepage / Landing page (/)
2. Login/signup page (if exists)
3. Main app page (dashboard, etc.)
4. Any page the user recently modified

## Key Principle

**Trust screenshots, not assumptions.** CSS changes cascade unpredictably. A "small tweak" in one component can break layouts across the entire app. Always verify visually.

## Portable Browser Verification Contract

Use this section when visual verification needs to behave like a standalone reviewer or as a category in a larger scorecard.

### Inputs

- Explicit URL, dev server URL, or deployed URL.
- Optional list of routes and viewport sizes.
- Optional before/after screenshot directories for regression comparison.

### Required Checks

1. Resolve a URL from the user input, dev server output, or common local ports.
2. Capture desktop and mobile views for the homepage and important routes.
3. Record console errors, failed network requests, obvious layout overlap, blank screens, and visible framework error pages.
4. Compare before/after screenshots when both baselines are available.
5. If browser automation is unavailable, return `SKIP` with a reason instead of inventing visual results.

### JSON Report

Return this shape when participating in a larger scorecard:

```json
{
  "category": "visual",
  "result": "PASS",
  "routes_checked": [],
  "viewports": ["desktop", "mobile"],
  "findings": [
    {
      "severity": "high",
      "type": "blank_screen",
      "message": "The dashboard route rendered an empty viewport.",
      "evidence": "screenshot dashboard-mobile.png captured after network idle",
      "fix": "check route loader and client-side error boundary"
    }
  ],
  "skipped": []
}
```
