# Chrome Prompt API QA Matrix - Feature 115

Date: 2026-05-21

This matrix is the required manual gate for real Chrome profiles/devices. Automated typecheck/build/tests verify code paths, but Prompt API exposure and Gemini Nano download behavior must be confirmed in Chrome itself.

## Required Profiles

| Case | Chrome/runtime | Expected result |
| --- | --- | --- |
| Prompt API available | Chrome profile with `LanguageModel.availability()` returning `available` | Side panel shows local AI ready. ProductBrief generation runs locally. Existing capture still works. |
| Prompt API downloadable | Chrome profile with availability `downloadable` | No model download starts on panel load. Download starts only after user action. Progress is visible and cancellable. |
| Prompt API unavailable | Chrome profile/device without `LanguageModel` | Side panel shows fallback/raw-capture state. Existing Shopee/TikTok Shop capture, upload, and server analyze still work. |
| Prompt API error | Mock or devtools override that throws from `availability()` or `create()` | Extension falls back to SmartSpecPro server AI when authenticated, otherwise deterministic raw-capture-only brief. |
| No extension token | Any Prompt API state with no SmartSpecPro token | Capture remains available. Sync/server fallback asks for connection instead of storing raw data. |

## Required Journeys

| Journey | Steps | Expected result |
| --- | --- | --- |
| Shopee local AI | Scan & Review product -> Create Product Brief -> Send insights -> Open Storytelling | Structured insights sync. Storytelling handoff opens Media Studio with a draft only. |
| Shopee server fallback | Disable/unavailable Prompt API -> Create Product Brief while connected | Extension calls `/api/marketplace-captures/insights/server-generate`; synced provider is `server_ai`. |
| TikTok Shop fallback | Open TikTok Shop product -> Scan & Review -> Create Product Brief | Existing capture and structured-only sync work without using raw HTML. |
| Claim blocker | Generate handoff without selected image/evidence | Extension blocks direct storytelling and asks for review instead of opening generation. |
| Media Studio import | Open `/media-studio?marketplaceStorytelling=1&marketplaceInsightId=...` | Video tab is selected, prompt/reference images are preloaded, render is not started. |

## Data Safety Checks

- Confirm synced insight payloads have `rawCaptureIncluded: false`.
- Confirm server rejects requests containing `rawCapture` or `rawCaptureIncluded: true`.
- Confirm telemetry/debug output does not include product text, reviews, comments, raw prompts, cookies, tokens, or HTML.
- Confirm Media Studio receives typed handoff fields, not free-form local AI output.

