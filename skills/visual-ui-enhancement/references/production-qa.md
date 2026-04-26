# Production QA

Before finalizing a UI patch, try to run available commands:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

If project-specific scripts differ, inspect `package.json` and use the closest equivalents.

Manual QA:

- Check mobile, tablet, desktop.
- Check light and dark mode.
- Navigate with keyboard.
- Test loading, empty, error, and disabled states.
- Verify no horizontal overflow.
- Verify icon-only buttons have accessible names.
- Verify no unrelated routes or behavior changed.
