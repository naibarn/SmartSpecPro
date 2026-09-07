# Smart AI Hub Speaker-Aware Runner

This is the local Feature 179 runner invoked by Worker App. It has no network
client and never creates synthetic detections. The Worker passes the selected
adapter policy in `--request`; the runner executes only the requested stages.

## Contract

```text
speaker-aware-runner.exe --version
speaker-aware-runner.exe --request runner-request.json --input source.mp4 --output result.json
```

The output must contain `contractVersion: feature-179-v1` and the SHA-256
`sourceChecksum` of the input video. The Worker verifies both before uploading
the result artifact.

## Windows installation

Run `build-windows.ps1` on the Worker build machine. It creates a dedicated
virtual environment, installs the pinned adapter families, and produces
`dist/speaker-aware-runner.exe`. Model files are deliberately not committed;
set their paths on the Worker host:

```powershell
$env:SMARTAIHUB_SILERO_MODEL = 'C:\SmartAIHub\models\silero_vad.onnx'
$env:SMARTAIHUB_MEDIAPIPE_FACE_MODEL = 'C:\SmartAIHub\models\blaze_face_short_range.task'
$env:SMARTAIHUB_MEDIAPIPE_PERSON_MODEL = 'C:\SmartAIHub\models\pose_landmarker.task'
$env:SMARTAIHUB_PYANNOTE_MODEL = 'C:\SmartAIHub\models\pyannote-speaker-diarization'
```

Pyannote is optional. It must be selected in the UI and installed locally when
multi-speaker diarization is needed. If a selected primary adapter is not ready
and the policy does not explicitly allow a ready fallback, the runner exits
with `workflow_capability_blocked`.

The Worker App release packages the executable under
`runtime-pack/speaker-aware/speaker-aware-runner.exe`; `SMARTAIHUB_SPEAKER_AWARE_RUNNER`
remains an explicit override for development or a separately managed runner.
