Now I have all the context I need. Let me generate the section content.

# Section 07: FFmpeg Bundling & Sidecar Setup

## Overview

This section configures FFmpeg and FFprobe as Tauri 2 `externalBin` sidecars, replacing the current manual binary path resolution that panics on Linux. The work involves updating the Tauri configuration, placing platform-specific binaries in the correct locations, migrating all Rust code that calls `get_ffmpeg_path()`/`get_ffprobe_path()` to use the Tauri sidecar API, and adding a graceful fallback for Linux and development environments.

## Dependencies

- **Section 03 (Desktop Engine Adapter)**: This section modifies the same Rust files (`ffmpeg.rs`, `render.rs`) that section 03 rebuilds. Coordinate to avoid merge conflicts. Section 03 introduces `job_dispatcher.rs` which should also use sidecar resolution rather than `get_ffmpeg_path()`.

## Current State Analysis

The existing codebase has several problems that this section resolves.

### Problem 1: Hardcoded platform-specific paths

In `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/ffmpeg.rs`, the functions `get_ffmpeg_path()` and `get_ffprobe_path()` (lines 19-56) manually construct paths based on `std::env::current_exe()`:

- **Windows**: `{exe_dir}/resources/ffmpeg/win/ffmpeg.exe`
- **macOS**: `{exe_dir}/../Resources/ffmpeg/mac/ffmpeg`
- **Linux/other**: `panic!("Unsupported platform for bundled FFmpeg")`

This approach is fragile -- it assumes a specific resource directory layout, does not integrate with Tauri's sidecar system, and crashes on Linux.

### Problem 2: No `externalBin` configuration

The current `tauri.conf.json` at `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/tauri.conf.json` has a `bundle` section (lines 27-37) but does not declare any `externalBin` entries. This means Tauri does not manage or bundle FFmpeg/FFprobe binaries.

### Problem 3: Missing `tauri-plugin-shell` dependency

The current `Cargo.toml` at `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/Cargo.toml` does not include `tauri-plugin-shell`, which is required for the `app.shell().sidecar()` API.

### Problem 4: Direct `Command::new()` usage

In `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/render.rs`, the `execute_render` method (line 407-409) calls `Command::new(&ffmpeg_path)` using `std::process::Command` directly. The sidecar approach replaces this with `app.shell().sidecar("ffmpeg")` which returns a managed child process that Tauri can track and kill on app exit.

## Tests

Write these tests BEFORE implementing the changes. The tests are a mix of automated Rust unit tests and manual/CI verification steps.

### Automated Rust Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/ffmpeg_tests.rs`

Add the following test stubs to the existing test module or a new test file:

```
# Test: resolve_ffmpeg_binary returns a valid sidecar command (not a raw PathBuf)
# Test: resolve_ffprobe_binary returns a valid sidecar command (not a raw PathBuf)
# Test: Linux gracefully returns error instead of panic
# Test: ffmpeg_version returns valid version string via sidecar
# Test: get_ffmpeg_path fallback finds system ffmpeg on PATH when sidecar unavailable
# Test: get_ffmpeg_path fallback returns clear error when no ffmpeg found anywhere
```

Since sidecar resolution requires a running Tauri `AppHandle`, the unit tests for binary resolution should test the fallback logic (finding `ffmpeg` on `PATH`) in isolation. The full sidecar integration is verified via manual/CI testing.

**Fallback resolution test (unit-testable without Tauri runtime):**

```rust
// In ffmpeg.rs or a dedicated test module
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_system_ffmpeg_returns_path_if_available() {
        // find_system_ffmpeg() should search PATH for "ffmpeg"
        // On CI/dev machines with ffmpeg installed, this returns Some(PathBuf)
        // The function should never panic
        let result = find_system_ffmpeg();
        // We don't assert Some because CI may not have ffmpeg
        // We just assert it doesn't panic
        assert!(result.is_some() || result.is_none());
    }

    #[test]
    fn test_find_system_ffprobe_returns_path_if_available() {
        let result = find_system_ffprobe();
        assert!(result.is_some() || result.is_none());
    }

    #[test]
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    fn test_linux_does_not_panic() {
        // Previously, get_ffmpeg_path() would panic! on Linux
        // After this section, it should return an error or find system ffmpeg
        let result = find_system_ffmpeg();
        // Key assertion: we reached this line without panicking
    }
}
```

### Manual / CI Verification

These are not automated unit tests but verification steps to run during development or in CI:

```
# Manual Test 1: macOS - build the app and verify ffmpeg sidecar resolves
#   cd apps/tauri-shell && cargo tauri build --target aarch64-apple-darwin
#   Run the app, open Video Editor, verify ffmpeg_version command works

# Manual Test 2: Windows - build and verify ffmpeg sidecar resolves
#   cd apps/tauri-shell && cargo tauri build --target x86_64-pc-windows-msvc
#   Run the app, verify FFmpeg operations work

# Manual Test 3: Linux dev - verify graceful fallback
#   Install ffmpeg via apt, run the app in dev mode
#   Verify it finds system ffmpeg and operations work
#   Uninstall ffmpeg, verify clear error message (not a panic)

# Manual Test 4: Verify sidecar binary is included in app bundle
#   After build, inspect the app bundle contents:
#   macOS: SmartSpec Pro.app/Contents/MacOS/ffmpeg
#   Windows: SmartSpec Pro/ffmpeg.exe
```

## Implementation Details

### Step 1: Add `tauri-plugin-shell` dependency

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/Cargo.toml`

Add `tauri-plugin-shell` to the `[dependencies]` section:

```toml
tauri-plugin-shell = "2"
```

This is also needed for the `uuid` crate if not already present (it is used in `render.rs` but check the dependency list). The existing `Cargo.toml` does not list `uuid` -- it may be a transitive dependency, but it should be declared explicitly.

### Step 2: Register the shell plugin

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/lib.rs`

Add `.plugin(tauri_plugin_shell::init())` to the Tauri builder chain, alongside the existing plugin registrations (lines 12-14):

```rust
.plugin(tauri_plugin_shell::init())
```

This must be added before the `.invoke_handler(...)` call.

### Step 3: Configure `externalBin` in Tauri config

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/tauri.conf.json`

Add `externalBin` to the `bundle` section. The current `bundle` object (lines 27-37) should be updated to include:

```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "externalBin": ["binaries/ffmpeg", "binaries/ffprobe"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

Tauri 2's `externalBin` takes base names without platform suffixes. At build time, Tauri automatically appends the target triple (e.g., `-aarch64-apple-darwin`) and `.exe` on Windows when looking for the binary to bundle.

### Step 4: Create the binaries directory with platform-specific binaries

**Directory to create**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/binaries/`

Place FFmpeg and FFprobe static builds with Tauri's expected naming convention:

```
apps/tauri-shell/binaries/
  ffmpeg-aarch64-apple-darwin          # macOS Apple Silicon
  ffprobe-aarch64-apple-darwin
  ffmpeg-x86_64-apple-darwin           # macOS Intel
  ffprobe-x86_64-apple-darwin
  ffmpeg-x86_64-pc-windows-msvc.exe    # Windows x64
  ffprobe-x86_64-pc-windows-msvc.exe
```

**Important notes on binary sourcing:**

- Use static FFmpeg builds (e.g., from https://ffmpeg.org/download.html or https://evermeet.cx/ffmpeg/ for macOS, https://github.com/BtbN/FFmpeg-Builds for Windows).
- The binaries must be executable (`chmod +x` on macOS/Linux).
- These are large files (80-100MB each). Use `.gitignore` to exclude them and download them in CI or via a setup script. Alternatively, use git-lfs.
- Add a download script (e.g., `apps/tauri-shell/scripts/download-ffmpeg.sh`) that fetches the correct binaries for the current platform.

**Add to `.gitignore`** (or the project-level `.gitignore`):

```
# FFmpeg sidecar binaries (downloaded separately)
apps/tauri-shell/binaries/ffmpeg-*
apps/tauri-shell/binaries/ffprobe-*
```

**Placeholder script** at `/home/dev/projects/SmartSpecPro/apps/tauri-shell/scripts/download-ffmpeg.sh`:

```bash
#!/usr/bin/env bash
# Downloads FFmpeg/FFprobe static builds for the current platform.
# Run this before `cargo tauri build`.
#
# Usage: ./scripts/download-ffmpeg.sh [target_triple]
# Example: ./scripts/download-ffmpeg.sh aarch64-apple-darwin
```

The script body should detect the current platform, download the appropriate static build, rename to the Tauri naming convention, and place in `binaries/`. The specific URLs depend on the chosen FFmpeg distribution.

### Step 5: Migrate `ffmpeg.rs` to use sidecar resolution

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/ffmpeg.rs`

The core change is replacing `get_ffmpeg_path() -> PathBuf` (which returns a filesystem path for use with `std::process::Command`) with a function that uses Tauri's sidecar API. Since the sidecar API requires an `AppHandle`, the function signatures change.

**New approach -- two-tier resolution:**

1. **Primary (production)**: Use `app.shell().sidecar("ffmpeg")` when an `AppHandle` is available. This is the sidecar path -- Tauri resolves the correct platform binary automatically.

2. **Fallback (development/Linux)**: If sidecar resolution fails (binary not found, running on Linux without bundled binaries, or running in dev mode), fall back to searching `PATH` for a system-installed `ffmpeg`.

**Key functions to add/replace:**

```rust
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

/// Find system ffmpeg on PATH (fallback for dev/Linux)
/// Returns the path if found, None otherwise.
/// This function never panics.
pub fn find_system_ffmpeg() -> Option<PathBuf> {
    // Use `which` crate or manual PATH search
    // ...
}

/// Find system ffprobe on PATH (fallback for dev/Linux)
pub fn find_system_ffprobe() -> Option<PathBuf> {
    // ...
}
```

The existing `get_ffmpeg_path()` and `get_ffprobe_path()` functions should be modified to not panic on Linux. Instead, they should:

1. Try the old platform-specific path resolution (for backward compatibility during transition).
2. If that fails, call `find_system_ffmpeg()`.
3. If that also fails, return an `Err` with a clear message.

For commands that use the sidecar API directly (like the new `job_dispatcher.rs` from section 03), they should call `app.shell().sidecar("ffmpeg")` and handle the `Err` by falling back to `find_system_ffmpeg()` + `std::process::Command`.

**Modifying existing Tauri commands:**

The current Tauri commands (`ffmpeg_probe_file`, `ffmpeg_generate_thumbnail`, etc.) use `Command::new(&ffprobe_path)` (from `std::process`). These should be migrated to use the sidecar API. However, this requires an `AppHandle` parameter.

Tauri 2 commands can receive an `app: AppHandle` parameter automatically:

```rust
#[tauri::command]
pub async fn ffmpeg_probe_file(app: AppHandle, path: String) -> Result<MediaFileInfo, String> {
    // Try sidecar first
    // Fall back to system ffprobe
    // ...
}
```

For the sidecar approach, spawning and capturing output is different from `std::process::Command`:

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

// Sidecar approach
let sidecar = app.shell().sidecar("ffprobe").map_err(|e| format!("Sidecar error: {}", e))?;
let (mut rx, _child) = sidecar
    .args(&["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", &path])
    .spawn()
    .map_err(|e| format!("Failed to spawn ffprobe sidecar: {}", e))?;

// Collect output from the receiver
let mut stdout_buf = Vec::new();
while let Some(event) = rx.recv().await {
    match event {
        CommandEvent::Stdout(data) => stdout_buf.extend_from_slice(&data),
        CommandEvent::Terminated(payload) => { /* check exit code */ },
        _ => {}
    }
}
```

Alternatively, if sidecar resolution fails, fall back to `Command::new()` with the system binary path.

**Recommended pattern -- helper function:**

Create a helper that encapsulates the two-tier resolution:

```rust
/// Execute ffmpeg/ffprobe with arguments, using sidecar if available,
/// falling back to system binary.
/// Returns (stdout, stderr) on success.
async fn execute_ffmpeg_binary(
    app: &AppHandle,
    binary: &str,  // "ffmpeg" or "ffprobe"
    args: &[&str],
) -> Result<(Vec<u8>, Vec<u8>), String> {
    // 1. Try sidecar
    // 2. Fallback to system binary
    // 3. Return clear error if neither available
}
```

### Step 6: Migrate `render.rs` to use sidecar

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/render.rs`

The `execute_render` method (line 372) calls `super::ffmpeg::get_ffmpeg_path()` and then `Command::new(&ffmpeg_path)`. This needs to change.

The `start_render` Tauri command (line 583) receives a `tauri::State` but not an `AppHandle`. It needs to also receive the `AppHandle` so it can pass it down to `execute_render` for sidecar resolution:

```rust
#[tauri::command]
pub async fn start_render(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<RenderEngine>>>,
    project_json: String,
    output_path: String
) -> Result<String, String> {
    // Pass app handle through to execute_render
    // ...
}
```

The `RenderEngine::execute_render` method signature must be updated to accept either an `AppHandle` or a pre-resolved binary path.

**Process tracking bug fix (from section 03, but relevant here):**

Currently in `execute_render` (line 409-424), the spawned `child` is used with `.wait()` directly but is never inserted into `self.processes`. This means `cancel_render` (line 617-620) can never find a process to kill. When migrating to sidecar, ensure the child process handle is stored in the `processes` HashMap after spawning.

### Step 7: Update `mod.rs` to export correctly

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/video_editor/mod.rs`

If new public functions are added to `ffmpeg.rs` (like `find_system_ffmpeg`), ensure they are re-exported via `pub use ffmpeg::*;` (which already exists on line 8).

### Step 8: Update `lib.rs` command registration

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/src/lib.rs`

After adding `AppHandle` parameters to existing commands, no changes to the handler registration are needed -- Tauri 2 automatically injects `AppHandle` when a command declares it as a parameter.

However, ensure the shell plugin is registered (Step 2 above).

### Step 9: Tauri plugin permissions (if needed)

Tauri 2 uses a capability/permission system. The `tauri-plugin-shell` plugin may require explicit permission grants for sidecar execution. Check if a `capabilities` directory exists and add shell permissions if needed:

**File to create/modify**: `/home/dev/projects/SmartSpecPro/apps/tauri-shell/src-tauri/capabilities/default.json`

```json
{
  "identifier": "default",
  "description": "Default capabilities",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "fs:default",
    "shell:allow-execute",
    "shell:allow-sidecar"
  ]
}
```

If this file already exists, add the `shell:allow-execute` and `shell:allow-sidecar` permissions to the existing array.

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/tauri-shell/src-tauri/Cargo.toml` | Modify | Add `tauri-plugin-shell = "2"` dependency |
| `apps/tauri-shell/src-tauri/tauri.conf.json` | Modify | Add `externalBin: ["binaries/ffmpeg", "binaries/ffprobe"]` to bundle config |
| `apps/tauri-shell/src-tauri/src/lib.rs` | Modify | Register `tauri_plugin_shell::init()` plugin |
| `apps/tauri-shell/src-tauri/src/video_editor/ffmpeg.rs` | Modify | Replace `get_ffmpeg_path()`/`get_ffprobe_path()` with sidecar resolution + system fallback; add `AppHandle` to command signatures; add `find_system_ffmpeg()`/`find_system_ffprobe()` |
| `apps/tauri-shell/src-tauri/src/video_editor/render.rs` | Modify | Update `start_render` and `execute_render` to accept `AppHandle` and use sidecar; store child process in `processes` HashMap |
| `apps/tauri-shell/src-tauri/src/video_editor/mod.rs` | Modify | Ensure new exports are available (likely no change if `pub use ffmpeg::*` stays) |
| `apps/tauri-shell/src-tauri/capabilities/default.json` | Create/Modify | Add shell plugin permissions for sidecar execution |
| `apps/tauri-shell/binaries/` | Create | Directory for platform-specific FFmpeg/FFprobe static builds |
| `apps/tauri-shell/scripts/download-ffmpeg.sh` | Create | Script to download FFmpeg binaries for the current platform |
| `.gitignore` | Modify | Exclude `apps/tauri-shell/binaries/ffmpeg-*` and `ffprobe-*` |

## Verification Checklist

After implementation, verify each of these:

1. `cargo check` passes in `apps/tauri-shell/src-tauri/` with no compile errors
2. `cargo test` passes -- especially the new fallback resolution tests
3. No `panic!` calls remain in FFmpeg path resolution code
4. On a Linux machine without bundled binaries, the app logs a clear error message instead of panicking
5. On a machine with system `ffmpeg` installed, the fallback correctly finds and uses it
6. `tauri.conf.json` is valid JSON after edits
7. The `binaries/` directory structure matches Tauri's naming convention
8. All existing Tauri commands (`ffmpeg_probe_file`, `ffmpeg_generate_thumbnail`, `ffmpeg_detect_encoders`, `ffmpeg_version`, `ffmpeg_extract_waveform`, `start_render`, `cancel_render`, `get_render_status`, `list_render_jobs`) still compile and are registered in `lib.rs`