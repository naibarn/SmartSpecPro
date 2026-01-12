# xterm.js 6.0.0 Breaking Changes

## Key Fix We Need
- **#4984 Clear timer when dispose** - This is the fix for our dimensions error!

## Breaking Changes

1. **overviewRulerWidth** - Now a property of `ITerminalOptions.overviewRuler`
   - We don't use this, so no impact

2. **Viewport/scroll bar** - Works very differently now
   - May need testing but should work

3. **Alt -> Ctrl+Arrow hack removed** - Need to add keybindings if needed
   - We don't use this, so no impact

4. **Canvas renderer removed** - Use DOM or WebGL
   - We use FitAddon only, no impact

5. **windowsMode and fastScrollModifier removed**
   - We don't use these, so no impact

## Package Changes

Old packages:
- `xterm` -> `@xterm/xterm`
- `@xterm/addon-fit` -> `@xterm/addon-fit` (same)

## Migration Steps

1. Remove `xterm` package
2. Install `@xterm/xterm@6.0.0`
3. Update imports:
   - `import { Terminal } from "xterm"` -> `import { Terminal } from "@xterm/xterm"`
   - `import "xterm/css/xterm.css"` -> `import "@xterm/xterm/css/xterm.css"`
4. Update `@xterm/addon-fit` to `0.11.0`
