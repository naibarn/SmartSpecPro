# Section 02: Intake And Playbook Drafting

## Goal

Build the case intake and first-wave authoring flow that turns raw process material into a structured playbook draft and a versioned workpack draft. This section should stop at normalized, inspectable artifacts. It must not execute work.

## Scope

- Accept multi-source case intake from SOPs, screenshots, threads, exports, recordings, browser traces, spreadsheets, and local files.
- Normalize the source material into a shared case model with traceable provenance and confidence scoring.
- Produce a draft playbook and a draft workpack from the normalized case.
- Support local-file-aware intake when desktop-host context is available.
- Ask targeted clarification questions when extraction confidence is too low.
- Suggest first-wave domain packs and playbook starting points for routine operational work.
- Persist enough draft-state metadata for later compiler, simulation, and UI sections to consume without redefining the intake vocabulary.

## Dependencies

- `section-01-shared-contracts-and-persistence`

## Blocks

- `section-03-workpack-compiler-and-routing`
- `section-07-control-plane-ui-surfaces`

## Parallelizable

Yes, once the shared contracts and persistence layer are in place.

## Implementation Work

1. Add the intake request and response contracts in the shared layer used by the web app.
   - Define a canonical `case_source` shape that can represent uploaded files, pasted text, imported exports, browser traces, screenshots, and local-file references.
   - Include stable provenance fields for source type, origin, capture time, file or trace reference, and normalized content hash where available.
   - Model confidence per extracted field so downstream services can tell what was inferred versus what was directly supplied.
   - Keep the contract aligned with the workpack lifecycle vocabulary from Section 01 so later sections can reuse the same identifiers.

2. Implement an intake normalization service.
   - Parse the raw sources into a normalized case summary with objective, actors, systems, triggers, recurring steps, outputs, failure modes, policy constraints, data sensitivity, connector requirements, and evaluation criteria.
   - Preserve a source-to-field trace map so every normalized field can be traced back to one or more original inputs.
   - Record ambiguity explicitly instead of guessing when the source material is incomplete or contradictory.
   - Keep normalization deterministic for the same input set so the draft output is stable and testable.

3. Implement the playbook drafting step.
   - Convert the normalized case into a structured playbook artifact with steps, roles, guardrails, expected outputs, and evaluation hooks.
   - Carry confidence metadata forward into the playbook so low-confidence sections remain visible to operators.
   - Generate a first-pass playbook structure that later compiler logic can map into runtime paths without reinterpreting the raw sources.
   - Support a clear `clarification_needed` state when the intake is not strong enough to produce a safe draft.

4. Implement the workpack draft authoring step.
   - Create a draft workpack version from the playbook and attach the policy profile, connector requirements, draft runtime preferences, and evaluation fixtures.
   - Keep the workpack draft inspectable and editable, but do not allow it to enter execution states from this section.
   - Preserve the link from draft workpack back to the case sources and normalized playbook so replay and promotion can explain how the draft was formed.
   - Represent first-wave domain packs as reusable starting points, not as hardcoded special cases.

5. Add local-file-aware intake support.
   - When desktop-host context is present, ingest local files through the governed local-file path instead of forcing upload-only behavior.
   - Preserve provenance for local files so operators can see which source came from disk, which came from a remote import, and which came from chat or manual paste.
   - Treat local-file access as a trust-aware input path, not as an implicit execution permission.

6. Add targeted clarification behavior.
   - When the intake service cannot reach the minimum confidence threshold for a required field, return a short clarification request rather than a half-baked draft.
   - Ask only about the missing or ambiguous fields, not the entire case again.
   - Keep the clarification response structured so the UI can present it as a checklist or prompt sequence.

7. Prepare the drafts for downstream sections.
   - Ensure the output can be consumed by the workpack compiler in Section 03 without re-normalizing the source material.
   - Ensure the output can be rendered in the control-plane surfaces in Section 07 with source traceability, draft status, and confidence cues.
   - Keep the authoring output free of execution side effects, simulation side effects, and promotion side effects.

## TDD Expectations

- Test: intake accepts multiple source kinds in one request and preserves source provenance for each source.
- Test: normalized case output includes the expected extracted fields and a stable trace map back to the original sources.
- Test: confidence metadata is attached to inferred fields and survives round-trip serialization.
- Test: low-confidence or ambiguous input returns a clarification-needed response instead of a falsely complete draft.
- Test: local-file-aware intake preserves local provenance when desktop-host context is supplied.
- Test: playbook drafting is deterministic for the same normalized case input.
- Test: draft workpack output includes policy, connector, and evaluation placeholders without execution routing data.

## Acceptance Criteria

- A user can submit messy process material and receive a structured playbook draft plus a draft workpack.
- Every normalized field can be traced back to one or more original source artifacts.
- Confidence metadata makes it obvious which parts of the draft were inferred.
- Low-confidence cases fail into a structured clarification path instead of being forced into a complete draft.
- Local-file intake works when desktop-host context is available and does not require an upload-first workflow.
- The section does not create any execution, simulation, or promotion path.
- The output shape is stable enough for Sections 03 and 07 to consume directly.

## Coordination Notes

- Section 01 owns the canonical workpack contracts and persistence vocabulary; this section should consume those shapes rather than redefining them.
- Section 03 will compile the draft workpack into runtime paths, so keep this section focused on normalization and authoring only.
- Section 07 will render intake drafts and clarification states, so keep the output structured for UI consumption.
- Do not add replay, simulation, exception routing, or promotion logic here.
