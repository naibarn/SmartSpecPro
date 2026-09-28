# Audit round 07 — source safety and publication

- Checked local source root boundary, relative source requirement, remote artifact checksum verification, output checksum, artifact metadata, and no-synthetic-runner behavior.
- Finding: Worker host could fall back to `selectedVideo.path`, which could be absolute and would be rejected inconsistently by the root-bound command.
- Action: removed that fallback; an absent relative source now fails closed.
