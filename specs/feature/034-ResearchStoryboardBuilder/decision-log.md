# Decision Log

## 2026-03-11

### Step 2 - Review mode
- Options considered: `external_llm`, `self_review`
- Decision taken: `self_review`
- Mode used: `auto`
- Rationale: `validate-env.sh` reported missing Gemini and OpenAI credentials, so external review is unavailable for this planning session.

### Step 4 - Session setup script
- Options considered: use `deep_plan/scripts/checks/setup-session.py` from the resolved worktree plugin root, or use the Codex-specific setup script available in the repository
- Decision taken: use `deep_plan/scripts/checks/setup-codex-session.py`
- Mode used: `auto`
- Rationale: the worktree plugin root returned by the validator did not contain the required setup script, while the repository-local Codex variant supports canonical artifact names and `self_review`.

### Step 5 - Decision mode
- Options considered: `ask_every_choice`, `smart_auto`, `auto_by_default`
- Decision taken: `smart_auto`
- Mode used: `asked`
- Rationale: user selected `smart_auto`.

### Step 6 - Codebase recon scope
- Options considered: broad repo-wide survey, or focused recon on the modules named explicitly in the spec
- Decision taken: focused recon on agency runtime, library/RAG, skill execution, presentation creation/import, artifact parsing/routing, and tests
- Mode used: `auto`
- Rationale: these are the directly impacted integration seams for this feature and provide enough signal without loading irrelevant parts of the repository.

### Step 7 - Web research selection
- Options considered: individual topic selection, `apply_all`, `skip`
- Decision taken: `apply_all`
- Mode used: `asked`
- Rationale: user selected `apply_all`, so web research was performed for all proposed topics.

### Step 14 - Review integration decisions
- Options considered: save confirmed research/storyboard outputs as library-backed artifacts or keep them only as committed agency artifacts
- Decision taken: save confirmed research reports and storyboards as library-backed artifacts in Phase 1, with `agency_run_artifacts` as the run/provenance index
- Mode used: `asked`
- Rationale: this keeps committed outputs first-class and reusable while preserving a clean audit trail.

### Step 14 - Deck preview payload contract
- Options considered: `AIPresentationSlide[]` plus deck metadata, final `PresentationSlideContent`, or a new custom schema
- Decision taken: use `AIPresentationSlide[]` plus deck-level metadata, then translate at commit time through the existing layout and presentation pipeline
- Mode used: `asked`
- Rationale: this keeps preview generation flexible and reuses the existing AI presentation path without coupling preview payloads directly to final render internals.

### Step 22 - Committed artifact representation
- Options considered: generic run-scoped blobs, document-like library items, or custom artifact tables as the canonical saved form
- Decision taken: save confirmed research and storyboard outputs as markdown-backed library items with `itemType = "md"` and `source = "agency_generated"`, plus typed `metadata.source_type`
- Mode used: `auto`
- Rationale: the repository already has markdown-backed library content patterns and viewers, so this keeps outputs first-class without introducing a second document surface in Phase 1.

### Step 22 - Streaming event contract
- Options considered: replace current SSE events, overload `run_finished`, or add a new additive terminal event
- Decision taken: preserve existing SSE events and add an additive terminal `preview_ready` event before `run_finished` when structured preview persistence succeeds
- Mode used: `auto`
- Rationale: the Node stream proxy already passes upstream events through unchanged, so an additive event minimizes breakage for legacy clients.

### Step 22 - Preview payload storage thresholds
- Options considered: always inline, all out-of-line, or threshold-based storage
- Decision taken: use threshold-based storage with `<= 64KB` inline, `> 64KB` referenced snapshot storage, and a Phase 1 hard cap of `5MB` per serialized preview payload
- Mode used: `auto`
- Rationale: hot runtime rows should remain small while still supporting large previews predictably.
