# Implementation Decision Log

## Section 01 - Contract and persistence

### Decision: Canonical run text field stays `response`

- Options considered: use `response`, switch everything to `output`, or introduce a third field.
- Decision taken: keep `response` as the canonical field and emit `output` as a compatibility alias from Python.
- Mode used: `auto`
- Rationale: `apps/web/server/services/agencyBridge.ts` and current Node consumers already center on `response`, so this keeps the diff smaller while still normalizing Python and Node.

### Decision: Envelope parser accepts fenced JSON or raw JSON

- Options considered: require raw JSON only, require a custom XML/tag wrapper, or support fenced JSON plus raw JSON.
- Decision taken: support ````agency-result``` fenced JSON first, then fall back to raw JSON detection.
- Mode used: `auto`
- Rationale: this preserves plain-text compatibility, gives agencies an explicit structured escape hatch, and avoids forcing every template to output JSON-only text immediately.

### Decision: Persist preview rows immediately for valid structured envelopes

- Options considered: store only run-level parse metadata now, defer artifact rows to Section 02, or create compact preview rows in Section 01.
- Decision taken: insert `agency_run_artifacts` rows during `AgencyService.execute_run()` when a structured envelope validates.
- Mode used: `auto`
- Rationale: later preview routing and commit flows depend on a stable run-scoped artifact index; writing the compact preview record now keeps later sections additive instead of retrofitting persistence.

## Section 02 - Preview routing and API contract

### Decision: Route previews through a dedicated typed Node mapper

- Options considered: let each router shape preview payloads ad hoc, expose raw envelope payloads directly, or centralize preview DTO mapping in one service.
- Decision taken: add `apps/web/server/services/agencyPreviewService.ts` as the single preview normalization layer and reuse it from both `sendMessage` and `getRunPreview`.
- Mode used: `auto`
- Rationale: this locks one preview contract for research, storyboard, and deck intents, keeps lifecycle derivation consistent, and minimizes later churn in Sections 03-04.

### Decision: Oversized preview payloads fall back to run indirection before summary-only truncation

- Options considered: inline every payload, introduce external blob storage immediately, or keep Phase 1 additive with a run-backed indirection threshold.
- Decision taken: keep preview payloads inline up to `64KB`, store only a `run_structured_result_payload` pointer up to `5MB`, and switch to a summary-only payload marker beyond `5MB`.
- Mode used: `auto`
- Rationale: this matches the section thresholds without adding a new storage subsystem mid-feature, while still giving preview APIs deterministic behavior for oversized payloads.

### Decision: Preview reads must re-check conversation ownership

- Options considered: trust tenant-scoped Python run detail access, trust run IDs as opaque enough, or reapply the existing conversation ownership guard in the new preview query.
- Decision taken: add `conversation_id` to run details and require `agencyConversations.userId == ctx.user.id` in `agencyRouter.getRunPreview`.
- Mode used: `auto`
- Rationale: the new preview endpoint would otherwise widen access from "can send on this conversation" to "can guess a tenant-local run ID"; reusing the existing guard keeps preview access aligned with current chat ownership rules.

### Decision: Reserve the commit mutation contract now, with a placeholder response

- Options considered: wait to add any commit API until Sections 03-04, expose only a mutation name in preview metadata, or add the route now and return a deterministic placeholder until downstream commit handlers exist.
- Decision taken: add `agency.commitPreview` now and return a `PRECONDITION_FAILED` placeholder message until the library and deck commit sections land.
- Mode used: `auto`
- Rationale: clients now have a stable mutation target from Section 02, while the actual write paths remain isolated to Sections 03-04 as planned.
