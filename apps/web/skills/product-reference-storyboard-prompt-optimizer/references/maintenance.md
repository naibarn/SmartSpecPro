# Maintenance

This skill is a post-processor for `product-reference-storyboard`.

Keep its compression rules aligned with the storyboard skill output contract:

- `CAMERA/LIGHT/DEPTH:` is shared, not repeated per frame.
- `PRODUCT VERIFY:` is shared, not repeated per frame.
- 9-frame storyboards must remain complete.
- Optimized output must remain plain prompt text only.
