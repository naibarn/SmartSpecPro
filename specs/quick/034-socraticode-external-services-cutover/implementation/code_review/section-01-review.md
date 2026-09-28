# Code Review: Section 01 - Launcher Tests and External Policy

Date: 2026-07-18

Reviewer-agent status: two read-only reviewer attempts did not return and were
interrupted. The conductor completed the required targeted review inline from
the staged diff and real command flow.

## Verdict

Approved after fixes.

## Material findings resolved

1. **Admission race:** With one unlocked orphan and two simultaneous launchers,
   both launchers could count the orphan before either new container registered,
   allowing three containers. Fixed with a global admission lock held across
   cleanup, count, Docker start, and positive `.State.Running` confirmation.
2. **Live dependency leakage in fixtures:** The cleanup fixture would have
   contacted live `.119` endpoints after preflight was introduced. Fixed by
   injecting a fake curl implementation and temporary slot directory.
3. **Missing planned coverage:** Added explicit Ollama-unreachable and
   `pids-limit=256` assertions.
4. **Registration correctness:** Docker `inspect` success alone was
   insufficient; the launcher now requires the returned running state to equal
   `true` before releasing the admission lock.

## Final review

- External probes precede cleanup and Docker mutation.
- Endpoint/model failures do not call cleanup or `docker run`.
- Exact Qdrant/Ollama environment is pinned.
- Docker socket and socket group access are absent.
- Slot and managed-container admission both fail closed.
- Per-container resource arguments match the reviewed design.
- Owned-container signal cleanup and orphan metadata are preserved.

No unresolved material findings remain.
