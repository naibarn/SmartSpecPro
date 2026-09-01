# Research notes

- `vertical_drama_locations` has a unique `(seriesId, locationKey)` constraint, but no unique or canonical-name constraint.
- Normal episode reconciliation already supports exact key, exact normalized name, and one trailing parenthetical qualifier; its tests explicitly reject general fuzzy merging.
- Special Tie-in provisioning hashes the exact trimmed scene label and only conflicts on the resulting key, so wording changes create new rows.
- Marketplace idea selection always adds the idea's primary scene label and only checks exact case-insensitive equality against scene-slot requests in that one idea.
- The Scenes UI maps every API location row directly and has no presentation deduplication.
- Series 53 contains rows 133, 134, 135, and 137 with overlapping living-room/play-area descriptions and separate creation times.
- A new optional `sceneLocationKey` in the JSON Special Tie-in input avoids a schema migration while preserving the selected canonical identity through worker/recovery paths.
