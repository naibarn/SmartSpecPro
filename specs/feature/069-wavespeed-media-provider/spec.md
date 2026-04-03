# 069 - WaveSpeedAI Media Provider and Seedance 2.0

Version: 1.0
Date: 2026-04-03
Status: Proposed

---

## 1. Executive summary

WaveSpeedAI will be added as a new media provider in the Admin > Media Providers UI, and the official WaveSpeed model `wavespeed-ai/cinematic-video-generator` will be seeded as a first-class media model under its public title, `Seedance 2.0 Grade Cinematic Video Generator`.

The first release is intentionally narrow:

- support the documented WaveSpeed API flow from the official get-started docs
- surface the provider in the admin UI with a safe connection test
- seed one initial Seedance 2.0 launch model
- support both prompt-only text-to-video and prompt-plus-images image-to-video through that same model
- route Seedance 2.0 requests through the Python media gateway with polling-based completion
- keep duration pricing correct even when DB pricing metadata is temporarily unavailable

## 2. Goals

- add a WaveSpeedAI provider template with the official API base URL
- store the seeded provider base URL as `https://api.wavespeed.ai/api/v3`
- make the provider discoverable, editable, and testable from the media provider admin page
- seed `wavespeed-ai/cinematic-video-generator` as the initial media model using the display name `Seedance 2.0 Grade Cinematic Video Generator`
- support prompt, up to 4 reference images, aspect ratio, and duration inputs for the model
- support tiered pricing for 5s, 10s, and 15s outputs
- preserve correct pricing and validation in both DB-first and static-fallback paths
- keep the existing provider behavior unchanged

## 3. Non-goals

- importing the entire WaveSpeed model catalog on day one
- adding a new chat / LLM provider path
- supporting every multimodal capability mentioned in WaveSpeed blog content
- exposing a separate Prompt Enhancer control in v1 before its exact upstream contract is mapped into the generic admin/runtime flow
- using WaveSpeed sync mode in v1
- splitting the model's native audio into a separate audio asset or audio-generation route
- changing the default model selection for other providers
- replacing the current media billing or credit system

## 4. Success criteria

- WaveSpeedAI appears in Admin > Media Providers and can be saved with a WaveSpeed API key
- the provider connection test succeeds against `GET /balance` on the WaveSpeed API root and reports actionable errors for `401`, `403`, and `429`
- `Seedance 2.0 Grade Cinematic Video Generator` appears in Admin > Media Models and can be enabled manually
- the same model supports prompt-only T2V and prompt-plus-images I2V, with a hard max of 4 reference images
- duration pricing remains correct for 5s / 10s / 15s even when DB pricing metadata falls back to static metadata
- the runtime gateway can submit and poll Seedance 2.0 jobs successfully
- existing providers and seeded models continue to work unchanged
