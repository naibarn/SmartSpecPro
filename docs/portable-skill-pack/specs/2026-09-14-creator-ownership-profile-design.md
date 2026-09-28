# Creator Ownership and Digital License Profile

## Decision

Add ordinary contact fields to `users` and keep creator ownership/licensing
metadata in a separate one-to-one `user_ownership_profiles` table. The profile
page will expose both areas in English, with ownership data clearly labelled as
the source metadata for attribution, license records, and digital watermark
rendering.

## Data boundary

Ordinary profile data contains first name, last name, contact email, contact
phone, and a structured postal address. It is not the login email, password,
backup email, or recovery phone.

The ownership profile contains the legal/display owner name, owner type,
country, address, contact details, website/channel identity, license display
name, copyright notice, watermark text, and attribution text. It is private
account data and is not considered verified merely because it was entered.
Future media/license consumers read this profile by authenticated user ID and
must retain the canonical ownership snapshot used for a generated artifact.

## International conventions

- Email values are trimmed and lower-cased before persistence and validated as
  email addresses.
- Phone values use E.164 form (`+` followed by 8–15 digits).
- Countries use ISO 3166-1 alpha-2 uppercase codes.
- Website and channel URLs accept only `http` or `https`.
- Field sizes are bounded for safe database, UI, and watermark rendering.
- English helper text recommends English/Latin-script license content for
  consistent rendering across platforms, while names remain Unicode-capable.

## API and security

The authenticated `users.getProfile`, `users.updateProfile`,
`users.getOwnershipProfile`, `users.getDigitalOwnershipMetadata`, and
`users.updateOwnershipProfile` procedures use `ctx.user.id`; no client-supplied
user, tenant, or owner ID is trusted. The server normalizes and validates all
fields, and the update is atomic per profile boundary. The redacted metadata
procedure is the consumer boundary for license and watermark code. No secrets,
access tokens, signed URLs, or provider payloads are stored in this profile.

## Migration and compatibility

The migration is additive: nullable columns are added to `users`, and the new
ownership table is created with a unique user foreign key. Existing `name`,
login email, recovery email, and recovery phone values remain unchanged. The
existing recovery phone workflow is intentionally not backfilled into contact
phone.

## Verification

Focused tests cover normalization, E.164/ISO/URL validation, ownership field
limits, API scope, and the migration's table/index/constraint shape. The UI
uses accessible labels, autocomplete hints, responsive fields, explicit save
states, and separate ownership wording. Local migration success is not a
production deployment or legal ownership verification proof.
