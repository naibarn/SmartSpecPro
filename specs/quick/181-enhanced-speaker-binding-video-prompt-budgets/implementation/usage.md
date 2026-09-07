# Usage guide

## Runtime behavior

Select a video model normally. Vertical Drama resolves its character budget from model identity and sends that number to the Enhanced compiler. The compiler emits separate physical-action and canonical speech events, compacts deterministically when needed, and fails before persistence if the protected dialogue core cannot fit.

## Supported ceilings

- Grok Imagine Video 1.5: 4,096
- MiniMax H3 / H3 Max: 7,000
- Gemini Omni Flash 1.1: 20,000
- Wan 3.0: 20,000
- Seedance 2.5: 30,000

Unknown models use an explicit video-only catalog limit when present, otherwise the existing default. An explicit video-only limit may tighten but cannot raise a known ceiling.

## Focused verification

```bash
cd apps/web/skills/generic-commercial-video-director
uv run --project . python -m unittest tests.test_enhanced_audio_bridge -v

cd apps/web
npx vitest run shared/verticalDramaSeries/__tests__/videoPromptBudget.test.ts server/services/__tests__/verticalDramaEnhancedVideoPrompt.test.ts
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts
```

These tests do not invoke a video provider or perform paid generation.
