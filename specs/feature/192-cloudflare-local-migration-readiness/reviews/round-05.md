# Review Round 05 — Python Parity and CI

Checks: Python envelope/attempt/fencing tests, hard-cutover flags, focused
command reproducibility, and prerequisite reporting.

Finding: host `python3` did not have pytest; repository `DEBUG=release` also
caused settings validation failure; the default coverage threshold was too
wide for a focused contract command.

Fix: focused verifier uses `uv`, sets `DEBUG=false`, and invokes the scoped
tests with `-o addopts=`. The result reports missing prerequisites explicitly.

Remaining: no Python production worker deployment claim is made.
