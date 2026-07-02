# Self Review Round 5: Report Image Skill Architecture

## Review Focus

Reviewed the stakeholder proposal to generate report images through report-specific skills. The desired flow is: SmartSpecPro prepares the current validated report data, a report-specific skill creates an image prompt, and the configured image provider renders the final image. The default provider/model should be `gpt-image-2` but configurable.

## Findings Fixed

1. Shareable image generation needed a dedicated skill layer.
   - Added Report Image Skill Architecture to the main spec.
   - Separated SmartSpecPro data package generation, report image skill prompt generation, and image provider rendering.

2. Skills needed explicit contracts.
   - Added `reportImageDataPackage` and `reportImagePromptPackage` contracts.
   - Required report image skills to be versioned, fixture-tested, and provider-agnostic.
   - Required warnings instead of image generation when required report blocks are missing.

3. Initial skill set needed to map to report types.
   - Added recommended initial skills:
     - `keyword_competitive_summary_image`
     - `multi_day_sku_monitor_image`
     - `pricing_intelligence_image`
     - `opportunity_finder_image`
     - `product_enrichment_image`

4. Export persistence needed prompt audit metadata.
   - Added `skillKey`, `skillVersion`, `dataPackageHash`, `promptPackageHash`, `imagePromptJson`, `imageProvider`, and `imageModel` to report export metadata.

5. Implementation plan and UI tests needed skill-specific gates.
   - Updated Section 08 and `claude-plan.md` with image skill registry, prompt generation service, provider adapter, required-block warnings, provider unavailable state, and Playwright evidence.

## Residual Risk

Image providers may render text imperfectly. Implementation should keep visual report images concise, evidence-backed, and include source/disclaimer metadata. For exact text fidelity, deterministic HTML-to-image remains a fallback/export path.
