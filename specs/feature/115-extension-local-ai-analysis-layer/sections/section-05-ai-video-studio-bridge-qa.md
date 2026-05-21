# Section 05 - AI Video Studio Bridge And QA

Status: IMPLEMENTED

## Objective

Convert validated insights into draft AI Video Studio inputs without starting render work from the extension.

## Scope

- VideoBrief generation
- AI Video Studio import contract
- Media Studio/Product Library linkage
- regression tests and manual Chrome QA

## Implementation Notes

- `VideoBrief` import creates a draft only.
- Reuse existing marketplace product image access in Media Studio when possible.
- HyperFrames hints are advisory metadata, not render commands.
- User must confirm project creation and attach/confirm assets before render.
- Failed import must not delete local insight records or capture drafts.

## Tests First

- ProductBrief + TrendBrief can produce a valid VideoBrief.
- Invalid scene timing fails validation.
- Send to AI Video Studio creates draft import payload only.
- No render job is started during import.
- Existing Media Studio marketplace product image queries still work.

## Manual QA Matrix

- Chrome 138+
- Chrome below Prompt API support where extension still loads
- Prompt API available
- Prompt API unavailable
- `LanguageModel` exposed but requested options unavailable
- model downloadable/downloading
- model download cancelled
- SmartSpecPro AI fallback enabled
- SmartSpecPro AI fallback disabled
- Windows 11
- macOS 13+
- Linux desktop
- unsupported mobile/browser environment documented as local AI unavailable
- Shopee product page
- TikTok Shop page
- Thai, English, mixed Thai/English source content

## Acceptance Criteria

- VideoBrief can be imported to AI Video Studio as a draft.
- Render remains user-confirmed.
- Shopee/TikTok Shop capture regression tests pass with Prompt API disabled.
- Supported and unsupported Prompt API paths both pass the manual QA matrix.

## Implementation Result

- Added extension-side `VideoBrief` generation from validated `ProductBrief` in `apps/extension/src/shared/localAi.ts`.
- Added sync of `video_brief` payloads through `/api/marketplace-captures/insights`.
- Added side panel action to open Media Studio with marketplace storytelling context after structured sync.
- No render job is started by extension or API insight import.
- Automated verification completed for extension typecheck/build, web typecheck, and marketplace shared schema tests. Manual Chrome QA matrix remains a release activity.
