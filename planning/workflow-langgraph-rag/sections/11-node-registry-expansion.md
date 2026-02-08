Now I have complete context. I can see all 21 existing nodes registered in the registry, the executor directory structure, the current category system, and the full Phase 1 plan with all ~33 nodes. Let me write the section.

# Section 11: Node Registry Expansion

## Overview

This section expands the node registry from its current 21 registered node types to the full ~33 Phase 1 node set. The node registry at `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` is the **single source of truth** for all workflow node definitions -- the frontend fetches these definitions via `GET /api/v1/workflows/node-types` and dynamically renders the node palette, configuration panels, and connection handles based on them.

**What gets done:**

1. Add four new categories to `NodeTypeSpec.category`: `reliability`, `security`, `communication`, `code`
2. Re-categorize existing nodes where their current categories are incorrect for the new taxonomy
3. Register 12 new node types covering Sections 4-9 of the plan (triggers, I/O, data shaping, reliability, security, HITL, code)
4. Add middleware flags to `NodeTypeSpec` for retry, rate limiter, and cache middleware
5. Ensure all executor paths match the actual executor directory structure

**Why this is a separate section:** The registry is purely declarative -- it defines `InputSpec`, `OutputSpec`, icons, colors, categories, and executor paths. The actual executor implementations are built in Sections 4-9. This section ensures every Phase 1 node has a well-defined spec so the frontend can render it and the compiler can validate connections, even before the executor code is complete. Executor stubs (raising `NotImplementedError`) are acceptable for nodes whose implementation is deferred to their respective section.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` | **MODIFY** | Add new categories, new node registrations, middleware flags, re-categorize existing nodes |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/data_types.py` | **MODIFY** | Add `file` and `secret` port data types |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_registry.py` | **CREATE** | Tests for registry completeness, category validation, port compatibility |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/io_executors/__init__.py` | **CREATE** | Package init for I/O executors |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/reliability_executors/__init__.py` | **CREATE** | Package init for reliability executors |
| `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/security_executors/__init__.py` | **CREATE** | Package init for security executors |

---

## Implementation Steps

### Step 1: Update Data Types

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/data_types.py`

Add two new port data types needed by the expanded node set: `file` (for storage/upload nodes) and `secret` (for the Secrets Vault node, which must never be logged or persisted in state).

```python
"""
Data type system for workflow node ports.
"""

PORT_TYPE_COMPATIBILITY = {
    "text": {"text", "any"},
    "json": {"json", "text", "any"},  # json can stringify to text
    "array": {"array", "json", "any"},
    "image": {"image", "any"},
    "number": {"number", "text", "any"},
    "boolean": {"boolean", "any"},
    "file": {"file", "any"},  # file URLs / references
    "secret": {"secret", "text", "any"},  # secrets (scrubbed from state)
    "any": {"text", "json", "array", "image", "number", "boolean", "file", "secret", "any"},
}


def is_compatible_connection(source_type: str, target_type: str) -> bool:
    """Check if source port type can connect to target port type."""
    return target_type in PORT_TYPE_COMPATIBILITY.get(source_type, set())
```

### Step 2: Add Middleware Flags to NodeTypeSpec

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`

Extend the `NodeTypeSpec` dataclass with optional middleware configuration flags. These flags tell the `NodeAdapter` (Section 1) which middleware to apply when wrapping the executor.

```python
@dataclass
class MiddlewareConfig:
    """Middleware flags for a node type.

    These control which execution middleware is applied
    by the NodeAdapter when wrapping this node's executor.
    """

    retry_eligible: bool = False  # Can have retry middleware applied
    rate_limit_eligible: bool = False  # Can have rate limiter applied
    cache_eligible: bool = False  # Can have caching applied
    default_timeout_seconds: int = 60  # Default execution timeout


@dataclass
class NodeTypeSpec:
    """Complete specification for a node type."""

    type: str  # Unique identifier (e.g., "llm_call")
    display_name: str
    description: str
    icon: str  # Lucide icon name
    color: str  # Tailwind color name (blue, green, purple, etc.)
    category: str  # ai, flow_control, human, skills, media, triggers, inputs, outputs, data,
                    # reliability, security, communication, code
    inputs: list[InputSpec]
    outputs: list[OutputSpec]
    executor: str  # Python dotpath to executor class
    middleware: MiddlewareConfig = field(default_factory=MiddlewareConfig)
```

### Step 3: Update Category Type in NodeTypeSpec

The `category` field is a plain `str` in the Python backend. The valid values are:

**Existing categories (preserved):**
- `ai` (color: blue) -- LLM Call, RAG Query
- `flow_control` (color: yellow) -- Conditional, Loop, Switch, Wait
- `human` (color: orange) -- Approval Gate
- `skills` (color: green) -- Skill
- `media` (color: pink) -- Generate Image, Generate Video
- `triggers` (color: green) -- Manual, Webhook, Schedule, Event, File Upload, Error triggers
- `inputs` (color: blue) -- Form Input
- `outputs` (color: purple) -- Workflow Response, Webhook Response
- `data` (color: orange) -- Set Variable, Merge Data, Code Runner

**New categories (added in this section):**
- `reliability` (color: orange) -- Retry, Rate Limiter, Circuit Breaker, Idempotency, DLQ, Checkpoint
- `security` (color: red) -- Secrets, RBAC, Audit, Logging, Metrics, Run History
- `communication` (color: cyan) -- Email/SMS/Chat, Notification
- `code` (color: purple) -- Code Step (sandboxed)

### Step 4: Register All New Node Types

Add the following registrations to `_register_core_nodes()` in the `NodeRegistry` class. These are organized by category matching Sections 4-9 of the master plan.

---

## Complete Node Registration Table

This table defines ALL ~33 Phase 1 nodes. Nodes marked "EXISTS" are already registered and require only middleware flag updates and (in some cases) re-categorization. Nodes marked "NEW" must be added.

### Existing Nodes (21 nodes -- update middleware flags)

| # | node_type | display_name | category | color | icon | executor_path | Status | Middleware |
|---|-----------|-------------|----------|-------|------|---------------|--------|------------|
| 1 | `llm_call` | LLM Call | ai | blue | brain | `...llm_executor.LLMExecutor` | EXISTS | retry=T, rate_limit=T, cache=T |
| 2 | `rag_query` | RAG Query | ai | green | database | `...rag_executor.RAGExecutor` | EXISTS | retry=T, cache=T |
| 3 | `conditional` | Conditional Branch | flow_control | yellow | split | `...conditional_executor.ConditionalExecutor` | EXISTS | -- |
| 4 | `loop` | Loop | flow_control | purple | repeat | `...loop_executor.LoopExecutor` | EXISTS | -- |
| 5 | `approval_gate` | Approval Gate | human | orange | user-check | `...approval_executor.ApprovalExecutor` | EXISTS | -- |
| 6 | `generate_image` | Generate Image | media | pink | image | `...image_executor.ImageExecutor` | EXISTS | retry=T, rate_limit=T |
| 7 | `skill` | Skill | skills | green | sparkles | `...skill_executor.SkillExecutor` | EXISTS | retry=T, cache=T |
| 8 | `manual_trigger` | Manual Trigger | triggers | green | play | `...manual_trigger_executor.ManualTriggerExecutor` | EXISTS | -- |
| 9 | `form_input` | Form Input | inputs | blue | form-input | `...form_input_executor.FormInputExecutor` | EXISTS | -- |
| 10 | `workflow_response` | Workflow Response | outputs | purple | check-circle | `...response_executor.ResponseExecutor` | EXISTS | -- |
| 11 | `set_variable` | Set Variable | data | orange | variable | `...set_executor.SetExecutor` | EXISTS | -- |
| 12 | `merge_data` | Merge Data | data | orange | merge | `...merge_executor.MergeExecutor` | EXISTS | -- |
| 13 | `code_runner` | Code Runner | data | red | code | `...code_executor.CodeExecutor` | EXISTS -> **MOVE to `code`** | timeout=30 |
| 14 | `webhook_trigger` | Webhook Trigger | triggers | green | webhook | `...webhook_trigger_executor.WebhookTriggerExecutor` | EXISTS | -- |
| 15 | `schedule_trigger` | Schedule Trigger | triggers | green | clock | `...schedule_trigger_executor.ScheduleTriggerExecutor` | EXISTS | -- |
| 16 | `event_trigger` | Event Trigger | triggers | green | zap | `...event_trigger_executor.EventTriggerExecutor` | EXISTS | -- |
| 17 | `file_upload_trigger` | File Upload Trigger | triggers | green | upload | `...file_upload_trigger_executor.FileUploadTriggerExecutor` | EXISTS | -- |
| 18 | `switch` | Switch | flow_control | yellow | git-branch | `...switch_executor.SwitchExecutor` | EXISTS | -- |
| 19 | `wait` | Wait | flow_control | gray | pause | `...wait_executor.WaitExecutor` | EXISTS | -- |
| 20 | `webhook_response` | Webhook Response | outputs -> **MOVE to `communication`** | cyan | reply | `...webhook_response_executor.WebhookResponseExecutor` | EXISTS | -- |
| 21 | `error_trigger` | Error Trigger | triggers | red | alert-circle | `...error_trigger_executor.ErrorTriggerExecutor` | EXISTS | -- |

### New Nodes (12 nodes)

#### Trigger Nodes (Section 4)

| # | node_type | display_name | category | color | icon | Description |
|---|-----------|-------------|----------|-------|------|-------------|
| 22 | `queue_trigger` | Queue Trigger | triggers | green | inbox | Consume from Redis Streams / message queue |

**Registration:**

```python
# 22. Queue Trigger (Section 4)
self.register_node_type(
    NodeTypeSpec(
        type="queue_trigger",
        display_name="Queue Trigger",
        description="Start workflow by consuming messages from a queue (Redis Streams)",
        icon="inbox",
        color="green",
        category="triggers",
        inputs=[
            InputSpec(
                name="queueName",
                display_name="Queue Name",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                placeholder="my-workflow-queue",
            ),
            InputSpec(
                name="consumerGroup",
                display_name="Consumer Group",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="workflow-consumers",
            ),
            InputSpec(
                name="batchSize",
                display_name="Batch Size",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=1,
                validation={"min": 1, "max": 100},
            ),
            InputSpec(
                name="ackMode",
                display_name="Acknowledgment Mode",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="after_process",
                options=[
                    {"label": "After Processing", "value": "after_process"},
                    {"label": "Immediate", "value": "immediate"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="messages", display_name="Messages", data_type="array"),
            OutputSpec(name="messageCount", display_name="Message Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.trigger_executors.queue_trigger_executor.QueueTriggerExecutor",
    )
)
```

#### Core I/O Nodes (Section 5)

| # | node_type | display_name | category | color | icon | Description |
|---|-----------|-------------|----------|-------|------|-------------|
| 23 | `http_request` | HTTP Request | data | blue | globe | Make HTTP requests with SSRF protection |
| 24 | `database_query` | Database Query | data | green | database | Execute parameterized SQL queries |
| 25 | `storage_action` | Storage Action | data | blue | hard-drive | Upload/download/list files in S3/R2 |
| 26 | `notification` | Email/SMS/Chat | communication | cyan | mail | Send email, Slack, or webhook notifications |

**Registrations:**

```python
# 23. HTTP Request (Section 5)
self.register_node_type(
    NodeTypeSpec(
        type="http_request",
        display_name="HTTP Request",
        description="Make HTTP requests to external APIs with SSRF protection",
        icon="globe",
        color="blue",
        category="data",
        inputs=[
            InputSpec(
                name="url",
                display_name="URL",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=True,
                placeholder="https://api.example.com/data",
                validation={"pattern": r"^https?://"},
            ),
            InputSpec(
                name="method",
                display_name="HTTP Method",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="GET",
                options=[
                    {"label": "GET", "value": "GET"},
                    {"label": "POST", "value": "POST"},
                    {"label": "PUT", "value": "PUT"},
                    {"label": "PATCH", "value": "PATCH"},
                    {"label": "DELETE", "value": "DELETE"},
                ],
            ),
            InputSpec(
                name="headers",
                display_name="Headers",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder='{"Authorization": "Bearer {{secrets.api_key}}"}',
            ),
            InputSpec(
                name="body",
                display_name="Request Body",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder='{"key": "value"}',
            ),
            InputSpec(
                name="authType",
                display_name="Authentication",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="none",
                options=[
                    {"label": "None", "value": "none"},
                    {"label": "Bearer Token", "value": "bearer"},
                    {"label": "Basic Auth", "value": "basic"},
                    {"label": "API Key Header", "value": "api_key"},
                ],
            ),
            InputSpec(
                name="authValue",
                display_name="Auth Value",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="Token or credentials...",
            ),
            InputSpec(
                name="timeout",
                display_name="Timeout (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=30,
                validation={"min": 1, "max": 300},
            ),
            InputSpec(
                name="followRedirects",
                display_name="Follow Redirects",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
        ],
        outputs=[
            OutputSpec(name="status", display_name="Status Code", data_type="number"),
            OutputSpec(name="headers", display_name="Response Headers", data_type="json"),
            OutputSpec(name="body", display_name="Response Body", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.io_executors.http_request_executor.HTTPRequestExecutor",
        middleware=MiddlewareConfig(
            retry_eligible=True,
            rate_limit_eligible=True,
            cache_eligible=True,
            default_timeout_seconds=30,
        ),
    )
)

# 24. Database Query (Section 5)
self.register_node_type(
    NodeTypeSpec(
        type="database_query",
        display_name="Database Query",
        description="Execute parameterized SQL queries against PostgreSQL or MySQL",
        icon="database",
        color="green",
        category="data",
        inputs=[
            InputSpec(
                name="connectionType",
                display_name="Database Type",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="postgresql",
                options=[
                    {"label": "PostgreSQL", "value": "postgresql"},
                    {"label": "MySQL", "value": "mysql"},
                ],
            ),
            InputSpec(
                name="query",
                display_name="SQL Query",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder="SELECT * FROM users WHERE id = $1",
            ),
            InputSpec(
                name="parameters",
                display_name="Query Parameters",
                data_type="array",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder='[1, "active"]',
            ),
            InputSpec(
                name="transactionMode",
                display_name="Transaction Mode",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="autocommit",
                options=[
                    {"label": "Autocommit", "value": "autocommit"},
                    {"label": "Read Only", "value": "read_only"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="rows", display_name="Result Rows", data_type="array"),
            OutputSpec(name="rowCount", display_name="Row Count", data_type="number"),
            OutputSpec(name="columns", display_name="Column Names", data_type="array"),
        ],
        executor="app.orchestrator.node_executors.io_executors.database_query_executor.DatabaseQueryExecutor",
        middleware=MiddlewareConfig(
            retry_eligible=True,
            cache_eligible=True,
            default_timeout_seconds=30,
        ),
    )
)

# 25. Storage Action (Section 5)
self.register_node_type(
    NodeTypeSpec(
        type="storage_action",
        display_name="Storage Action",
        description="Upload, download, list, or delete files in S3/R2 storage",
        icon="hard-drive",
        color="blue",
        category="data",
        inputs=[
            InputSpec(
                name="operation",
                display_name="Operation",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="upload",
                options=[
                    {"label": "Upload", "value": "upload"},
                    {"label": "Download", "value": "download"},
                    {"label": "List", "value": "list"},
                    {"label": "Delete", "value": "delete"},
                ],
            ),
            InputSpec(
                name="bucket",
                display_name="Bucket",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                placeholder="my-bucket",
            ),
            InputSpec(
                name="key",
                display_name="File Key / Path",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="uploads/report.pdf",
            ),
            InputSpec(
                name="content",
                display_name="File Content",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data to upload (for upload operation)...",
            ),
            InputSpec(
                name="contentType",
                display_name="Content Type",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default="application/octet-stream",
                placeholder="application/pdf",
            ),
        ],
        outputs=[
            OutputSpec(name="url", display_name="File URL", data_type="text"),
            OutputSpec(name="signedUrl", display_name="Signed URL", data_type="text"),
            OutputSpec(name="metadata", display_name="File Metadata", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.io_executors.storage_executor.StorageExecutor",
        middleware=MiddlewareConfig(
            retry_eligible=True,
            default_timeout_seconds=60,
        ),
    )
)

# 26. Notification / Email/SMS/Chat (Section 5)
self.register_node_type(
    NodeTypeSpec(
        type="notification",
        display_name="Email / SMS / Chat",
        description="Send notifications via email, Slack, or webhook",
        icon="mail",
        color="cyan",
        category="communication",
        inputs=[
            InputSpec(
                name="channel",
                display_name="Channel",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="email",
                options=[
                    {"label": "Email (SMTP)", "value": "email"},
                    {"label": "Slack", "value": "slack"},
                    {"label": "Webhook", "value": "webhook"},
                ],
            ),
            InputSpec(
                name="recipients",
                display_name="Recipients",
                data_type="array",
                ui_type="text",
                required=True,
                accepts_connection=True,
                placeholder="user@example.com, #slack-channel",
            ),
            InputSpec(
                name="subject",
                display_name="Subject",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="Workflow notification: {{node1.status}}",
            ),
            InputSpec(
                name="body",
                display_name="Message Body",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder="Your workflow has completed...",
            ),
            InputSpec(
                name="template",
                display_name="Template",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                options_endpoint="/api/v1/workflow/notification-templates",
            ),
        ],
        outputs=[
            OutputSpec(name="messageId", display_name="Message ID", data_type="text"),
            OutputSpec(name="status", display_name="Send Status", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.io_executors.notification_executor.NotificationExecutor",
        middleware=MiddlewareConfig(
            retry_eligible=True,
            rate_limit_eligible=True,
            default_timeout_seconds=30,
        ),
    )
)
```

#### Data Shaping Nodes (Section 6)

| # | node_type | display_name | category | color | icon | Description |
|---|-----------|-------------|----------|-------|------|-------------|
| 27 | `map_fields` | Map Fields | data | orange | arrow-right-left | Rename and remap fields |
| 28 | `filter` | Filter | data | orange | filter | Filter items by condition |
| 29 | `if` | If | flow_control | yellow | git-branch | Boolean branch (true/false) |
| 30 | `split_items` | Split Items | data | orange | scissors | Split array into individual items |
| 31 | `batch` | Batch | data | orange | layers | Group items into batches of N |
| 32 | `json_transform` | JSON/CSV Transform | data | orange | file-json | Convert between JSON, CSV, XML |
| 33 | `schema_validator` | Schema Validator | data | orange | shield-check | Validate data against JSON Schema |

**Registrations:**

```python
# 27. Map Fields (Section 6)
self.register_node_type(
    NodeTypeSpec(
        type="map_fields",
        display_name="Map / Rename Fields",
        description="Rename, remap, and restructure data fields",
        icon="arrow-right-left",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Data to transform...",
            ),
            InputSpec(
                name="mappings",
                display_name="Field Mappings",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                default=[{"from": "old_name", "to": "new_name"}],
                placeholder='[{"from":"old_name","to":"new_name"}]',
            ),
            InputSpec(
                name="unmappedHandling",
                display_name="Unmapped Fields",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="keep",
                options=[
                    {"label": "Keep", "value": "keep"},
                    {"label": "Drop", "value": "drop"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="data", display_name="Mapped Data", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.data_executors.map_executor.MapExecutor",
    )
)

# 28. Filter (Section 6)
self.register_node_type(
    NodeTypeSpec(
        type="filter",
        display_name="Filter",
        description="Filter items based on conditions, splitting into matching and rejected sets",
        icon="filter",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Array of items to filter...",
            ),
            InputSpec(
                name="conditions",
                display_name="Filter Conditions",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                default=[{"field": "status", "operator": "==", "value": "active"}],
                placeholder='[{"field":"status","operator":"==","value":"active"}]',
            ),
            InputSpec(
                name="logic",
                display_name="Condition Logic",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="AND",
                options=[
                    {"label": "All conditions (AND)", "value": "AND"},
                    {"label": "Any condition (OR)", "value": "OR"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="matching", display_name="Matching Items", data_type="array"),
            OutputSpec(name="rejected", display_name="Rejected Items", data_type="array"),
        ],
        executor="app.orchestrator.node_executors.data_executors.filter_executor.FilterExecutor",
    )
)

# 29. If (Section 6 -- replaces/extends conditional)
self.register_node_type(
    NodeTypeSpec(
        type="if",
        display_name="If / Then / Else",
        description="Branch execution based on a boolean condition",
        icon="git-branch",
        color="yellow",
        category="flow_control",
        inputs=[
            InputSpec(
                name="value",
                display_name="Value to Evaluate",
                data_type="any",
                ui_type="text",
                required=True,
                accepts_connection=True,
                placeholder="{{node1.result}}",
            ),
            InputSpec(
                name="operator",
                display_name="Operator",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="==",
                options=[
                    {"label": "Equals (==)", "value": "=="},
                    {"label": "Not Equals (!=)", "value": "!="},
                    {"label": "Greater Than (>)", "value": ">"},
                    {"label": "Less Than (<)", "value": "<"},
                    {"label": "Contains", "value": "contains"},
                    {"label": "Starts With", "value": "startsWith"},
                    {"label": "Ends With", "value": "endsWith"},
                    {"label": "Matches Regex", "value": "matches"},
                    {"label": "Is Empty", "value": "isEmpty"},
                    {"label": "Is Not Empty", "value": "isNotEmpty"},
                ],
            ),
            InputSpec(
                name="compareValue",
                display_name="Compare To",
                data_type="any",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="Value to compare against...",
            ),
        ],
        outputs=[
            OutputSpec(name="true", display_name="True Branch", data_type="any"),
            OutputSpec(name="false", display_name="False Branch", data_type="any"),
        ],
        executor="app.orchestrator.node_executors.data_executors.if_executor.IfExecutor",
    )
)

# 30. Split Items (Section 6)
self.register_node_type(
    NodeTypeSpec(
        type="split_items",
        display_name="Split Items",
        description="Split an array into individual items for parallel processing",
        icon="scissors",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Input Array",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Array to split into individual items...",
            ),
            InputSpec(
                name="fieldName",
                display_name="Array Field Name",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="items (optional, for nested arrays)",
            ),
        ],
        outputs=[
            OutputSpec(name="item", display_name="Current Item", data_type="any"),
            OutputSpec(name="index", display_name="Item Index", data_type="number"),
            OutputSpec(name="total", display_name="Total Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.data_executors.split_executor.SplitExecutor",
    )
)

# 31. Batch (Section 6)
self.register_node_type(
    NodeTypeSpec(
        type="batch",
        display_name="Batch / Chunk",
        description="Group items into batches of N for chunked processing",
        icon="layers",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Input Array",
                data_type="array",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Array to batch...",
            ),
            InputSpec(
                name="batchSize",
                display_name="Batch Size",
                data_type="number",
                ui_type="number",
                required=True,
                accepts_connection=False,
                default=10,
                validation={"min": 1, "max": 1000},
            ),
            InputSpec(
                name="delayBetweenBatches",
                display_name="Delay Between Batches (ms)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=0,
                validation={"min": 0, "max": 60000},
            ),
        ],
        outputs=[
            OutputSpec(name="batch", display_name="Current Batch", data_type="array"),
            OutputSpec(name="batchIndex", display_name="Batch Index", data_type="number"),
            OutputSpec(name="totalBatches", display_name="Total Batches", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.data_executors.batch_executor.BatchExecutor",
    )
)

# 32. JSON/CSV Transform (Section 6)
self.register_node_type(
    NodeTypeSpec(
        type="json_transform",
        display_name="JSON / CSV Transform",
        description="Convert data between JSON, CSV, and XML formats",
        icon="file-json",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Data to transform...",
            ),
            InputSpec(
                name="sourceFormat",
                display_name="Source Format",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="json",
                options=[
                    {"label": "JSON", "value": "json"},
                    {"label": "CSV", "value": "csv"},
                    {"label": "XML", "value": "xml"},
                ],
            ),
            InputSpec(
                name="targetFormat",
                display_name="Target Format",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="csv",
                options=[
                    {"label": "JSON", "value": "json"},
                    {"label": "CSV", "value": "csv"},
                    {"label": "XML", "value": "xml"},
                ],
            ),
            InputSpec(
                name="delimiter",
                display_name="CSV Delimiter",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                default=",",
            ),
        ],
        outputs=[
            OutputSpec(name="data", display_name="Transformed Data", data_type="any"),
            OutputSpec(name="format", display_name="Output Format", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.data_executors.transform_executor.TransformExecutor",
    )
)

# 33. Schema Validator (Section 6)
self.register_node_type(
    NodeTypeSpec(
        type="schema_validator",
        display_name="Schema Validator",
        description="Validate data against a JSON Schema and split into valid/invalid",
        icon="shield-check",
        color="orange",
        category="data",
        inputs=[
            InputSpec(
                name="data",
                display_name="Data to Validate",
                data_type="any",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Data to validate...",
            ),
            InputSpec(
                name="schema",
                display_name="JSON Schema",
                data_type="json",
                ui_type="json_editor",
                required=True,
                accepts_connection=False,
                placeholder='{"type":"object","required":["name"],"properties":{"name":{"type":"string"}}}',
            ),
            InputSpec(
                name="validationMode",
                display_name="Validation Mode",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="strict",
                options=[
                    {"label": "Strict", "value": "strict"},
                    {"label": "Coerce Types", "value": "coerce"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="valid_items", display_name="Valid Items", data_type="array"),
            OutputSpec(name="invalid_items", display_name="Invalid Items", data_type="array"),
            OutputSpec(name="errors", display_name="Validation Errors", data_type="array"),
        ],
        executor="app.orchestrator.node_executors.data_executors.schema_validator_executor.SchemaValidatorExecutor",
    )
)
```

#### Reliability Nodes (Section 7)

| # | node_type | display_name | category | color | icon | Description |
|---|-----------|-------------|----------|-------|------|-------------|
| 34 | `retry` | Retry | reliability | orange | refresh-cw | Retry failed node execution with backoff |
| 35 | `rate_limiter` | Rate Limiter | reliability | orange | gauge | Token bucket rate limiting |
| 36 | `circuit_breaker` | Circuit Breaker | reliability | orange | shield-off | Circuit breaker pattern |
| 37 | `idempotency` | Idempotency Check | reliability | orange | fingerprint | Deduplicate by input hash |
| 38 | `dlq` | Dead Letter Queue | reliability | orange | archive-x | Store failed items for later reprocessing |
| 39 | `checkpoint` | Checkpoint | reliability | orange | save | Create named checkpoint in workflow |

**Note:** Retry (#34) and Rate Limiter (#35) are implemented as **execution middleware** (not standalone graph nodes) per the architecture plan. They still appear in the registry for the visual editor so users can configure them as wrapper nodes, but their executors delegate to the middleware system in `node_adapter.py`.

**Registrations:**

```python
# 34. Retry with Backoff (Section 7 -- middleware node)
self.register_node_type(
    NodeTypeSpec(
        type="retry",
        display_name="Retry with Backoff",
        description="Wrap a node with automatic retry on failure with exponential backoff",
        icon="refresh-cw",
        color="orange",
        category="reliability",
        inputs=[
            InputSpec(
                name="maxRetries",
                display_name="Max Retries",
                data_type="number",
                ui_type="number",
                required=True,
                accepts_connection=False,
                default=3,
                validation={"min": 1, "max": 10},
            ),
            InputSpec(
                name="baseDelay",
                display_name="Base Delay (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=1,
                validation={"min": 0.1, "max": 60},
            ),
            InputSpec(
                name="maxDelay",
                display_name="Max Delay (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=60,
                validation={"min": 1, "max": 300},
            ),
            InputSpec(
                name="backoffFactor",
                display_name="Backoff Factor",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=2.0,
                validation={"min": 1, "max": 5},
            ),
            InputSpec(
                name="jitter",
                display_name="Add Jitter",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=True,
            ),
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data to pass through...",
            ),
        ],
        outputs=[
            OutputSpec(name="result", display_name="Result", data_type="any"),
            OutputSpec(name="attempts", display_name="Attempt Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.reliability_executors.retry_executor.RetryExecutor",
    )
)

# 35. Rate Limiter (Section 7 -- middleware node)
self.register_node_type(
    NodeTypeSpec(
        type="rate_limiter",
        display_name="Rate Limiter",
        description="Throttle execution rate using token bucket algorithm",
        icon="gauge",
        color="orange",
        category="reliability",
        inputs=[
            InputSpec(
                name="rate",
                display_name="Requests per Second",
                data_type="number",
                ui_type="number",
                required=True,
                accepts_connection=False,
                default=5,
                validation={"min": 0.1, "max": 1000},
            ),
            InputSpec(
                name="burstCapacity",
                display_name="Burst Capacity",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=10,
                validation={"min": 1, "max": 100},
            ),
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data to pass through...",
            ),
        ],
        outputs=[
            OutputSpec(name="result", display_name="Result", data_type="any"),
            OutputSpec(name="waitTime", display_name="Wait Time (ms)", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.reliability_executors.rate_limiter_executor.RateLimiterExecutor",
    )
)

# 36. Circuit Breaker (Section 7)
self.register_node_type(
    NodeTypeSpec(
        type="circuit_breaker",
        display_name="Circuit Breaker",
        description="Protect downstream services with circuit breaker pattern (closed/open/half-open)",
        icon="shield-off",
        color="orange",
        category="reliability",
        inputs=[
            InputSpec(
                name="failureThreshold",
                display_name="Failure Threshold",
                data_type="number",
                ui_type="number",
                required=True,
                accepts_connection=False,
                default=5,
                validation={"min": 1, "max": 100},
            ),
            InputSpec(
                name="recoveryTimeout",
                display_name="Recovery Timeout (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=60,
                validation={"min": 5, "max": 3600},
            ),
            InputSpec(
                name="timeoutSeconds",
                display_name="Request Timeout (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=30,
                validation={"min": 1, "max": 300},
            ),
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data to pass through...",
            ),
        ],
        outputs=[
            OutputSpec(name="result", display_name="Result", data_type="any"),
            OutputSpec(name="circuitState", display_name="Circuit State", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.reliability_executors.circuit_breaker_executor.CircuitBreakerExecutor",
    )
)

# 37. Idempotency Check (Section 7)
self.register_node_type(
    NodeTypeSpec(
        type="idempotency",
        display_name="Idempotency Check",
        description="Deduplicate requests by hashing input fields and caching results",
        icon="fingerprint",
        color="orange",
        category="reliability",
        inputs=[
            InputSpec(
                name="keyExpression",
                display_name="Dedup Key Expression",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                placeholder="{{node1.userId}}-{{node1.action}}",
            ),
            InputSpec(
                name="ttl",
                display_name="Cache TTL (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=3600,
                validation={"min": 60, "max": 604800},
            ),
            InputSpec(
                name="data",
                display_name="Input Data",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data to check for duplicates...",
            ),
        ],
        outputs=[
            OutputSpec(name="result", display_name="Result", data_type="any"),
            OutputSpec(name="isDuplicate", display_name="Is Duplicate", data_type="boolean"),
            OutputSpec(name="cachedResult", display_name="Cached Result", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.reliability_executors.idempotency_executor.IdempotencyExecutor",
    )
)

# 38. Dead Letter Queue (Section 7)
self.register_node_type(
    NodeTypeSpec(
        type="dlq",
        display_name="Dead Letter Queue",
        description="Store failed items for later inspection and reprocessing",
        icon="archive-x",
        color="orange",
        category="reliability",
        inputs=[
            InputSpec(
                name="queueName",
                display_name="Queue Name",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                default="default",
                placeholder="dlq-name",
            ),
            InputSpec(
                name="maxRetriesBeforeDLQ",
                display_name="Max Retries Before DLQ",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=3,
                validation={"min": 0, "max": 10},
            ),
            InputSpec(
                name="data",
                display_name="Failed Data",
                data_type="any",
                ui_type="json_editor",
                required=True,
                accepts_connection=True,
                placeholder="Data that failed processing...",
            ),
            InputSpec(
                name="error",
                display_name="Error Details",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Error from failed node...",
            ),
        ],
        outputs=[
            OutputSpec(name="dlqId", display_name="DLQ Entry ID", data_type="text"),
            OutputSpec(name="status", display_name="DLQ Status", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.reliability_executors.dlq_executor.DLQExecutor",
    )
)

# 39. Checkpoint (Section 7)
self.register_node_type(
    NodeTypeSpec(
        type="checkpoint",
        display_name="Checkpoint",
        description="Create a named checkpoint for resuming long-running workflows",
        icon="save",
        color="orange",
        category="reliability",
        inputs=[
            InputSpec(
                name="label",
                display_name="Checkpoint Label",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                placeholder="after-data-validation",
            ),
            InputSpec(
                name="data",
                display_name="Data to Checkpoint",
                data_type="any",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="State to preserve...",
            ),
        ],
        outputs=[
            OutputSpec(name="checkpointId", display_name="Checkpoint ID", data_type="text"),
            OutputSpec(name="timestamp", display_name="Checkpoint Time", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.reliability_executors.checkpoint_executor.CheckpointExecutor",
    )
)
```

#### Security & Governance Nodes (Section 8)

| # | node_type | display_name | category | color | icon | Description |
|---|-----------|-------------|----------|-------|------|-------------|
| 40 | `secrets_vault` | Secrets Vault | security | red | key-round | Retrieve encrypted secrets |
| 41 | `rbac_check` | RBAC Check | security | red | shield | Check user permission/role |
| 42 | `audit_log` | Audit Log | security | red | scroll-text | Write structured audit event |
| 43 | `structured_log` | Structured Log | security | red | file-text | Write structured log entry |
| 44 | `metrics` | Metrics & Alert | security | red | activity | Emit metric and optional alert |
| 45 | `run_history` | Run History | security | red | history | Query workflow execution history |

**Registrations:**

```python
# 40. Secrets Vault (Section 8)
self.register_node_type(
    NodeTypeSpec(
        type="secrets_vault",
        display_name="Secrets Vault",
        description="Retrieve encrypted secrets (API keys, credentials) from the vault",
        icon="key-round",
        color="red",
        category="security",
        inputs=[
            InputSpec(
                name="secretName",
                display_name="Secret Name",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                placeholder="my-api-key",
            ),
            InputSpec(
                name="vaultBackend",
                display_name="Vault Backend",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="internal",
                options=[
                    {"label": "Internal (AES-256-GCM)", "value": "internal"},
                    {"label": "HashiCorp Vault", "value": "hashicorp"},
                    {"label": "AWS Secrets Manager", "value": "aws"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="value", display_name="Secret Value", data_type="secret"),
        ],
        executor="app.orchestrator.node_executors.security_executors.secrets_executor.SecretsExecutor",
    )
)

# 41. RBAC Check (Section 8)
self.register_node_type(
    NodeTypeSpec(
        type="rbac_check",
        display_name="Permission & RBAC Check",
        description="Check if user has required role/permission for an action",
        icon="shield",
        color="red",
        category="security",
        inputs=[
            InputSpec(
                name="requiredRole",
                display_name="Required Role",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                options=[
                    {"label": "Viewer", "value": "viewer"},
                    {"label": "Editor", "value": "editor"},
                    {"label": "Admin", "value": "admin"},
                    {"label": "Owner", "value": "owner"},
                ],
            ),
            InputSpec(
                name="resourceType",
                display_name="Resource Type",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=False,
                placeholder="workflow, document, settings...",
            ),
            InputSpec(
                name="resourceId",
                display_name="Resource ID",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="ID of the resource to check...",
            ),
        ],
        outputs=[
            OutputSpec(name="allowed", display_name="Allowed", data_type="boolean"),
            OutputSpec(name="userRole", display_name="User Role", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.security_executors.rbac_executor.RBACExecutor",
    )
)

# 42. Audit Log (Section 8)
self.register_node_type(
    NodeTypeSpec(
        type="audit_log",
        display_name="Audit Log",
        description="Write a structured audit event with automatic sensitive field redaction",
        icon="scroll-text",
        color="red",
        category="security",
        inputs=[
            InputSpec(
                name="eventType",
                display_name="Event Type",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                placeholder="data.export, user.permission_change",
            ),
            InputSpec(
                name="fieldsToLog",
                display_name="Fields to Log",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder='{"userId": "{{ctx.userId}}", "action": "export"}',
            ),
            InputSpec(
                name="includeInput",
                display_name="Include Node Input",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=False,
            ),
            InputSpec(
                name="includeOutput",
                display_name="Include Node Output",
                data_type="boolean",
                ui_type="toggle",
                required=False,
                accepts_connection=False,
                default=False,
            ),
        ],
        outputs=[
            OutputSpec(name="auditId", display_name="Audit Entry ID", data_type="text"),
            OutputSpec(name="timestamp", display_name="Timestamp", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.security_executors.audit_log_executor.AuditLogExecutor",
    )
)

# 43. Structured Logging (Section 8)
self.register_node_type(
    NodeTypeSpec(
        type="structured_log",
        display_name="Structured Log",
        description="Write a structured log entry to JSONL audit log files",
        icon="file-text",
        color="red",
        category="security",
        inputs=[
            InputSpec(
                name="level",
                display_name="Log Level",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="info",
                options=[
                    {"label": "Info", "value": "info"},
                    {"label": "Warning", "value": "warn"},
                    {"label": "Error", "value": "error"},
                    {"label": "Debug", "value": "debug"},
                ],
            ),
            InputSpec(
                name="messageTemplate",
                display_name="Message Template",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder="Processed {{node1.count}} items in {{node2.duration}}ms",
            ),
            InputSpec(
                name="fields",
                display_name="Additional Fields",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder='{"component": "data-pipeline", "version": "1.0"}',
            ),
        ],
        outputs=[
            OutputSpec(name="logged", display_name="Log Written", data_type="boolean"),
        ],
        executor="app.orchestrator.node_executors.security_executors.structured_log_executor.StructuredLogExecutor",
    )
)

# 44. Metrics & Alerting (Section 8)
self.register_node_type(
    NodeTypeSpec(
        type="metrics",
        display_name="Metrics & Alert",
        description="Emit a metric value and optionally trigger an alert when threshold exceeded",
        icon="activity",
        color="red",
        category="security",
        inputs=[
            InputSpec(
                name="metricName",
                display_name="Metric Name",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=False,
                placeholder="workflow.processing_time_ms",
            ),
            InputSpec(
                name="value",
                display_name="Metric Value",
                data_type="number",
                ui_type="number",
                required=True,
                accepts_connection=True,
            ),
            InputSpec(
                name="alertThreshold",
                display_name="Alert Threshold",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                placeholder="Trigger alert when value exceeds this...",
            ),
            InputSpec(
                name="alertChannel",
                display_name="Alert Channel",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                options=[
                    {"label": "Email", "value": "email"},
                    {"label": "Slack", "value": "slack"},
                    {"label": "Webhook", "value": "webhook"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="recorded", display_name="Metric Recorded", data_type="boolean"),
            OutputSpec(name="alertTriggered", display_name="Alert Triggered", data_type="boolean"),
        ],
        executor="app.orchestrator.node_executors.security_executors.metrics_executor.MetricsExecutor",
    )
)

# 45. Run History (Section 8)
self.register_node_type(
    NodeTypeSpec(
        type="run_history",
        display_name="Run History & Replay",
        description="Query workflow execution history for monitoring and replay",
        icon="history",
        color="red",
        category="security",
        inputs=[
            InputSpec(
                name="workflowId",
                display_name="Workflow ID",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="Filter by workflow ID (empty = current workflow)",
            ),
            InputSpec(
                name="limit",
                display_name="Limit",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=10,
                validation={"min": 1, "max": 100},
            ),
            InputSpec(
                name="statusFilter",
                display_name="Status Filter",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                options=[
                    {"label": "All", "value": "all"},
                    {"label": "Completed", "value": "completed"},
                    {"label": "Failed", "value": "failed"},
                    {"label": "Running", "value": "running"},
                ],
            ),
        ],
        outputs=[
            OutputSpec(name="executions", display_name="Execution List", data_type="array"),
            OutputSpec(name="totalCount", display_name="Total Count", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.security_executors.run_history_executor.RunHistoryExecutor",
    )
)
```

#### HITL & Code Nodes (Section 9)

| # | node_type | display_name | category | color | icon | Description |
|---|-----------|-------------|----------|-------|------|-------------|
| 46 | `approval` | Approval (HITL) | human | orange | user-check | Pause for human approval using interrupt() |
| 47 | `code_step` | Code Step | code | purple | terminal | Execute sandboxed Python/JS code |

**Note:** The existing `approval_gate` (node #5) is preserved for backward compatibility. The new `approval` node uses the LangGraph `interrupt()` pattern from Section 3. The existing `code_runner` (node #13) is preserved and re-categorized; the new `code_step` uses subprocess sandboxing from Section 9.

**Registrations:**

```python
# 46. Approval / HITL (Section 9 -- uses LangGraph interrupt())
self.register_node_type(
    NodeTypeSpec(
        type="approval",
        display_name="Approval (HITL)",
        description="Pause workflow for human approval, input, or decision using LangGraph interrupt",
        icon="user-check",
        color="orange",
        category="human",
        inputs=[
            InputSpec(
                name="message",
                display_name="Approval Message",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder="Please review the following data and approve...",
            ),
            InputSpec(
                name="approvalType",
                display_name="Approval Type",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="approve_reject",
                options=[
                    {"label": "Approve / Reject", "value": "approve_reject"},
                    {"label": "Free-form Input", "value": "input"},
                    {"label": "Multiple Choice", "value": "decision"},
                ],
            ),
            InputSpec(
                name="options",
                display_name="Decision Options",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=False,
                placeholder='["Option A", "Option B", "Option C"]',
            ),
            InputSpec(
                name="timeoutMinutes",
                display_name="Timeout (minutes)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=1440,
                validation={"min": 1, "max": 10080},
            ),
            InputSpec(
                name="requiredApprovers",
                display_name="Required Approvers",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=1,
                validation={"min": 1, "max": 10},
            ),
            InputSpec(
                name="notificationChannel",
                display_name="Notification Channel",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                options=[
                    {"label": "Email", "value": "email"},
                    {"label": "Slack", "value": "slack"},
                    {"label": "In-App", "value": "in_app"},
                ],
            ),
            InputSpec(
                name="data",
                display_name="Data to Review",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder="Data for reviewer to inspect...",
            ),
        ],
        outputs=[
            OutputSpec(name="approved", display_name="Approved", data_type="boolean"),
            OutputSpec(name="response", display_name="Approver Response", data_type="json"),
            OutputSpec(name="approver", display_name="Approver ID", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.security_executors.approval_hitl_executor.ApprovalHITLExecutor",
    )
)

# 47. Code Step (Section 9 -- sandboxed subprocess execution)
self.register_node_type(
    NodeTypeSpec(
        type="code_step",
        display_name="Code Step (Sandboxed)",
        description="Execute Python or JavaScript code in an isolated sandbox with resource limits",
        icon="terminal",
        color="purple",
        category="code",
        inputs=[
            InputSpec(
                name="language",
                display_name="Language",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="python",
                options=[
                    {"label": "Python", "value": "python"},
                    {"label": "JavaScript", "value": "javascript"},
                ],
            ),
            InputSpec(
                name="code",
                display_name="Code",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=False,
                placeholder="# Inputs available as 'inputs' dict\nresult = inputs['value'] * 2\nreturn result",
            ),
            InputSpec(
                name="inputs",
                display_name="Input Data",
                data_type="json",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder='{"value": 42}',
            ),
            InputSpec(
                name="timeout",
                display_name="Timeout (seconds)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=30,
                validation={"min": 1, "max": 30},
            ),
            InputSpec(
                name="memoryLimitMB",
                display_name="Memory Limit (MB)",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=128,
                validation={"min": 16, "max": 256},
            ),
        ],
        outputs=[
            OutputSpec(name="result", display_name="Return Value", data_type="any"),
            OutputSpec(name="stdout", display_name="Standard Output", data_type="text"),
            OutputSpec(name="stderr", display_name="Standard Error", data_type="text"),
        ],
        executor="app.orchestrator.node_executors.security_executors.code_step_executor.CodeStepExecutor",
        middleware=MiddlewareConfig(
            default_timeout_seconds=30,
        ),
    )
)
```

### Step 5: Re-categorize Existing Nodes

Two existing nodes need category changes:

1. **`code_runner`** -- move from `data` to `code` category, update color from `red` to `purple`
2. **`webhook_response`** -- move from `outputs` to `communication` category, update color from `purple` to `cyan`

Since the registry uses `register_node_type()` which raises `ValueError` on duplicate, the approach is to modify the existing registrations in `_register_core_nodes()` rather than re-register. Update the two entries inline:

```python
# code_runner: change category="data" -> category="code", color="red" -> color="purple"
# webhook_response: change category="outputs" -> category="communication", color="purple" -> color="cyan"
```

### Step 6: Add Middleware Flags to Existing Nodes

Update existing registrations to include the `middleware` field:

| Node Type | retry_eligible | rate_limit_eligible | cache_eligible | default_timeout |
|-----------|---------------|--------------------|----|------|
| `llm_call` | True | True | True | 60 |
| `rag_query` | True | False | True | 30 |
| `generate_image` | True | True | False | 120 |
| `skill` | True | False | True | 60 |
| `http_request` | True | True | True | 30 |
| `database_query` | True | False | True | 30 |
| `storage_action` | True | False | False | 60 |
| `notification` | True | True | False | 30 |
| `code_runner` | False | False | False | 30 |
| `code_step` | False | False | False | 30 |
| All others | False | False | False | 60 |

---

## Middleware Flag Summary

The `MiddlewareConfig` on each `NodeTypeSpec` is consumed by the `NodeAdapter` (from Section 1) and the caching middleware (from Section 10). Here is how each flag is used:

| Flag | Consumed By | Behavior |
|------|-------------|----------|
| `retry_eligible` | `node_adapter.py` retry middleware (Section 7) | If `True` AND the node instance config includes a `retry` block, the adapter wraps execution with exponential backoff retry |
| `rate_limit_eligible` | `node_adapter.py` rate limiter middleware (Section 7) | If `True` AND the node instance config includes a `rateLimit` block, the adapter wraps execution with token-bucket rate limiting |
| `cache_eligible` | `cache_middleware.py` (Section 10) | If `True` AND the node instance config does not set `cache_enabled: false`, the adapter checks the cache before execution |
| `default_timeout_seconds` | `node_adapter.py` | Used as the `asyncio.wait_for` timeout if the node config does not specify a custom timeout |

---

## Migration Plan for Existing 21 Nodes

The existing 21 nodes are already registered in `_register_core_nodes()`. The migration is purely additive -- no existing registrations are removed or have their `type` field changed. Changes are:

| Change Type | Affected Nodes | Risk |
|-------------|---------------|------|
| Add `middleware` field | `llm_call`, `rag_query`, `generate_image`, `skill`, `code_runner` | **Low** -- new optional field with default values |
| Change `category` | `code_runner` (data -> code), `webhook_response` (outputs -> communication) | **Low** -- frontend re-fetches registry; palette position changes |
| Change `color` | `code_runner` (red -> purple), `webhook_response` (purple -> cyan) | **Low** -- visual only |
| No changes | 17 remaining nodes | None |

**Backward compatibility:**
- The `middleware` field has a default value (`MiddlewareConfig()`) so all existing nodes that do not specify it will have all flags as `False` -- no behavioral change
- The `GET /api/v1/workflows/node-types` endpoint returns the `middleware` field as part of the spec, but the frontend ignores unknown fields (TypeScript type just picks what it needs)
- Category changes only affect the node palette position in the editor -- existing saved workflows reference nodes by `type`, not by `category`

---

## Tests

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_registry.py`

| Test Name | Type | What it verifies |
|-----------|------|------------------|
| `test_registry_singleton` | unit | `NodeRegistry.get_instance()` returns the same instance |
| `test_all_phase1_nodes_registered` | unit | Registry contains all ~33 Phase 1 node types by `type` string |
| `test_no_duplicate_node_types` | unit | No two nodes share the same `type` identifier |
| `test_all_nodes_have_executor_path` | unit | Every registered node has a non-empty `executor` string |
| `test_executor_paths_are_valid_module_syntax` | unit | Every `executor` string matches `module.path.ClassName` pattern |
| `test_all_nodes_have_icon` | unit | Every node has a non-empty `icon` string |
| `test_all_nodes_have_description` | unit | Every node has a non-empty `description` string |
| `test_categories_are_valid` | unit | Every node's `category` is in the allowed set |
| `test_new_categories_exist` | unit | `reliability`, `security`, `communication`, `code` categories each have at least one node |
| `test_input_specs_valid` | unit | Every `InputSpec` has valid `data_type` and `ui_type` values |
| `test_output_specs_valid` | unit | Every `OutputSpec` has a valid `data_type` |
| `test_port_type_compatibility_includes_new_types` | unit | `file` and `secret` data types are in `PORT_TYPE_COMPATIBILITY` |
| `test_middleware_config_defaults` | unit | Nodes without explicit middleware have all flags as `False` |
| `test_middleware_flags_for_llm_call` | unit | `llm_call` has `retry_eligible=True`, `rate_limit_eligible=True`, `cache_eligible=True` |
| `test_code_runner_recategorized` | unit | `code_runner` has `category="code"` and `color="purple"` |
| `test_webhook_response_recategorized` | unit | `webhook_response` has `category="communication"` and `color="cyan"` |
| `test_secrets_vault_output_is_secret_type` | unit | `secrets_vault` output port uses `data_type="secret"` |
| `test_get_node_types_by_category` | unit | `get_all_node_types()` filtered by category returns expected counts |

```python
"""Tests for the workflow node registry expansion."""

import re
import pytest

from app.orchestrator.node_registry import NodeRegistry, NodeTypeSpec, MiddlewareConfig
from app.orchestrator.data_types import PORT_TYPE_COMPATIBILITY, is_compatible_connection


# Valid values for validation
VALID_CATEGORIES = {
    "ai", "flow_control", "human", "skills", "media",
    "triggers", "inputs", "outputs", "data",
    "reliability", "security", "communication", "code",
}

VALID_DATA_TYPES = set(PORT_TYPE_COMPATIBILITY.keys())

VALID_UI_TYPES = {
    "text", "textarea", "number", "slider", "select",
    "multiselect", "toggle", "json_editor",
}

# All Phase 1 node type identifiers
PHASE1_NODE_TYPES = {
    # Existing (21)
    "llm_call", "rag_query", "conditional", "loop", "approval_gate",
    "generate_image", "skill", "manual_trigger", "form_input",
    "workflow_response", "set_variable", "merge_data", "code_runner",
    "webhook_trigger", "schedule_trigger", "event_trigger",
    "file_upload_trigger", "switch", "wait", "webhook_response",
    "error_trigger",
    # New (12+)
    "queue_trigger",
    "http_request", "database_query", "storage_action", "notification",
    "map_fields", "filter", "if", "split_items", "batch",
    "json_transform", "schema_validator",
    "retry", "rate_limiter", "circuit_breaker", "idempotency", "dlq", "checkpoint",
    "secrets_vault", "rbac_check", "audit_log", "structured_log", "metrics", "run_history",
    "approval", "code_step",
}


@pytest.fixture
def registry() -> NodeRegistry:
    """Get a fresh registry instance."""
    # Reset singleton for test isolation
    NodeRegistry._instance = None
    return NodeRegistry.get_instance()


class TestRegistrySingleton:
    def test_registry_singleton(self):
        """NodeRegistry.get_instance() returns the same instance."""
        NodeRegistry._instance = None
        r1 = NodeRegistry.get_instance()
        r2 = NodeRegistry.get_instance()
        assert r1 is r2


class TestPhase1Completeness:
    def test_all_phase1_nodes_registered(self, registry: NodeRegistry):
        """Registry contains all Phase 1 node types."""
        registered = {spec.type for spec in registry.get_all_node_types()}
        missing = PHASE1_NODE_TYPES - registered
        assert not missing, f"Missing node types: {missing}"

    def test_no_duplicate_node_types(self, registry: NodeRegistry):
        """No two nodes share the same type identifier."""
        types = [spec.type for spec in registry.get_all_node_types()]
        assert len(types) == len(set(types)), f"Duplicates found: {[t for t in types if types.count(t) > 1]}"


class TestNodeSpecValidity:
    def test_all_nodes_have_executor_path(self, registry: NodeRegistry):
        """Every registered node has a non-empty executor string."""
        for spec in registry.get_all_node_types():
            assert spec.executor, f"Node '{spec.type}' has empty executor"

    def test_executor_paths_are_valid_module_syntax(self, registry: NodeRegistry):
        """Every executor string matches module.path.ClassName pattern."""
        pattern = re.compile(r"^[\w]+(?:\.[\w]+)+$")
        for spec in registry.get_all_node_types():
            assert pattern.match(spec.executor), (
                f"Node '{spec.type}' executor '{spec.executor}' is not valid dotted path"
            )

    def test_all_nodes_have_icon(self, registry: NodeRegistry):
        """Every node has a non-empty icon string."""
        for spec in registry.get_all_node_types():
            assert spec.icon, f"Node '{spec.type}' has empty icon"

    def test_all_nodes_have_description(self, registry: NodeRegistry):
        """Every node has a non-empty description string."""
        for spec in registry.get_all_node_types():
            assert spec.description, f"Node '{spec.type}' has empty description"

    def test_categories_are_valid(self, registry: NodeRegistry):
        """Every node's category is in the allowed set."""
        for spec in registry.get_all_node_types():
            assert spec.category in VALID_CATEGORIES, (
                f"Node '{spec.type}' has invalid category '{spec.category}'"
            )

    def test_input_specs_valid(self, registry: NodeRegistry):
        """Every InputSpec has valid data_type and ui_type values."""
        for spec in registry.get_all_node_types():
            for inp in spec.inputs:
                assert inp.data_type in VALID_DATA_TYPES, (
                    f"Node '{spec.type}' input '{inp.name}' has invalid data_type '{inp.data_type}'"
                )
                assert inp.ui_type in VALID_UI_TYPES, (
                    f"Node '{spec.type}' input '{inp.name}' has invalid ui_type '{inp.ui_type}'"
                )

    def test_output_specs_valid(self, registry: NodeRegistry):
        """Every OutputSpec has a valid data_type."""
        for spec in registry.get_all_node_types():
            for out in spec.outputs:
                assert out.data_type in VALID_DATA_TYPES, (
                    f"Node '{spec.type}' output '{out.name}' has invalid data_type '{out.data_type}'"
                )


class TestNewCategories:
    def test_new_categories_exist(self, registry: NodeRegistry):
        """Each new category has at least one node."""
        all_specs = registry.get_all_node_types()
        for cat in ("reliability", "security", "communication", "code"):
            nodes_in_cat = [s for s in all_specs if s.category == cat]
            assert len(nodes_in_cat) > 0, f"Category '{cat}' has no registered nodes"

    def test_reliability_category_count(self, registry: NodeRegistry):
        """Reliability category has 6 nodes."""
        nodes = [s for s in registry.get_all_node_types() if s.category == "reliability"]
        assert len(nodes) == 6

    def test_security_category_count(self, registry: NodeRegistry):
        """Security category has 6 nodes."""
        nodes = [s for s in registry.get_all_node_types() if s.category == "security"]
        assert len(nodes) == 6

    def test_communication_category_has_nodes(self, registry: NodeRegistry):
        """Communication category has at least 1 node."""
        nodes = [s for s in registry.get_all_node_types() if s.category == "communication"]
        assert len(nodes) >= 1


class TestDataTypes:
    def test_port_type_compatibility_includes_new_types(self):
        """file and secret data types are in PORT_TYPE_COMPATIBILITY."""
        assert "file" in PORT_TYPE_COMPATIBILITY
        assert "secret" in PORT_TYPE_COMPATIBILITY

    def test_secret_compatible_with_text(self):
        """Secret type can connect to text inputs."""
        assert is_compatible_connection("secret", "text")

    def test_secret_compatible_with_any(self):
        """Secret type can connect to any inputs."""
        assert is_compatible_connection("secret", "any")

    def test_file_compatible_with_any(self):
        """File type can connect to any inputs."""
        assert is_compatible_connection("file", "any")


class TestMiddlewareConfig:
    def test_middleware_config_defaults(self, registry: NodeRegistry):
        """Nodes without explicit middleware have all flags as False."""
        spec = registry.get_node_type("conditional")
        assert spec is not None
        assert spec.middleware.retry_eligible is False
        assert spec.middleware.rate_limit_eligible is False
        assert spec.middleware.cache_eligible is False

    def test_middleware_flags_for_llm_call(self, registry: NodeRegistry):
        """llm_call has retry, rate_limit, and cache eligible."""
        spec = registry.get_node_type("llm_call")
        assert spec is not None
        assert spec.middleware.retry_eligible is True
        assert spec.middleware.rate_limit_eligible is True
        assert spec.middleware.cache_eligible is True

    def test_middleware_flags_for_http_request(self, registry: NodeRegistry):
        """http_request has retry, rate_limit, and cache eligible."""
        spec = registry.get_node_type("http_request")
        assert spec is not None
        assert spec.middleware.retry_eligible is True
        assert spec.middleware.rate_limit_eligible is True
        assert spec.middleware.cache_eligible is True


class TestRecategorization:
    def test_code_runner_recategorized(self, registry: NodeRegistry):
        """code_runner has category='code' and color='purple'."""
        spec = registry.get_node_type("code_runner")
        assert spec is not None
        assert spec.category == "code"
        assert spec.color == "purple"

    def test_webhook_response_recategorized(self, registry: NodeRegistry):
        """webhook_response has category='communication' and color='cyan'."""
        spec = registry.get_node_type("webhook_response")
        assert spec is not None
        assert spec.category == "communication"
        assert spec.color == "cyan"


class TestSecurityNodes:
    def test_secrets_vault_output_is_secret_type(self, registry: NodeRegistry):
        """secrets_vault output port uses data_type='secret'."""
        spec = registry.get_node_type("secrets_vault")
        assert spec is not None
        assert len(spec.outputs) == 1
        assert spec.outputs[0].data_type == "secret"
```

---

## Dependencies

### On Other Sections

| Dependency | Section | Nature |
|------------|---------|--------|
| LangGraph Runtime Core | Section 1 | `NodeTypeSpec.executor` paths must match what `WorkflowCompiler._instantiate_executor()` can import. The `MiddlewareConfig` is consumed by `NodeAdapter` from Section 1. |
| Trigger Node Executors | Section 4 | Queue trigger executor (`QueueTriggerExecutor`) is created in Section 4. Registry only defines the spec. |
| I/O Node Executors | Section 5 | HTTP Request, Database Query, Storage, Notification executors created in Section 5. |
| Data Shaping Executors | Section 6 | Map, Filter, If, Split, Batch, Transform, Validator executors created in Section 6. |
| Reliability Executors | Section 7 | Retry, Rate Limiter, Circuit Breaker, Idempotency, DLQ, Checkpoint executors created in Section 7. |
| Security Executors | Section 8 | Secrets, RBAC, Audit, Log, Metrics, Run History executors created in Section 8. |
| HITL & Code Executors | Section 9 | Approval HITL and Code Step executors created in Section 9. |
| Caching System | Section 10 | `MiddlewareConfig.cache_eligible` flag consumed by cache middleware from Section 10. |
| Frontend Updates | Section 12 | Frontend TypeScript type `NodeTypeSpec["category"]` union must be updated to include new categories. The `nodeColorMap` in `colorMap.ts` already has `orange`, `red`, `cyan`, `purple` entries. |
| Database Schema | Section 13 | DLQ and audit tables required by DLQ and Audit Log executors. |

### Executor Stub Strategy

Executors that are not yet implemented (covered in Sections 4-9) should have stub files with a `NotImplementedError`:

```python
"""Stub executor -- implementation in Section N."""

from app.orchestrator.node_executors.base import NodeExecutor, NodeExecutionData, ExecutionContext


class StubExecutor(NodeExecutor):
    """Stub: raises NotImplementedError until Section N is implemented."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict:
        raise NotImplementedError(
            f"Executor for '{data.node_type}' is not yet implemented. "
            "See the implementation plan for the relevant section."
        )
```

This allows the registry to be fully populated and the compiler to validate connections, even before executor implementations are complete. The `WorkflowCompiler._instantiate_executor()` method will successfully import the stub, and execution will fail with a clear error message pointing to the pending section.

### Python Packages Required

No new packages are required for this section. The registry is pure Python dataclasses with no external dependencies.