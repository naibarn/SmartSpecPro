# VD Character Visual Bible — occupation-aware wardrobe + DNA identity guard fix

Date: 2026-07-17 · TraceId evidence: `Ytrq5TrfJRzyFNRLasyV8` (audit-2026-07-17.jsonl)

## Problem statement

User report (series 18, character id 70 "คิริน วัฒนเมธา", key `character`):

1. **500 on `verticalDramaCharacters.previewCharacterPrompt`** — "Character visual
   bible response failed schema validation: characters.0.character_design_dna: The
   response changed an already-approved canonical Character DNA identity."
2. **Wardrobe ignores the character's occupation** — the character is an aircraft
   maintenance engineer (วิศวกรซ่อมบำรุงอากาศยาน) but the approved DNA/portraits
   dressed him as a **pilot** ("crisp pilot uniform", "impeccable pilot uniform").

## Root causes (verified from audit log + DB)

1. **Fingerprint guard too broad.** `canonicalDesignIdentityFingerprint`
   (verticalDramaCharacterImageGeneration.ts:1678) compares free-prose fields with
   exact JSON equality. The 2026-07-14 fix excluded only `costumeGrammar`, but
   wardrobe/occupation prose also lives in `designIntent` and
   `recallStack.silhouette`/`recallStack.color`. When the user sent a custom
   instruction requesting the correct maintenance-crew uniform, the LLM echoed
   every identity field verbatim but updated "pilot" → "maintenance lead"
   (design_intent) and "crisp pilot uniform" → "maintenance uniform"
   (recall_stack.silhouette). The guard rejected the response on all 3 retries →
   `VdSchemaValidationError` → 500. The LLM's answer was correct; the gate was wrong.
2. **Occupation never reached the skill.** Character row 70 was auto-registered
   from story before `verticalDramaCharacterRosterAutoRegister` started copying
   `occupation` on INSERT; its `role`/`occupation` columns are NULL and `data` has
   only `{source, visualBible}` — no description. The series bible
   (`bible.refinedCharacters`) carries full facts (role "Licensed Aircraft
   Maintenance Engineer", occupation, Thai description) but the router only reads
   the roster row, so the visual-bible input had NO occupation/description and the
   skill guessed "pilot" from the aviation series context.

## Changes

1. `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
   - Exclude `designIntent`, `recallStack.silhouette`, `recallStack.color` from
     `canonicalDesignIdentityFingerprint` (same rationale as the existing
     `costumeGrammar` exclusion: wardrobe/occupation staging, not identity).
     Identity remains locked by faceIdentity, bodyLanguage, recallStack.face/
     behavior/emotionalHook, roleTier, beautyArchetype, ageRange, masks,
     antiCloneChecks.
2. `apps/web/server/routers/verticalDramaCharacters.ts`
   - Generation-time fallback: when the roster row lacks role/occupation/
     description, merge them from the bible `refinedCharacters` entry matched by
     normalized name. Apply at every `generateCharacterVisualPrompts` /
     `generateCharacterPortraitCandidates` call site in the router.
3. `apps/web/skills/vertical-drama-character-visual-bible/skill.md` (lowercase —
   loader reads it before SKILL.md)
   - Add an occupation-accuracy wardrobe rule: professions with regulated/specific
     workwear must be dressed in their own accurate uniform; never substitute an
     adjacent, more glamorous profession's uniform (e.g. maintenance engineer ≠
     pilot uniform).
4. Tests: extend the beggar-outfit fingerprint test with design_intent /
   recall_stack occupation-prose drift (must pass) and keep/verify a face-drift
   negative case (must still fail); add coverage for the bible-fallback helper.

## Risk assessment

- Fingerprint narrowing weakens the drift guard for the excluded prose fields only;
  face/hair/body/anti-clone/masks remain verbatim-locked. Low risk.
- Bible fallback is read-only enrichment (no DB writes, no schema change). Roster
  values always win when present.
- No migration. No service-file config change.

## Verification

- Targeted vitest: verticalDramaCharacterImageGeneration.test.ts + router custom
  instruction tests.
- Live re-run of the failing flow (preview character prompt with the same custom
  instruction) after restart.

## Status

- [x] Investigated (audit log + DB + code)
- [x] Fix 1 fingerprint (implemented; tests pass)
- [x] Fix 2 router fallback (implemented; tests pass)
- [x] Fix 3 skill.md rule (both skill.md + SKILL.md)
- [x] Tests green (79 files / 719 tests in affected suites)
- [x] Deployed (smartspec-web restarted 2026-07-17)
