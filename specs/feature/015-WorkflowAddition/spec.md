# Workflow Editor Enhancement Specification

## Document Information
- **Feature ID**: 015-WorkflowAddition
- **Version**: 1.0.0
- **Status**: Draft
- **Created**: 2026-02-17
- **Author**: AI Assistant

---

## 1. Executive Summary

This specification consolidates identified issues, missing node types, and new feature requirements for the Workflow Editor system. The goal is to enhance workflow functionality from 18 core nodes to approximately 50 nodes, fix existing issues, and enable Workflow-to-Agent-Skill conversion capabilities.

---

## 2. Current System Status

### 2.1 Existing Node Types (18 types)

| Category | Nodes | Status |
|----------|-------|--------|
| AI | llm_call, rag_query | ✅ Implemented |
| Flow Control | conditional, loop | ✅ Implemented |
| Human | approval_gate | ✅ Implemented |
| Media | generate_image | ✅ Implemented |
| Skills | skill | ✅ Implemented |
| Triggers | manual_trigger | ✅ Implemented |
| Inputs/Outputs | form_input, workflow_response | ✅ Implemented |
| Data | set_variable, merge_data, code_runner, map_array, database_query, filter, split, batch | ✅ Implemented |

### 2.2 Identified Issues

#### Issue #1: Skill Node Field Naming Inconsistency
- **Problem**: Node registry uses `skill_id` field name, but frontend checks for `skill`
- **Location**: `python-backend/app/orchestrator/node_registry.py` line 462
- **Impact**: Skill selector may not render correctly
- **Fix**: Update `DynamicNodeConfig.tsx` to check for `input.name === "skill_id"`

#### Issue #2: Options Endpoints Not Ready
The following endpoints referenced in node definitions may not be fully implemented:

| Endpoint | Used By | Status | Priority |
|----------|---------|--------|----------|
| `/api/v1/workflow/available-models` | llm_call | ⚠️ Verify | High |
| `/api/v1/workflow/rag-collections` | rag_query | ⚠️ Verify | High |
| `/api/v1/workflow/available-approvers` | approval_gate | ⚠️ Verify | Medium |
| `/api/v1/workflow/image-providers` | generate_image | ⚠️ Verify | Medium |
| `/api/v1/workflows/skills` | skill | ✅ Implemented | High |

#### Issue #3: Missing Executor Implementations
Some executors referenced in node registry may not have full implementations:

| Executor | Node | Status | Risk Level |
|----------|------|--------|------------|
| `DatabaseQueryExecutor` | database_query | ⚠️ Verify implementation | High |
| `ApprovalExecutor` | approval_gate | ⚠️ Verify notification system | Medium |
| `CodeExecutor` | code_runner | ⚠️ Verify sandbox security | High |

---

## 3. Phase 1: Bug Fixes & Stabilization

### 3.1 Fix Skill Node Field Detection
**File**: `apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx`

```typescript
// Current (incorrect)
{input.ui_type === "select" && input.name === "skill" ? (

// Fixed
{input.ui_type === "select" && input.name === "skill_id" ? (
```

### 3.2 Options Endpoint Validation
Create health check endpoint to verify all options endpoints:

```python
# New endpoint: GET /api/v1/workflows/health/endpoints
{
  "endpoints": [
    {"path": "/available-models", "status": "ok", "latency_ms": 45},
    {"path": "/rag-collections", "status": "error", "message": "Vector DB not connected"}
  ]
}
```

### 3.3 Executor Implementation Verification
Create test workflows for each node type to verify:
- Node compiles successfully
- Node executes without error
- Node returns expected output format

---

## 4. Phase 2: New Node Types (31 Additional Nodes)

### 4.1 Integration & Connectivity Nodes (5 nodes)

#### 4.1.1 HTTP Request Node
```yaml
type: http_request
display_name: HTTP Request
description: Make HTTP requests to external APIs
category: integrations
icon: globe
color: blue
inputs:
  - name: url
    display_name: URL
    data_type: text
    ui_type: text
    required: true
    accepts_connection: true
  - name: method
    display_name: Method
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: GET, value: GET}
      - {label: POST, value: POST}
      - {label: PUT, value: PUT}
      - {label: DELETE, value: DELETE}
      - {label: PATCH, value: PATCH}
    default: GET
  - name: headers
    display_name: Headers
    data_type: json
    ui_type: json_editor
    required: false
  - name: body
    display_name: Request Body
    data_type: json
    ui_type: json_editor
    required: false
  - name: timeout
    display_name: Timeout (seconds)
    data_type: number
    ui_type: number
    default: 30
    validation: {min: 1, max: 300}
outputs:
  - name: response
    display_name: Response Body
    data_type: json
  - name: statusCode
    display_name: Status Code
    data_type: number
  - name: headers
    display_name: Response Headers
    data_type: json
executor: app.orchestrator.node_executors.integration.http_executor.HTTPExecutor
```

#### 4.1.2 Webhook Trigger Node
```yaml
type: webhook_trigger
display_name: Webhook Trigger
description: Trigger workflow via HTTP webhook
category: triggers
icon: webhook
color: green
inputs: []
outputs:
  - name: body
    display_name: Request Body
    data_type: json
  - name: headers
    display_name: Headers
    data_type: json
  - name: query
    display_name: Query Parameters
    data_type: json
  - name: method
    display_name: HTTP Method
    data_type: text
executor: app.orchestrator.node_executors.trigger_executors.webhook_trigger_executor.WebhookTriggerExecutor
config:
  requires_webhook_registration: true
```

#### 4.1.3 Webhook Response Node
```yaml
type: webhook_response
display_name: Webhook Response
description: Send HTTP response for webhook trigger
category: outputs
icon: reply
color: purple
inputs:
  - name: data
    display_name: Response Data
    data_type: json
    ui_type: json_editor
    required: true
  - name: statusCode
    display_name: Status Code
    data_type: number
    ui_type: select
    required: false
    default: 200
    options:
      - {label: "200 OK", value: 200}
      - {label: "201 Created", value: 201}
      - {label: "400 Bad Request", value: 400}
      - {label: "404 Not Found", value: 404}
outputs: []
executor: app.orchestrator.node_executors.output_executors.webhook_response_executor.WebhookResponseExecutor
```

#### 4.1.4 WebSocket Client Node
```yaml
type: websocket_client
display_name: WebSocket Client
description: Connect to WebSocket for real-time data
category: integrations
icon: radio
color: indigo
inputs:
  - name: url
    display_name: WebSocket URL
    data_type: text
    ui_type: text
    required: true
  - name: message
    display_name: Message to Send
    data_type: json
    ui_type: json_editor
    required: false
  - name: action
    display_name: Action
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: Connect, value: connect}
      - {label: Send, value: send}
      - {label: Close, value: close}
outputs:
  - name: received
    display_name: Received Message
    data_type: json
  - name: connected
    display_name: Connection Status
    data_type: boolean
executor: app.orchestrator.node_executors.integration.websocket_executor.WebSocketExecutor
```

#### 4.1.5 GraphQL Request Node
```yaml
type: graphql_request
display_name: GraphQL Request
description: Query GraphQL APIs
category: integrations
icon: share-2
color: pink
inputs:
  - name: url
    display_name: GraphQL Endpoint
    data_type: text
    ui_type: text
    required: true
  - name: query
    display_name: Query
    data_type: text
    ui_type: textarea
    required: true
  - name: variables
    display_name: Variables
    data_type: json
    ui_type: json_editor
    required: false
  - name: headers
    display_name: Headers
    data_type: json
    ui_type: json_editor
    required: false
outputs:
  - name: data
    display_name: Response Data
    data_type: json
  - name: errors
    display_name: GraphQL Errors
    data_type: array
executor: app.orchestrator.node_executors.integration.graphql_executor.GraphQLExecutor
```

### 4.2 Communication Nodes (4 nodes)

#### 4.2.1 Send Email Node
```yaml
type: send_email
display_name: Send Email
description: Send email notifications
category: integrations
icon: mail
color: blue
inputs:
  - name: to
    display_name: To
    data_type: text
    ui_type: text
    required: true
    accepts_connection: true
  - name: subject
    display_name: Subject
    data_type: text
    ui_type: text
    required: true
  - name: body
    display_name: Body
    data_type: text
    ui_type: textarea
    required: true
  - name: html
    display_name: HTML Content
    data_type: text
    ui_type: textarea
    required: false
outputs:
  - name: sent
    display_name: Sent Status
    data_type: boolean
  - name: messageId
    display_name: Message ID
    data_type: text
executor: app.orchestrator.node_executors.integration.email_executor.EmailExecutor
```

#### 4.2.2 Send Slack Message Node
```yaml
type: send_slack
display_name: Send Slack Message
description: Send messages to Slack channels
category: integrations
icon: slack
color: purple
inputs:
  - name: channel
    display_name: Channel
    data_type: text
    ui_type: text
    required: true
    placeholder: "#general"
  - name: message
    display_name: Message
    data_type: text
    ui_type: textarea
    required: true
  - name: blocks
    display_name: Block Kit JSON
    data_type: json
    ui_type: json_editor
    required: false
outputs:
  - name: ts
    display_name: Timestamp
    data_type: text
executor: app.orchestrator.node_executors.integration.slack_executor.SlackExecutor
```

#### 4.2.3 Send Discord Message Node
```yaml
type: send_discord
display_name: Send Discord Message
description: Send messages to Discord channels
category: integrations
icon: message-circle
color: indigo
inputs:
  - name: webhookUrl
    display_name: Webhook URL
    data_type: text
    ui_type: text
    required: true
  - name: content
    display_name: Content
    data_type: text
    ui_type: textarea
    required: true
  - name: embeds
    display_name: Embeds
    data_type: json
    ui_type: json_editor
    required: false
outputs:
  - name: sent
    display_name: Sent
    data_type: boolean
executor: app.orchestrator.node_executors.integration.discord_executor.DiscordExecutor
```

#### 4.2.4 Web Push Notification Node
```yaml
type: send_webpush
display_name: Web Push Notification
description: Send browser push notifications
category: integrations
icon: bell
color: orange
inputs:
  - name: subscription
    display_name: Push Subscription
    data_type: json
    ui_type: json_editor
    required: true
  - name: title
    display_name: Title
    data_type: text
    ui_type: text
    required: true
  - name: body
    display_name: Body
    data_type: text
    ui_type: textarea
    required: true
  - name: icon
    display_name: Icon URL
    data_type: text
    ui_type: text
    required: false
outputs:
  - name: delivered
    display_name: Delivered
    data_type: boolean
executor: app.orchestrator.node_executors.integration.webpush_executor.WebPushExecutor
```

### 4.3 File & Storage Nodes (4 nodes)

#### 4.3.1 Read File Node
```yaml
type: read_file
display_name: Read File
description: Read and parse file contents
category: data
icon: file-input
color: yellow
inputs:
  - name: source
    display_name: File Source
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: Upload, value: upload}
      - {label: URL, value: url}
      - {label: S3, value: s3}
  - name: file
    display_name: File Path/URL
    data_type: text
    ui_type: text
    required: true
  - name: format
    display_name: File Format
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: Auto-detect, value: auto}
      - {label: CSV, value: csv}
      - {label: JSON, value: json}
      - {label: Text, value: text}
      - {label: PDF, value: pdf}
outputs:
  - name: content
    display_name: File Content
    data_type: any
  - name: metadata
    display_name: File Metadata
    data_type: json
executor: app.orchestrator.node_executors.data_executors.file_read_executor.FileReadExecutor
```

#### 4.3.2 Write File Node
```yaml
type: write_file
display_name: Write File
description: Write data to file
category: data
icon: file-output
color: yellow
inputs:
  - name: filename
    display_name: Filename
    data_type: text
    ui_type: text
    required: true
  - name: content
    display_name: Content
    data_type: any
    ui_type: json_editor
    required: true
  - name: format
    display_name: Format
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: JSON, value: json}
      - {label: CSV, value: csv}
      - {label: Text, value: text}
outputs:
  - name: url
    display_name: Download URL
    data_type: text
executor: app.orchestrator.node_executors.data_executors.file_write_executor.FileWriteExecutor
```

#### 4.3.3 S3 Storage Node
```yaml
type: s3_storage
display_name: S3 Storage
description: Interact with S3-compatible storage
category: integrations
icon: cloud
color: cyan
inputs:
  - name: action
    display_name: Action
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: Upload, value: upload}
      - {label: Download, value: download}
      - {label: Delete, value: delete}
      - {label: List, value: list}
  - name: bucket
    display_name: Bucket
    data_type: text
    ui_type: text
    required: true
  - name: key
    display_name: Object Key
    data_type: text
    ui_type: text
    required: true
outputs:
  - name: url
    display_name: URL
    data_type: text
  - name: items
    display_name: Items
    data_type: array
executor: app.orchestrator.node_executors.integration.s3_executor.S3Executor
```

#### 4.3.4 CSV Parser Node
```yaml
type: csv_parser
display_name: CSV Parser
description: Parse and generate CSV data
category: data
icon: table
color: green
inputs:
  - name: action
    display_name: Action
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: Parse, value: parse}
      - {label: Generate, value: generate}
  - name: data
    display_name: Data
    data_type: any
    ui_type: textarea
    required: true
  - name: delimiter
    display_name: Delimiter
    data_type: text
    ui_type: text
    default: ","
outputs:
  - name: result
    display_name: Result
    data_type: any
executor: app.orchestrator.node_executors.data_executors.csv_executor.CSVExecutor
```

### 4.4 Scheduling & Time Nodes (3 nodes)

#### 4.4.1 Schedule Trigger Node
```yaml
type: schedule_trigger
display_name: Schedule Trigger
description: Trigger workflow on schedule
category: triggers
icon: clock
color: green
inputs:
  - name: cron
    display_name: Cron Expression
    data_type: text
    ui_type: text
    required: true
    placeholder: "0 9 * * 1-5"
  - name: timezone
    display_name: Timezone
    data_type: text
    ui_type: select
    required: false
    default: UTC
    options_endpoint: /api/v1/workflow/timezones
outputs:
  - name: timestamp
    display_name: Trigger Timestamp
    data_type: text
executor: app.orchestrator.node_executors.trigger_executors.schedule_trigger_executor.ScheduleTriggerExecutor
config:
  requires_scheduler: true
```

#### 4.4.2 Delay Node
```yaml
type: delay
display_name: Delay
description: Pause execution for a duration
category: flow_control
icon: timer
color: yellow
inputs:
  - name: duration
    display_name: Duration (seconds)
    data_type: number
    ui_type: number
    required: true
    validation: {min: 0.1, max: 86400}
outputs:
  - name: resumedAt
    display_name: Resumed At
    data_type: text
executor: app.orchestrator.node_executors.flow.delay_executor.DelayExecutor
```

#### 4.4.3 Wait For Node
```yaml
type: wait_for
display_name: Wait For
description: Wait until condition is met
category: flow_control
icon: hourglass
color: yellow
inputs:
  - name: condition
    display_name: Condition Expression
    data_type: text
    ui_type: text
    required: true
    placeholder: "{{previousNode.status}} == 'completed'"
  - name: timeout
    display_name: Timeout (seconds)
    data_type: number
    ui_type: number
    default: 300
    validation: {min: 1, max: 3600}
  - name: pollInterval
    display_name: Poll Interval (seconds)
    data_type: number
    ui_type: number
    default: 5
outputs:
  - name: satisfied
    display_name: Condition Satisfied
    data_type: boolean
executor: app.orchestrator.node_executors.flow.wait_executor.WaitExecutor
```

### 4.5 Error Handling & Reliability Nodes (3 nodes)

#### 4.5.1 Try Catch Node
```yaml
type: try_catch
display_name: Try Catch
description: Handle errors with fallback
category: flow_control
icon: shield
color: red
inputs:
  - name: retryCount
    display_name: Retry Count
    data_type: number
    ui_type: number
    default: 0
    validation: {min: 0, max: 10}
  - name: fallbackValue
    display_name: Fallback Value
    data_type: json
    ui_type: json_editor
    required: false
outputs:
  - name: result
    display_name: Result
    data_type: any
  - name: error
    display_name: Error (if any)
    data_type: json
executor: app.orchestrator.node_executors.flow.try_catch_executor.TryCatchExecutor
```

#### 4.5.2 Retry Node
```yaml
type: retry
display_name: Retry
description: Retry execution with backoff
category: flow_control
icon: refresh-cw
color: orange
inputs:
  - name: maxAttempts
    display_name: Max Attempts
    data_type: number
    ui_type: number
    default: 3
    validation: {min: 1, max: 10}
  - name: backoff
    display_name: Backoff Strategy
    data_type: text
    ui_type: select
    default: exponential
    options:
      - {label: Fixed, value: fixed}
      - {label: Exponential, value: exponential}
      - {label: Linear, value: linear}
  - name: delay
    display_name: Initial Delay (seconds)
    data_type: number
    ui_type: number
    default: 1
outputs:
  - name: attempts
    display_name: Attempts Made
    data_type: number
executor: app.orchestrator.node_executors.flow.retry_executor.RetryExecutor
```

#### 4.5.3 Circuit Breaker Node
```yaml
type: circuit_breaker
display_name: Circuit Breaker
description: Prevent cascade failures
category: flow_control
icon: shield-alert
color: red
inputs:
  - name: failureThreshold
    display_name: Failure Threshold
    data_type: number
    ui_type: number
    default: 5
  - name: timeout
    display_name: Timeout Duration (seconds)
    data_type: number
    ui_type: number
    default: 60
outputs:
  - name: state
    display_name: Circuit State
    data_type: text
executor: app.orchestrator.node_executors.flow.circuit_breaker_executor.CircuitBreakerExecutor
```

### 4.6 Advanced Flow Control Nodes (4 nodes)

#### 4.6.1 Switch Node
```yaml
type: switch
display_name: Switch
description: Route to multiple branches
category: flow_control
icon: git-branch
color: yellow
inputs:
  - name: value
    display_name: Value to Match
    data_type: any
    ui_type: text
    required: true
outputs:
  - name: default
    display_name: Default
    data_type: any
  # Additional outputs added dynamically based on cases
executor: app.orchestrator.node_executors.flow.switch_executor.SwitchExecutor
```

#### 4.6.2 Parallel Node
```yaml
type: parallel
display_name: Parallel
description: Execute branches in parallel
category: flow_control
icon: split
color: purple
inputs:
  - name: branches
    display_name: Number of Branches
    data_type: number
    ui_type: number
    required: true
    default: 2
    validation: {min: 2, max: 10}
outputs:
  - name: results
    display_name: All Results
    data_type: array
executor: app.orchestrator.node_executors.flow.parallel_executor.ParallelExecutor
```

#### 4.6.3 Join Node
```yaml
type: join
display_name: Join
description: Wait for and combine parallel results
category: flow_control
icon: merge
color: purple
inputs:
  - name: mode
    display_name: Join Mode
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: Wait All, value: all}
      - {label: Wait Any, value: any}
      - {label: Wait N, value: count}
  - name: count
    display_name: Required Count
    data_type: number
    ui_type: number
    required: false
outputs:
  - name: results
    display_name: Combined Results
    data_type: array
executor: app.orchestrator.node_executors.flow.join_executor.JoinExecutor
```

#### 4.6.4 Subworkflow Node
```yaml
type: subworkflow
display_name: Subworkflow
description: Call another workflow
category: flow_control
icon: workflow
color: blue
inputs:
  - name: workflowId
    display_name: Workflow ID
    data_type: text
    ui_type: select
    required: true
    options_endpoint: /api/v1/workflows/list
  - name: inputs
    display_name: Input Data
    data_type: json
    ui_type: json_editor
    required: false
outputs:
  - name: result
    display_name: Subworkflow Result
    data_type: json
executor: app.orchestrator.node_executors.flow.subworkflow_executor.SubworkflowExecutor
```

### 4.7 Data Format & Template Nodes (3 nodes)

#### 4.7.1 Template Engine Node
```yaml
type: template_engine
display_name: Template Engine
description: Render text templates
category: data
icon: file-code
color: orange
inputs:
  - name: template
    display_name: Template
    data_type: text
    ui_type: textarea
    required: true
  - name: data
    display_name: Template Data
    data_type: json
    ui_type: json_editor
    required: true
  - name: engine
    display_name: Template Engine
    data_type: text
    ui_type: select
    default: handlebars
    options:
      - {label: Handlebars, value: handlebars}
      - {label: Jinja2, value: jinja2}
      - {label: EJS, value: ejs}
outputs:
  - name: rendered
    display_name: Rendered Output
    data_type: text
executor: app.orchestrator.node_executors.data_executors.template_executor.TemplateExecutor
```

#### 4.7.2 JSON Parser Node
```yaml
type: json_parser
display_name: JSON Parser
description: Parse and validate JSON
category: data
icon: brackets
color: orange
inputs:
  - name: input
    display_name: JSON Input
    data_type: text
    ui_type: textarea
    required: true
  - name: schema
    display_name: JSON Schema
    data_type: json
    ui_type: json_editor
    required: false
outputs:
  - name: parsed
    display_name: Parsed Data
    data_type: json
  - name: valid
    display_name: Is Valid
    data_type: boolean
executor: app.orchestrator.node_executors.data_executors.json_parser_executor.JSONParserExecutor
```

#### 4.7.3 XML Parser Node
```yaml
type: xml_parser
display_name: XML Parser
description: Parse and generate XML
category: data
icon: code-2
color: orange
inputs:
  - name: action
    display_name: Action
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: Parse XML to JSON, value: parse}
      - {label: Generate XML from JSON, value: generate}
  - name: data
    display_name: Data
    data_type: text
    ui_type: textarea
    required: true
outputs:
  - name: result
    display_name: Result
    data_type: any
executor: app.orchestrator.node_executors.data_executors.xml_executor.XMLExecutor
```

### 4.8 AI Enhancement Nodes (3 nodes)

#### 4.8.1 Prompt Template Node
```yaml
type: prompt_template
display_name: Prompt Template
description: Create reusable LLM prompts
category: ai
icon: file-text
color: blue
inputs:
  - name: template
    display_name: Prompt Template
    data_type: text
    ui_type: textarea
    required: true
  - name: variables
    display_name: Variables
    data_type: json
    ui_type: json_editor
    required: true
outputs:
  - name: prompt
    display_name: Final Prompt
    data_type: text
executor: app.orchestrator.node_executors.ai.prompt_template_executor.PromptTemplateExecutor
```

#### 4.8.2 Output Parser Node
```yaml
type: output_parser
display_name: Output Parser
description: Parse LLM output to structured data
category: ai
icon: scanner
color: blue
inputs:
  - name: output
    display_name: LLM Output
    data_type: text
    ui_type: textarea
    required: true
  - name: format
    display_name: Output Format
    data_type: text
    ui_type: select
    required: true
    options:
      - {label: JSON, value: json}
      - {label: CSV, value: csv}
      - {label: List, value: list}
      - {label: Key-Value, value: keyvalue}
  - name: schema
    display_name: Expected Schema
    data_type: json
    ui_type: json_editor
    required: false
outputs:
  - name: parsed
    display_name: Parsed Output
    data_type: json
executor: app.orchestrator.node_executors.ai.output_parser_executor.OutputParserExecutor
```

#### 4.8.3 Multi Model Router Node
```yaml
type: multi_model_router
display_name: Multi Model Router
description: Route to different models based on complexity
category: ai
icon: route
color: blue
inputs:
  - name: prompt
    display_name: Prompt
    data_type: text
    ui_type: textarea
    required: true
  - name: complexity
    display_name: Complexity Score
    data_type: number
    ui_type: slider
    default: 0.5
    validation: {min: 0, max: 1, step: 0.1}
  - name: models
    display_name: Model Configuration
    data_type: json
    ui_type: json_editor
    default:
      low: gpt-4o-mini
      medium: gpt-4o
      high: gpt-4
outputs:
  - name: response
    display_name: Response
    data_type: text
  - name: modelUsed
    display_name: Model Used
    data_type: text
executor: app.orchestrator.node_executors.ai.model_router_executor.ModelRouterExecutor
```

---

## 5. Phase 3: Workflow → Agent Skill Conversion

### 5.1 Feature Overview

Enable users to convert tested workflows into private agent skills that can be invoked through natural language in chat.

### 5.2 Conversion Eligibility System

#### 5.2.1 Compatibility Score Algorithm

```typescript
interface ConversionAnalysis {
  workflowId: string;
  eligible: boolean;
  score: number; // 0-100
  unsupportedNodes: string[];
  warnings: string[];
  suggestedModifications: string[];
  estimatedConfidence: number; // 0-1
}

// Node compatibility matrix
const NODE_COMPATIBILITY: Record<string, {
  supported: boolean;
  complexity: 'simple' | 'medium' | 'complex';
  conversionStrategy: 'direct' | 'adapter' | 'not-supported';
  notes?: string;
}> = {
  // Fully supported nodes (direct conversion)
  'llm_call': { supported: true, complexity: 'simple', conversionStrategy: 'direct' },
  'rag_query': { supported: true, complexity: 'simple', conversionStrategy: 'direct' },
  'conditional': { supported: true, complexity: 'simple', conversionStrategy: 'direct' },
  'skill': { supported: true, complexity: 'simple', conversionStrategy: 'direct' },
  'http_request': { supported: true, complexity: 'simple', conversionStrategy: 'direct' },
  'send_email': { supported: true, complexity: 'simple', conversionStrategy: 'direct' },
  'code_runner': { supported: true, complexity: 'medium', conversionStrategy: 'adapter' },
  
  // Nodes requiring adapter
  'form_input': { 
    supported: true, 
    complexity: 'medium', 
    conversionStrategy: 'adapter',
    notes: 'Convert to conversational form collection'
  },
  'approval_gate': { 
    supported: true, 
    complexity: 'complex', 
    conversionStrategy: 'adapter',
    notes: 'Convert to chat-based approval'
  },
  
  // Not supported nodes
  'webhook_trigger': { 
    supported: false, 
    complexity: 'complex', 
    conversionStrategy: 'not-supported',
    notes: 'Skills are triggered by intent, not webhooks'
  },
  'schedule_trigger': { 
    supported: false, 
    complexity: 'complex', 
    conversionStrategy: 'not-supported',
    notes: 'Use workflow scheduling instead'
  },
  'parallel': { 
    supported: false, 
    complexity: 'complex', 
    conversionStrategy: 'not-supported',
    notes: 'Chat interface requires sequential processing'
  },
};
```

#### 5.2.2 Conversion Validation API

```typescript
// POST /api/v1/workflows/analyze-conversion
interface AnalyzeConversionRequest {
  workflowId: string;
}

interface AnalyzeConversionResponse {
  eligible: boolean;
  score: number;
  details: {
    totalNodes: number;
    supportedNodes: number;
    adapterNodes: number;
    unsupportedNodes: number;
    unsupportedNodeList: Array<{
      nodeId: string;
      nodeType: string;
      reason: string;
    }>;
  };
  recommendations: string[];
  preview?: {
    skillName: string;
    triggerPatterns: string[];
    estimatedInputParams: string[];
    expectedOutputFormat: string;
  };
}
```

### 5.3 Conversion Process

#### Step 1: User Initiates Conversion
```typescript
// User clicks "Convert to Skill" button in workflow editor
// System calls analyze-conversion API
```

#### Step 2: Display Analysis Results

**Case A: Eligible for Conversion (Score >= 70)**
```
┌─────────────────────────────────────────┐
│  ✅ Convertible to Agent Skill          │
│                                         │
│  Compatibility Score: 85/100           │
│                                         │
│  Supported Nodes: 8/10                 │
│  Requires Adaptation: 2 nodes          │
│  Unsupported: 0 nodes                  │
│                                         │
│  [Preview Conversion] [Proceed]        │
└─────────────────────────────────────────┘
```

**Case B: Partial Support (Score 40-69)**
```
┌─────────────────────────────────────────┐
│  ⚠️ Partially Convertible              │
│                                         │
│  Compatibility Score: 55/100           │
│                                         │
│  The following nodes require            │
│  modification:                          │
│  • form_input → Conversational input   │
│  • approval_gate → Chat approval       │
│                                         │
│  [View Modifications] [Proceed Anyway] │
└─────────────────────────────────────────┘
```

**Case C: Not Convertible (Score < 40)**
```
┌─────────────────────────────────────────┐
│  ❌ Cannot Convert to Skill            │
│                                         │
│  Compatibility Score: 25/100           │
│                                         │
│  Unsupported nodes detected:            │
│  • webhook_trigger (trigger mismatch)  │
│  • parallel (chat limitation)          │
│  • generate_image (UI required)        │
│                                         │
│  [View Details] [Keep as Workflow]     │
└─────────────────────────────────────────┘
```

#### Step 3: User Configuration

```typescript
interface SkillConversionConfig {
  workflowId: string;
  skillName: string;
  description: string;
  triggerPatterns: string[]; // Natural language patterns
  inputMapping: Array<{
    workflowInput: string;
    skillParam: string;
    description: string;
    required: boolean;
  }>;
  outputMapping: {
    format: 'text' | 'json' | 'markdown';
    template?: string;
  };
  isPrivate: boolean; // Always true for user-created skills
  category: string;
}
```

#### Step 4: Conversion Execution

```python
# Backend conversion process
class WorkflowToSkillConverter:
    def convert(self, workflow_id: str, config: SkillConfig) -> Skill:
        workflow = self.load_workflow(workflow_id)
        
        # 1. Analyze workflow structure
        analysis = self.analyze_compatibility(workflow)
        
        # 2. Transform nodes
        transformed_nodes = []
        for node in workflow.nodes:
            if node.type in NODE_ADAPTER_MAP:
                adapter = NODE_ADAPTER_MAP[node.type]
                transformed_nodes.append(adapter.convert(node))
            else:
                transformed_nodes.append(node)
        
        # 3. Generate skill executor
        executor_code = self.generate_executor(transformed_nodes)
        
        # 4. Create skill definition
        skill = Skill(
            name=config.skill_name,
            description=config.description,
            trigger_patterns=config.trigger_patterns,
            executor_code=executor_code,
            input_schema=self.generate_input_schema(config.input_mapping),
            output_schema=self.generate_output_schema(config.output_mapping),
            is_private=True,
            user_id=config.user_id,
            source_workflow_id=workflow_id
        )
        
        # 5. Register to user's private skill registry
        self.skill_registry.register(skill)
        
        return skill
```

### 5.4 Node Adapters

#### Adapter for form_input → Conversational Input
```python
class FormInputAdapter(NodeAdapter):
    def convert(self, node: Node) -> AdaptedNode:
        return {
            'type': 'conversational_input',
            'config': {
                'fields': node.config['fields'],
                'collection_strategy': 'sequential',  # Ask one by one
                'validation': True
            },
            'prompt_template': self.generate_collection_prompt(node.config['fields'])
        }
    
    def generate_collection_prompt(self, fields):
        return """
        I need to collect the following information:
        {field_descriptions}
        
        Please provide them one by one. I'll ask for each field.
        """
```

#### Adapter for approval_gate → Chat Approval
```python
class ApprovalGateAdapter(NodeAdapter):
    def convert(self, node: Node) -> AdaptedNode:
        return {
            'type': 'chat_approval',
            'config': {
                'message_template': node.config.get('message', 'Please review:'),
                'timeout_seconds': node.config.get('timeout', 3600),
                'approval_prompt': 'Do you approve this? (yes/no)',
            },
            'fallback_action': 'notify_and_continue'
        }
```

### 5.5 Generated Skill Structure

```yaml
# Private skill generated from workflow
skill:
  id: "skill_workflow_12345"
  name: "Data Processing Pipeline"
  description: "Processes CSV data and sends report via email"
  version: "1.0.0"
  
  # Trigger patterns for natural language invocation
  trigger_patterns:
    - "process {filename} and email to {email}"
    - "run data pipeline for {filename}"
    - "generate report from {filename}"
  
  # Input extracted from workflow
  input_schema:
    type: object
    properties:
      filename:
        type: string
        description: "CSV file to process"
      email:
        type: string
        description: "Recipient email address"
    required: [filename, email]
  
  # Output format
  output_schema:
    type: object
    properties:
      success:
        type: boolean
      report_summary:
        type: string
      records_processed:
        type: number
  
  # Generated executor
  executor:
    type: compiled_workflow
    source_workflow_id: 12345
    execution_plan: [...]
  
  # Access control
  visibility: private
  owner_user_id: 67890
  
  # Metadata
  created_from_workflow: true
  conversion_date: "2026-02-17T10:30:00Z"
```

### 5.6 User Interface Flow

```
Workflow Editor
    │
    ▼
┌─────────────────────┐
│ Test & Validate     │
│ Workflow            │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Click "Convert to   │
│ Agent Skill"        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Show Compatibility  │
│ Analysis            │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐  ┌────────────┐
│Eligible│  │Not Eligible│
└───┬────┘  └─────┬──────┘
    │             │
    ▼             ▼
┌─────────────────┐
│ Configure Skill │
│ - Name          │
│ - Description   │
│ - Trigger       │
│   patterns      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Preview &       │
│ Confirm         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Skill Created!  │
│ [Test in Chat]  │
└─────────────────┘
```

---

## 6. Implementation Phases

### Phase 1: Bug Fixes (Week 1-2)
- [ ] Fix skill node field detection (`skill_id` vs `skill`)
- [ ] Verify all options endpoints are functional
- [ ] Test all existing node executors
- [ ] Create endpoint health check system

### Phase 2: High-Priority Nodes (Week 3-6)
**Integration Nodes:**
- [ ] HTTP Request
- [ ] Webhook Trigger/Response

**Communication Nodes:**
- [ ] Send Email
- [ ] Send Slack Message

**Scheduling:**
- [ ] Schedule Trigger
- [ ] Delay

**Error Handling:**
- [ ] Try Catch
- [ ] Retry

### Phase 3: Medium-Priority Nodes (Week 7-10)
- [ ] File operations (Read/Write)
- [ ] CSV Parser
- [ ] S3 Storage
- [ ] Template Engine
- [ ] JSON/XML Parsers
- [ ] WebSocket Client
- [ ] GraphQL Request

### Phase 4: Advanced Nodes (Week 11-14)
- [ ] Parallel/Join
- [ ] Subworkflow
- [ ] Switch
- [ ] Circuit Breaker
- [ ] Wait For
- [ ] AI Enhancement nodes

### Phase 5: Workflow → Skill Conversion (Week 15-18)
- [ ] Conversion analysis API
- [ ] Node adapters implementation
- [ ] Skill generation engine
- [ ] UI for conversion flow
- [ ] Private skill registry integration

---

## 7. Acceptance Criteria

### 7.1 Bug Fixes
- [ ] Skill selector renders correctly for skill node
- [ ] All options endpoints return valid data
- [ ] All 18 existing nodes execute without errors

### 7.2 New Nodes
- [ ] 31 new node types registered in node registry
- [ ] Each node has working executor implementation
- [ ] Each node has proper input validation
- [ ] Each node displays correctly in workflow editor

### 7.3 Workflow → Skill Conversion
- [ ] System can analyze workflow compatibility
- [ ] System correctly identifies unsupported nodes
- [ ] Eligible workflows can be converted to skills
- [ ] Generated skills are private to creating user
- [ ] Skills can be invoked from chat interface
- [ ] Skills execute workflow logic correctly

---

## 8. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Executor implementation complexity | High | Start with simple nodes, use code generation |
| Options endpoint dependencies | Medium | Create mock endpoints for development |
| Skill conversion accuracy | Medium | Implement thorough testing, allow manual override |
| Performance with 50+ nodes | Low | Implement lazy loading, search/filter |

---

## 9. Appendix

### 9.1 Node Type Summary

**Current (18):**
ai: llm_call, rag_query
flow_control: conditional, loop
human: approval_gate
media: generate_image
skills: skill
triggers: manual_trigger
inputs: form_input
outputs: workflow_response
data: set_variable, merge_data, code_runner, map_array, database_query, filter, split, batch

**Proposed New (31):**
integrations: http_request, websocket_client, graphql_request, s3_storage, send_email, send_slack, send_discord, send_webpush
triggers: schedule_trigger, webhook_trigger
outputs: webhook_response
flow_control: delay, wait_for, try_catch, retry, circuit_breaker, switch, parallel, join, subworkflow
data: read_file, write_file, csv_parser, template_engine, json_parser, xml_parser
ai: prompt_template, output_parser, multi_model_router

**Total: 49 node types**

### 9.2 API Endpoints to Implement

```
GET  /api/v1/workflows/node-types
GET  /api/v1/workflows/health/endpoints
POST /api/v1/workflows/analyze-conversion
POST /api/v1/workflows/convert-to-skill
GET  /api/v1/workflows/skills/converted
```

---

## 10. Related Documents

- Current Node Registry: `python-backend/app/orchestrator/node_registry.py`
- Workflow Router: `apps/web/server/routers/workflow.ts`
- Dynamic Node Config: `apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx`
- Skill Registry: `apps/web/server/services/skillRegistry.ts`
