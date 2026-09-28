# Gap review round 4 — news evidence and correction cascade

Scope checked: news profile/modes, current claims, source metadata, as-of/freshness, AI illustration, archive footage, and correction behavior.

Closed gaps:

- News claims start `needs_verification`; supplied text is not silently verified.
- Current/numeric claims require supporting evidence, current freshness, as-of, and visual coverage for readiness.
- Contradictory/partial states remain visible rather than being collapsed.
- Corrections create a new revision and return the claim to unverified/unknown freshness.
- AI visuals cannot satisfy verified evidence; archive/file footage requires a label.

Evidence: `verticalDramaNewsReportService.ts`, `VerticalDramaNewsEvidencePanel.tsx`, and the Nan-shaped numeric claim integration fixture.

Result: PASS — no evidence-policy gap found in the deterministic service layer.
