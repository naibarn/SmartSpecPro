# Section 04: builtin-file-parse Tool (Node.js Handler)

## Overview

This section implements a secure file parsing endpoint at `POST /api/internal/tools/file-parse` that converts CSV, XLSX, and TXT files into structured `InputItem[]` arrays for use by the Auto Draft Agent. The endpoint handles magic byte detection, formula injection sanitization, SSRF URL validation, ZIP bomb guards, and enforces 5MB file size / 100-row limits.

**Runtime:** TypeScript (Node.js, Vitest)

## Dependencies

- **Section 01 (shared-infra):** Provides `FileParseRequestSchema`, `FileParseResponseSchema`, `InputItemSchema` from `apps/web/shared/contentAutomation/types.ts`, and the `contentAutomationGate` middleware that gates the endpoint behind `ENABLE_CONTENT_AUTOMATION`.
- **Existing packages:** `papaparse` (already in `apps/web/package.json`), `xlsx` (already in `apps/web/package.json`).
- **Existing utilities:** `classifyHostSafety` from `apps/web/server/services/libraryUrlPolicy.ts` for SSRF host validation. `auditLogger` from `apps/web/server/services/auditLogger.ts` for structured logging.

## File to Create

`/home/dev/projects/SmartSpecPro/apps/web/server/routers/fileParseTool.ts`

## Tests

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/fileParseTool.test.ts`

Write tests FIRST before implementation. The tests cover the following scenarios:

### Feature Flag and Auth

```
Test: returns 503 when feature flag is disabled
Test: returns 401 when X-Service-Token / X-Internal-Token is missing
```

### URL Validation (SSRF Prevention)

```
Test: rejects file URL with file:// scheme
Test: rejects file URL with gopher:// scheme
Test: rejects file URL pointing to private IP (e.g., 10.0.0.1, 192.168.1.1, 172.16.0.1)
Test: rejects file URL pointing to localhost
Test: allows file URL from R2/S3 host prefix
Test: allows file URL from /uploads/ path
```

### File Size Limits

```
Test: rejects file larger than 5MB (via HEAD Content-Length)
Test: rejects file larger than 5MB (via streaming byte counter when no Content-Length)
```

### Magic Byte Detection

```
Test: detects XLSX by ZIP magic bytes (PK\x03\x04, i.e. bytes 0x50 0x4B 0x03 0x04)
Test: detects CSV by UTF-8 text content (no ZIP magic bytes)
Test: rejects binary file with neither ZIP nor UTF-8 signature
```

### CSV Parsing (Papa Parse)

```
Test: parses CSV with topic_column and returns InputItem[]
Test: rejects CSV when topic_column does not match any header
Test: limits CSV to 100 data rows
Test: strips formula prefix = from cell values
Test: strips formula prefix + from cell values
Test: strips formula prefix - from cell values
Test: strips formula prefix @ from cell values
Test: strips control characters from cell values
Test: truncates cell values exceeding 5000 chars
Test: skips empty rows
```

### XLSX Parsing (SheetJS)

```
Test: parses XLSX first sheet with topic_column
Test: limits XLSX to 100 data rows (sheetRows: 101)
Test: applies same cell sanitization as CSV
Test: rejects XLSX with decompressed size > 50MB (zip bomb guard)
```

### TXT Parsing

```
Test: per_line mode splits file by newline, each line becomes an InputItem
Test: single mode uses entire file as one InputItem topic
Test: strips empty lines in per_line mode
```

### Response Shape

```
Test: returns FileParseResponse with correct total_rows and parsed_rows
Test: includes warnings for skipped rows
Test: params_columns maps additional columns correctly
```

### Test Structure Guidance

Tests should mock the HTTP fetch calls (to simulate fetching files from S3/R2) and the feature flag middleware. Use `vi.fn()` / `vi.mock()` for these external dependencies. Create small in-memory buffers for CSV/XLSX/TXT test data rather than relying on fixture files.

For XLSX test data, create minimal valid ZIP-structured XLSX buffers using the `xlsx` library's `XLSX.write()` function in the test setup.

## Implementation Details

### Endpoint Definition

Create an Express `Router` with a single route: `POST /api/internal/tools/file-parse`.

The route must be gated by:
1. The `contentAutomationGate` middleware from Section 01 (returns 503 when feature flag is off).
2. Internal token verification using the existing `X-Internal-Token` header pattern (timing-safe comparison against `SMARTSPEC_WEB_GATEWAY_TOKEN`).

### Step-by-Step Handler Logic

**Step 1: URL Validation (SSRF Prevention)**

Before fetching the file, validate the `file_url`:

- Parse with `new URL(file_url)`.
- Block schemes: `file://`, `gopher://`, `dict://`, `ftp://`. Only allow `http://` and `https://`.
- Validate the hostname using the existing `classifyHostSafety()` function from `apps/web/server/services/libraryUrlPolicy.ts`. If it returns `"blocked_local_private_host"`, reject with 400.
- Additionally, enforce an allowlist: only permit URLs whose hostname matches the project's R2/S3 bucket host (from `ENV.S3_ENDPOINT` or `ENV.R2_PUBLIC_URL`) OR whose pathname starts with `/uploads/`. This prevents the agent from fetching arbitrary external URLs.

**Step 2: File Size Check (HEAD Request)**

Issue a `HEAD` request to the `file_url`. Read the `Content-Length` header. If it exceeds 5MB (5 * 1024 * 1024 bytes), reject with 400 and error `"file_too_large"`.

If `Content-Length` is absent, proceed to streaming with a byte counter (Step 3).

**Step 3: Fetch and Stream with Byte Guard**

Fetch the file body. While reading the response stream, maintain a running byte counter. If total bytes exceed 5MB, abort the stream and reject with 400 `"file_too_large"`.

Collect the complete buffer in memory.

**Step 4: Magic Byte Detection**

Examine the first 4 bytes of the buffer:

- If bytes match `0x50 0x4B 0x03 0x04` (ZIP/PK signature): route to XLSX parser.
- If `file_type` was explicitly `"txt"`: route to TXT parser.
- If the buffer is valid UTF-8 text (no null bytes in first 512 bytes): route to CSV parser.
- Otherwise: reject with 400 `"unsupported_file_type"`.

Do NOT trust the file extension or `Content-Type` header for format detection.

**Step 5a: CSV Parsing Path (Papa Parse)**

```typescript
import Papa from "papaparse";

const result = Papa.parse(data, {
  header: true,
  skipEmptyLines: true,
});
```

- Verify `topic_column` exists in `result.meta.fields`. If not found, reject with 400 `"column_not_found"` listing available columns.
- Truncate rows to `max_rows` (default 100).
- Apply cell sanitization to every cell value (see Step 6).
- Map each row to an `InputItem`: `{ topic: row[topic_column], ...mappedParams }`.
- If `params_columns` is provided, map those additional columns into the InputItem's params.

**Step 5b: XLSX Parsing Path (SheetJS)**

```typescript
import * as XLSX from "xlsx";

const workbook = XLSX.read(buffer, { sheetRows: 101 });
```

- Use the first sheet (`workbook.SheetNames[0]`).
- Convert to JSON: `XLSX.utils.sheet_to_json(sheet, { header: 1 })`.
- Use first row as headers, remaining rows as data.
- **ZIP bomb guard:** After `XLSX.read()`, check the total cell count. If the workbook reports more than 50MB worth of decompressed data (heuristic: total string content > 50MB), reject with 400 `"zip_bomb_detected"`. The `sheetRows: 101` option already limits rows at read time, which is the primary guard.
- Apply same column validation and cell sanitization as CSV path.

**Step 5c: TXT Parsing Path**

- If `parse_mode === "per_line"`: split by `\n`, trim each line, filter out empty lines, each line becomes an InputItem with `topic` set to the line content.
- If `parse_mode === "single"`: entire file content becomes a single InputItem.
- Apply row limit (`max_rows`).

**Step 6: Cell Sanitization**

Apply to every cell value across all parsers:

```typescript
function sanitizeCell(value: unknown): string {
  if (value == null) return "";
  let str = String(value);

  // Strip formula injection prefixes
  str = str.replace(/^[=+\-@]+/, "");

  // Strip control characters (ASCII 0-31 except \n \r \t)
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // Truncate to 5000 chars
  if (str.length > 5000) {
    str = str.slice(0, 5000);
  }

  return str.trim();
}
```

The formula prefix stripping is critical: spreadsheet applications interpret leading `=`, `+`, `-`, `@` as formula markers. Since parsed content may eventually be re-exported or displayed, this prevents formula injection attacks.

**Step 7: Build Response**

Return the `FileParseResponse`:

```typescript
{
  success: true,
  total_rows: <total rows found in file>,
  parsed_rows: <rows actually returned after limits>,
  items: InputItem[],
  warnings: string[]  // e.g., "Truncated to 100 rows (file had 500)"
}
```

### Batch Processing Semantics

Note: the `file-parse` tool itself does NOT execute drafts. It only parses files into `InputItem[]`. The Auto Draft Agent (Section 07) is responsible for iterating over parsed items and calling `builtin-auto-draft` for each one.

### Error Handling

All errors should return structured JSON:

```typescript
{
  success: false,
  error: {
    code: "blocked_scheme" | "blocked_host" | "file_too_large" |
          "unsupported_file_type" | "column_not_found" |
          "zip_bomb_detected" | "parse_error",
    message: string
  }
}
```

Use appropriate HTTP status codes: 400 for validation/parsing errors, 401 for auth failures, 503 for feature flag disabled.

### Audit Logging

Emit structured audit log events:
- `file_parse.started` -- with userId, tenantId, file_url (sanitized, no query params), file_type
- `file_parse.completed` -- with parsed_rows, total_rows, warnings count
- `file_parse.failed` -- with error code and sanitized error message

### Security Summary

| Threat | Mitigation |
|--------|-----------|
| SSRF via file_url | Scheme blocklist + `classifyHostSafety()` + allowlist for R2/S3 hosts |
| ZIP bomb (XLSX) | `sheetRows: 101` at read time + decompressed size heuristic check |
| Formula injection | Strip leading `=+@-` from all cell values |
| Oversized files | HEAD Content-Length check + streaming byte counter (5MB limit) |
| Binary/executable upload | Magic byte detection rejects non-CSV/XLSX/TXT content |
| Column injection | Explicit `topic_column` validation against actual headers |
| Control character injection | Strip ASCII 0x00-0x1F (except newline/tab) from all cells |

### Router Registration

The router must be mounted in the Express app. Section 01 is responsible for setting up the route mount point. This section only creates the router module itself with the exported `Router` instance.

Export pattern (matching `browserTool.ts`):

```typescript
const router = Router();
// ... route definition ...
export default router;
```

## Key Existing Code References

- **SSRF validation pattern:** `apps/web/server/services/libraryUrlPolicy.ts` -- `classifyHostSafety()`, `isPrivateIpv4()`, `isPrivateIpv6()` functions. Reuse these rather than reimplementing.
- **Internal token verification pattern:** `apps/web/server/routes/browserTool.ts` lines 1-35 -- shows Express router setup, `X-Internal-Token` header check, feature flag check.
- **Papa Parse usage:** `apps/web/client/src/components/library/CSVViewer.tsx` -- existing import pattern. Note: the existing usage is client-side; this section uses it server-side (same API).
- **SheetJS usage:** `apps/web/client/src/components/library/ExcelViewer.tsx` -- existing import pattern.
- **Audit logger:** `apps/web/server/services/auditLogger.ts` -- use the existing `auditLogger` for structured event emission.
- **Environment config:** `apps/web/server/_core/env.ts` -- `ENV` object for accessing `S3_ENDPOINT`, `R2_PUBLIC_URL`, and `SMARTSPEC_WEB_GATEWAY_TOKEN`.
