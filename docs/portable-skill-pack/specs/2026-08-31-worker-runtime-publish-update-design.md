# Worker runtime publish and in-app repair design

## Outcome

Publish one complete official HyperFrames runtime release for the current
Worker App contract, including the bundled whisper.cpp binary and
`ggml-large-v3.bin` model. The release must be admitted only when its archive
contains the declared transcription files and a non-placeholder signature.

The Worker App Runtime & agents screen will expose the same update/repair
action as the render readiness flow. It will be safe to run when the installed
version equals the latest version: that case performs a repair/reinstall and
then reruns the doctor.

## Boundaries

- The server runtime manifest and archive are the release authority.
- Native macOS installs use the existing runtime-pack installer command.
- Windows managed WSL installs use the existing setup terminal and status-file
  polling path.
- The doctor must report transcription and signature readiness before the
  worker can claim render jobs.
- A production deploy or git push remains a separate operation after the local
  artifact and verification are complete.

## Failure handling

- Missing transcription metadata/files, a placeholder signature, or missing
  archive entries make the pack unavailable for render jobs.
- A repair button remains available after a version check failure, but the
  installer error is shown and the app does not claim readiness.
- The existing connection and worker loop are preserved while a repair runs;
  readiness is updated only after the installed pack is checked again.

## Verification

- Server route tests cover complete packs, missing transcription, and
  placeholder signatures.
- Rust runtime-manifest tests continue to cover missing transcription and
  placeholder signatures.
- Typecheck the web and Worker App packages.
- Run the focused Rust doctor tests.
- Release verification must report the exact archive hash, size, manifest
  version, transcription hashes, and signature provenance.
