# Character custom instruction render enforcement

No API or UI changes are required. When `customInstruction` is present, the server automatically appends one bounded visual-requirements block to the previewed prompt and to the exact image-provider prompt.

The block is replaced rather than duplicated when the brief changes. With an empty or absent brief, the original prompt is preserved byte-for-byte.
