# Section 03 Interview Transcript

## Auto-fixes (applied without asking)
- #1: `makeTextElement` - use conditional insertion for optional fields
- #2: Fallback slide - re-validate through Zod
- #6: Overlay rect - remove explicit `opacity` (fill already has alpha)
- #7: Line element color test - add assertions
- #9: `header.titleFontSize` fallback consistency

## User decisions
- #5: Header/footer heights → **Scale proportionally** with scaleY
- #4: Border CSS shorthand → **Keep as-is** (works for all hex-color presets)

## Let go (not worth the change)
- #3: `console.error` in pure function - keep for now
- #8: Fallback test doesn't truly trigger fallback - acceptable
- #10-12: YAGNI
