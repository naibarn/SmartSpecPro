# Section 02 Code Review Interview

## Decisions

### User-Decided Items
1. **Missing waveform tests** → ADD NOW (user chose to add the 4 missing waveform tests)
2. **Global test setup scope** → SCOPE TO CLIENT (use environmentMatchGlobs, move setup to jsdom-only)

### Auto-Fixed Items
1. Double portal/overlay → Use DialogPrimitive.Content directly, remove explicit Portal/Overlay
2. Missing DialogDescription → Add aria-describedby={undefined} to opt out
3. Math.random() in render → useMemo for skeleton bar heights
4. Missing useEffect dep → Add project to deps with guard
5. No abort controller → Add mounted ref guard
6. `as any` casts → Type properly with interface extension
7. environmentMatchGlobs → Add client tsx pattern for jsdom auto-assignment
8. Rename pulse keyframe → Use silence-pulse to avoid Tailwind collision

### Let Go
1. Dead handleCutAndCombine → Will be used by section 08
2. Inline style tag → Matches existing codebase pattern (ExportDialog)
3. package-lock.json changes → Already staged, minimal impact
