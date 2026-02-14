# Silence Detection Feature — Interview Transcript

## Q1: Dialog vs Sidebar Layout

**Q:** For the full-screen dialog layout: should it completely replace the existing sidebar panel, or keep the sidebar as a 'quick mode' and the dialog as 'advanced mode'? The spec says 'KEEP: Refactor to use shared logic' but how should users switch between them?

**A:** Dialog only, sidebar becomes trigger. The sidebar slot will show a button/card that opens the full-screen dialog. All silence detection functionality moves into the dialog.

## Q2: Multi-Track Export Behavior

**Q:** For 'Export to Timeline': when multiple tracks have clips (e.g., video + audio + voiceover), should silence detection cuts be applied to ALL tracks at the detected boundaries, or only to the analyzed audio track?

**A:** User chooses per export. Show a checkbox or toggle: "Apply to all tracks" vs "Audio track only". This gives users flexibility for different workflows.

## Q3: Maximum Video Duration

**Q:** What's the expected maximum video duration the silence detection should handle?

**A:** Up to 30 minutes. Short-form content focus (YouTube videos, tutorials, podcast clips).

**Implications:**
- Waveform rendering: Client-side processing feasible for 30 min
- FFmpeg detection: ~10-30 seconds processing time
- No need for chunked/streaming analysis

## Q4: Waveform Library Choice

**Q:** Should we use the existing custom WaveformCanvas.tsx and extend it with overlays, or integrate WaveSurfer.js?

**A:** Extend existing WaveformCanvas (recommended). No new dependency, consistent with codebase patterns. Add an overlay canvas for regions and playhead.

## Q5: Backend dead_air_cut Priority

**Q:** Should the dead_air_cut backend be implemented in Phase 1 (MVP) or deferred?

**A:** Phase 1 (include in MVP). Implement the FFmpeg trim+concat handler immediately for a complete feature from the start.

## Q6: Progress Feedback During Analysis

**Q:** Should we implement SSE-based progress or a simple spinner?

**A:** Indeterminate spinner with stage labels from backend. Show sequential stages:
- Preparing...
- Scanning audio...
- Detecting silence...
- Building cuts...
- Done

No percentage progress bar needed, but the stage transitions give users meaningful feedback about what's happening.

## Q7: Skip-Silence Preview Mode

**Q:** Should the dialog have a 'Preview without silence' playback mode?

**A:** Yes, implement skip-silence preview. When enabled, video playback automatically jumps past selected silent regions in real-time, so users can preview exactly what the final result will look/sound like.

## Q8: Video Thumbnails Strategy

**Q:** How should mini-timeline thumbnails be handled?

**A:** Reuse if available, generate if not. Check project assets for existing thumbnails first, only request new generation via the 'thumbnails' media job if none exist.

## Q9: Export Feedback UX

**Q:** What should happen visually when 'Export to Timeline' completes?

**A:** Toast notification + briefly highlight new clip boundaries on the main timeline. This shows the user exactly where changes were made and confirms the operation succeeded.

---

## Key Design Decisions Summary

| Decision | Choice |
|----------|--------|
| Dialog approach | Full-screen dialog only; sidebar becomes trigger button |
| Multi-track export | User toggle: "Apply to all tracks" vs "Audio only" |
| Max duration | 30 minutes (short-form content) |
| Waveform implementation | Extend existing WaveformCanvas.tsx (no new deps) |
| Backend cut | Phase 1 (MVP) — implement immediately |
| Progress UX | Indeterminate spinner + stage labels (no percentage) |
| Preview mode | Skip-silence preview (auto-jump past selected regions) |
| Thumbnails | Reuse existing, generate on-demand if missing |
| Export feedback | Toast + highlight clip boundaries on main timeline |
