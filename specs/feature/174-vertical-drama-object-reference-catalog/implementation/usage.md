# Feature 174 usage guide

## Quick start

1. Apply the additive migration with the normal web migration command:
   `npm --workspace apps/web run db:migrate`.
2. Open the series `Object Reference` tab. The legacy `tab=product` route is
   still accepted and opens the same wide workspace.
3. Add a story object, drop/import a managed image, choose its canonical image,
   then attach it to any ordinary shot from the optional shot picker.
4. For legacy Special/Product data, use the existing Product entry point; the
   reconciliation procedure creates/updates the same commercial catalog
   identity and preserves the reviewed snapshot.

## Legacy report/backfill

Run a read-only inventory first:

```bash
npm --workspace apps/web run backfill:vertical-drama-object-references
```

After reviewing the report, the additive identity bridge can be applied:

```bash
npm --workspace apps/web run backfill:vertical-drama-object-references -- --apply
```

The script does not infer or download an image from an unmanaged URL. Import
such images through the managed upload/library flow instead.

## API entry points

- Series: `listObjectReferences`, `createObjectReference`,
  `updateObjectReference`, archive/restore, asset lifecycle/canonical/reorder,
  aliases, prompt preview/request, capabilities, and commercial reconciliation.
- Episode: `suggestObjectReferenceCandidates`,
  `getObjectReferenceSuggestions`, `reviewObjectReferenceSuggestion`,
  shot link/unlink/reset, shot usage listing.

Detection is advisory and explicit. Opening an episode remains read-pure; no
paid generation is started by detection or migration. Image generation is
available only after explicit confirmation through the existing model/credit
admission path, and completed tasks require managed provenance before import.
