# xterm.js Debug Results

## Test: Rapid Create/Dispose (10 cycles)

### Findings

1. **Error occurs intermittently** - "UNCAUGHT: Script error. at line 0"
   - This is the dimensions error being caught by window.onerror
   - Error occurs 4 times out of 10 cycles

2. **Error timing**:
   - Error happens AFTER dispose() is called
   - xterm.js has internal setTimeout that runs after dispose

3. **Error is from xterm.js internal code**:
   - Viewport constructor: `setTimeout(() => this.syncScrollArea())`
   - This timer runs even after terminal is disposed

## Root Cause Confirmed

The error is **unavoidable** with xterm.js 5.3.0 when:
1. Terminal is created
2. Terminal is disposed quickly (before internal setTimeout completes)
3. Internal timer runs and accesses disposed viewport

## Solutions

### Option 1: Suppress the error (current approach)
- Error is harmless - terminal is already disposed
- Just catch and ignore the error

### Option 2: Upgrade to xterm.js 6.0+
- Fixed in PR #4984
- Uses @xterm/xterm package

### Option 3: Delay dispose
- Wait 100ms before disposing to let internal timers complete
- Not ideal for UX

## Recommendation

**Option 1** is the best for now:
- Error doesn't affect functionality
- Terminal works correctly
- Can upgrade to v6 when stable
