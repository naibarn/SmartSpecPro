# Code Review Interview: Section 02 — Media Asset Service

## Decisions

### HIGH: Missing dimension extraction (AUTO-FIX)
Spec requires sharp metadata call for width/height when attachment.key is available. Applied.

### HIGH: deleteAsset userId timing oracle (AUTO-FIX)
Include userId in the initial WHERE clause so tenant members cannot enumerate private asset IDs.

### HIGH: Checksum from key/URL not content (LET GO)
Spec explicitly accepts this trade-off ("hashing the storage key is acceptable as a lightweight approach"). Test coverage reflects implementation, not spec gap.

### MEDIUM: No S3 object deletion (LET GO)
Spec says FK CASCADE handles child rows; storage cleanup is a Section 10 concern.

### MEDIUM: Null guard on storageKey before generateSignedUrl (AUTO-FIX)
Add guard to return null early.

### MEDIUM: aHash vs dHash (AUTO-FIX)
Implement proper dHash (compare adjacent pixels horizontally) per spec.

### MEDIUM: Unreachable mimeType default (AUTO-FIX)
Remove dead `?? 'image/jpeg'` default after validateImage already rejected undefined.

### LOW: sharp not in apps/web/package.json (AUTO-FIX)
Add sharp to apps/web/package.json dependencies.
