# Completeness Review - Prompt API Support Matrix

## Scope

Reviewed `spec.md` and section plans for completeness around machines that support Chrome Prompt API and machines that do not.

## Findings

### 1. Support path existed but needed an explicit matrix

The spec already treated Prompt API as optional, but implementers still had to infer behavior for `downloadable`, `downloading`, thrown errors, and fallback-disabled states.

Auto-fix:

- Added `Prompt API Support Matrix`.
- Added supported and unsupported device flows.
- Added provider decision contract.
- Added acceptance criteria for detection errors, raw capture-only mode, cancellation, and user-triggered downloads.

### 2. Chrome-specific requirements needed sharper implementation gates

Official Chrome docs require runtime `LanguageModel.availability()`, separate model download, user interaction before starting a download/session where required, and no expired `aiLanguageModelOriginTrial` permission.

Auto-fix:

- Added explicit requirements to avoid expired origin-trial permission.
- Added requirement to keep `availability()`, `create()`, and prompt options consistent.
- Added download progress and cancellation requirements.

### 3. Unsupported-device behavior needed product-level clarity

The spec said fallback exists, but did not fully define the exact UX when Prompt API and server fallback are both unavailable.

Auto-fix:

- Added unsupported device path.
- Added raw capture-only mode behavior.
- Added side panel status reason and fallback-active UI states.
- Added tests for fallback enabled and fallback disabled.

### 4. Thai output should remain best effort

The spec mentioned Thai best effort, but section-level validation could still be misread as requiring Thai quality from local Prompt API.

Auto-fix:

- Added language/modality constraints.
- Added section guidance that schema validation must not depend on Thai quality.

## Result

The feature package now explicitly covers:

- Prompt API supported and model ready.
- Prompt API supported but model not downloaded.
- Prompt API currently downloading.
- Prompt API exposed but requested options unsupported.
- Prompt API not exposed.
- Prompt API throws.
- Server fallback enabled.
- Server fallback disabled.
- Raw capture-only mode.

