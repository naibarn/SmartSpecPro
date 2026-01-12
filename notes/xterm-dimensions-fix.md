# xterm.js Dimensions Error Fix

## Problem
Error: `Cannot read properties of undefined (reading 'dimensions')`
at `Viewport._innerRefresh`

## Root Cause (from GitHub issues #4983, #5011)
1. **React Strict Mode** causes terminal to mount/unmount quickly
2. **Calling fit() then dispose()** immediately causes race condition
3. **Timer not cleared on dispose** - internal timer fires after terminal is disposed
4. **Fixed in xterm.js 6.0.0** - PR #4984 "Clear timer when dispose"

## Current xterm.js version
- xterm: ^5.3.0 (affected)
- @xterm/addon-fit: ^0.10.0

## Solutions

### Option 1: Upgrade to xterm.js 6.0.0+
The issue is fixed in version 6.0.0

### Option 2: Delay fit() call
Wait for terminal to be fully ready before calling fit()

### Option 3: Guard dispose with delay
Ensure fit() timer completes before dispose

### Option 4: Check if terminal is disposed before operations
Add disposed check before any terminal operations

## Implementation for PtyXterm.tsx
1. Add delay before initial fit() call
2. Use setTimeout to ensure terminal is ready
3. Check disposed flag before fit operations
4. Wrap fit() in try-catch
