# Quality-aware Page-by-Page Example

## Project Summary
- Recommended pages: 6
- Primary render output: `render_manifest_json`
- Quality mode: enabled
- Target occupancy range: 0.78–0.92
- Whitespace ceiling for content pages: 0.18

## Page 1 — cover
- Final layout: `hero_text_stack`
- Template switched: yes
- Why: expanded hero to improve page fill
- Quality: occupancy 0.81 / whitespace 0.19 / fitness 90

## Page 2 — content
- Final layout: `split_text_card_image`
- Initial layout: `text_left_image_right_60_40`
- Template switched: yes
- Why: lower half was too empty; image enlarged and callout injected
- Quality: occupancy 0.86 / whitespace 0.14 / fitness 92

## Page 3 — content
- Final layout: `split_text_card_image`
- Initial layout: `image_left_text_right_40_60`
- Template switched: yes
- Why: image and text card expanded to fix underfill
- Quality: occupancy 0.85 / whitespace 0.15 / fitness 91

## Page 4 — content
- Final layout: `text_panel_with_bottom_strip`
- Template switched: no
- Why: practical text-first page already balanced
- Quality: occupancy 0.84 / whitespace 0.16 / fitness 91

## Page 5 — content
- Final layout: `image_band_with_callout`
- Initial layout: `floating_top_right`
- Template switched: yes
- Why: floating image was too small and page felt top-heavy
- Quality: occupancy 0.88 / whitespace 0.12 / fitness 90

## Page 6 — closing
- Final layout: `text_panel_with_bottom_strip`
- Template switched: no
- Why: slightly airier close is acceptable
- Quality: occupancy 0.80 / whitespace 0.20 / fitness 89
