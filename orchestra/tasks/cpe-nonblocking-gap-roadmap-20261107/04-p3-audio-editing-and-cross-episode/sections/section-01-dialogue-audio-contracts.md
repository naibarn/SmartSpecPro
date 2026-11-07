# Section 01 — Dialogue and Audio Contracts

## Requirement IDs

CPE-12, CPE-13, NB-05, NB-07

## Objective

Reconcile and complete typed dialogue/audio intent and voice/lip-sync continuity at current authoring boundaries.

## Owned paths

`verticalDramaDialogueAudio.ts`, shared audio/dialogue contracts, existing native-audio prompt mode, prompt compiler and dialogue panel/tests.

## Tasks

1. Map existing toggle behavior and dialogue-only/silent semantics to prompts and assembly inputs.
2. Identify voice identity, delivery, per-shot timing and lip-sync facts already available; add only source-backed missing fields.
3. Make audio model/provider requirements capability-driven and preserve current user-selected mode.
4. Bind intent to episode/shot revision and keep it optional for the video-generation path.

## Completion predicate

Old records remain compatible; toggle ON/OFF behavior is covered; dialogue facts remain current; optional audio planning failure leaves video eligibility unchanged.

## Prerequisites and fallback

Requires P0–P2. Use existing audio/video prompt contracts when optional intent is missing.

## Focused tests and evidence

Cover audio on/off, dialogue-only, silent clip, voice identity/delivery, per-shot timing, lip-sync advisory, old records, provider capability and missing/stale audio intent. Assert the chosen audio mode is preserved and optional dialogue/QC failure leaves video eligibility unchanged.

## Unresolved assumptions

Confirm which providers expose native audio/lip-sync versus separate audio tracks and what timing evidence is actually available. Do not claim lip-sync verification when only prompt intent exists.
