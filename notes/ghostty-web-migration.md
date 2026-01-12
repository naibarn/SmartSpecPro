# ghostty-web Migration Notes

## Key Points
- **xterm.js API compatible** - just change import from `@xterm/xterm` to `ghostty-web`
- WASM-compiled parser from Ghostty
- Zero runtime dependencies, ~400KB WASM bundle
- Better Unicode/grapheme handling than xterm.js

## Usage Pattern
```typescript
import { init, Terminal } from 'ghostty-web';

await init();  // IMPORTANT: Must call init() first!

const term = new Terminal({
  fontSize: 14,
  theme: {
    background: '#1a1b26',
    foreground: '#a9b1d6',
  },
});

term.open(document.getElementById('terminal'));
term.onData((data) => websocket.send(data));
websocket.onmessage = (e) => term.write(e.data);
```

## Key Differences from xterm.js
1. Must call `init()` before creating Terminal (loads WASM)
2. Uses Ghostty's VT100 parser (more accurate)
3. Better complex script rendering (Devanagari, Arabic)
4. Supports XTPUSHSGR/XTPOPSGR

## opencode Implementation Details
- Uses `ghostty-web` version 0.3.0
- Terminal component is in SolidJS (need to convert to React)
- Uses FitAddon from ghostty-web
- Has SerializeAddon for buffer persistence
- WebSocket-based PTY communication

## Migration Steps for SmartSpecPro
1. Install ghostty-web
2. Remove xterm and @xterm/addon-fit
3. Rewrite PtyXterm.tsx to use ghostty-web API
4. Call init() at app startup
5. Update terminal creation code
