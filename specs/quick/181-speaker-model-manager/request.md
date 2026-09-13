# Speaker model manager

Add a real Worker App setup flow for Feature 179 adapter dependencies. Users
must be able to inspect the local readiness of Silero, MediaPipe Face/Person,
pyannote, WebRTC VAD, and ActiveSpeakerFusion; configure local model paths;
receive actionable installation guidance; and run adapter preflight before a
job is queued. No mock status, synthetic model, silent fallback, or implicit
network download is allowed.

Constraints: keep model weights outside the base runtime archive, preserve the
existing fail-closed policy, support Windows Worker + WSL2 runtime, persist
configuration in the Worker App data directory, and avoid exposing secrets in
diagnostics or UI responses.
