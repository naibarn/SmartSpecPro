# Research Notes

## Existing data and code

- Durable relation: `apps/web/drizzle/schema.ts` defines nullable
  `sharesFaceWithCharacterId` self-FK for a different person/twin.
- API projection: `verticalDramaCharacters.characterRowToDto` exposes the relation.
- Existing mutation: `verticalDramaCharacters.createCharacterTwin` writes the relation
  and keeps the new row independent.
- Image resolver: `resolveFaceSourceReferenceForCharacter` maps the relation to a hard
  `face_source_reference`.
- Storyboard pipeline: `buildTwinAgeLocks`/`twinPairs` can consume relation facts and
  role-text fallback; existing storyboard JSON remains a snapshot.
- Characters UI: roster/detail currently show a conditional shares-face badge, while
  the DNA editor has no relationship/shared-DNA section.
- Character identity DNA schema contains age and face dimensions but no relation field.

## Series 53 evidence

- 29 character rows; zero non-null `sharesFaceWithCharacterId` links.
- Base rows 192/193 have roles `ลูกชายฝาแฝดคนที่หนึ่ง/สอง` but no durable link.
- Row 192 has approved DNA age `around 9 years old` and approved portrait 417.
- Row 193 has no base visual bible; portrait 463 was cast broadly at age 8–14.
- Row 198 is an age/outfit variant `ภาคินทารก` with `1 month old infant`.
- Episode 258 shot 3 uses `character-4-variant` with ภูมิ's school-age look.

## Existing patterns to reuse

- Character roster card/detail badge and collapsible DNA editor in
  `VerticalDramaCharacterStockPanel.tsx`.
- Shot reference grouping/picker in `VerticalDramaStoryboardPanel.tsx`.
- Existing tenant/user/series-scoped tRPC mutation patterns in
  `verticalDramaCharacters.ts`.

## Discovery limitation

SocratiCode transport was unavailable; targeted `rg`, file reads, and read-only `psql`
were used instead.
