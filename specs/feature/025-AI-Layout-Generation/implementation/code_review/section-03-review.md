# Section 03 Code Review: Layout Engine

## Critical Issues

### 1. [HIGH] `makeTextElement` includes explicit `undefined` properties
The helper sets `fontSize`, `fontFamily`, `fontWeight`, and `textAlign` even when undefined. Should use conditional insertion like `makeImageElement` and `makeRectElement`.

### 2. [HIGH] Fallback slide NOT validated through Zod
When primary validation fails, the fallback slide bypasses `safeParse()`. A corrupt preset could produce an invalid fallback too.

### 3. [HIGH] `console.error` instead of structured logger
Plan shows `console.error` but project conventions require structured loggers.

## Medium Issues

### 4. [MEDIUM] Border string parsing is fragile
Splitting CSS border shorthand on spaces fails for colors with spaces (e.g., `rgb()`). Since all presets use hex, this works today but is fragile.

### 5. [MEDIUM] Header/footer height NOT scaled by scaleY
For non-standard canvas sizes, header/footer heights remain at their original values, causing disproportionate sizing.

### 6. [MEDIUM] Overlay rect opacity conflicts with rgba alpha
`hero_center` overlay uses `fill: rgba(0,0,0,0.55)` AND `opacity: 0.6`, resulting in effective opacity of ~0.33 instead of ~0.55.

### 7. [MEDIUM] Line element color test is a no-op
The color parameterization test has an empty block for line elements with no assertions.

## Low Issues

### 8. [LOW] Fallback test doesn't actually trigger fallback path
### 9. [LOW] header.titleFontSize fallback inconsistency
### 10. [LOW] Missing totalSlides on TemplateContext
### 11. [LOW] No test for unknown/default template ID
### 12. [LOW] makeImageElement/makeRectElement use unsafe cast
