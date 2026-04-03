# Editorial Layout Planner — Quality-aware Upgrade

This package upgrades the render-safe version into a quality-aware version.

## Added concepts

- `page_fill_rules`
- `quality_optimizer`
- `page_quality`
- `template_switched`
- `switch_reason`
- occupancy / whitespace targets
- post-layout optimization

## What it helps fix

- pages that look too empty
- lower-half whitespace
- tiny floating images on dense pages
- fixed template use that ignores content density

## Included examples

- `example.quality_layout_plan.json`
- `example.quality_render_manifest.json`
- `example.page_by_page.md`
- `QualityAwareManifestPreview.jsx`
