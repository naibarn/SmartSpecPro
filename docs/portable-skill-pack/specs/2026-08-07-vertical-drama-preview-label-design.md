# Vertical Drama Preview Persistent Label

## Approved behavior

Every generated Sub-episode preview video displays the exact Thai label `ตัวอย่าง`
from frame 0 through the final frame, including the generated cover end card.

The label reuses the existing preview title-band position and typography. It does
not change full-episode renders, episode text-overlay plans, or the preview's
duration. The only render-template change is the label content, full-duration
window, and z-index needed to keep it visible above the end card.

## Verification

The Remotion template test must assert exact label text, start frame 0, and a
duration equal to the complete preview duration.
