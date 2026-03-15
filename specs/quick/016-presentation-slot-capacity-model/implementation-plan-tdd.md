## Tests First

1. Add shared tests for slot capacity guidance and weighted clamp behavior.
2. Add a UI test proving the inspector renders the slot capacity hint.

## Expected Failures

- No exported helper exists yet for Thai/English capacity guidance.
- Thai-heavy text is still clamped by raw length only.
- The inspector currently renders no slot capacity guidance.

## Regression Checks

- Existing component recipe metadata tests still pass.
- Existing slot binding tests still pass for all built-in components.

