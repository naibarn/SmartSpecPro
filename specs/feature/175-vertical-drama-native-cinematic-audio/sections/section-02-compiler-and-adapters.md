# Section 02 — Enhanced Prompt Compiler Audio Shaping & Model Adapters

## 1. Objective
Implement prompt shaping in the Python Director runtime (`enhanced_bridge.py`) enforcing the user's toggle contract (Cinematic Full when ON vs Spoken Dialogue Only when OFF) across Gemini Omni, Grok, MiniMax H3, Seedance, Veo, and Wan.

## 2. Invariants
1. When `nativeAudioEnabled === false`:
   - Prompt MUST output: `AUDIO POLICY: Spoken dialogue only. Do not generate any background sound effects, foley, footsteps, or room tone.`
   - Negative prompt MUST inject: `sound effects, foley, background music, ambient noise, room tone, footsteps.`
   - If shot has no dialogue, output: `AUDIO POLICY: Complete silence. Silent visual acting only.`
2. When `nativeAudioEnabled === true`:
   - Prompt compiles dialogue with verbatim text and emotional delivery, physical motivated Foley with material pairing, continuous room tone, and negative audio filters.
3. Model adapter formatting:
   - Gemini Omni: Timecode brackets `[0-2s] Character says: "..."`.
   - Grok: Positive narrative block + Negative audio constraints.
   - Seedance/MiniMax/Veo: Direct acoustic physics formatting.

## 3. Files to Modify & Create
- [MODIFY] `apps/web/skills/generic-commercial-video-director/src/smartaihub_video_director/enhanced_bridge.py`:
  - Read `nativeAudioEnabled` in `_package_input`.
  - In `_terminal_prompt`, branch on `nativeAudioEnabled` to format strict dialogue-only vs full cinematic audio.
- [NEW] `apps/web/skills/generic-commercial-video-director/tests/test_enhanced_audio_bridge.py`:
  - Unit tests verifying compiled prompts when toggle is true vs false.

## 4. Verification
- `uv run --project apps/web/skills/generic-commercial-video-director pytest tests/test_enhanced_audio_bridge.py`
