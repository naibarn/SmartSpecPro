/**
 * Vertical Drama Series — Storyboard location grouping contract
 * (`planning/polished-toasting-gadget.md` Phase 2).
 *
 * TypeScript-side (camelCase) mirror of the `distinct_locations[]` shape
 * already produced by the `vertical-drama-storyboard-shotgrid` skill and
 * validated by `distinctLocationSchema` in
 * `server/services/verticalDramaStoryboardGeneration.ts` (snake_case on the
 * LLM/persisted-JSON side: `location_key` / `location_name` / `description` /
 * `shot_numbers`). Each entry groups the contiguous shots (1-9) that share
 * one physical setting for a single episode. Pure field-only contract — no
 * server/db imports, safe to import from the browser bundle.
 */
export type VerticalDramaStoryboardLocationGroup = {
  locationKey: string;
  locationName: string;
  description: string;
  shotNumbers: number[];
};
