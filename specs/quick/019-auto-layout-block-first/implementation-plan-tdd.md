# TDD Plan

## Tests First / Update
- client: Auto Layout dialog should show block layouts only, not legacy template names
- client: selected block layout still serializes as `componentRecipeId`
- server: relayout should fall back from skipped/weak recipe to mapped block layout before internal fallback
- server: warnings should describe block fallback, not plain-template fallback

## Regression Checks
- A4 auto-fit remains intact after relayout/rebuild
- legacy template-based relayout API callers still work
- existing Draft with AI block paths remain unchanged
