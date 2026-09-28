# Enhanced virtual-screen continuity lock

## Problem

An Enhanced video prompt can receive a server-authorized screen caller and an
approved `START_FRAME_IMAGE` that already contains that caller's virtual screen.
The current Enhanced bridge says the caller belongs on a call display, but does
not explicitly require reuse of the existing inset. A provider can therefore
interpret dialogue as permission to create a new phone, device display, or
floating caller window.

## Approved design

When `shot.visualCastPolicy.screenCallerCharacterRefs` is non-empty, the
Enhanced bridge adds a deterministic continuity block to the terminal prompt:

- each selected caller is bound to the exact existing virtual-screen inset in
  `START_FRAME_IMAGE`;
- the inset remains in its original position and is the only place the caller
  can speak or appear;
- no new phone, tablet, monitor, device display, inset, floating window, face,
  physical caller, reflection, poster, or duplicate may be generated;
- a caller dialogue line animates only the face already inside its assigned
  screen.

The same invariant is retained in the compact prompt path. Caller roles remain
server-authoritative; dialogue text does not create or infer a screen caller.

## Scope and trade-offs

The change is limited to `enhanced_bridge.py` and its focused Python tests. It
does not change schemas, persisted media, Legacy prompt generation, provider
adapters, or UI. This keeps the fix low-risk and idempotent while relying on
the approved start frame as visual ground truth.

## Verification

Add a regression test that builds both normal and compact terminal prompts with
one physical character, one existing screen caller, and a dialogue line from
that caller. Assert the prompt requires exact reuse and forbids new screens and
people. Provider-rendered output still requires a separate live retest.
