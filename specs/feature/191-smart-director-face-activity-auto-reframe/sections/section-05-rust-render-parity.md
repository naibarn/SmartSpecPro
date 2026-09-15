# Section 05 — Rust render parity

Extend Rust media plan types and validation for the new mode/provenance while
preserving old payloads and segment remapping. Local commands accept automatic
reframe only with a validated plan/track and otherwise return a truthful
capability error or use manual focus. FFmpeg expressions remain bounded and
use the same normalized top-left coordinate semantics as preview.

Proof: focused Cargo tests cover validation, remapping, stale/malformed plan
rejection, and manual behavior.

Status: IMPLEMENTED locally in Rust validation/remapping and command admission;
the full fixture-video parity gate remains a rollout proof requirement.
