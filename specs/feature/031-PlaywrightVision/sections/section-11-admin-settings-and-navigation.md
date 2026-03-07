I have enough context now. Let me produce the section content.

# Section 11: Admin Settings and Navigation

## Overview

This section adds three user-facing integration points for the Automation Copilot feature:

1. **Vision model admin dropdown** -- a new settings panel on the AdminSettings page where admins select the Vision LLM used for screenshot analysis.
2. **Tenant allowed_domains setting** -- a configuration panel where admins specify which domains the Automation Copilot is permitted to visit, with a prominent warning when the list is empty.
3. **Sidebar navigation entry** -- an "Automation Copilot" item in the sidebar menu that opens the `AutomationChatModal` (built in section 10).
4. **WorkflowEditor `web_automation` node type** -- a new node in the workflow node registry so workflows can include browser automation steps.

## Dependencies

- **Section 09** (tRPC router and DB schema) -- the `automationCopilot` tRPC router must exist so the frontend can call `analyze`, `execute`, `getStatus`, `cancel`.
- **Section 10** (frontend components) -- `AutomationChatModal` must exist to be opened from the sidebar navigation entry.
- The existing `system_settings` tRPC procedures (`systemSettings.getAll`, `systemSettings.upsert`) are used for reading/writing the vision model and allowed_domains settings.
- The existing node registry in `python-backend/app/orchestrator/node_registry.py` is used to register the `web_automation` node type.

---

## Tests

### 6.4 Admin Settings Tests

**File:** `apps/web/client/src/components/automation/__tests__/AdminAutomationSettings.test.tsx`

Write three Vitest + React Testing Library tests:

1. **Vision model dropdown populates from model registry** -- Render the settings component with a mocked tRPC query that returns a list of vision-capable models (e.g., `gpt-4o`, `claude-3-opus`). Assert the `<Select>` dropdown contains items matching those model names.

2. **Allowed domains text area saves comma-separated to system_settings** -- Render the settings component. Type `example.com\ntest.org` into the domains textarea. Click save. Assert the `systemSettings.upsert` mutation was called with `{ category: "tenant_automation", key: "allowed_domains_{tenantId}", value: "example.com,test.org" }`.

3. **Warning banner shown when allowed_domains is empty** -- Render the settings component with no allowed_domains configured (empty string or undefined from the settings query). Assert a warning element is visible containing text about "No domains configured" and "all web automation is blocked."

### Sidebar Navigation Test

No dedicated test file needed. The sidebar entry is a static data addition to `packages/shared/src/constants/menu.ts` which is already covered by existing menu filtering tests. However, verify manually that the new entry appears only when the `automationCopilot` feature flag is enabled (via `requiresFeature`).

### WorkflowEditor Node Registration Test

**File:** `python-backend/tests/test_web_automation_node.py`

Write two pytest tests:

1. **Node registered in registry** -- Call `NodeRegistry.get_instance()`, then `get_node_type("web_automation")`. Assert it returns a `NodeTypeSpec` with `type="web_automation"`, `category="integrations"`, has inputs named `prompt`, `url`, `goal`, `vision_model`, and an output named `extracted_data`.

2. **Node has correct executor path** -- Assert the `executor` field is `"app.orchestrator.node_executors.web_automation_executor.WebAutomationExecutor"`.

---

## Implementation Details

### 11.1 Vision Model Admin Setting

**File to modify:** `apps/web/client/src/pages/AdminSettings.tsx`

Add a new tab (or section within an existing tab) for "Automation" settings. The pattern follows the existing tab structure in AdminSettings which uses the Radix `Tabs` component with `TabsTrigger` / `TabsContent`.

Key elements of the Automation settings panel:

- A `<Select>` dropdown labeled "Vision Model" populated from the model registry. Fetch available vision-capable models using the existing tRPC query for media models or LLM models (filter to models that support image/vision input). The selected value is stored in `system_settings` with `category: "automation"` and `key: "automation_vision_model"`.

- Default fallback: if no model is configured, display `gpt-4o` as the default selection and show an info note: "Using default model gpt-4o. Select a different vision model if desired."

- On save, call `systemSettings.upsert` with the selected model name. Show a success toast via `sonner`.

- Import `Bot` from `lucide-react` for the tab icon.

### 11.2 Tenant Allowed Domains Setting

**File to modify:** `apps/web/client/src/pages/AdminSettings.tsx` (same Automation tab)

Add below the vision model dropdown:

- A `<Textarea>` labeled "Allowed Domains" with placeholder text: "Enter one domain per line, e.g.\nexample.com\n*.mysite.org"

- On load, fetch the current value from `system_settings` with `category: "tenant_automation"` and `key: "allowed_domains_{tenantId}"`. Parse the comma-separated string back into newline-separated for display.

- On save, convert newline-separated domains to comma-separated, trim whitespace, filter empty lines, and call `systemSettings.upsert`.

- **Warning banner:** When the allowed_domains value is empty (no domains configured), render an amber warning banner using the existing `AlertTriangle` icon pattern:

```
[AlertTriangle icon] No domains configured -- all web automation is blocked for this tenant.
Add at least one domain to enable Automation Copilot.
```

Use Tailwind classes: `bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200` (consistent with existing warning patterns in the codebase).

- **Wildcard support note:** Show a small help text below the textarea: "Use *.example.com to allow all subdomains. The base domain (example.com) must be listed separately."

### 11.3 Sidebar Navigation Entry

**File to modify:** `packages/shared/src/constants/menu.ts`

Add a new entry to the `defaultMenuItems` array in the `'main'` group:

```typescript
{
  id: 'automation',
  label: 'Automation Copilot',
  labelTh: 'ระบบอัตโนมัติ',
  icon: 'Bot',
  path: '/automation',
  platforms: ['web', 'desktop'],
  group: 'main',
  sortOrder: 3.8,
  requiresFeature: 'automationCopilot',
}
```

Key decisions:
- `sortOrder: 3.8` places it after Agencies (3.7) and before Media History (4).
- `requiresFeature: 'automationCopilot'` ensures the menu item only appears when the feature flag is enabled for the tenant.
- `icon: 'Bot'` uses the Lucide Bot icon (same as used in agency items, appropriate for automation).
- `path: '/automation'` -- the route handler in `App.tsx` should open the `AutomationChatModal` as a full-page modal overlay rather than a traditional page. Alternatively, the route can render a thin wrapper page that immediately opens the modal.

**File to modify:** `apps/web/client/src/App.tsx`

Add a `<Route path="/automation">` entry that renders a wrapper component which opens `AutomationChatModal` in an always-open state. This follows the modal overlay pattern -- the user navigates to `/automation`, sees the modal, and closing the modal navigates them back to their previous page. The wrapper component:

- Renders `AutomationChatModal` with `open={true}`.
- On `onOpenChange(false)`, calls `setLocation("/dashboard")` to navigate away (or `history.back()` if available).

### 11.4 WorkflowEditor `web_automation` Node Type

**File to modify:** `python-backend/app/orchestrator/node_registry.py`

Register a new node type inside the `_register_core_nodes()` method of `NodeRegistry`. The node definition:

- `type`: `"web_automation"`
- `display_name`: `"Web Automation"`
- `description`: `"Run browser automation via Automation Copilot"`
- `icon`: `"Bot"`
- `color`: `"indigo"`
- `category`: `"integrations"`
- `inputs`:
  - `prompt` -- `data_type: "text"`, `ui_type: "textarea"`, `required: True`, `accepts_connection: True`, `placeholder: "Describe what to automate..."`
  - `url` -- `data_type: "text"`, `ui_type: "text"`, `required: True`, `accepts_connection: True`, `placeholder: "https://example.com"`
  - `goal` -- `data_type: "text"`, `ui_type: "text"`, `required: True`, `accepts_connection: True`, `placeholder: "Extract product prices"`
  - `vision_model` -- `data_type: "text"`, `ui_type: "select"`, `required: False`, `accepts_connection: False`, `options_endpoint: "/api/v1/models?capability=vision"`, `placeholder: "Use admin default"`
- `outputs`:
  - `extracted_data` -- `data_type: "json"`, `display_name: "Extracted Data"`
- `executor`: `"app.orchestrator.node_executors.web_automation_executor.WebAutomationExecutor"`

**New file:** `python-backend/app/orchestrator/node_executors/web_automation_executor.py`

Create a stub executor class. The executor is called when a workflow containing a `web_automation` node is run. It should:

- Accept the node inputs (`prompt`, `url`, `goal`, `vision_model`).
- Call the `AutomationCopilot` service (from section 06) to analyze, build, and execute.
- Return the `extracted_data` from the execution result as the node output.
- Handle errors by raising appropriate exceptions that the workflow engine can catch.

For now, implement only the class skeleton with docstrings. The full implementation depends on sections 05-07 being complete.

```python
class WebAutomationExecutor:
    """Workflow node executor for web automation tasks.

    Calls AutomationCopilot.analyze() -> build() -> execute()
    and returns extracted_data as the node output.
    """

    async def execute(self, inputs: dict, context: dict) -> dict:
        """Execute the web automation node.

        Args:
            inputs: Dict with keys: prompt, url, goal, vision_model (optional)
            context: Workflow execution context with tenant_id, user_id, etc.

        Returns:
            Dict with key 'extracted_data' containing the automation result.

        Raises:
            NodeExecutionError on failure.
        """
        raise NotImplementedError("WebAutomationExecutor pending full pipeline implementation")
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/client/src/pages/AdminSettings.tsx` | Modify | Add Automation tab with vision model dropdown and allowed_domains textarea |
| `packages/shared/src/constants/menu.ts` | Modify | Add `automation` sidebar menu item with `requiresFeature: 'automationCopilot'` |
| `apps/web/client/src/App.tsx` | Modify | Add `/automation` route that opens `AutomationChatModal` |
| `python-backend/app/orchestrator/node_registry.py` | Modify | Register `web_automation` node type in `_register_core_nodes()` |
| `python-backend/app/orchestrator/node_executors/web_automation_executor.py` | Create | Stub executor for the `web_automation` workflow node |
| `apps/web/client/src/components/automation/__tests__/AdminAutomationSettings.test.tsx` | Create | Tests for admin settings UI |
| `python-backend/tests/test_web_automation_node.py` | Create | Tests for node registry entry |

## Implementation Notes

- The `system_settings` table already exists and supports arbitrary key-value pairs with categories. No schema migration is needed for storing the vision model or allowed_domains settings.
- The `requiresFeature` field on menu items is already supported by the existing `getVisibleMenuItems()` function in the menu module -- the sidebar rendering logic checks feature flags before displaying items with this field.
- The `web_automation` node executor is intentionally a stub. Full implementation requires the `AutomationCopilot` orchestrator (section 06) and the Celery task infrastructure (section 07) to be in place. The stub allows workflows to be designed with this node type even before execution is available.
- The allowed_domains setting uses the tenant ID in the key (`allowed_domains_{tenantId}`) to support multi-tenant isolation. Each tenant has its own domain whitelist.