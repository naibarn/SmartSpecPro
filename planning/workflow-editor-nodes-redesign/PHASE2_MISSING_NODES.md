# Workflow Editor Phase 2: Missing Critical Nodes

**Status:** Planning → Implementation
**Branch:** `feature/workflow-nodes-phase2`
**Prerequisite:** Phase 1 (15 sections) complete ✅

## Executive Summary

Phase 1 delivered the registry-driven architecture and 7 core nodes, but analysis revealed **critical gaps**:
- ❌ **No Input/Trigger nodes** — workflows cannot start or receive data
- ❌ **No Output nodes** — workflows cannot return results
- ❌ **No data manipulation** — no Set/Merge/Transform capabilities
- ❌ **No advanced flow control** — no Switch/Wait/Error handling

This phase adds **14 essential nodes** organized into 4 implementation phases.

## Gap Analysis

### Current Coverage (Phase 1)
✅ LLM Call, RAG Query, Conditional, Loop, Approval Gate, Generate Image, Skill (7 nodes)

### Missing Critical Nodes
1. **Triggers** (5 nodes) — Manual, Webhook, Schedule, Event, File Upload
2. **Inputs** (1 node) — Form Input
3. **Outputs** (1 node) — Workflow Response
4. **Data Manipulation** (3 nodes) — Set Variable, Merge Data, Code Runner
5. **Advanced Flow Control** (3 nodes) — Switch, Wait/Delay, Error Trigger
6. **Integration** (1 node) — Webhook Response

**Total: 14 new nodes**

## Implementation Phases

### Phase 2.1: Core Triggers & I/O (HIGHEST PRIORITY)
**Goal:** Enable workflows to start and return results

| Node | Category | Priority | Complexity |
|------|----------|----------|------------|
| Manual Trigger | triggers | 🔴 Critical | Low |
| Form Input | inputs | 🔴 Critical | Medium |
| Workflow Response | outputs | 🔴 Critical | Low |

**Deliverables:**
- 3 new NodeTypeSpec definitions in node_registry.py
- 3 new executors in node_executors/
- Frontend support for trigger rendering
- Test: Create manual workflow → run → get response

### Phase 2.2: Data Manipulation (HIGH PRIORITY)
**Goal:** Enable variable assignment and data transformation

| Node | Category | Priority | Complexity |
|------|----------|----------|------------|
| Set Variable | data | 🔴 High | Low |
| Merge Data | data | 🔴 High | Medium |
| Code Runner | data | 🟡 Medium | High |

**Deliverables:**
- 3 new NodeTypeSpec definitions
- set_executor.py, merge_executor.py, code_executor.py
- Expression resolver integration ({{variable}} support)
- Security: sandbox Code Runner (restricted Python eval)
- Test: Set var → Merge → Code transform → Output

### Phase 2.3: Advanced Triggers (MEDIUM PRIORITY)
**Goal:** Enable scheduled and event-driven workflows

| Node | Category | Priority | Complexity |
|------|----------|----------|------------|
| Webhook Trigger | triggers | 🟡 Medium | Medium |
| Schedule Trigger | triggers | 🟡 Medium | Medium |
| Event Trigger | triggers | 🟢 Low | High |
| File Upload Trigger | triggers | 🟢 Low | Medium |

**Deliverables:**
- 4 new NodeTypeSpec definitions
- webhook_trigger_executor.py, schedule_trigger_executor.py, etc.
- Webhook endpoint: POST /api/v1/workflows/webhook/{workflowId}/{triggerNodeId}
- Celery beat integration for schedules
- S3 upload handler for file triggers
- Test: Webhook call → workflow execution

### Phase 2.4: Advanced Flow Control (MEDIUM PRIORITY)
**Goal:** Enable complex branching and error handling

| Node | Category | Priority | Complexity |
|------|----------|----------|------------|
| Switch | flow_control | 🟡 Medium | Medium |
| Wait/Delay | flow_control | 🟡 Medium | Low |
| Webhook Response | outputs | 🟡 Medium | Medium |
| Error Trigger | triggers | 🟢 Low | Medium |

**Deliverables:**
- 4 new NodeTypeSpec definitions
- switch_executor.py, wait_executor.py, webhook_response_executor.py, error_executor.py
- Flow compiler support for multi-branch Switch
- Async wait implementation (Celery delay task)
- Error boundary pattern integration
- Test: Switch on condition → Wait 5s → Respond to webhook

## Detailed Node Specifications

### Phase 2.1 Nodes

#### 1. Manual Trigger
```python
{
    "type": "manual_trigger",
    "name": "Manual Trigger",
    "category": "triggers",
    "description": "Start workflow manually with optional input parameters",
    "color": "green",
    "icon": "play",
    "inputSpec": [],
    "outputSpec": [
        {
            "name": "userId",
            "type": "number",
            "label": "User ID",
            "description": "ID of user who triggered the workflow"
        },
        {
            "name": "timestamp",
            "type": "text",
            "label": "Timestamp",
            "description": "ISO timestamp of trigger"
        },
        {
            "name": "params",
            "type": "json",
            "label": "Input Parameters",
            "description": "Optional parameters passed on trigger"
        }
    ]
}
```

#### 2. Form Input
```python
{
    "type": "form_input",
    "name": "Form Input",
    "category": "inputs",
    "description": "Collect structured input from user before workflow execution",
    "color": "blue",
    "icon": "form",
    "inputSpec": [
        {
            "name": "fields",
            "type": "json",
            "label": "Form Fields",
            "description": "JSON array of field definitions",
            "ui_type": "json_editor",
            "default": [
                {
                    "id": "field1",
                    "label": "Field 1",
                    "type": "text",
                    "required": true,
                    "placeholder": "Enter value"
                }
            ]
        }
    ],
    "outputSpec": [
        {
            "name": "values",
            "type": "json",
            "label": "Form Values",
            "description": "Submitted form values as key-value pairs"
        }
    ]
}
```

#### 3. Workflow Response
```python
{
    "type": "workflow_response",
    "name": "Workflow Response",
    "category": "outputs",
    "description": "Return final output from workflow",
    "color": "purple",
    "icon": "check-circle",
    "inputSpec": [
        {
            "name": "data",
            "type": "any",
            "label": "Response Data",
            "description": "Data to return as workflow result",
            "allow_expression": true
        },
        {
            "name": "status",
            "type": "text",
            "label": "Status",
            "description": "Response status",
            "ui_type": "select",
            "options": ["success", "partial", "failed"],
            "default": "success"
        }
    ],
    "outputSpec": []
}
```

### Phase 2.2 Nodes

#### 4. Set Variable
```python
{
    "type": "set_variable",
    "name": "Set Variable",
    "category": "data",
    "description": "Assign a value to a variable",
    "color": "orange",
    "icon": "variable",
    "inputSpec": [
        {
            "name": "variableName",
            "type": "text",
            "label": "Variable Name",
            "description": "Name of the variable to set",
            "required": true
        },
        {
            "name": "value",
            "type": "any",
            "label": "Value",
            "description": "Value to assign (supports expressions)",
            "allow_expression": true,
            "required": true
        }
    ],
    "outputSpec": [
        {
            "name": "value",
            "type": "any",
            "label": "Assigned Value",
            "description": "The value that was assigned"
        }
    ]
}
```

#### 5. Merge Data
```python
{
    "type": "merge_data",
    "name": "Merge Data",
    "category": "data",
    "description": "Combine multiple data sources into one object",
    "color": "orange",
    "icon": "merge",
    "inputSpec": [
        {
            "name": "sources",
            "type": "array",
            "label": "Data Sources",
            "description": "Array of data objects to merge",
            "allow_expression": true,
            "required": true
        },
        {
            "name": "strategy",
            "type": "text",
            "label": "Merge Strategy",
            "description": "How to handle conflicts",
            "ui_type": "select",
            "options": ["overwrite", "keep_first", "deep_merge"],
            "default": "overwrite"
        }
    ],
    "outputSpec": [
        {
            "name": "merged",
            "type": "json",
            "label": "Merged Data",
            "description": "Combined data object"
        }
    ]
}
```

#### 6. Code Runner
```python
{
    "type": "code_runner",
    "name": "Code Runner",
    "category": "data",
    "description": "Execute custom Python code for data transformation",
    "color": "red",
    "icon": "code",
    "inputSpec": [
        {
            "name": "code",
            "type": "text",
            "label": "Python Code",
            "description": "Python code to execute (input available as 'input' variable)",
            "ui_type": "code_editor",
            "required": true
        },
        {
            "name": "input",
            "type": "any",
            "label": "Input Data",
            "description": "Data passed to code as 'input' variable",
            "allow_expression": true
        },
        {
            "name": "timeout",
            "type": "number",
            "label": "Timeout (seconds)",
            "description": "Maximum execution time",
            "default": 30,
            "min": 1,
            "max": 300
        }
    ],
    "outputSpec": [
        {
            "name": "result",
            "type": "any",
            "label": "Execution Result",
            "description": "Value returned by the code"
        },
        {
            "name": "stdout",
            "type": "text",
            "label": "Standard Output",
            "description": "Printed output from the code"
        }
    ]
}
```

### Phase 2.3 Nodes

#### 7. Webhook Trigger
```python
{
    "type": "webhook_trigger",
    "name": "Webhook Trigger",
    "category": "triggers",
    "description": "Start workflow from HTTP webhook call",
    "color": "green",
    "icon": "webhook",
    "inputSpec": [
        {
            "name": "method",
            "type": "text",
            "label": "HTTP Method",
            "ui_type": "select",
            "options": ["POST", "GET", "PUT"],
            "default": "POST"
        },
        {
            "name": "authRequired",
            "type": "boolean",
            "label": "Require Authentication",
            "default": false
        }
    ],
    "outputSpec": [
        {
            "name": "body",
            "type": "json",
            "label": "Request Body",
            "description": "Parsed JSON body from webhook call"
        },
        {
            "name": "headers",
            "type": "json",
            "label": "Request Headers",
            "description": "HTTP headers from webhook call"
        },
        {
            "name": "query",
            "type": "json",
            "label": "Query Parameters",
            "description": "URL query parameters"
        }
    ]
}
```

#### 8. Schedule Trigger
```python
{
    "type": "schedule_trigger",
    "name": "Schedule Trigger",
    "category": "triggers",
    "description": "Start workflow on a schedule (cron)",
    "color": "green",
    "icon": "clock",
    "inputSpec": [
        {
            "name": "schedule",
            "type": "text",
            "label": "Cron Expression",
            "description": "Cron schedule (e.g., '0 9 * * 1' for Monday 9am)",
            "required": true,
            "placeholder": "0 9 * * 1"
        },
        {
            "name": "timezone",
            "type": "text",
            "label": "Timezone",
            "description": "IANA timezone (e.g., 'Asia/Bangkok')",
            "default": "UTC"
        }
    ],
    "outputSpec": [
        {
            "name": "timestamp",
            "type": "text",
            "label": "Execution Time",
            "description": "ISO timestamp of scheduled execution"
        }
    ]
}
```

#### 9. Event Trigger
```python
{
    "type": "event_trigger",
    "name": "Event Trigger",
    "category": "triggers",
    "description": "Start workflow when system event occurs",
    "color": "green",
    "icon": "zap",
    "inputSpec": [
        {
            "name": "eventType",
            "type": "text",
            "label": "Event Type",
            "ui_type": "select",
            "options": [
                "user.created",
                "user.updated",
                "skill.completed",
                "media.generated",
                "workflow.completed"
            ],
            "required": true
        },
        {
            "name": "filter",
            "type": "json",
            "label": "Event Filter",
            "description": "Optional filter conditions (JSON)",
            "ui_type": "json_editor"
        }
    ],
    "outputSpec": [
        {
            "name": "event",
            "type": "json",
            "label": "Event Data",
            "description": "Full event payload"
        },
        {
            "name": "eventType",
            "type": "text",
            "label": "Event Type",
            "description": "Type of event that triggered workflow"
        }
    ]
}
```

#### 10. File Upload Trigger
```python
{
    "type": "file_upload_trigger",
    "name": "File Upload Trigger",
    "category": "triggers",
    "description": "Start workflow when file is uploaded",
    "color": "green",
    "icon": "upload",
    "inputSpec": [
        {
            "name": "acceptedTypes",
            "type": "array",
            "label": "Accepted File Types",
            "description": "MIME types to accept (e.g., ['image/*', 'application/pdf'])",
            "ui_type": "tags",
            "default": ["*/*"]
        },
        {
            "name": "maxSize",
            "type": "number",
            "label": "Max Size (MB)",
            "description": "Maximum file size in megabytes",
            "default": 10,
            "min": 1,
            "max": 100
        }
    ],
    "outputSpec": [
        {
            "name": "fileUrl",
            "type": "text",
            "label": "File URL",
            "description": "S3 URL of uploaded file"
        },
        {
            "name": "fileName",
            "type": "text",
            "label": "File Name",
            "description": "Original file name"
        },
        {
            "name": "fileSize",
            "type": "number",
            "label": "File Size",
            "description": "File size in bytes"
        },
        {
            "name": "mimeType",
            "type": "text",
            "label": "MIME Type",
            "description": "File MIME type"
        }
    ]
}
```

### Phase 2.4 Nodes

#### 11. Switch
```python
{
    "type": "switch",
    "name": "Switch",
    "category": "flow_control",
    "description": "Multi-way branch based on value matching",
    "color": "yellow",
    "icon": "git-branch",
    "inputSpec": [
        {
            "name": "value",
            "type": "any",
            "label": "Value to Match",
            "description": "Value to compare against cases",
            "allow_expression": true,
            "required": true
        },
        {
            "name": "cases",
            "type": "json",
            "label": "Cases",
            "description": "Array of {match, label} objects",
            "ui_type": "json_editor",
            "default": [
                {"match": "value1", "label": "Case 1"},
                {"match": "value2", "label": "Case 2"}
            ]
        },
        {
            "name": "defaultCase",
            "type": "text",
            "label": "Default Case Label",
            "description": "Label for default/fallback case",
            "default": "default"
        }
    ],
    "outputSpec": [
        {
            "name": "matched",
            "type": "text",
            "label": "Matched Case",
            "description": "Label of the matched case"
        },
        {
            "name": "value",
            "type": "any",
            "label": "Input Value",
            "description": "The value that was matched"
        }
    ]
}
```

#### 12. Wait/Delay
```python
{
    "type": "wait",
    "name": "Wait",
    "category": "flow_control",
    "description": "Pause workflow execution for specified duration",
    "color": "gray",
    "icon": "pause",
    "inputSpec": [
        {
            "name": "duration",
            "type": "number",
            "label": "Duration",
            "description": "How long to wait",
            "required": true,
            "min": 1
        },
        {
            "name": "unit",
            "type": "text",
            "label": "Time Unit",
            "ui_type": "select",
            "options": ["seconds", "minutes", "hours", "days"],
            "default": "seconds"
        }
    ],
    "outputSpec": [
        {
            "name": "resumedAt",
            "type": "text",
            "label": "Resumed At",
            "description": "ISO timestamp when execution resumed"
        }
    ]
}
```

#### 13. Webhook Response
```python
{
    "type": "webhook_response",
    "name": "Webhook Response",
    "category": "outputs",
    "description": "Send HTTP response back to webhook caller",
    "color": "purple",
    "icon": "reply",
    "inputSpec": [
        {
            "name": "statusCode",
            "type": "number",
            "label": "HTTP Status Code",
            "description": "Response status code",
            "default": 200,
            "min": 100,
            "max": 599
        },
        {
            "name": "body",
            "type": "any",
            "label": "Response Body",
            "description": "Data to return",
            "allow_expression": true
        },
        {
            "name": "headers",
            "type": "json",
            "label": "Response Headers",
            "description": "Optional HTTP headers",
            "ui_type": "json_editor"
        }
    ],
    "outputSpec": []
}
```

#### 14. Error Trigger
```python
{
    "type": "error_trigger",
    "name": "Error Trigger",
    "category": "triggers",
    "description": "Start workflow when another workflow fails",
    "color": "red",
    "icon": "alert-circle",
    "inputSpec": [
        {
            "name": "watchWorkflow",
            "type": "text",
            "label": "Workflow to Watch",
            "description": "ID of workflow to monitor for errors",
            "ui_type": "workflow_select"
        },
        {
            "name": "errorTypes",
            "type": "array",
            "label": "Error Types",
            "description": "Which errors to trigger on",
            "ui_type": "tags",
            "default": ["all"]
        }
    ],
    "outputSpec": [
        {
            "name": "error",
            "type": "json",
            "label": "Error Details",
            "description": "Error information from failed workflow"
        },
        {
            "name": "workflowId",
            "type": "text",
            "label": "Failed Workflow ID",
            "description": "ID of workflow that failed"
        },
        {
            "name": "timestamp",
            "type": "text",
            "label": "Error Timestamp",
            "description": "When the error occurred"
        }
    ]
}
```

## Implementation Strategy

### Backend Changes (python-backend/)

1. **Extend node_registry.py** (400 lines → 1200 lines)
   - Add all 14 NodeTypeSpec definitions
   - Update `get_all_node_types()` to include new nodes
   - Add category filtering support

2. **Create new executors** (python-backend/app/orchestrator/node_executors/)
   ```
   trigger_executors/
   ├── manual_trigger_executor.py
   ├── webhook_trigger_executor.py
   ├── schedule_trigger_executor.py
   ├── event_trigger_executor.py
   └── file_upload_trigger_executor.py

   data_executors/
   ├── set_executor.py
   ├── merge_executor.py
   └── code_executor.py

   flow_executors/
   ├── switch_executor.py
   └── wait_executor.py

   output_executors/
   ├── response_executor.py
   └── webhook_response_executor.py
   ```

3. **New API endpoints** (python-backend/app/api/workflows.py)
   - `POST /api/v1/workflows/webhook/{workflowId}/{nodeId}` — Webhook trigger endpoint
   - `GET /api/v1/workflows/webhook/{workflowId}/{nodeId}/info` — Get webhook URL
   - `POST /api/v1/workflows/schedule/{workflowId}` — Register/update schedule
   - `DELETE /api/v1/workflows/schedule/{workflowId}` — Remove schedule

4. **Celery integration** (python-backend/app/core/celery_app.py)
   - Add `execute_scheduled_workflow` periodic task
   - Add `execute_delayed_node` task for Wait node
   - Configure celery beat for schedule triggers

5. **Code sandbox** (python-backend/app/orchestrator/sandbox.py)
   - RestrictedPython integration for Code Runner
   - Whitelist safe builtins (no file I/O, no network)
   - Resource limits (CPU time, memory)

### Frontend Changes (apps/web/client/)

1. **Trigger node UI** (components/workflow/nodes/TriggerNode.tsx)
   - Special rendering for trigger nodes (green badge)
   - Webhook URL display with copy button
   - Schedule visualization (next run time)

2. **Form builder** (components/workflow/config/FormBuilder.tsx)
   - Visual form field designer for Form Input node
   - Drag-and-drop field reordering
   - Field type selector (text, number, select, etc.)

3. **Code editor** (components/workflow/config/CodeEditor.tsx)
   - Monaco editor integration for Code Runner
   - Python syntax highlighting
   - Error display

4. **Webhook management** (components/workflow/WebhookPanel.tsx)
   - List all webhook nodes in workflow
   - Generate webhook URLs
   - View webhook call history

### Database Changes

```sql
-- New table for scheduled workflows
CREATE TABLE workflow_schedules (
  id SERIAL PRIMARY KEY,
  workflow_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  last_run TIMESTAMP,
  next_run TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- New table for webhook call history
CREATE TABLE webhook_calls (
  id SERIAL PRIMARY KEY,
  workflow_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36) NOT NULL,
  request_method VARCHAR(10),
  request_body JSONB,
  request_headers JSONB,
  execution_id VARCHAR(36),
  status VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_workflow_node (workflow_id, node_id)
);

-- New table for event subscriptions
CREATE TABLE workflow_event_subscriptions (
  id SERIAL PRIMARY KEY,
  workflow_id VARCHAR(36) NOT NULL,
  node_id VARCHAR(36) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  filter_conditions JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_event_type (event_type),
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);
```

## Testing Plan

### Unit Tests
- [ ] Test each new executor in isolation
- [ ] Test expression resolution in Set/Merge nodes
- [ ] Test code sandbox security (deny file I/O, network)
- [ ] Test switch branching logic
- [ ] Test wait duration calculations

### Integration Tests
- [ ] Manual trigger → Set variable → Response
- [ ] Webhook trigger → LLM call → Webhook response
- [ ] Schedule trigger → multiple executions
- [ ] Form input → Merge data → Code runner → Output
- [ ] Switch → multiple branches → different outcomes
- [ ] Error trigger → handles failed workflow

### Security Tests
- [ ] Code Runner cannot access filesystem
- [ ] Code Runner cannot make network calls
- [ ] Code Runner respects timeout limits
- [ ] Webhook auth validation works
- [ ] Event trigger respects tenant isolation

## Migration Guide

### For Existing Workflows
- Existing workflows remain functional (no breaking changes)
- Users can add new nodes via node palette
- Recommend adding Manual Trigger + Response to all existing workflows

### For Developers
```bash
# 1. Pull latest changes
git pull origin main

# 2. Install new Python dependencies
cd python-backend
pip install RestrictedPython croniter pytz

# 3. Run database migration
cd apps/web
pnpm db:push

# 4. Restart all services
cd ../..
./run-services.sh restart
```

## Success Criteria

- [x] All 14 nodes defined in node_registry.py
- [ ] All 14 executors implemented and tested
- [ ] Webhook endpoint accepts external calls
- [ ] Schedule trigger executes at correct time
- [ ] Code Runner sandboxed and secure
- [ ] Form Input renders dynamic forms
- [ ] Switch supports 2+ branches
- [ ] Wait delays execution correctly
- [ ] Full integration test passes
- [ ] Documentation updated

## Known Limitations

1. **Code Runner**: Python only (no JavaScript support yet)
2. **Schedule Trigger**: Minimum interval 1 minute (no sub-minute cron)
3. **Event Trigger**: Limited to internal events (no external webhooks yet)
4. **File Upload**: 100MB max file size (S3 limitation)
5. **Wait**: Maximum wait time 7 days (Celery countdown limit)

## Next Steps After Phase 2

1. **Phase 3: Advanced Executors** — Complete stub implementations (Approval, Skill, RAG, Image)
2. **Phase 4: Workflow Marketplace** — Template sharing, rating, categories
3. **Phase 5: Collaboration** — Multi-user editing, comments, version control
4. **Phase 6: Monitoring** — Execution analytics, performance metrics, alerts

---

**Implementation Start:** 2026-02-08
**Estimated Completion:** Phase 2.1-2.2 (1 day), Phase 2.3-2.4 (2 days)
**Total Effort:** ~3 days for all 14 nodes
