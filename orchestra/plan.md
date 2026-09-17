# Orchestra Plan — Enhanced virtual-screen continuity lock

## Task Classification
- Scope: small
- Risk: low
- Affected domains: Enhanced video prompt bridge and Python regression tests
- Estimated file count: 3
- Chosen route: direct-standard-light inline implementation
- Bug route: true
- Classification notes: The defect is isolated to the Enhanced bridge's deterministic terminal prompt and its focused regression coverage. No schema, provider, auth, or UI change is required.

## Evidence Ledger
- source: user screenshot and repository prompt-path inspection
- observed failure: an Enhanced video prompt can create a new phone/device screen even when the approved start frame already contains the caller's virtual screen
- root-cause evidence: `_build_visual_cast_lock` identifies a caller as `viewer-screen` but does not require reuse of the exact existing inset or forbid a new screen/window
- authoritative input: `shot.visualCastPolicy.screenCallerCharacterRefs` plus the approved `START_FRAME_IMAGE`
- verification boundary: focused Python bridge regression tests; provider output and browser playback remain unverified

## Design
- Add a deterministic Enhanced-only virtual-screen continuity block whenever server-authorized screen callers exist.
- Bind each caller dialogue event to the same existing virtual screen visible in `START_FRAME_IMAGE`.
- Explicitly forbid new phones, device displays, insets, floating windows, faces, physical callers, duplicates, and caller reassignment.
- Include the same invariant in the compact prompt path so budget reduction cannot remove the protection.
- Do not add schema fields or infer caller roles from dialogue text.
