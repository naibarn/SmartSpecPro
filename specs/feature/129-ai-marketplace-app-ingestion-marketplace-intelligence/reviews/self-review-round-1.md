# Self Review Round 1

## Scorecard

- Structural integrity: Pass
- Completeness vs spec: Pass
- Implementability: Pass
- Internal consistency: Pass
- Edge cases: Pass with one improvement

## Findings And Fixes

1. The plan originally risked making database work appear before UI proof. Fixed by making Section 01 the Browser Connector Lab UI shell and Section 03 the fixture/contract harness.
2. The live connector could be unavailable for many users. Fixed by requiring fixture replay as a first-class development and CI path.
3. The MCP tools could accidentally bypass browser/API validation. Fixed by routing all tool writes through the same ingestion service.
4. Raw payload access and retention needed clearer production controls. Fixed by adding Section 07 gates and explicit raw retention fields.
5. UI requirements needed browser evidence and Astryx alignment. Fixed in the UI/UX contract for Section 01.

## Residual Risks

- Exact live connector invocation mechanics still need implementation-time discovery because host capabilities may vary.
- The first real field sample may require updating capability mappings before analytics sections proceed.
- Existing marketplace capture router may already be large; implementation should strongly consider a separate `marketplaceIntelligenceRouter`.
