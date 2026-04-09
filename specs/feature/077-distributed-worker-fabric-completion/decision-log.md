# Decision Log

Date: 2026-04-08

## Planning depth

Chosen depth: `standard`

Reason:

- the repository already has a concrete feature chain for worker runtimes
- the task is to add the missing continuation spec, not to redesign the whole product from zero
- a new follow-on feature package with five focused sections is enough to make the next implementation slice actionable

## Main decisions

1. Create a new follow-on feature instead of rewriting Features 071-074.
   - Those features remain valid for OpenClaw control plane, delegated platform access, and delegated MCP.
   - The missing work is broader runtime-fabric completion, not a reversal of the OpenClaw work already done.

2. Treat Feature 059 as historical baseline, but supersede its conflicting ZeroClaw sidecar wording.
   - Feature 059 still supplies useful vocabulary and acceptance ideas.
   - Feature 077 becomes the new source of truth where ZeroClaw must be modeled as a managed local runtime profile.

3. Preserve OpenClaw as the first production runtime while generalizing the platform around it.
   - The implementation should remove OpenClaw-only hardcoding from shared services.
   - It should not regress the already-working OpenClaw path in order to make room for future runtimes.

4. Reuse existing desktop/media execution assets.
   - `apps/tauri-shell` and `python-backend` already contain FFmpeg and media-job primitives.
   - The new feature should bridge to those assets through typed worker adapters.

5. Split rollout by runtime family instead of one giant worker flag.
   - `openClawExternalRuntime` should remain for current flows.
   - new runtime families should receive their own rollout switches and compatibility checks.

6. Lock implementation-facing contracts where the first draft was still too prose-heavy.
   - `video_assembly` now has minimum input/output/progress/failure expectations.
   - workflow/persona worker nodes now have named contracts and failure semantics.
   - desktop-local artifact publication must reuse the existing `workerArtifactService` safety path.

7. Separate shared-worker service identity from request origin and budget attribution.
   - shared department and dedicated GPU workers cannot inherit owner-bound personal-worker semantics.
   - approval mode, token rotation, and budget attribution must be explicit for those worker classes.

## Review rounds

### Round 1

[AUTO-FIX]

- Added an explicit current-support matrix so the new feature does not overclaim completion.

### Round 2

[AUTO-FIX]

- Separated “OpenClaw product reality” from “SmartSpecPro integration reality” so the spec does not blame OpenClaw for gaps that belong to SmartSpecPro.

### Round 3

[AUTO-FIX]

- Added a clear supersession rule for Feature 059’s ZeroClaw sidecar language.

### Round 4

[AUTO-FIX]

- Added reuse guidance for `apps/tauri-shell` and `python-backend` media execution assets.

### Round 5

[AUTO-FIX]

- Added runtime-specific feature flags, rollout posture, and non-substitution rules for NemoClaw and HiClaw.

### Round 6

[AUTO-FIX]

- Added explicit alignment for shared-worker service identity, approval mode, and budget attribution.

### Round 7

[AUTO-FIX]

- Added runtime-profile schema versioning, canonical `video_assembly` contract details, workflow node contracts, and artifact-publication safety reuse.
