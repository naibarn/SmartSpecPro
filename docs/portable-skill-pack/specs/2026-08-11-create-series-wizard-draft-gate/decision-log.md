# Decision Log

## D1 — Reuse the existing synthesis endpoint

Use `verticalDramaSeries.synthesizeGenrePreset`; do not add a route. This preserves auth,
credit accounting, tenant feature handling, preset visibility checks, and skill provenance.

## D2 — Gate transiently in the wizard

Track source signature, request key, draft key, and applied key in React state/refs. No DB
migration is warranted because the draft is not durable until the final create mutation.

## D3 — Single preset means reinterpretation

Change the action resolver and prompt contract. A server-generated variation nonce is added
to each synthesis attempt so retry requests are distinguishable without exposing metadata to
the persisted story.

## D4 — Manual title is authoritative

If the user has typed a non-empty title, the title candidate gate is bypassed, but draft
application is still mandatory. Applying a draft never overwrites that title.

## D5 — No fabricated title fallback

The wizard rejects an automatic-title draft without 4–5 usable distinct options. It does not
derive or invent titles on the client.

## D6 — Keep existing broad service compatibility

The service schema can continue accepting omitted `titleOptions` for non-wizard callers;
the wizard boundary enforces the stricter title contract. This avoids an unrelated API
breaking change.
