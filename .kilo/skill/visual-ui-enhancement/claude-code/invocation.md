# Claude Code Invocation Guide

## Direct invocation

```text
/visual-ui-enhancement app/dashboard/page.tsx

Improve this UI with Tailwind CSS + shadcn/ui.
Make it premium, modern, responsive, accessible, dark-mode friendly, and production-ready.
```

## Automatic invocation

Claude Code may invoke the skill automatically when the task matches the skill description. Direct invocation is recommended for important UI work.

## Arguments

Text after `/visual-ui-enhancement` should be treated as target files, routes, or the UI task. Example:

```text
/visual-ui-enhancement components/billing/PricingTable.tsx

Make the pricing table feel more editorial and premium while preserving behavior.
```

## With optional subagents

```text
/visual-ui-enhancement app/dashboard/page.tsx

Use the installed Claude Code subagents if helpful:
- visual-ui-requirement-analyzer
- visual-ui-direction-agent
- shadcn-tailwind-builder
- visual-ux-reviewer
- visual-accessibility-reviewer
- visual-responsive-reviewer
- visual-final-refactor-agent

Wait for reviewer findings before applying final edits.
```
