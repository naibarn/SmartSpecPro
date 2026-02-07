# Interview Transcript: Video Editor Audit

## Round 1

### Q1: Target platform priority?
**Answer**: macOS + Windows first. Linux support later.

### Q2: Which editing capabilities should the render engine support?
**Answer**: Multi-clip trim + concat (not the full feature set yet — overlays, ducking, etc. deferred to v0.2 per Job Spec roadmap).

### Q3: Which VideoEditor component variant (Phase0/1/2/3) is the active version?
**Answer**: Consolidate all into one single VideoEditor component.

### Q4: FFmpeg bundling approach?
**Answer**: User will provide a reference document (Media Job Spec) to align with.

---

## Round 2

### Q5: FFmpeg bundling — clarify the reference document
**Answer**: User will paste content (the Media Job Spec v0.1 document).

### Q6: Fix waveform visualization (currently dummy data)?
**Answer**: Fix in this round. Make `waveform_peaks` job return real FFmpeg data.

### Q7: Implement silence detection backend?
**Answer**: Implement in this round. Create `dead_air_detect` job type.

---

## Round 3 (Post Media Job Spec review)

### Q8: Which engine adapters to implement in this round?
**Answer**: Both Desktop (Tauri sidecar) + Web backend.

### Q9: Web backend technology stack?
**Answer**:
- **Python/FastAPI + Celery** = primary media job queue/worker (ALL FFmpeg processing)
- **Node.js** = Web API orchestrator + streaming progress (SSE/WebSocket)
- BullMQ NOT used for FFmpeg jobs (only lightweight web tasks as before)

Architecture: Frontend → Node.js API (job submission/orchestration) → Python/Celery (FFmpeg execution)

### Q10: Time units — migrate to milliseconds?
**Answer**: Video editing system uses milliseconds (ms) throughout, aligned with Job Spec. But **MUST NOT touch or break other modules** in the existing system. The ms convention is isolated to the video editor domain only.

---

## Key Decisions Summary

| Decision | Choice |
|----------|--------|
| Platform priority | macOS + Windows (Linux deferred) |
| Render features (v0.1) | trim/concat, waveform, thumbnails, subtitles, dead air detect/cut, probe |
| Render features (v0.2) | transitions, overlays, ducking, color LUT, multi-audio |
| UI components | Consolidate Phase0-3 into single component |
| FFmpeg bundling | Tauri 2 sidecar (`externalBin`) per Job Spec §13 |
| Web backend | Python/Celery for FFmpeg, Node.js for API/orchestration/progress |
| Time units | ms in video editor domain, don't touch other modules |
| Architecture | Platform-agnostic Job Spec JSON contract |
| Waveform | Fix in this round (real FFmpeg data) |
| Silence detection | Implement in this round |
