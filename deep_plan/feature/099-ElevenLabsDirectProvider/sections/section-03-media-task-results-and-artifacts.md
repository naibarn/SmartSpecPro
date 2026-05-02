# Section 03: Media Task Results and Artifacts

## Goal

Support both audio file outputs and transcript JSON/text outputs cleanly.

## Current Risk

Most audio generation paths expect an audio URL. ElevenLabs Speech-to-Text returns JSON with `text`, language data, and word timestamps.

## Plan

1. Keep TTS, voice changer, sound effects, and voice isolator as `mediaType: "audio"` with `resultUrl`.
2. For speech-to-text, use `mediaType: "audio"` initially but set:
   - `resultUrl`: `null` for MVP.
   - `resultData.artifactKind`: `transcript`.
   - `resultData.provider`: `elevenlabs`.
   - `resultData.capability`: `speech_to_text`.
   - `resultData.text`: plain transcript.
   - `resultData.transcript`: full JSON transcript.
   - `resultData.words`: word/timestamp array when present.
   - `resultData.languageCode`: detected or requested language when present.
   - `resultData.sourceMediaUrl`: original source URL if safe to store.
3. Add UI/rendering logic to show transcript output in Media Studio.
4. Later phase: create library text/subtitle asset and Video Editor subtitle import.

## Result Contract

Audio-producing capabilities:

```json
{
  "resultUrl": "https://...",
  "resultData": {
    "artifactKind": "audio",
    "provider": "elevenlabs",
    "capability": "text_to_speech|voice_changer|sound_effects|voice_isolator",
    "contentType": "audio/mpeg",
    "outputFormat": "mp3"
  }
}
```

Speech-to-text capability:

```json
{
  "resultUrl": null,
  "resultData": {
    "artifactKind": "transcript",
    "provider": "elevenlabs",
    "capability": "speech_to_text",
    "text": "...",
    "transcript": {},
    "words": [],
    "languageCode": "en"
  }
}
```

## UI Rendering Contract

- Media Studio preview panel:
  - audio artifact: render audio player.
  - transcript artifact: render transcript text panel, copy button, and optional JSON details.
- Media history:
  - transcript cards must not show broken audio players.
  - transcript cards show model, provider, source filename if available, and first transcript excerpt.
- Download:
  - audio artifact downloads audio extension.
  - transcript artifact downloads `.txt` and optionally `.json` later.

## Library Contract

MVP:

- Add-to-library for transcript artifacts should either:
  - create a text/subtitle library item if supported by current library schema, or
  - show a clear "Transcript library export is coming next" message.
- It must not attempt to upload a null `resultUrl`.

## TDD

1. Media task can complete with no audio URL when `artifactKind === "transcript"`.
2. Media history renders transcript cards without an audio player.
3. Add-to-library either rejects with a clear message or stores a text artifact.
4. Preview panel renders copyable transcript text.
5. Download action uses `.txt` for transcript artifacts.
