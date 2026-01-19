# Video Editor - Security Audit & UX Improvements

## 📋 Table of Contents
1. [Security Vulnerabilities](#security-vulnerabilities)
2. [UX Improvements](#ux-improvements)
3. [Dead Air Detection](#dead-air-detection)
4. [Zoom & Pan System](#zoom-pan-system)
5. [Implementation Plan](#implementation-plan)

---

## 🔒 Security Vulnerabilities

### ⚠️ **Critical Issues**

#### 1. **Path Traversal Attack**
**Location:** `workspace.rs`, `projectManager.ts`

**Vulnerability:**
```rust
// workspace.rs - No path validation
pub fn save_blob_to_file(blob: Vec<u8>, path: String) -> Result<(), String> {
    fs::write(&path, blob)  // ❌ Accepts ANY path!
}
```

**Risk:** User can write files anywhere on system
```typescript
// Attack example:
await invoke('save_blob_to_file', {
    blob: maliciousData,
    path: '../../../etc/passwd'  // 😱
});
```

**Fix:**
```rust
pub fn save_blob_to_file(blob: Vec<u8>, path: String) -> Result<(), String> {
    let workspace_path = get_video_editor_workspace_path()?;
    let workspace = PathBuf::from(&workspace_path);
    let target = PathBuf::from(&path);

    // Validate path is within workspace
    let canonical_target = target.canonicalize()
        .map_err(|_| "Invalid path".to_string())?;
    let canonical_workspace = workspace.canonicalize()
        .map_err(|_| "Workspace not found".to_string())?;

    if !canonical_target.starts_with(&canonical_workspace) {
        return Err("Path traversal detected".to_string());
    }

    fs::write(&canonical_target, blob)
        .map_err(|e| format!("Failed to write: {}", e))
}
```

#### 2. **Command Injection in FFmpeg**
**Location:** `render.rs`

**Vulnerability:**
```rust
// If output_path comes from user input
args.push(output_path.to_string());  // ❌ No sanitization
```

**Risk:** Shell command injection
```typescript
// Attack:
outputPath: "file.mp4; rm -rf /"  // 😱
```

**Fix:**
```rust
fn sanitize_path(path: &str) -> Result<String, String> {
    // Only allow alphanumeric, dash, underscore, dot
    let re = Regex::new(r"^[a-zA-Z0-9_\-\.]+$").unwrap();

    if !re.is_match(path) {
        return Err("Invalid filename characters".to_string());
    }

    // Check extension
    if !path.ends_with(".mp4") && !path.ends_with(".mov") {
        return Err("Invalid file extension".to_string());
    }

    Ok(path.to_string())
}

// Use it:
let safe_path = sanitize_path(&output_path)?;
args.push(safe_path);
```

#### 3. **Unvalidated JSON Deserialization**
**Location:** `projectManager.ts`

**Vulnerability:**
```typescript
// No schema validation
const project: VideoEditorProject = JSON.parse(json);  // ❌
```

**Risk:** Malicious project files can inject code

**Fix:**
```typescript
import Ajv from 'ajv';

const projectSchema = {
    type: 'object',
    required: ['version', 'name', 'timeline', 'assets'],
    properties: {
        version: { type: 'string', pattern: '^\\d+\\.\\d+$' },
        name: { type: 'string', maxLength: 256 },
        timeline: { type: 'object' },
        assets: { type: 'object' }
    }
};

async loadProject(path?: string): Promise<VideoEditorProject> {
    const json = await readTextFile(loadPath);

    // Validate JSON schema
    const ajv = new Ajv();
    const validate = ajv.compile(projectSchema);
    const data = JSON.parse(json);

    if (!validate(data)) {
        throw new Error(`Invalid project: ${ajv.errorsText(validate.errors)}`);
    }

    return data as VideoEditorProject;
}
```

#### 4. **XSS in Project Names**
**Location:** `VideoEditorPhase2.tsx`

**Vulnerability:**
```tsx
// Direct rendering of user input
<div className="project-title">🎬 {project.name}</div>  // ❌
```

**Risk:** XSS if name contains `<script>` tags

**Fix:**
```typescript
// Sanitize project name
import DOMPurify from 'isomorphic-dompurify';

const sanitizeProjectName = (name: string): string => {
    return DOMPurify.sanitize(name, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
    }).slice(0, 256); // Max length
};

// Use:
<div className="project-title">
    🎬 {sanitizeProjectName(project.name)}
</div>
```

### ⚠️ **Medium Issues**

#### 5. **Uncontrolled Resource Consumption**
**Location:** `render.rs`

**Issue:** No limits on:
- Number of clips (could be 10,000+)
- Project duration (could be 24 hours)
- File sizes (could be GBs)

**Fix:**
```rust
const MAX_CLIPS: usize = 1000;
const MAX_DURATION: f64 = 3600.0; // 1 hour
const MAX_FILE_SIZE: u64 = 5 * 1024 * 1024 * 1024; // 5GB

fn validate_project(project: &VideoEditorProject) -> Result<(), String> {
    let total_clips: usize = project.timeline.tracks
        .iter()
        .map(|t| t.clips.len())
        .sum();

    if total_clips > MAX_CLIPS {
        return Err(format!("Too many clips: {} (max: {})", total_clips, MAX_CLIPS));
    }

    if project.settings.duration > MAX_DURATION {
        return Err(format!("Duration too long: {}s (max: {}s)",
            project.settings.duration, MAX_DURATION));
    }

    Ok(())
}
```

#### 6. **Missing Input Validation**
**Location:** Multiple components

**Issues:**
- Bitrate: accepts 999999999
- Volume: accepts -100 to 100
- FPS: accepts 999

**Fix:**
```typescript
// Add validation functions
const validateBitrate = (bitrate: number): number => {
    return Math.max(1000, Math.min(50000, bitrate));
};

const validateVolume = (volume: number): number => {
    return Math.max(0, Math.min(1, volume));
};

const validateFPS = (fps: number): number => {
    const allowed = [24, 25, 30, 50, 60];
    return allowed.includes(fps) ? fps : 30;
};
```

### ⚠️ **Low Issues**

#### 7. **Sensitive Data in Logs**
```typescript
console.log('Project loaded:', project);  // ❌ Logs full project
console.error('Failed to save:', error);  // ❌ Might log paths
```

**Fix:**
```typescript
// Use safe logging
const safeLog = (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
        console.log(message, data);
    } else {
        // Production: log to file without sensitive data
        console.log(message);
    }
};
```

---

## 🎨 UX Improvements

### 🚨 **Critical UX Issues**

#### 1. **No Loading States**
**Problem:** User doesn't know if app is working

**Current:**
```tsx
// No loading indicator when downloading
handleAddToTimeline(asset);  // ❌ Blocks silently
```

**Fix:**
```tsx
const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

const handleAddToTimeline = async (asset: MediaLibraryAsset) => {
    setLoadingStates(prev => ({ ...prev, [asset.id]: true }));

    try {
        await downloadAndAdd(asset);
    } finally {
        setLoadingStates(prev => ({ ...prev, [asset.id]: false }));
    }
};

// Show spinner
{loadingStates[asset.id] && <Spinner />}
```

#### 2. **No Error Recovery**
**Problem:** Errors just alert() and lose data

**Current:**
```typescript
catch (error) {
    alert('Failed!');  // ❌ User loses work
}
```

**Fix:**
```tsx
const ErrorBoundary: React.FC = ({ children }) => {
    const [error, setError] = useState<Error | null>(null);

    if (error) {
        return (
            <div className="error-recovery">
                <h2>😔 Something went wrong</h2>
                <p>{error.message}</p>
                <button onClick={() => {
                    // Try to save before reload
                    projectManager.autoSave(project);
                    window.location.reload();
                }}>
                    Reload (auto-saved)
                </button>
            </div>
        );
    }

    return <>{children}</>;
};
```

#### 3. **No Confirmation Dialogs**
**Problem:** Destructive actions without confirmation

**Current:**
```typescript
handleClipDelete(clipId);  // ❌ No undo warning
```

**Fix:**
```tsx
const ConfirmDialog: React.FC<{
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ message, onConfirm, onCancel }) => (
    <div className="confirm-dialog">
        <p>{message}</p>
        <button onClick={onConfirm}>Delete</button>
        <button onClick={onCancel}>Cancel</button>
        <p className="hint">💡 You can undo with Ctrl+Z</p>
    </div>
);
```

### 📊 **High Priority UX**

#### 4. **Better Timeline Navigation**
**Add:**
- Mini-map for long timelines
- Zoom to selection
- Zoom to fit
- Markers/bookmarks

```tsx
const TimelineNavigation: React.FC = () => {
    return (
        <div className="timeline-nav">
            <button onClick={zoomToSelection}>🔍 Zoom to Selection</button>
            <button onClick={zoomToFit}>⊡ Fit to Window</button>
            <button onClick={addMarker}>📍 Add Marker</button>

            {/* Mini-map */}
            <div className="timeline-minimap">
                <div className="minimap-viewport" />
                {clips.map(clip => (
                    <div key={clip.id} className="minimap-clip" />
                ))}
            </div>
        </div>
    );
};
```

#### 5. **Clip Thumbnails in Timeline**
**Show video thumbnails in clips**

```tsx
const ClipWithThumbnail: React.FC<{ clip: Clip }> = ({ clip }) => {
    const [thumbnail, setThumbnail] = useState<string | null>(null);

    useEffect(() => {
        if (asset.thumbnailPath) {
            setThumbnail(asset.thumbnailPath);
        } else {
            // Generate on demand
            generateThumbnail(asset.path).then(setThumbnail);
        }
    }, [asset]);

    return (
        <div className="clip-with-thumbnail">
            {thumbnail && <img src={thumbnail} />}
            <div className="clip-overlay">
                <span>{asset.filename}</span>
            </div>
        </div>
    );
};
```

#### 6. **Drag & Drop from Desktop**
**Allow dropping video files directly**

```tsx
const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);

    files.forEach(async file => {
        if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
            // Import to workspace
            await importLocalFile(file);
        }
    });
};

<div onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
    <Timeline />
</div>
```

#### 7. **Keyboard Shortcut Overlay**
**Show shortcuts on `?` key**

```tsx
const ShortcutsOverlay: React.FC = () => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === '?') setShow(!show);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    if (!show) return null;

    return (
        <div className="shortcuts-overlay">
            <h2>⌨️ Keyboard Shortcuts</h2>
            <table>
                <tr><td>Space</td><td>Play/Pause</td></tr>
                <tr><td>←/→</td><td>Frame Step</td></tr>
                <tr><td>Delete</td><td>Delete Clip</td></tr>
                <tr><td>Ctrl+S</td><td>Save</td></tr>
                <tr><td>Ctrl+Z</td><td>Undo</td></tr>
            </table>
        </div>
    );
};
```

### 📝 **Medium Priority UX**

#### 8. **Recent Projects Panel**
```tsx
const RecentProjects: React.FC = () => {
    const [recent, setRecent] = useState<RecentProject[]>([]);

    useEffect(() => {
        projectManager.getRecentProjects().then(setRecent);
    }, []);

    return (
        <div className="recent-projects">
            <h3>Recent Projects</h3>
            {recent.map(project => (
                <div key={project.path} onClick={() => loadProject(project.path)}>
                    <span>{project.name}</span>
                    <span>{formatDate(project.modifiedAt)}</span>
                </div>
            ))}
        </div>
    );
};
```

#### 9. **Project Templates**
```typescript
const templates = {
    youtube: {
        name: 'YouTube Video',
        settings: { width: 1920, height: 1080, fps: 30 },
        tracks: [
            { type: 'video', name: 'Main Video' },
            { type: 'audio', name: 'Music' },
            { type: 'audio', name: 'Voiceover' }
        ]
    },
    instagram: {
        name: 'Instagram Reel',
        settings: { width: 1080, height: 1920, fps: 30 },
        tracks: [/* ... */]
    }
};
```

#### 10. **Timeline Rulers & Guides**
```tsx
// Add visual guides
<div className="timeline-guides">
    <div className="guide-line" style={{ left: '50%' }}>
        Center
    </div>
    <div className="guide-time" style={{ left: `${currentTime}px` }}>
        {formatTime(currentTime)}
    </div>
</div>
```

---

## 🔇 Dead Air Detection & Removal

### 📋 **Problem Analysis**

**Scenario:** User imports video with voiceover that has:
- Silent gaps (dead air)
- Pauses between sentences
- Long thinking pauses

**User wants:**
- Automatically detect silence
- Option to remove or shorten gaps
- Maintain natural flow

### 🎯 **Solution: Silence Detection System**

#### **Architecture:**

```
1. Audio Analysis (Rust)
   ├─ FFmpeg extracts audio waveform
   ├─ Detect silence regions (threshold-based)
   └─ Return array of silence segments

2. UI Visualization (React)
   ├─ Show silence regions on timeline
   ├─ Allow user to review/adjust
   └─ Bulk remove or shorten

3. Auto-edit (Smart)
   ├─ Keep short pauses (< 0.5s) - natural
   ├─ Shorten long pauses (> 1s) to 0.5s
   └─ Remove very long pauses (> 3s)
```

#### **Implementation:**

**1. Rust Backend - Silence Detection**

```rust
// video_editor/audio_analysis.rs

#[derive(Debug, Serialize, Deserialize)]
pub struct SilenceSegment {
    pub start: f64,      // seconds
    pub end: f64,
    pub duration: f64,
    pub volume_db: f64,  // average volume in dB
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioAnalysis {
    pub duration: f64,
    pub silence_segments: Vec<SilenceSegment>,
    pub speech_segments: Vec<SilenceSegment>,
    pub total_silence: f64,
    pub speech_ratio: f64,  // 0.0-1.0
}

/// Detect silence in audio file
#[tauri::command]
pub async fn detect_silence(
    input_path: String,
    threshold_db: f64,      // -50dB default
    min_duration: f64       // 0.5s default
) -> Result<AudioAnalysis, String> {
    let ffmpeg_path = super::ffmpeg::get_ffmpeg_path();

    // Use FFmpeg silencedetect filter
    let output = Command::new(&ffmpeg_path)
        .args(&[
            "-i", &input_path,
            "-af", &format!("silencedetect=n={}dB:d={}", threshold_db, min_duration),
            "-f", "null",
            "-"
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    // Parse output
    let mut silence_segments = Vec::new();
    let mut lines = stderr.lines();

    while let Some(line) = lines.next() {
        if line.contains("silence_start:") {
            let start = parse_silence_value(line)?;

            if let Some(next_line) = lines.next() {
                if next_line.contains("silence_end:") {
                    let end = parse_silence_value(next_line)?;
                    let duration = end - start;

                    silence_segments.push(SilenceSegment {
                        start,
                        end,
                        duration,
                        volume_db: threshold_db
                    });
                }
            }
        }
    }

    // Get total duration
    let file_info = super::ffmpeg::ffmpeg_probe_file(input_path).await?;
    let duration = file_info.duration;

    // Calculate speech segments (inverse of silence)
    let mut speech_segments = Vec::new();
    let mut last_end = 0.0;

    for silence in &silence_segments {
        if silence.start > last_end {
            speech_segments.push(SilenceSegment {
                start: last_end,
                end: silence.start,
                duration: silence.start - last_end,
                volume_db: 0.0
            });
        }
        last_end = silence.end;
    }

    // Add final speech segment
    if last_end < duration {
        speech_segments.push(SilenceSegment {
            start: last_end,
            end: duration,
            duration: duration - last_end,
            volume_db: 0.0
        });
    }

    let total_silence: f64 = silence_segments.iter().map(|s| s.duration).sum();
    let speech_ratio = (duration - total_silence) / duration;

    Ok(AudioAnalysis {
        duration,
        silence_segments,
        speech_segments,
        total_silence,
        speech_ratio
    })
}

fn parse_silence_value(line: &str) -> Result<f64, String> {
    line.split(':')
        .nth(1)
        .and_then(|s| s.split('|').next())
        .and_then(|s| s.trim().parse().ok())
        .ok_or_else(|| "Failed to parse silence value".to_string())
}

/// Auto-remove dead air from clip
#[tauri::command]
pub async fn auto_remove_dead_air(
    clip_id: String,
    project_json: String,
    mode: String  // "remove_all", "shorten", "smart"
) -> Result<Vec<ClipSplit>, String> {
    let project: VideoEditorProject = serde_json::from_str(&project_json)?;

    // Find clip
    let clip = find_clip_in_project(&project, &clip_id)?;
    let asset = project.assets.get(&clip.asset_id)
        .ok_or("Asset not found")?;

    // Analyze audio
    let analysis = detect_silence(
        asset.path.clone(),
        -40.0,  // threshold
        0.5     // min duration
    ).await?;

    // Generate split points based on mode
    let splits = match mode.as_str() {
        "remove_all" => remove_all_silence(&analysis),
        "shorten" => shorten_silence(&analysis, 0.3), // 0.3s max
        "smart" => smart_silence_removal(&analysis),
        _ => return Err("Invalid mode".to_string())
    };

    Ok(splits)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClipSplit {
    pub start: f64,
    pub end: f64,
    pub action: String,  // "keep", "remove", "shorten"
    pub new_duration: Option<f64>
}

fn smart_silence_removal(analysis: &AudioAnalysis) -> Vec<ClipSplit> {
    let mut splits = Vec::new();

    for segment in &analysis.silence_segments {
        if segment.duration < 0.5 {
            // Keep short pauses (natural)
            splits.push(ClipSplit {
                start: segment.start,
                end: segment.end,
                action: "keep".to_string(),
                new_duration: None
            });
        } else if segment.duration < 2.0 {
            // Shorten medium pauses to 0.3s
            splits.push(ClipSplit {
                start: segment.start,
                end: segment.end,
                action: "shorten".to_string(),
                new_duration: Some(0.3)
            });
        } else {
            // Remove long pauses completely
            splits.push(ClipSplit {
                start: segment.start,
                end: segment.end,
                action: "remove".to_string(),
                new_duration: None
            });
        }
    }

    splits
}
```

**2. TypeScript Service**

```typescript
// services/audioAnalysisService.ts

export interface SilenceSegment {
    start: number;
    end: number;
    duration: number;
    volumeDb: number;
}

export interface AudioAnalysis {
    duration: number;
    silenceSegments: SilenceSegment[];
    speechSegments: SilenceSegment[];
    totalSilence: number;
    speechRatio: number;
}

export class AudioAnalysisService {

    async detectSilence(
        filePath: string,
        thresholdDb: number = -40,
        minDuration: number = 0.5
    ): Promise<AudioAnalysis> {
        return await invoke<AudioAnalysis>('detect_silence', {
            inputPath: filePath,
            thresholdDb,
            minDuration
        });
    }

    async autoRemoveDeadAir(
        clipId: string,
        project: VideoEditorProject,
        mode: 'remove_all' | 'shorten' | 'smart'
    ): Promise<ClipSplit[]> {
        const projectJson = JSON.stringify(project);

        return await invoke<ClipSplit[]>('auto_remove_dead_air', {
            clipId,
            projectJson,
            mode
        });
    }

    applySplitsToTimeline(
        clip: Clip,
        splits: ClipSplit[],
        track: Track
    ): Clip[] {
        const newClips: Clip[] = [];
        let currentTime = clip.startTime;

        for (const split of splits) {
            if (split.action === 'keep' || split.action === 'shorten') {
                const duration = split.newDuration || (split.end - split.start);

                newClips.push({
                    ...clip,
                    id: generateId('clip'),
                    startTime: currentTime,
                    duration,
                    trimIn: clip.trimIn + split.start,
                    trimOut: clip.trimIn + split.end
                });

                currentTime += duration;
            }
            // 'remove' = skip this segment
        }

        return newClips;
    }
}

export const audioAnalysisService = new AudioAnalysisService();
```

**3. React UI Component**

```tsx
// components/videoeditor/DeadAirPanel.tsx

export const DeadAirPanel: React.FC<{
    clip: Clip;
    asset: Asset;
    onApply: (newClips: Clip[]) => void;
}> = ({ clip, asset, onApply }) => {
    const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
    const [mode, setMode] = useState<'smart' | 'shorten' | 'remove_all'>('smart');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        try {
            const result = await audioAnalysisService.detectSilence(asset.path);
            setAnalysis(result);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleApply = async () => {
        if (!analysis) return;

        const splits = await audioAnalysisService.autoRemoveDeadAir(
            clip.id,
            project,
            mode
        );

        const newClips = audioAnalysisService.applySplitsToTimeline(
            clip,
            splits,
            track
        );

        onApply(newClips);
    };

    return (
        <div className="dead-air-panel">
            <h3>🔇 Dead Air Detection</h3>

            {!analysis ? (
                <button onClick={handleAnalyze} disabled={isAnalyzing}>
                    {isAnalyzing ? 'Analyzing...' : 'Analyze Audio'}
                </button>
            ) : (
                <>
                    {/* Results */}
                    <div className="analysis-results">
                        <div className="stat">
                            <span>Speech Ratio:</span>
                            <strong>{(analysis.speechRatio * 100).toFixed(1)}%</strong>
                        </div>
                        <div className="stat">
                            <span>Total Silence:</span>
                            <strong>{analysis.totalSilence.toFixed(1)}s</strong>
                        </div>
                        <div className="stat">
                            <span>Silent Regions:</span>
                            <strong>{analysis.silenceSegments.length}</strong>
                        </div>
                    </div>

                    {/* Visualization */}
                    <div className="silence-visualization">
                        {analysis.silenceSegments.map((segment, i) => (
                            <div
                                key={i}
                                className="silence-segment"
                                style={{
                                    left: `${(segment.start / analysis.duration) * 100}%`,
                                    width: `${(segment.duration / analysis.duration) * 100}%`
                                }}
                                title={`${segment.duration.toFixed(2)}s silence`}
                            />
                        ))}
                    </div>

                    {/* Mode Selection */}
                    <div className="mode-selection">
                        <label>
                            <input
                                type="radio"
                                checked={mode === 'smart'}
                                onChange={() => setMode('smart')}
                            />
                            Smart (Recommended)
                            <span className="hint">Keep natural pauses, remove long gaps</span>
                        </label>

                        <label>
                            <input
                                type="radio"
                                checked={mode === 'shorten'}
                                onChange={() => setMode('shorten')}
                            />
                            Shorten All
                            <span className="hint">Reduce all pauses to 0.3s</span>
                        </label>

                        <label>
                            <input
                                type="radio"
                                checked={mode === 'remove_all'}
                                onChange={() => setMode('remove_all')}
                            />
                            Remove All
                            <span className="hint">Delete all silent regions</span>
                        </label>
                    </div>

                    {/* Preview */}
                    <div className="preview-info">
                        <p>
                            Original: {analysis.duration.toFixed(1)}s →
                            New: {calculateNewDuration(analysis, mode).toFixed(1)}s
                        </p>
                        <p>
                            Saved: {(analysis.duration - calculateNewDuration(analysis, mode)).toFixed(1)}s
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="actions">
                        <button onClick={() => setAnalysis(null)}>
                            Re-analyze
                        </button>
                        <button onClick={handleApply} className="primary">
                            Apply Changes
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
```

---

## 🎬 Zoom & Pan Animation System

### 📋 **Problem Analysis**

**User wants:**
- Ken Burns effect (zoom + pan)
- Custom zoom in/out
- Pan left/right/up/down
- Bezier easing curves
- Keyframe animation

### 🎯 **Solution: Transform Animation System**

#### **Architecture:**

```
1. Transform Model
   ├─ Position (x, y) - pan
   ├─ Scale (zoom) - 0.5x to 3x
   ├─ Rotation - optional
   └─ Keyframes with easing

2. FFmpeg Implementation
   ├─ zoompan filter
   ├─ scale + crop combination
   └─ Complex filtergraph

3. UI Controls
   ├─ Visual canvas editor
   ├─ Keyframe timeline
   └─ Preset animations
```

#### **Implementation:**

**1. Data Model**

```typescript
// types/videoEditor.ts

export interface Transform {
    position: { x: number; y: number };  // -1 to 1 (normalized)
    scale: number;                       // 0.5 to 3
    rotation: number;                    // degrees
}

export interface Keyframe {
    time: number;        // seconds from clip start
    transform: Transform;
    easing: EasingFunction;
}

export type EasingFunction =
    | 'linear'
    | 'easeIn'
    | 'easeOut'
    | 'easeInOut'
    | 'bounce'
    | 'elastic';

export interface AnimationEffect extends Effect {
    type: 'animation';
    parameters: {
        keyframes: Keyframe[];
        loop: boolean;
    };
}

// Add to Clip
export interface Clip {
    // ... existing fields
    transform?: Transform;        // Static transform
    animation?: AnimationEffect;  // Animated transform
}
```

**2. Preset Animations**

```typescript
// Preset library
export const ANIMATION_PRESETS = {
    kenBurns: {
        name: 'Ken Burns (Zoom In)',
        keyframes: [
            {
                time: 0,
                transform: { position: { x: 0, y: 0 }, scale: 1.0, rotation: 0 },
                easing: 'easeInOut'
            },
            {
                time: 'end',  // Special: end of clip
                transform: { position: { x: 0, y: 0 }, scale: 1.3, rotation: 0 },
                easing: 'linear'
            }
        ]
    },

    kenBurnsOut: {
        name: 'Ken Burns (Zoom Out)',
        keyframes: [
            {
                time: 0,
                transform: { position: { x: 0, y: 0 }, scale: 1.3, rotation: 0 },
                easing: 'easeInOut'
            },
            {
                time: 'end',
                transform: { position: { x: 0, y: 0 }, scale: 1.0, rotation: 0 },
                easing: 'linear'
            }
        ]
    },

    panRight: {
        name: 'Pan Right',
        keyframes: [
            {
                time: 0,
                transform: { position: { x: -0.2, y: 0 }, scale: 1.2, rotation: 0 },
                easing: 'linear'
            },
            {
                time: 'end',
                transform: { position: { x: 0.2, y: 0 }, scale: 1.2, rotation: 0 },
                easing: 'linear'
            }
        ]
    },

    zoomInPanRight: {
        name: 'Zoom In + Pan Right',
        keyframes: [
            {
                time: 0,
                transform: { position: { x: -0.1, y: 0 }, scale: 1.0, rotation: 0 },
                easing: 'easeInOut'
            },
            {
                time: 'end',
                transform: { position: { x: 0.1, y: 0 }, scale: 1.5, rotation: 0 },
                easing: 'easeInOut'
            }
        ]
    }
};
```

**3. FFmpeg Filter Generator**

```rust
// video_editor/animation.rs

pub fn generate_animation_filter(
    clip: &Clip,
    asset: &Asset,
    settings: &ProjectSettings
) -> Result<String, String> {
    if let Some(animation) = &clip.animation {
        if animation.keyframes.is_empty() {
            return Ok(String::new());
        }

        // Use zoompan filter for Ken Burns
        if is_zoom_only(&animation.keyframes) {
            return generate_zoompan_filter(clip, asset, animation, settings);
        }

        // Use scale + crop for pan
        if is_pan_only(&animation.keyframes) {
            return generate_pan_filter(clip, asset, animation, settings);
        }

        // Complex: use scale + crop + pad
        generate_complex_transform_filter(clip, asset, animation, settings)
    } else if let Some(transform) = &clip.transform {
        // Static transform
        generate_static_transform_filter(transform, settings)
    } else {
        Ok(String::new())
    }
}

fn generate_zoompan_filter(
    clip: &Clip,
    asset: &Asset,
    animation: &AnimationEffect,
    settings: &ProjectSettings
) -> Result<String, String> {
    let start_kf = &animation.keyframes[0];
    let end_kf = &animation.keyframes[animation.keyframes.len() - 1];

    let zoom_start = start_kf.transform.scale;
    let zoom_end = end_kf.transform.scale;

    // Calculate frames
    let fps = settings.fps as f64;
    let duration_frames = (clip.duration * fps) as u32;

    // zoompan filter
    // z='zoom factor':d='duration in frames':x='x position':y='y position'
    let filter = format!(
        "zoompan=z='if(lte(on,{0}),{1}+{2}*(on/{0}),{3})':d={0}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={}x{}",
        duration_frames,
        zoom_start,
        zoom_end - zoom_start,
        zoom_end,
        settings.width,
        settings.height
    );

    Ok(filter)
}

fn generate_pan_filter(
    clip: &Clip,
    asset: &Asset,
    animation: &AnimationEffect,
    settings: &ProjectSettings
) -> Result<String, String> {
    let start_kf = &animation.keyframes[0];
    let end_kf = &animation.keyframes[animation.keyframes.len() - 1];

    let scale = start_kf.transform.scale;

    // Scale up first
    let scaled_w = (settings.width as f64 * scale) as u32;
    let scaled_h = (settings.height as f64 * scale) as u32;

    // Calculate crop positions
    let start_x = ((start_kf.transform.position.x + 1.0) / 2.0 * (scaled_w - settings.width) as f64) as i32;
    let end_x = ((end_kf.transform.position.x + 1.0) / 2.0 * (scaled_w - settings.width) as f64) as i32;

    let fps = settings.fps as f64;
    let duration_frames = (clip.duration * fps) as u32;

    // Animated crop
    let filter = format!(
        "scale={}:{},crop={}:{}:x='{}+({}-{})*(n/{})':y=0",
        scaled_w, scaled_h,
        settings.width, settings.height,
        start_x,
        end_x, start_x,
        duration_frames
    );

    Ok(filter)
}
```

**4. Visual Transform Editor**

```tsx
// components/videoeditor/TransformEditor.tsx

export const TransformEditor: React.FC<{
    clip: Clip;
    asset: Asset;
    onTransformChange: (animation: AnimationEffect) => void;
}> = ({ clip, asset, onTransformChange }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [keyframes, setKeyframes] = useState<Keyframe[]>([
        {
            time: 0,
            transform: { position: { x: 0, y: 0 }, scale: 1, rotation: 0 },
            easing: 'easeInOut'
        }
    ]);
    const [selectedKeyframe, setSelectedKeyframe] = useState(0);
    const [previewTime, setPreviewTime] = useState(0);

    // Draw preview on canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Get transform at preview time
        const transform = interpolateTransform(keyframes, previewTime);

        // Draw transformed video preview
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(transform.scale, transform.scale);
        ctx.translate(
            transform.position.x * canvas.width / 2,
            transform.position.y * canvas.height / 2
        );
        ctx.rotate(transform.rotation * Math.PI / 180);

        // Draw thumbnail
        if (asset.thumbnailPath) {
            const img = new Image();
            img.src = asset.thumbnailPath;
            ctx.drawImage(img, -canvas.width/2, -canvas.height/2, canvas.width, canvas.height);
        }

        ctx.restore();

        // Draw bounds
        ctx.strokeStyle = '#0078d4';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);

    }, [keyframes, previewTime, asset.thumbnailPath]);

    const addKeyframe = () => {
        const newKeyframe: Keyframe = {
            time: previewTime,
            transform: interpolateTransform(keyframes, previewTime),
            easing: 'easeInOut'
        };

        setKeyframes([...keyframes, newKeyframe].sort((a, b) => a.time - b.time));
    };

    const updateKeyframe = (index: number, transform: Partial<Transform>) => {
        const updated = [...keyframes];
        updated[index] = {
            ...updated[index],
            transform: { ...updated[index].transform, ...transform }
        };
        setKeyframes(updated);
    };

    const applyPreset = (presetName: keyof typeof ANIMATION_PRESETS) => {
        const preset = ANIMATION_PRESETS[presetName];
        const kfs = preset.keyframes.map(kf => ({
            ...kf,
            time: kf.time === 'end' ? clip.duration : kf.time
        }));
        setKeyframes(kfs);
    };

    return (
        <div className="transform-editor">
            <div className="editor-header">
                <h3>🎬 Transform & Animation</h3>
            </div>

            {/* Preset Buttons */}
            <div className="presets">
                <h4>Quick Presets:</h4>
                {Object.entries(ANIMATION_PRESETS).map(([key, preset]) => (
                    <button
                        key={key}
                        onClick={() => applyPreset(key as any)}
                        className="preset-btn"
                    >
                        {preset.name}
                    </button>
                ))}
            </div>

            {/* Visual Canvas */}
            <div className="canvas-container">
                <canvas
                    ref={canvasRef}
                    width={640}
                    height={360}
                    className="preview-canvas"
                />

                {/* Controls overlay */}
                <div className="canvas-controls">
                    <button onClick={() => updateKeyframe(selectedKeyframe, {
                        scale: keyframes[selectedKeyframe].transform.scale * 1.1
                    })}>
                        🔍+
                    </button>
                    <button onClick={() => updateKeyframe(selectedKeyframe, {
                        scale: keyframes[selectedKeyframe].transform.scale * 0.9
                    })}>
                        🔍-
                    </button>
                </div>
            </div>

            {/* Keyframe Timeline */}
            <div className="keyframe-timeline">
                <div className="timeline-header">
                    <span>Keyframes</span>
                    <button onClick={addKeyframe}>+ Add Keyframe</button>
                </div>

                <div className="timeline-track">
                    {keyframes.map((kf, i) => (
                        <div
                            key={i}
                            className={`keyframe ${i === selectedKeyframe ? 'selected' : ''}`}
                            style={{ left: `${(kf.time / clip.duration) * 100}%` }}
                            onClick={() => setSelectedKeyframe(i)}
                        >
                            <div className="keyframe-marker" />
                            <div className="keyframe-time">{kf.time.toFixed(2)}s</div>
                        </div>
                    ))}

                    {/* Preview cursor */}
                    <div
                        className="preview-cursor"
                        style={{ left: `${(previewTime / clip.duration) * 100}%` }}
                    />
                </div>

                {/* Scrub bar */}
                <input
                    type="range"
                    min="0"
                    max={clip.duration}
                    step="0.01"
                    value={previewTime}
                    onChange={(e) => setPreviewTime(parseFloat(e.target.value))}
                    className="scrub-bar"
                />
            </div>

            {/* Keyframe Properties */}
            {selectedKeyframe !== -1 && (
                <div className="keyframe-properties">
                    <h4>Keyframe {selectedKeyframe + 1}</h4>

                    <div className="property">
                        <label>Position X:</label>
                        <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.01"
                            value={keyframes[selectedKeyframe].transform.position.x}
                            onChange={(e) => updateKeyframe(selectedKeyframe, {
                                position: {
                                    ...keyframes[selectedKeyframe].transform.position,
                                    x: parseFloat(e.target.value)
                                }
                            })}
                        />
                        <span>{keyframes[selectedKeyframe].transform.position.x.toFixed(2)}</span>
                    </div>

                    <div className="property">
                        <label>Position Y:</label>
                        <input
                            type="range"
                            min="-1"
                            max="1"
                            step="0.01"
                            value={keyframes[selectedKeyframe].transform.position.y}
                            onChange={(e) => updateKeyframe(selectedKeyframe, {
                                position: {
                                    ...keyframes[selectedKeyframe].transform.position,
                                    y: parseFloat(e.target.value)
                                }
                            })}
                        />
                        <span>{keyframes[selectedKeyframe].transform.position.y.toFixed(2)}</span>
                    </div>

                    <div className="property">
                        <label>Scale (Zoom):</label>
                        <input
                            type="range"
                            min="0.5"
                            max="3"
                            step="0.1"
                            value={keyframes[selectedKeyframe].transform.scale}
                            onChange={(e) => updateKeyframe(selectedKeyframe, {
                                scale: parseFloat(e.target.value)
                            })}
                        />
                        <span>{keyframes[selectedKeyframe].transform.scale.toFixed(1)}x</span>
                    </div>

                    <div className="property">
                        <label>Rotation:</label>
                        <input
                            type="range"
                            min="-180"
                            max="180"
                            step="1"
                            value={keyframes[selectedKeyframe].transform.rotation}
                            onChange={(e) => updateKeyframe(selectedKeyframe, {
                                rotation: parseFloat(e.target.value)
                            })}
                        />
                        <span>{keyframes[selectedKeyframe].transform.rotation}°</span>
                    </div>

                    <div className="property">
                        <label>Easing:</label>
                        <select
                            value={keyframes[selectedKeyframe].easing}
                            onChange={(e) => {
                                const updated = [...keyframes];
                                updated[selectedKeyframe].easing = e.target.value as EasingFunction;
                                setKeyframes(updated);
                            }}
                        >
                            <option value="linear">Linear</option>
                            <option value="easeIn">Ease In</option>
                            <option value="easeOut">Ease Out</option>
                            <option value="easeInOut">Ease In/Out</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Apply Button */}
            <div className="editor-footer">
                <button
                    onClick={() => onTransformChange({
                        type: 'animation',
                        parameters: {
                            keyframes,
                            loop: false
                        }
                    })}
                    className="apply-btn"
                >
                    Apply Animation
                </button>
            </div>
        </div>
    );
};

// Interpolate transform between keyframes
function interpolateTransform(keyframes: Keyframe[], time: number): Transform {
    if (keyframes.length === 0) {
        return { position: { x: 0, y: 0 }, scale: 1, rotation: 0 };
    }

    if (keyframes.length === 1 || time <= keyframes[0].time) {
        return keyframes[0].transform;
    }

    // Find surrounding keyframes
    let startKf = keyframes[0];
    let endKf = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
        if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
            startKf = keyframes[i];
            endKf = keyframes[i + 1];
            break;
        }
    }

    // Calculate interpolation factor
    const duration = endKf.time - startKf.time;
    const elapsed = time - startKf.time;
    let t = elapsed / duration;

    // Apply easing
    t = applyEasing(t, startKf.easing);

    // Interpolate
    return {
        position: {
            x: lerp(startKf.transform.position.x, endKf.transform.position.x, t),
            y: lerp(startKf.transform.position.y, endKf.transform.position.y, t)
        },
        scale: lerp(startKf.transform.scale, endKf.transform.scale, t),
        rotation: lerp(startKf.transform.rotation, endKf.transform.rotation, t)
    };
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function applyEasing(t: number, easing: EasingFunction): number {
    switch (easing) {
        case 'linear':
            return t;
        case 'easeIn':
            return t * t;
        case 'easeOut':
            return t * (2 - t);
        case 'easeInOut':
            return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        default:
            return t;
    }
}
```

---

## 📋 Implementation Priority

### **Phase 3.1: Security Fixes (1-2 days)**
1. ✅ Path validation in Rust
2. ✅ FFmpeg command sanitization
3. ✅ JSON schema validation
4. ✅ Input validation everywhere
5. ✅ XSS prevention

### **Phase 3.2: Critical UX (3-4 days)**
1. ✅ Loading states
2. ✅ Error recovery
3. ✅ Confirmation dialogs
4. ✅ Timeline thumbnails
5. ✅ Keyboard shortcuts overlay

### **Phase 3.3: Dead Air Detection (1 week)**
1. ✅ Rust FFmpeg silence detection
2. ✅ UI visualization
3. ✅ Smart removal modes
4. ✅ Preview & apply

### **Phase 3.4: Zoom & Pan (1 week)**
1. ✅ Transform model
2. ✅ FFmpeg filter generation
3. ✅ Visual canvas editor
4. ✅ Keyframe timeline
5. ✅ Preset animations

---

## ✅ Summary

### **Security:**
- 7 vulnerabilities identified (4 critical, 2 medium, 1 low)
- All have concrete fixes provided
- Estimated fix time: 1-2 days

### **UX Improvements:**
- 10 critical/high priority items
- Focus on feedback, loading states, error handling
- Estimated time: 3-4 days

### **New Features:**
- Dead Air Detection: Complete solution with 3 modes
- Zoom & Pan: Full keyframe animation system
- Both integrate seamlessly with existing architecture

### **Total Implementation:**
- Phase 3.1-3.4: ~3-4 weeks
- Production-ready with security + UX + features

**คุณจะได้ Video Editor ที่:**
- 🔒 Secure
- 🎨 Professional UX
- 🔇 Smart audio editing
- 🎬 Advanced animations
- ⚡ Production-ready

พร้อมเริ่ม Phase 3 เลยไหม? 🚀
