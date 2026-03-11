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

## Section 03 - Library-backed commit flows

### Decision: Commit research and storyboard previews into markdown library items

- Options considered: create a new dedicated agency artifact table, persist JSON-only committed blobs, or reuse the existing markdown library item path.
- Decision taken: commit both preview types as `library_items.itemType = "md"` with canonical markdown stored as a `markdown_source` chunk.
- Mode used: `auto`
- Rationale: this matches the plan’s Phase 1 contract, reuses the existing document viewer path, and keeps the committed artifact shape compatible with existing library ACL patterns.

### Decision: Use `library_links` on `agency_run_artifact` for idempotent duplicate suppression

- Options considered: rely only on the run artifact commit status, add a new idempotency table, or reuse library source-link dedupe.
- Decision taken: create library items with `sourceLink = { linkType: "agency_run_artifact", linkId: artifactId }` and treat already committed artifacts with the same token as idempotent.
- Mode used: `auto`
- Rationale: `library_links` already gives a tenant-scoped dedupe path that survives retries, while `agency_run_artifacts` remains the audit/state layer for preview lifecycle and target identifiers.

### Decision: Default committed generated artifacts to non-indexed markdown writes

- Options considered: enqueue normal library indexing immediately, block commit until an explicit indexing policy exists, or persist readable markdown without default indexing.
- Decision taken: write markdown chunks directly without the standard indexing enqueue so committed generated research/storyboard artifacts stay excluded from ordinary RAG retrieval by default in Phase 1.
- Mode used: `auto`
- Rationale: the section requires safe default exclusion from retrieval, and direct markdown persistence keeps the artifact readable in-library without silently making generated summaries part of future research evidence.

## Section 04 - Deck preview and presentation commit

### Decision: Commit deck previews through the presentation service stack, not a new import pipeline

- Options considered: call the existing import pipeline, create bespoke deck SQL writes, or reuse presentation service helpers plus the shared layout engine.
- Decision taken: create the backing presentation library item, call `createPresentationDeckForLibraryItem`, and then update/add slides using existing presentation service helpers with shared `generateSlide()` layout rendering.
- Mode used: `auto`
- Rationale: this keeps the preview contract centered on `AIPresentationSlide[]`, preserves current presentation lifecycle rules, and avoids introducing a second deck-construction path just for agency commits.

### Decision: Reuse the auto-created first slide instead of deleting and recreating it

- Options considered: delete the placeholder slide and recreate all slides, leave the placeholder untouched and append after it, or overwrite the first slide and append the rest.
- Decision taken: update the initial slide with the first preview payload, then append remaining slides sequentially with version increments.
- Mode used: `auto`
- Rationale: this matches the existing `createPresentationDeckForLibraryItem` behavior, avoids orphan/extra blank slides, and keeps slide ordering deterministic without adding a new delete step.

### Decision: Serialize both deck and library item identifiers into the persisted deck target

- Options considered: store only `deckId`, add new artifact columns immediately, or serialize `{ deckId, libraryItemId }` into the existing `targetId` field.
- Decision taken: keep `targetType = "presentation_deck"` and serialize both identifiers into `targetId`, while returning parsed `deckId` and `libraryItemId` in the commit response.
- Mode used: `auto`
- Rationale: the existing artifact index has only `targetType` and `targetId`; serializing both identifiers keeps the implementation additive for this section while still making both IDs durable and retry-safe.

## Section 05 - Template seeding and scope resolution

### Decision: Seed built-in experiences lazily from the router instead of requiring a separate seed job

- Options considered: require an external seed script, seed templates opportunistically on template reads/clones, or block the feature until a migration-managed seed system exists.
- Decision taken: add `ensureBuiltInAgencyExperienceTemplates()` and call it from `listTemplates` and `createFromTemplate`.
- Mode used: `auto`
- Rationale: the repo already exposes agency template reads through the router, and lazy seeding keeps the feature self-starting without introducing a separate operational step for this section.

### Decision: Clone template `defaultTools` into `agency_agent_tools`

- Options considered: leave cloned drafts without tool assignments, invent a new template-tool table, or reuse the existing `defaultTools` array on `agent_templates`.
- Decision taken: map each template agent’s `defaultTools` into real `agency_agent_tools` rows when cloning a tenant draft.
- Mode used: `auto`
- Rationale: this preserves the curated tool surface for the built-in experiences while keeping the implementation aligned with the existing template schema and draft-cloning flow.

### Decision: Resolve built-in retrieval scope from cloned agency identity and persist it as run metadata

- Options considered: add new schema columns for template provenance immediately, rely only on UI state without backend persistence, or derive the built-in experience from the cloned agency slug and persist a resolved scope object per run.
- Decision taken: derive the built-in experience from the cloned slug prefix, resolve a bounded scope mode server-side, store it in `agency_runs.metadata`, and append a prompt-level runtime instruction for the run.
- Mode used: `auto`
- Rationale: this keeps the rollout additive and auditable in the current schema, while still giving template-derived runs a concrete backend scope contract instead of leaving scope behavior as UI-only state.
