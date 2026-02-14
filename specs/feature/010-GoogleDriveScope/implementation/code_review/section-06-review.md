# Section 06 Code Review

## CRITICAL
1. No Google API `HttpError` handling -- API errors silently become generic `ExtractionError`. Callers can't distinguish 403 vs 404.
2. `_check_file_size` silently swallows all non-`FileTooLargeError` exceptions (lines 198-200). Hides auth/permission failures.
3. `signal.SIGALRM` is not thread-safe and will crash in threaded Celery workers or `run_in_executor` contexts.

## HIGH
4. Missing large-sheet pagination -- plan requirement for >10k rows pagination not implemented.
5. 7 of 22 specified tests are missing (PDF/binary tests, timeout test, pagination test).
6. Access token stored with no expiry awareness -- tokens expire after ~60 minutes.
7. `_extract_via_export` has no output size guard -- could return megabytes of text.

## MEDIUM
8. `max_file_size_bytes=0` treated as falsy, silently using default.
9. `_chunk_slides` doesn't use overlap when splitting large slides (inconsistent with doc chunking).
10. `_chunk_sheet` only handles first sheet's content in multi-sheet text.
11. `FileTooLargeError` semantically overloaded for cell-count violations (says "bytes" for cell counts).
12. No input validation on `file_id` parameter.
13. Lazy import of `re` module inside `_chunk_slides`.

## LOW
14. Tests directly test private methods instead of public `extract()`.
15. Missing return type annotations on builder methods.
16. Test mock setup fragile due to MagicMock chaining.
17. No logging in extraction methods.
