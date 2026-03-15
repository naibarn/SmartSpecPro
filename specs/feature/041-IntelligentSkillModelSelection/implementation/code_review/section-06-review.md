# Section 06 Code Review

## HIGH
- Stale closure in onSuccess callback — localValue captured from wrong render cycle
- Missing component tests (8 stubs in plan)

## MEDIUM
- No Enter key support for keyboard submit
- Number() accepts non-integer floats
- `?? false` on non-optional boolean

## LOW
- Grouped vs flat view inconsistency in conditional editor rendering
- filterAdminModelCatalogRows sorts on every render
