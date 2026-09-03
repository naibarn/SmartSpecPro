# Section 06 — Storyboard UI Integration, Studio Metering & Rollback Drawer

## 1. Objective
Integrate Native Audio controls into the existing Storyboard UI: episode header switch, 3-stem mixer faders (Dialogue, Foley, Ambience), WebAudio master clock synchronization, real-time studio LUFS/VU meters, sub-segment punch-in, and Take history rollback drawer.

## 2. Invariants
1. `VerticalDramaStoryboardPanel.tsx` header switch `nativeAudioEnabled` updates episode audio policy atomically.
2. 3-stem mixer faders save deltas to `audio_manifests.mixDeltas` without triggering full video re-generation.
3. WebAudio master clock synchronizes `<video>` playback via `requestVideoFrameCallback()` to eliminate scrubbing stutter.
4. Take history allows 0-credit, instant rollback to any prior manifest version.

## 3. Files to Modify & Create
- [MODIFY] `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`:
  - Wire header switch to `updateEpisodeAudioSettings` mutation.
  - Render Audio Health & Intent chip on shot cards.
  - Add Audio Inspector Drawer with 3-stem faders, LUFS/VU meter, and Take history.
- [NEW] `apps/web/client/src/components/verticalDramaSeries/VerticalDramaAudioInspector.tsx`:
  - Dedicated component for multi-stem inspection and mixer console.

## 4. Verification
- `npm --workspace apps/web run test -- apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.test.tsx`
