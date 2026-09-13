# Section 04 — Quick Silence Cut, Extract Audio and ducking

## Goal

Bring the Worker App's silence review and audio preparation into the Web editor
without cutting media blindly. Analysis proposes a versioned edit map; the user
reviews and applies it to a new revision. Audio extraction and ducking remain
traceable to their source clips.

## Quick Silence Cut

Add `ตัดความเงียบ` as a panel and a `quick_silence_cut` job. Options are source
clip/track, threshold in dB, minimum silence, pre/post padding, channel mode,
VAD mode and keep-leading/trailing-silence policy. Worker returns waveform
metadata, silent/keep ranges, confidence, analysis version, source checksum and
an edit-map artifact. The browser renders a zoomable waveform and lets the user
include/exclude ranges, split/merge ranges and adjust padding before previewing
the proposed timeline.

Include the Worker presets `ธรรมชาติ` (ทั่วไป), `Shorts`, `Jump Cut` and
`พอดแคสต์` as named parameter bundles. Selecting a preset only changes the
review draft; it never runs analysis or applies a cut until the user presses
Analyze and then approves the edit map. Manual cut markers and the dead-air
highlight can be shown/hidden independently.

Applying the map requires the expected revision and creates a new revision. A
missing audio stream or no detectable activity is an explicit `analysis_unavailable`
state and disables apply. The map must preserve frame boundaries, source time,
speed and linked audio/video policy; it cannot silently detach linked clips.

Provide `undo applied cut` as an inverse edit-map command that creates another
revision and keeps the original analysis artifact. Extracted audio never mutates
the source video clip; it creates a derived asset/clip with an explicit source
time offset and alignment report.

## Extract Audio

`แยกเสียง` is available from a video clip context menu and Audio panel. The user
chooses output format, sample rate, channel layout, source range and placement
track. For local preview the browser may use a supported MediaStream, but the
durable path submits `extract_audio` to Worker FFmpeg and publishes an asset with
`derivedFromAssetId`, source revision, duration, channel and checksum. A video
with no audio stream returns a typed error and leaves the project unchanged.

## Ducking and waveform presets

Extend `AudioDuckingPanel` with sidechain source, targets, threshold, ratio,
attack, release, lookahead, floor, pre/post fades and presets: `speech`,
`music`, `balanced`, `custom`. Show editable gain envelopes, peak/RMS meters,
clip boundaries and audible-range warnings. Persist an `AudioMixMap`; render
compiles it to typed `sidechaincompress`, `amix`, `volume` and fade options.
Optional loudness QC records integrated loudness/true-peak (EBU R128 profile or
the configured equivalent) in the analysis/render manifest; it is a review
warning unless the selected export profile requires a target. The client cannot
submit arbitrary filter strings. Waveform and envelope values are
bounded and normalized to the clip's source/project time map. Ducking respects
track mute, solo and lock semantics; locked tracks can be inspected but their
mix map cannot be changed until unlocked.

## Files and sequence

1. Add shared analysis/edit-map/audio-mix schemas and fixtures.
2. Adapt Worker `media_pipeline.rs` silence/waveform/extraction behavior to the
   canonical job envelope and add server `review/apply` CAS procedures.
3. Refactor `SilenceDetectionPanel/Dialog.tsx` and `AudioDuckingPanel.tsx` to
   use reviewable artifacts and the common job status component.
4. Add FFmpeg fixture compilation and output metadata tests.

## UI/UX Contract

### Target User / JTBD

A creator needs to remove dead air, detach a soundtrack and keep speech clear
without losing timing or applying an unreviewed analysis.

### Surface Inventory

Silence tab, waveform review sheet, keep/cut range controls, Extract Audio
dialog, Audio/Ducking panel, gain envelope and audio-track context menu.

### Component Map

`SilenceDetectionPanel` owns analysis/review, `WaveformView` owns range display,
`AudioExtractDialog` owns output options, `AudioDuckingPanel` owns mix controls,
and server/Worker adapters own durable processing.

### State Matrix

| State | Required behavior |
|---|---|
| no audio | explain unavailable; disable apply/extract |
| analysis queued/running | progress, cancel, keep timeline unchanged |
| review changes | dirty review map with preview |
| applied | new revision and audit link |
| stale result | show source revision; regenerate/review |
| extraction queued/complete | lineage and track placement |
| ducking preset/custom | bounded envelope and live meter |
| render preview | show approximate/faithful label |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | review ranges and status; detailed envelope editing deferred |
| 390x844 | stacked waveform and action bar |
| 768x1024 | bottom-sheet analysis and ducking controls |
| 1024x768 | side panel aligned to timeline |
| 1280x800 | waveform, inspector and timeline visible |
| 1440x900 | full analysis, envelope and meters |

### Accessibility Acceptance

Ranges have text start/end and keep/cut buttons, sliders expose dB/seconds,
meter values are announced at a throttled rate, keyboard can split/merge and
colour is supplemented by patterns/labels. Apply requires an accessible review
confirmation.

### Copy Contract

Use `ตัดความเงียบ`, `ช่วงที่จะตัด`, `ช่วงที่จะเก็บ`, `แยกเสียงออกจากวิดีโอ`,
`ปรับเสียงพูด`, `พรีเซ็ต Speech`, `ผลวิเคราะห์ล้าสมัย`, `ไม่มีเสียงที่ตรวจพบ`
and `ตรวจสอบก่อนใช้`. Keep `Quick Silence Cut` as an English fallback.

### Browser Evidence Required

Mocked job flow must show waveform review, edited ranges, stale apply rejection,
audio extraction lineage and ducking envelope. A staging fixture must run one
real audio probe/extract if Worker and media assets are available.

## Tests and acceptance

- Silence options and result validation, no-audio/no-activity behavior, range
  edit map and revision CAS.
- Extraction stream/channel/rate metadata, lineage and publication.
- Preset expansion, envelope bounds, sidechain mapping and allowlisted FFmpeg
  compilation.
- Browser keyboard/range/meter states and timeline unchanged before apply.

## Risks and stop conditions

Never auto-apply a silence map or silently cut when audio is absent. Stop render
if an envelope exceeds safe gain bounds or linked audio/video timing cannot be
proven.
