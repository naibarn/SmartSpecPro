# Feature 173 interview transcript

## Q1 — Should the existing Legacy flow change?

**User answer:** No. Add a paired Enhanced action so the user chooses which
approach to use. The existing flow must remain usable and must not be broken.

## Q2 — How should a generated Enhanced prompt affect the current prompt?

**User answer:** Show the generated prompt in the same editor, but let the user
choose. Enhanced generation must not replace the current prompt automatically;
the user explicitly applies the selected variant.

## Q3 — What model behavior is required?

**User answer:** Prompt quality must match the actual media model. Image/video
model selection must be handled clearly, and Enhanced should be usable at full
quality without coupling models incorrectly.

## Auto-decisions

- Use a versioned additive variant store inside each motion-pack clip, with the
  current clip fields remaining the active render projection.
- Keep `viewedVariant` client-only and `activeVariant` server-persisted. Apply
  is the only normal operation that changes active state; first store creation
  seeds Legacy as a no-op compatibility stamp.
- Use a separate Enhanced async job and readiness query. Never silently fall
  back to Legacy when Enhanced is unavailable.
- Keep Legacy mutation names, inputs, callbacks, credit behavior, and polling
  unchanged.
- Use a Core-owned adapter around the isolated v11 runtime. The Agent may
  reason and return structured intent; Core/provider compiler/finalizer owns
  the terminal prompt bundle and all side effects.
- Use separate `selectedImageModelId`, `authoringModelId`, and
  `selectedVideoModelId`, with exact target capability/profile hashes in every
  Enhanced result.
- Use existing app Vitest conventions for TypeScript/server/UI tests and keep
  browser/provider/deployment proof as explicit rollout gates.
