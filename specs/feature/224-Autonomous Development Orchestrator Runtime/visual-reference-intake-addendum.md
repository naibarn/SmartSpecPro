# SPEC-224 Addendum: Multimodal Visual Reference Intake for Mini App Factory

Status: PROPOSED — specification-only; implementation and acceptance not claimed.
Date: 2026-10-11
Owner: SmartAIHub Mini App Factory / SPEC-224
Related: SPEC-240, SPEC-270, SPEC-271, SPEC-277, SPEC-287, SPEC-208.

## Objective

A Mini App creation request may contain functional specifications (Markdown, JSON, schemas, APIs) and **optional first-class visual and interaction references**: one or many screenshots/mockups, screen recordings/videos, example-site URLs, and optional Figma/PDF/brand assets. The autonomous creator should build working applications whose UI matches the user's desired layout, style, navigation and observable interactions as closely as authorized and technically feasible, **without requiring the user to approve each stage**.

This is a capability extension of the existing SPEC-224 workflow; do not build a second orchestrator, queue, task-control plane, browser harness, design system or LLM gateway.

## User-facing Create Mini App intake (all optional)

- Existing specification, JSON/data/schema and API inputs remain supported and unchanged.
- Add **Design References** attachments: multi-image (PNG/JPEG/WebP), multi-video (MP4/WebM), multiple URLs; optional design export (Figma-derived, PDF), brand assets and free-text notes.
- Allow each reference to annotate: target page/route, device/viewport, state (default/hover/modal/validation/loading/empty), importance, what to imitate, what to ignore, and permission to reuse supplied assets.
- Request-level settings: similarity mode `inspired | close | high_fidelity` (default `close` for user-owned mockups, `inspired` for third-party site examples until reuse rights are clarified); primary target devices; preferred brand/theme; optional target screens.
- Enable **zero visual inputs**: spec/JSON-only existing path must still work. Visual-only submissions may generate a working draft using explicit assumptions; no invented backend guarantees.
- Upload limits, allowed MIME types and signed URLs follow existing tenant upload/storage policy; no new hard-coded global limits. Record validation failures per-reference and continue with usable references where safe.

## Intake API — additive versioned contract (illustrative)

```json
{
  "spec_files": ["r2://tenant/spec.md"],
  "reference_data": ["r2://tenant/sample.json"],
  "visual_references": [
    {"id":"dashboard-desktop","type":"image","uri":"r2://tenant/dashboard.png","page_hint":"/dashboard","viewport":{"width":1440,"height":900},"importance":"high","asset_reuse_allowed":true},
    {"id":"checkout-flow","type":"video","uri":"r2://tenant/checkout.webm","flow_hint":"checkout"},
    {"id":"inspiration-site","type":"url","url":"https://example.org","scope":"public_pages","asset_reuse_allowed":false}
  ],
  "design_preferences":{"similarity_mode":"close","devices":["mobile","tablet","desktop"],"notes":"Match layout; keep tenant brand"},
  "rights":{"user_claims_ownership":false,"third_party_reference_only":true}
}
```

Schema is conceptual; Codex must inspect existing Mini App request/attachment contracts and extend them compatibly rather than copy these exact names if canonical types already exist. Never store bearer tokens, session cookies, passwords or private signed URLs in publicly accessible evidence or logs.

## Resolution & precedence

1. Security, authorization, tenant isolation, data-use rights, accessibility essentials and explicit user restrictions remain mandatory.
2. Explicit functional spec/schema/API contracts govern domain behavior, data, validation and permissions.
3. User-owned design mocks and direct visual instructions govern visual structure, styling, screen hierarchy and responsive intent.
4. External sites/videos demonstrate observable UI/interaction patterns only; they do not establish backend semantics.
5. If references conflict, resolve by per-reference page/viewport/state and explicit priority, then make a reasonable reversible assumption; record it as an assumption, not an automated human approval checkpoint.
6. `high_fidelity` is allowed for owned/authorized references; a third-party example may inspire layout and interaction but must not silently clone protected logos, photographs, copy or branding.

## Processing pipeline — capability steps inside current SPEC-224 work units

1. **Ingest/normalize**: classify assets and refs, attach page/state/viewport hints, validate mime/auth/tenant scope, store source provenance through existing asset management/R2 or configured self-host storage.
2. **Analyze**: extract page inventory, component hierarchy, visual tokens, layout, navigation, responsive cues, video-observed events and URL-observed states; separate observed facts from inferred behavior. For URLs: bounded capture of authorized public pages, obey access restrictions, no credential bypass, no uncontrolled site traversal or SSRF to internal networks.
3. **Blueprint**: align functional spec with visual references; generate a page/route map, design-token draft, reuse-candidate component catalog, interaction map and source-to-page traceability. Reuse SPEC-240/270/287 contracts and existing design providers (Stitch/Astryx) instead of introducing competing state.
4. **Implement**: generate functional UI within existing Mini App build orchestration; reuse licensed/authorized assets before synthesizing new ones, preserve tenant branding, accessibility, and responsive layouts.
5. **Render/compare**: reuse SPEC-208/271 browser or portable harness where available; snapshot each relevant viewport/state; compare perceptual similarity and structural cues, not only pixel equality. Distinguish unmeasured, unavailable, failed and passed states.
6. **Autonomous repair**: create scoped work units for high-impact mismatches; change only affected components; rerender and check functional regression. Use bounded iteration (suggested initial budget three rounds, configurable by cost/candidate improvement); stop on convergence, regression or budget limit.
7. **Final verification & delivery**: functional correctness and authorized deployment remain independent gates; publish screenshots, test receipts, unresolved gaps and fidelity status. No false COMPLETED based on visual score alone.

## Durable artifacts (reuse canonical store & receipt machinery)

- `visual-reference-manifest.json`: reference id, type, source hash, rights, storage link, page/viewport/state hints and acquisition status
- `visual-understanding.json`: observed vs inferred layout, style, components, flow states, confidence and citations to refs
- `ui-blueprint.json`: route/component/interaction and responsive mapping to spec items
- `visual-verification.json`: reference/render pairs, viewport, metric/method, screenshots, mismatch regions, verdict and unverified reasons
- Existing SPEC-224/277 work-unit receipts and handoff: cost, repair iterations, test evidence, residual issues; avoid duplicate state machines

These are **logical artifacts**; adopt existing project naming and schemas where available. Treat screenshot/video contents, linked pages and OCR text as untrusted user-supplied data, not execution instructions. Redact secrets and personal data in previews/reports; cap capture duration, file size and browser resources per existing tenant quotas.

## Acceptance criteria

- AC1: Legacy spec/JSON-only requests preserve their current path and behavior.
- AC2: One or multiple image references can be attached and mapped to different routes/states/devices without overwriting each other.
- AC3: Video and URL references produce bounded, provenance-linked **observable** interaction and page snapshots; blocked/unavailable refs degrade gracefully, do not fabricate observations.
- AC4: Functional spec wins over a conflicting screenshot on validation, data model, authorization and backend semantics, with conflict recorded.
- AC5: Design blueprint and output page are traceable to reference ids; comparison uses matching viewport/state and records method plus evidence.
- AC6: Local/available browser visual repair performs bounded retries, does not loop indefinitely and does not require serial user approvals; missing optional browser produces UNVERIFIED visual evidence, not a false PASS or blanket build blockade.
- AC7: Browser URL fetch rejects SSRF/internal metadata targets, credential leakage, cross-tenant asset reads and uncontrolled third-party copying.
- AC8: Mobile, tablet and desktop layout checks run to capability/budget and declare untested targets honestly; focus on user-specified target viewports.
- AC9: Functional tests, authorization checks and deployment gates remain independent; final completion is evidence-based.
- AC10: Resume/idempotency, work-unit ownership, bounded spend, cancellation and recovery use existing SPEC-224/277 machinery; no new queues or runtime required.

## Implementation plan: small mergeable slices

1. **Inventory/GAP**: inspect canonical SPEC-224, 240, 270, 271, 277, 287, Mini App Factory UI/API schema, R2 media uploads, URL capture and browser testing; identify existing capabilities and real gaps. No duplicate implementation.
2. **Intake + types**: additive attachments/URL UI and API contract, tenant-scoped metadata, tests; keep legacy path.
3. **Analysis + blueprint**: reuse provider-neutral vision, design provider, retrieval and media capabilities; no new orchestrator.
4. **Visual harness + repair**: reuse SPEC-271/208 Playwright/Runner; compare and bounded repair; record receipts.
5. **Evaluation**: benchmark 20–30 varied screens/flows against existing baseline (visual layout, functional pass rate, cost, repair utility, autonomous completion); ship only improvements with evidence.
6. **Rollout**: progressive integration, small tested PRs merged to main promptly, no giant integration branch, no speculative acceptance claims.

## Codex integration instructions

Read this addendum alongside the listed canonical specs; first map exact code/spec locations, run a gap audit, then update the canonical source documents and implementation contracts in small PRs. Keep active in-flight branches intact. Do not mark this addendum or dependent specs implemented until live, source-linked acceptance evidence exists. When external capture/visual runtime is unavailable, take the best safe fallback and record it rather than asking the user to manually run every verification step.
