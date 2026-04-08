# Gemma 4-First Web/Tauri Implementation Request

Date: 2026-04-05
Source: follow-up planning request on feature `070-local-client-llm-mode`

## Task summary

Create an implementation-ready breakdown for a Gemma 4-first rollout that is limited to:

- web
- Tauri

The breakdown must stay aligned with the existing `070-local-client-llm-mode` feature plan, but make the execution path more concrete for real implementation work.

The user also asked for targeted research on:

- `https://huggingface.co/huggingworld/gemma-4-E4B-it-litert-lm`

and whether it should be used together with the Gemma 4 rollout.

## Desired outcome

Produce a compact implementation package that:

- explains how Gemma 4 should be integrated on web versus Tauri
- decides how to use the LiteRT artifacts from the Hugging Face model family
- defines how selected skills can participate in the Tauri local-runtime path without broadening scope to unsafe skill classes
- narrows the scope to what can actually be implemented next
- preserves the existing compatibility-first and security-first rules
- is directly consumable by `deep-implement`

## Constraints

- stay consistent with the existing feature spec and plan in `specs/feature/070-local-client-llm-mode/`
- keep unsupported devices fully safe
- do not silently replace the existing cloud/server path
- keep `legacy_stt` as the compatibility fallback
- keep routing, audit, and persistence server-authoritative
- focus on Gemma 4-first implementation choices, not a generic local model abstraction
- do not assume every skill can become local; selected skill coverage must stay opt-in, policy-driven, and Tauri-first

## Assumptions inferred from the repository

- browser local runtime is still a stub and not yet backed by a real local inference dependency
- Tauri shell exists but has no Local AI runtime commands yet
- chat mic still uses the current server STT path by default
- local model catalog already includes Gemma 4 E2B/E4B placeholder profiles for web and Tauri
- the most useful next step is a focused execution package, not a brand-new feature spec
- the current skill system already distinguishes execution modes, model policy, and schema extraction on the server, so local skill coverage should extend those contracts rather than bypass them

## Non-goals

- replacing the parent feature spec
- designing Android/mobile rollout
- adding document-grade OCR to local Gemma 4
- turning the assistant into an always-listening agent
- broadening scope to arbitrary external local workers in this package
- making public API, scheduler, or other server/background skill paths depend on a user-local Tauri runtime
