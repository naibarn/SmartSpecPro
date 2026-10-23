# CI root causes and SPEC-224 PR reconciliation — 2026-10-23

## CI fixes integrated

- `d2e54be0c3945870ec36a8b1749218dfb0041f83` adds `ffmpeg` to the Python CI job. The exact earlier Python failure at `d8d1bfe8606fb063f4829c6291a797fcb9757038` was `FileNotFoundError: [Errno 2] No such file or directory: 'ffmpeg'` in `tests/test_dead_air_detect.py`.
- `8bbf6c42be` updates three API key validation fixture values from a rejected legacy prefix to the current `sk-smartspec-` prefix. The earlier success case failed before querying the mocked database because `TokenGenerator.is_valid_api_key_format` requires that prefix; with the old value, “not found” and “expired” cases also returned at the format guard rather than testing their intended branch.
- Focused evidence: the FFmpeg test passed 1/1; API-key validation tests passed 4/4; workflow YAML parsed and `git diff --check` passed. Full CI for these fixes is pending on the latest code SHA.

## Requested PR review

Compared each open PR head against current `origin/main` at `8bbf6c42be`:

- PR #1174: open, 3 commits ahead / 31 behind, head `510aebac49b0a713104abb948384fdc702862f99`; exact-candidate CI changes. Its latest recorded CI and candidate gate failed. Do not merge this stale head; rebase/retest is needed if the gate is still selected.
- PR #944: draft, 1 commit ahead / 606 behind, head `d826f71bde6c995260e7dbb9ae6925aef29b08a9`; older candidate gate plus Runner checkpoint/workspace assertions. Its latest recorded CI candidate gate and turbo build failed. Preserve its distinct Runner changes for review; do not merge this stale head.
- PR #961: draft, 7 commits ahead / 590 behind, head `e581a4c4612a123f43062dc2774d3a34481ea527`; Mini-App preview provisioning. Its mocked SPEC-308 browser simulation failed while the progressive integration gate passed. Preserve the distinct provisioning slice for current-main reconciliation; do not merge this stale head.

All three PRs are authored under the connected `naibarn` account. They remain open because each retains distinct unmerged scope and closing them is not necessary to protect the current mainline. No PR source was merged or rewritten in this recovery pass.

## Still open

The latest main CI run must establish whether the two focused fixes clear their failures. Other Python, SmartSpecWeb, turbo/type, protected Runner, external approval, deployment, and end-to-end acceptance gaps remain unresolved. No acceptance or production release is claimed here.
