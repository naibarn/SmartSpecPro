# Synthesized implementation specification — Feature 162

Feature 162 adds Worker-first Vertical Drama media intelligence. The browser
and storyboard express intent and review results; the installed Worker reads
local source footage, probes/analyzes it, trims dead air and unusable ranges,
performs subject-aware 9:16 reframing, adds controlled motion to still images,
renders deterministic derived video, runs QC, and publishes only verified
derived artifacts/manifests to R2 linked to the server-owned SeriesID.

The feature must support guided, AI-assisted-review, and opt-in automated-AI
editing. Automated plans are typed, policy-validated, budget-limited, and stop
for review when confidence/QC/policy gates fail. Source bytes, absolute paths,
arbitrary FFmpeg/shell commands, arbitrary ComfyUI graphs, and client-supplied
tenant/user authority are prohibited from server/UI contracts.

Generated shot video supports approved start frame, ordered reference-frame
pack, optional last frame/reference video/audio, and immutable workflow/model/
capability snapshots. ComfyUI is MCP-primary through a pinned capability/tool
manifest; direct HTTP is adapter-internal only. MiniMax H3 workflows are
available only when local/runtime/model/licensing probes pass.

The implementation must extend existing Worker runtime contracts, server auth,
artifact upload, Vertical Drama B-roll/media services, and Tauri control-plane
seams. It must add shared schemas, local resumable processing, Series media
metadata/vector indexing, artifact publication verification, nine-shot UI
integration, workflow/admin-policy resolution, error/recovery states, focused
tests, rollout flags, and migration-safe observability.

Feature 163 owns the shell, Series selector, local-root binding, global Quick
Actions, and queue/runtime host surfaces. Feature 162 owns media-specific
intake, inventory, AI plan, processing, review/QC, publication semantics, and
storyboard shot media controls.
