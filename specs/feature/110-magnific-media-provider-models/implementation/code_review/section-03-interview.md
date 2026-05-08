# Section 03 Acceptance Interview

Date: 2026-05-06

## Questions

### Do Magnific controls render through the existing generic input system?

Yes. Magnific controls are expressed as `configJson.inputFields`; the parser now preserves the generic metadata needed by the existing panel, and the panel applies number constraints without Magnific-specific UI branching.

### Do reference image and video controls use picker-backed flows?

Yes. Magnific reference fields are synchronized with the existing reference image/video state via `syncWith`, so Media Studio uses the existing reference picker flows instead of requiring raw JSON arrays.

### Does server validation reject unsafe Magnific requests before provider calls?

Yes. The media router validates Magnific config metadata after resolving the selected model and before credit deduction/provider submission. Tests cover webhook rejection, numeric range rejection, Google Search model gating, required reference video validation, allowed resolution validation, and safe local upload acceptance.

### Are existing providers preserved?

Yes. A regression test verifies DB rows with `configJson: null` keep the previous five-reference behavior for other providers. Static fallback constraints still apply when the fallback path provides config metadata.

## Residual Risks

- Mystic LoRA discovery is not fully implemented in this section. The section now has safe fallback input/validation groundwork, but read-only provider-backed LoRA option fetching remains for the runtime/provider-client sections.

