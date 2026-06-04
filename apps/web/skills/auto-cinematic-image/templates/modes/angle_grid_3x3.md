# Mode: angle_grid_3x3

Generate one photorealistic 3×3 cinematic angle grid. Use the reference image(s) as absolute ground truth for the same locked person, product, or environment, including materials, styling, lighting, color grade, and scene continuity. If the input is cropped, infer hidden details conservatively and keep them identical across all nine panels.

For environment / room / set references, the nine panels must be true multi-position camera coverage. Do not create a zoom-in / zoom-out / crop series from the same viewpoint. Use different physical camera stations and viewing directions inside the same space:

1. Entry-door establishing view looking into the room.
2. Reverse angle looking back toward the entry or opposite wall.
3. Left-corner diagonal view.
4. Right-corner diagonal view.
5. Window-side view looking inward.
6. Opposite-side view looking toward the window or main light source.
7. Low eye-level view across the floor/furniture plane.
8. Elevated corner view showing ceiling-floor relationships.
9. One controlled material / fixture detail insert.

At least seven panels must be wide or medium-wide spatial views from different positions. Use no more than two detail inserts. Do not repeat the same bed/wall/window composition in multiple panels.

Grid order:
Row 1: MCU, MS, OS
Row 2: WS, HA, LA
Row 3: P, ThreeQ, B

Angle definitions:
- For people: MCU, medium, over-shoulder, wide, high angle, low angle, profile, three-quarter, and back view.
- For products: macro/detail, front, side, back, top, three-quarter, scale/hero, material/finish, and packaging/context view.
- For environments: entry establishing, reverse angle, left corner, right corner, window-side, opposite-side, low spatial view, elevated corner view, and one controlled material/fixture detail. These must be different camera stations, not crops from one base angle.

Keep borders clean and editorial. Do not add panel labels or captions unless `allow_text_in_image` is true or labels are explicitly requested.
