# Code Review: Section 01 - Types & Shared Logic

Overall the implementation is a faithful translation of the plan. All six deliverables are present: SilentRegion extended, SilenceDetectionConfig extended, AnalysisStage union type, SilenceDetectionDialogState reference interface, applyBufferToRegions(), and dbToPercent(). Tests cover the specified cases. That said, a senior architect would raise the following issues:

1. **NO INPUT VALIDATION ON applyBufferToRegions (MEDIUM).** The function accepts any number for bufferSeconds, including negative values. A negative buffer would expand the region (adjustedStart moves earlier, adjustedEnd moves later), which is semantically nonsensical for a "softening buffer". There is no guard, no assertion, and no test for this case. At minimum, clamp bufferSeconds to Math.max(0, bufferSeconds) or throw.

2. **NO INPUT VALIDATION FOR adjustedStartTime < 0 (MEDIUM).** Nothing prevents adjustedStartTime from going negative if startTime is very small (e.g., region starts at 0.1s, buffer is 0.5s -> adjustedStart = -0.4s). A negative timestamp is invalid in a video editor context and could cause downstream crashes when seeking. The implementation should clamp adjustedStartTime to Math.max(0, ...) at a minimum.

3. **SilentRegionV2 SILENTLY INHERITS NEW FIELDS (LOW-MEDIUM).** SilentRegionV2 extends Omit<SilentRegion, 'startTime' | 'endTime' | 'duration'>. This means SilentRegionV2 now also requires adjustedStartTime, adjustedEndTime, adjustedDuration, and skipped. Any code constructing SilentRegionV2 objects will break at compile time.

4. **SilenceDetectionConfig.softeningBuffer BREAKS SilenceDetectionPanel (MEDIUM).** The diff patched SilenceDetectionPanel.tsx to fix SilentRegion construction but did NOT initialize softeningBuffer for any SilenceDetectionConfig construction. If any code path constructs a SilenceDetectionConfig literal before Section 2 lands, TypeScript will error.

5. **TESTS DO NOT VERIFY IMMUTABILITY (LOW).** The plan explicitly states "Return a new array (do not mutate the input)" but no test verifies `regions[0] !== result[0]` (different object references).

6. **TESTS LACK EDGE CASE: EXACT BOUNDARY (LOW).** No test where adjustedEnd === adjustedStart exactly (buffer = exactly half the duration). E.g., region 4.0-6.0 (2s) with buffer 1.0.

7. **FUNCTIONS IN A TYPES FILE (LOW).** Plan-compliant, but continues architectural anti-pattern of mixing type declarations with business logic.

8. **dbToPercent MAGIC NUMBERS (LOW).** Hardcoded -60 and -20 without named constants.

Summary: The implementation is plan-compliant and the core logic is correct. The highest-priority gaps are: SilentRegionV2 inheritance side-effect (item 3), missing softeningBuffer initialization (item 4), and missing negative-buffer guards (items 1-2).
