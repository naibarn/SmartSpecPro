# Decision log

## Planning depth

`standard` quick plan: Worker runtime, server compatibility behavior, UI
recovery, and release proof are coupled but bounded to the existing Hermes
control flow.

## Decisions

1. Accumulate output and emit only a complete structured device event.
2. Remove raw fallback emission instead of teaching the server to parse
   secret-bearing CLI text.
3. Detect legacy raw-only events server-side only to stop silent polling; do
   not expose their contents.
4. Use Windows process flags rather than shell wrappers to hide the console.
5. Raise the desktop minimum to 0.1.133 so 0.1.132 cannot repeat this defect.
6. Reuse the existing Settings error card and retry presentation.

## Review rounds

1. Completeness: added legacy raw-only recovery.
2. Contradictions: kept raw text out of status responses and diagnostics.
3. Security: preserved environment isolation and code secrecy.
4. Integration: included version gate and installer publication.
5. UX: included non-silent error state and existing retry path.
6. Final review: no unresolved product or architecture choice remains.
