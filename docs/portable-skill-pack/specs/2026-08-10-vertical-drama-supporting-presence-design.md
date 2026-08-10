# Vertical Drama Shot-Local Supporting Presence

## Objective

Make generic people and groups described by a shot appear in the generated image
without promoting them to the series character roster. The user must be able to
accept, edit, remove, suppress, or add these entries manually per shot. User
edits are authoritative across prompt regeneration and image generation.

## User-visible contract

- Existing identity-locked character references remain unchanged.
- Each shot may show a collapsed `Supporting presence from script` section.
- Auto-detected entries show their evidence and are marked as shot-local.
- The user can edit role label, count, visibility, action, accept/dismiss an
  auto suggestion, add a new role, and remove or suppress an entry.
- A shot-level suppression marker prevents a dismissed auto suggestion from
  returning during storyboard/start-frame regeneration.
- Supporting presence never changes another shot and never creates a durable
  series character unless the user explicitly promotes it.

## Data model

`supportingPresence` is an additive field on both storyboard shots and the
corresponding start-frame plan frame. Each entry contains a stable id, role
label, bounded count, visibility, optional action/evidence, source, confidence,
and a user-authority/status marker. The plan copy is the effective value used by
start-frame prompt generation; storyboard data is the auto-detected fallback for
frames that have not been customized.

The model distinguishes:

- identity-locked characters (`requiredCharacterRefs`)
- screen callers (`screenCallerCharacterRefs`)
- generic shot-local supporting presence (`supportingPresence`)

The provider receives supporting presence as text only, never as portrait
references. The prompt states an exact/bounded count and a negative constraint
against unrelated additional people.

## Auto-detection

The storyboard generator emits structured supporting presence per shot. The
prompt instructs it to create an entry only when the shot's own action or visual
description places a generic role/group visibly in the scene. Mere mentions,
phone calls, historical references, off-screen audio, or news/TV references do
not create visible presence. Server normalization validates counts, limits the
number of entries, cleans labels, and preserves explicit user customizations.

High-confidence visible actions may be auto-confirmed; lower-confidence entries
remain suggestions. No episode-wide keyword scan propagates a role to other
shots.

## Promotion

Named or recurring supporting people remain shot-local by default until the user
chooses `Promote to character`. Promotion is an explicit follow-up and is not
part of this change's automatic path.

## Acceptance criteria

1. A shot saying a protagonist brings one police officer receives one visible
   shot-local supporting entry and prompt instruction.
2. A shot saying villagers or building members gather supports a bounded group
   count without creating roster characters.
3. A mere mention of police or a phone call does not add a visible person.
4. User removal, suppression, count/label/action edits, and manual additions
   survive regeneration and do not affect other shots.
5. Supporting roles are excluded from physical portrait attachment resolution.
6. Legacy storyboard/start-frame JSON without the field behaves exactly as
   before.
7. Focused shared, storyboard, prompt, router, and UI tests cover the contract.
