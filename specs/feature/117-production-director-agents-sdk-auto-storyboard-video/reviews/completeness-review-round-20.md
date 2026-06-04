# Completeness Review Round 20

Date: 2026-05-31
Scope: marketplace evidence instruction firewall for Feature 117 Agents-backed automation.

## Result

The plan already treated marketplace evidence as untrusted and added privacy redaction. Round 20 makes prompt-injection resistance implementable by adding a first-class `MarketplaceEvidenceInstructionFirewall` before marketplace DOM, OCR, reviews, seller text, filenames, uploaded evidence, or prior AI output can enter Agents, LLM vision QA, repair prompts, provider prompts, or metadata generation.

## Findings Fixed

1. Prompt-injection hardening was too implicit for the Agents runtime.
   - Added `MarketplaceEvidenceInstructionFirewall`.
   - The firewall records source refs, privacy envelope ref, rule pack ref, detected instruction patterns, quarantined refs, blocked refs, allowed safe fact refs, confidence, and pre-gateway-spend status.

2. Feature 117 needed to preserve Feature 113/114 untrusted-evidence discipline.
   - DOM/OCR/review/seller text is data only, never instructions.
   - Hidden text, fake tools, fake schemas, provider/model routing instructions, credit/budget instructions, policy-bypass text, and output-routing attempts must be quarantined, escaped, reduced to fact refs, or blocked.

3. Resume, recovery, and finalization needed to keep quarantine decisions durable.
   - Added resume/background recheck requirements.
   - Added finalization blockers so quarantined instruction refs cannot appear in scripts, captions, subtitles, overlays, thumbnails, platform metadata, or Library package artifacts.

4. Credit and LLM routing needed a pre-spend blocker.
   - Evidence-dependent planning, QA, repair, and metadata generation cannot estimate/reserve/spend LLM credits until the firewall has passed or reduced context to safe refs.
   - Blocked or low-confidence firewall status creates timeline-visible `evidence_instruction_blocked`.

## Residual Risk

- The first implementation must choose rule patterns, confidence thresholds, escaped-evidence format, and quarantine retention policy carefully. These are implementation decisions, now tracked in the Orchestra backlog.

## Validation Target

- Section manifest still complete.
- UI contract includes the new blocker state.
- Placeholder, stale node-canvas status, whitespace, and diff checks remain clean.
