# Code Review: Section 01 — Capability and catalog

## Review round 1

The reviewer requested changes for:

1. incomplete static fallback parity;
2. missing structured family/length metadata on budget errors;
3. incomplete DB/static/reference/error test coverage;
4. fractional target limits being accepted after flooring.

All four findings were auto-fixed. A second review is required before commit.

## Review round 2

The second review found three additional gaps:

1. reference-route lookup could override the canonical selected model;
2. the legacy `google-nano-banana-pro` row had no matching seed refresh path;
3. complete static/seed/reference/non-target test coverage was not yet proven.

These were auto-fixed by making canonical model ID authoritative, adding the
legacy seed row and Seedream 3/4/4.5 metadata/static entries, resetting mocks,
adding real-registry route/non-target tests, and adding exact structured-error
assertions.

## Review round 3

The reviewer returned `pass_with_minor_findings`: alias parity and a
non-target catalog snapshot were not explicit enough. The finding was
auto-fixed by adding table-driven Nano Banana/Seedream alias assertions and
representative Flux, Z-Image, and Grok non-target legacy snapshots. The alias
collision between `nano-banana-pro` and `banana-pro` was also detected by the
new test and preserved intentionally according to the static registry's
canonical ordering.

## Review round 4

Pending final confirmation after the alias/non-target coverage fix.
