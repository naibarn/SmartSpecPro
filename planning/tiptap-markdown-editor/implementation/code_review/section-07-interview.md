# Section 07 Code Review Interview

## Auto-fixes Applied
- **S3**: Fixed Enter/blur double-fire in caption/alt inputs. Changed `onKeyDown` Enter handler to call `e.currentTarget.blur()` instead of directly calling confirm, so `onBlur` is the single source of confirmation. Applied to ImageNodeView, VideoNodeView, AudioNodeView.

## Let Go (No Action)
- **S2**: VIDEO tagName comment — self-explanatory from context
- **S4**: `data-drag-handle` — properly addressed in section 09 (paste/drag-drop)
- **S5**: Barrel export — not needed yet, premature abstraction
