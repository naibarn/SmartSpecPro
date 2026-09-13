# Decisions

1. Use a hybrid flow: local path configuration and truthful capability checks
   now; automatic downloads only when a future signed model manifest is
   available. This release must never invent download URLs or silently fetch
   licensed weights.
2. Persist model paths in a dedicated `speaker-models.json` file so existing
   Worker settings remain backward compatible.
3. Add a runner `--capabilities` command and invoke it from Rust preflight;
   this reuses the runner's real import/model/GPU checks without duplicating
   Python dependency logic in Rust.
4. The UI shows per-adapter status, remediation text, path selection, clear
   path, copyable manual instructions, and a recheck action.
5. The runner contract revision is reflected by bumping the runner to 0.1.1;
   the Windows runner and runtime release must be rebuilt before distribution.
