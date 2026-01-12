# xterm.js Dimensions Error - Root Cause Analysis

## Error Location
- File: `src/browser/Viewport.ts`
- Function: `_innerRefresh()`
- Line 122-123

## The Problem Code

```typescript
private _innerRefresh(): void {
  if (this._charSizeService.height > 0) {
    this._currentRowHeight = this._renderService.dimensions.device.cell.height / this._coreBrowserService.dpr;
    this._currentDeviceCellHeight = this._renderService.dimensions.device.cell.height;
    // ...
  }
}
```

## Root Cause

1. **Constructor calls `setTimeout(() => this.syncScrollArea())`** (line 83)
   - This schedules `syncScrollArea()` to run asynchronously

2. **`syncScrollArea()` calls `_refresh(false)`** which schedules `_innerRefresh()` via `requestAnimationFrame`

3. **`_innerRefresh()` accesses `this._renderService.dimensions`**
   - If `_renderService` is disposed or not initialized, `dimensions` is undefined
   - Accessing `dimensions.device.cell.height` throws the error

## When Error Occurs

The error happens when:
1. Terminal is created and `open()` is called
2. `setTimeout()` in constructor schedules `syncScrollArea()`
3. Before `syncScrollArea()` runs, terminal is disposed (e.g., React Strict Mode unmount)
4. `_innerRefresh()` runs but `_renderService.dimensions` is undefined

## Solution Options

1. **Check if disposed before accessing dimensions**
   - Add `if (this.isDisposed) return;` at start of `_innerRefresh()`

2. **Clear timeout on dispose**
   - Store timeout ID and clear it in dispose()

3. **Null check dimensions**
   - Add `if (!this._renderService?.dimensions) return;`

## For Our Code (PtyXterm.tsx)

We need to ensure:
1. Terminal is not created until container is ready AND visible
2. All internal timers are cleared before dispose
3. Use a flag to prevent any operations after dispose starts
