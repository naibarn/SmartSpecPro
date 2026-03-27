---
name: audit_058_agency_creator_frontend
description: 2026-03-24 frontend security audit of feature-058 agency creator intelligence upgrade (AutoCreateAgencyModal, ImprovementSuggestionPanel, RunFeedbackCard, AgencyBuilder, AgencyChat)
type: project
---

CONDITIONAL PASS — no CRITICAL, 2 HIGH must be fixed before merge.

**Why:** Feature adds suggestions UI, template save dialog, and phase stepper to AutoCreateAgencyModal. All LLM-sourced content rendered as plain React text nodes (safe). All mutations via tRPC. Both routes wrapped in RequireAuth. No new localStorage token writes. No dangerouslySetInnerHTML.

**Findings:**
- FE01 HIGH: `AutoCreateAgencyModal.tsx:529–544` — templateName/templateDesc inputs have no maxLength; sends unbounded strings to saveAsTemplate mutation. Fix: add maxLength={255} and maxLength={2000}.
- FE02 HIGH: `AutoCreateAgencyModal.tsx:158` — guide field stored with no length cap before render. Fix: `setGuide((status.guide ?? "").slice(0, 2000))`.
- FE03 MEDIUM: suggestions keyed by array index (line 479); dismissedSuggestions is index-based Set — fragile if array mutates.
- FE04 MEDIUM: `console.warn("saveAsTemplate failed", e)` at line 563 logs raw error object.
- FE05 MEDIUM: state/setter naming mismatch — `dismissedSuggestions` state has setter `setAppliedSuggestions`.
- FE06 LOW: ImprovementSuggestionPanel iterates `any`-typed tRPC response; no null guards on rendered fields.
- FE07 LOW: raw `err.message` forwarded to toast/errorMsg state; low risk since tRPC client errors are sanitized.

**How to apply:** When re-auditing this modal or reviewing the saveAsTemplate flow, confirm maxLength constraints and guide-cap are present.
