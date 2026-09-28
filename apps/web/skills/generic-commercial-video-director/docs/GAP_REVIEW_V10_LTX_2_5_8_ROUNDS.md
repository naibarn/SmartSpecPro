# Gap Review v10 — LTX 2.5 — 8 Rounds

Date: 2026-09-01  
Scope: Generic Commercial Video Director v10

## Round 1 — Provider-family audit

### Gap

v9 had no first-class LTX-2.5 profile/adapter.

### Fix

Added three profiles:

```text
ltx-2-5-fast
ltx-2-5-pro
Lightricks/LTX-2.5 local
```

Cloud and Local are deliberately separate because their capability contracts differ.

---

## Round 2 — Cloud model matrix audit

### Gap

A generic 6–20s / 4K capability would be wrong for Pro and high-FPS/high-resolution Fast combinations.

### Fix

Added exact matrix validation:

- Fast 720p/1080p @24/25 → 6–20s even;
- Fast 720p/1080p @48/50 → 6/8/10s;
- Fast 1440p/4K → 6/8/10s;
- Pro 720p/1080p @24/25/50 → 6/8/10s;
- Pro does not accept 4K or 48fps.

Auto model routing selects Pro for quality <=10s/1080p and Fast for longer/high-resolution jobs.

---

## Round 3 — Start / Last / Auto-duration audit

### Gap

LTX-2.5 supports both Last Frame and automatic duration, but they are incompatible.

### Fix

Added:

```text
Start → image_uri
End → last_frame_uri
```

Validation:

```text
last_frame_uri requires image_uri
automatic duration + last_frame_uri = BLOCK
```

Start Frame is treated as canonical State #0.

---

## Round 4 — Audio semantics audit

### Gap

SmartAIHub supports many audio reference meanings, but LTX Cloud A2V accepts one actual soundtrack driver.

A `voice_reference` cannot be automatically interpreted as `audio_uri`.

### Fix

Added explicit:

```text
audioDriverAssetId
providerHints.ltx.useAsAudioDriver
```

A2V:

- one exact soundtrack;
- duration follows input audio;
- optional first/last image;
- model/resolution-specific audio-duration preflight.

Generic voice/music references are derived/precomposed/local/fallback instead of silently becoming the soundtrack.

---

## Round 5 — Generic Reference audit

### Gap

Cloud LTX-2.5 does not expose an arbitrary character/product/place image array or generic raw motion-video reference bundle.

### Fix

Added policies:

```text
prebake_start_frame
derive_to_prompt
local_ic_lora
fallback_provider
block
```

Default visual-production solution:

```text
Character/Product/Place refs
→ Approved Start Frame
→ LTX I2V
```

`must_use_raw` is never silently downgraded.

---

## Round 6 — Native multi-shot prompt audit

### Gap

SmartAIHub internally uses structured shots, but official LTX prompting guidance says final multi-shot prompts should be chronological prose with explicit edit transitions, not a screenplay/numbered shot list.

### Fix

`Ltx25PromptCompiler` converts approved shots into prose and explicitly carries:

- recurring subject identity;
- product state;
- scene/lighting;
- transition type;
- voice/music/ambience continuity.

This preserves structured planning internally while matching provider-native prompting style externally.

---

## Round 7 — Cloud vs Local capability leakage audit

### Gap

The LTX API family has Retake/Extend/Reframe endpoints, while the current LTX-2.5 Fast/Pro support matrix marks them unsupported.

Open-source LTX also has advanced LoRA/IC-LoRA/reference/extension workflows that are not equivalent to zero-config cloud features.

### Fix

Cloud 2.5:

```text
T2V / I2V / A2V only
Retake = unsupported
Extend = unsupported
Reframe = unsupported
```

Local advanced modes:

```text
local_ic_lora
local_extension
```

require:

```text
localReferenceWorkflowVerified
localExtensionWorkflowVerified
localWorkflowId
```

No cross-route capability leakage is allowed.

---

## Round 8 — Local pipeline / regression audit

### Added local preflight

- official ComfyUI template routing;
- width/height divisible by 32;
- two-stage final dimensions divisible by 64;
- explicit `num_frames` must satisfy `8k+1`;
- prompt enhancer option;
- local custom workflow IDs;
- Worker/ComfyUI execution route.

### Regression gates

```text
v10 schemas
H3 tests
Grok tests
Wan tests
FLUX tests
Seedance tests
LTX tests
```

## Final LTX 2.5 coverage

### Cloud

```text
✓ T2V
✓ I2V / Start Frame
✓ First + Last
✓ A2V exact soundtrack
✓ native audio
✓ native multi-shot
✓ camera motion
✓ automatic duration
✓ Fast up to 4K / 20s where matrix permits
✓ Pro up to 1080p / 10s
✓ sync + async API
△ generic image refs → prebake/derive/local/fallback
✗ generic video reference
✗ cloud 2.5 Retake
✗ cloud 2.5 Extend
✗ cloud 2.5 Reframe
```

### Local/Open Source

```text
✓ T2V
✓ I2V
✓ First + Last
✓ native AV
✓ native multi-shot
✓ prompt enhancer
✓ LoRA
△ IC-LoRA/raw references → verified workflow required
△ local extension → verified workflow required
```
