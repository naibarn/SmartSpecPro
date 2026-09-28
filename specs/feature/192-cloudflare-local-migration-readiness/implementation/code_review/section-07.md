# Section 07 Code Review

- Scope: Python parity and focused verification.
- Finding: the host `python3` lacked pytest and the repository environment had
  `DEBUG=release`, which prevented test configuration parsing; the focused
  pytest run also inherited the project-wide 80% coverage gate.
- Fix: focused verifier uses the repository `uv` environment, sets `DEBUG=false`,
  and overrides addopts for the explicitly scoped tests while reporting missing
  prerequisites.
- Verification: 13 Python parity tests pass; focused verifier passes.
