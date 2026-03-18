# Section 07: Frontend API Key Panel -- LLM Key Migration from sessionStorage to tRPC

## Overview

This section migrates user-provided LLM API keys (OpenAI, Anthropic, etc.) from insecure `sessionStorage` in the browser to server-side encrypted storage via the new `trpc.userApiKeys.*` router created in section-06. It also removes the now-obsolete sessionStorage-based API key functions from `authService.ts`.

**Important distinction:** The existing `UserAPIKeysPanel.tsx` at `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/UserAPIKeysPanel.tsx` manages **public integration API keys** (for n8n, MCP clients, etc.) via `trpc.apiKeys.*`. This section does NOT modify that component. Instead, this section creates a **new** `UserLlmKeysPanel` component for managing LLM provider keys (OpenAI, Anthropic, DeepSeek, Google, OpenRouter), and removes the sessionStorage functions from `authService.ts`.

## Dependencies

- **Section 05 (api-key-service):** Provides `userApiKeyService.ts` with encrypt/decrypt logic
- **Section 06 (api-key-trpc-router):** Provides `trpc.userApiKeys.setKey`, `trpc.userApiKeys.listKeys`, `trpc.userApiKeys.deleteKey` procedures

These must be implemented and the router registered before the frontend can call the new endpoints.

## Files to Create

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/UserLlmKeysPanel.tsx` -- New component for LLM provider key management

## Files to Modify

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/authService.ts` -- Remove sessionStorage API key functions
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx` -- Wire in the new `UserLlmKeysPanel` component in the API tab

## Tests (Write First)

**Test file:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx`

Test stubs to implement:

```
# Test: renders list of configured LLM providers from listKeys query
# Test: displays keyHint for configured providers (e.g., "...abcd")
# Test: save button calls setKey mutation with provider and apiKey
# Test: delete button calls deleteKey mutation with provider
# Test: shows success toast after saving key
# Test: shows error toast on save failure
# Test: does NOT display raw API key values in the DOM
# Test: input field clears after successful save
```

Mock strategy:
- Mock tRPC hooks (`trpc.userApiKeys.listKeys.useQuery`, `trpc.userApiKeys.setKey.useMutation`, `trpc.userApiKeys.deleteKey.useMutation`)
- Use React Testing Library (`@testing-library/react`) for component rendering and interaction
- Mock `sonner` toast to verify success/error notifications

Each test should render the `UserLlmKeysPanel` component with mocked tRPC context. Use `userEvent` for interactions (click save, click delete, type in input). Assert that:
- The mutation functions are called with the correct `{ provider, apiKey }` or `{ provider }` arguments
- The UI never renders the full API key -- only the hint (last 4 chars)
- Toast notifications fire on success and error callbacks

## Implementation Details

### 1. Create UserLlmKeysPanel Component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/UserLlmKeysPanel.tsx`

This component manages user-provided LLM API keys. It should follow the existing codebase patterns (Radix UI components from `@/components/ui/*`, `lucide-react` icons, `sonner` toast, TanStack Query via tRPC hooks).

**Supported providers** (must match the Zod enum in the tRPC router from section-06):
- `openai`
- `anthropic`
- `deepseek`
- `google`
- `openrouter`

**Component structure:**

The panel displays a card with a table/list of LLM providers. For each provider:
- Show provider name and icon
- Show configuration status: either "Configured" with the keyHint (e.g., `...abcd`) or "Not configured"
- Provide an "Edit" / "Add Key" action that opens an inline input or dialog
- Provide a "Delete" action for configured providers

**Data flow:**

1. **List keys:** `trpc.userApiKeys.listKeys.useQuery()` returns `Array<{ provider: string; keyHint: string | null; configured: boolean }>`. Use this to populate the provider list.

2. **Save key:** When the user enters an API key and clicks save, call `trpc.userApiKeys.setKey.useMutation()` with `{ provider, apiKey }`. On success:
   - Show a success toast via `sonner`
   - Clear the input field
   - Invalidate the `listKeys` query to refresh the displayed keyHint
   - The response returns `{ provider, keyHint, configured: true }` -- never the raw key

3. **Delete key:** When the user clicks delete, call `trpc.userApiKeys.deleteKey.useMutation()` with `{ provider }`. On success:
   - Show a success toast
   - Invalidate the `listKeys` query

**Security rules for the component:**
- Never store the API key value in React state beyond the input field
- Clear the input after successful save
- Never display the raw key -- only show the `keyHint` from the server response
- The input type should be `password` to mask the key while typing

**UI pattern:** Follow the existing project pattern of using `Card`, `CardHeader`, `CardContent` from `@/components/ui/card`, `Button` from `@/components/ui/button`, `Input` from `@/components/ui/input`, `Badge` from `@/components/ui/badge`, and `toast` from `sonner`. Use `Key`, `Trash2`, `CheckCircle2` icons from `lucide-react`.

### 2. Remove sessionStorage API Key Functions from authService.ts

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/authService.ts`

Remove these functions entirely (lines 270-319 in the current file):
- `setApiKey(provider, apiKey)` -- stored keys in sessionStorage
- `getApiKey(provider)` -- read keys from sessionStorage
- `deleteApiKey(provider)` -- removed keys from sessionStorage
- `listStoredApiKeys()` -- scanned sessionStorage for keys
- `hasApiKey(provider)` -- checked sessionStorage for a key
- The `LLMProvider` type export (move to the new component or shared types if needed elsewhere)
- The comment block `// API Key Management` and `// TODO: Move API keys to server-side encrypted store`

**Keep** the Tauri paths within these functions if they are referenced by other Tauri-specific code. However, based on the codebase analysis, the Tauri API key commands (`set_api_key`, `get_api_key`, `delete_api_key`, `list_stored_api_keys`) are only called from these functions. If the Tauri desktop app should also use server-side storage (preferred for consistency), remove the Tauri paths too. If Tauri must keep using its native secure store, preserve only the Tauri branches but remove the sessionStorage fallback.

The recommended approach: Remove all sessionStorage API key functions. The Tauri app can use the same tRPC-based storage since it communicates with the same server. This simplifies the codebase to a single source of truth for user LLM keys.

### 3. Wire UserLlmKeysPanel into Settings Page

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx`

In the API tab section (currently around line 1393-1395), add the `UserLlmKeysPanel` component alongside the existing `UserAPIKeysPanel`. The existing panel handles public integration API keys; the new one handles LLM provider keys.

Add the import at the top of the file:
```typescript
import { UserLlmKeysPanel } from '@/components/settings/UserLlmKeysPanel';
```

Place it within the `activeTab === 'api'` block, either before or after the existing `<UserAPIKeysPanel />`. A logical placement is after the existing panel, separated by a divider, since LLM keys are a secondary concern for most users.

### 4. Clean Up Remaining References

Search for any remaining imports of the removed functions (`setApiKey`, `getApiKey`, `deleteApiKey`, `listStoredApiKeys`, `hasApiKey` from `authService`) across the codebase. Based on analysis, these are referenced in:

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/skills/SkillStudioDialog.tsx` -- uses `llmApiKey` as local state for custom LLM config, NOT from authService. No changes needed.
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminLLMProviders.tsx` -- uses `hasApiKey` as a property name on provider objects from the server, NOT the authService function. No changes needed.
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminMediaProviders.tsx` -- same pattern, no changes needed.
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSettings.tsx` -- same pattern, no changes needed.
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSTTProviders.tsx` -- uses `setApiKey` as local `useState` setter, not the authService function. No changes needed.

If any file directly imports `setApiKey` or `getApiKey` from `authService`, update those imports to use the new tRPC-based approach instead.

## Verification Steps

1. Run the test suite: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
2. Verify TypeScript compiles: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
3. Confirm that no imports of the removed functions remain: `grep -r "from.*authService.*import.*setApiKey\|from.*authService.*import.*getApiKey\|from.*authService.*import.*deleteApiKey\|from.*authService.*import.*listStoredApiKeys\|from.*authService.*import.*hasApiKey" apps/web/client/src/`
4. Manually test in the browser: navigate to Settings, API tab, verify the LLM keys panel renders and can save/delete keys
5. Confirm sessionStorage no longer contains `smartspec_apikey_*` keys after using the new panel