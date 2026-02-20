# Section 03: Template JSON Files (60 Files)

## Status: IMPLEMENTED

## Overview

This section covers creating 60 template JSON files that serve as the canonical source of truth for all example workflow templates. These files are consumed by the seeder script (section 04) and validated by automated tests.

**Dependency**: This section has no upstream dependencies. It can be implemented in parallel with sections 01, 02, and 07.

**Blocks**: Section 04 (Seeder Script) depends on these files being present.

## Implementation Notes

### Files Created
- **Test file**: `specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts` (721 tests)
- **Template files**: 60 JSON files in `specs/feature/017-VirtualWorkflowExam/templates/tpl-001-*.json` through `tpl-060-*.json`

### Running Tests
```bash
./apps/web/node_modules/.bin/vitest run --dir specs/feature/017-VirtualWorkflowExam
```
Note: The vitest config's include pattern doesn't cover the specs directory, so `--dir` flag is needed.

### Deviations from Plan
1. **Parallel/join node materialization**: The spec's shorthand notation (e.g., `parallel [A, B, C]`) implies implicit parallel/join. The implementation materializes these as explicit `parallel` and `join` nodes, which is correct for ReactFlow rendering. This adds 1-2 nodes per parallel workflow compared to the spec's shorthand count.
2. **tpl-023**: Removed an extra audit `send_notification` node that was not in the spec (per code review).
3. **tpl-032, tpl-043**: Fixed branch node naming to follow the spec convention (branches use parent parallel node's number, e.g., `node-3a`/`node-3b` for parallel node `node-3`).

---

## Tests First

Write and run these tests before creating any `.json` files. All tests should initially fail (no files exist), then pass once all 60 files are created.

**Test file**: `/home/dev/projects/SmartSpecPro/specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts`

The tests are parameterized — they run the same assertions on every file matched by the glob `templates/tpl-*.json`. An implementer should be able to run them with:

```
cd specs/feature/017-VirtualWorkflowExam && pnpm test
```

or from the project root:

```
npx vitest run specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts
```

### Test stub

```typescript
// specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const TEMPLATES_DIR = join(__dirname, "../templates");
const KNOWN_CATEGORIES = [
  "Sales & Marketing",
  "HR & People",
  "Finance & Accounting",
  "IT & DevOps",
  "Healthcare",
  "Education",
  "Government & Public",
  "Personal Productivity",
  "Real Estate",
  "Logistics & Supply Chain",
  "Content & Media",
  "Food & Restaurant",
  "Legal & Compliance",
  "Customer Service",
  "AI & Automation",
];

// The 57 known node types from the NodeRegistry
const KNOWN_NODE_TYPES = new Set([
  "manual_trigger", "form_input", "webhook_trigger", "schedule_trigger",
  "queue_trigger", "event_trigger", "file_upload_trigger", "error_trigger",
  "llm_call", "rag_query", "generate_image", "prompt_template", "output_parser",
  "multi_model_router", "skill",
  "conditional", "loop", "switch", "wait", "delay", "retry", "try_catch",
  "parallel", "join", "subworkflow", "execution_timeout", "rate_limiter",
  "circuit_breaker", "idempotency", "approval_gate",
  "set_variable", "merge_data", "code_runner", "map_array", "database_query",
  "filter", "split", "batch", "transformer", "validator", "read_file",
  "write_file", "csv_parser", "template_engine",
  "http_request", "storage_action", "mcp_connector", "graphql_request",
  "websocket_client",
  "workflow_response", "webhook_response", "send_notification", "send_email",
  "metrics_collector", "dead_letter_queue", "run_history", "secrets_vault",
]);

const TRIGGER_NODE_TYPES = new Set([
  "manual_trigger", "form_input", "webhook_trigger", "schedule_trigger",
  "queue_trigger", "event_trigger", "file_upload_trigger", "error_trigger",
]);

// Load all template files
const templateFiles = readdirSync(TEMPLATES_DIR).filter(
  (f) => f.match(/^tpl-\d{3}-[\w-]+\.json$/)
);

describe("Template JSON files", () => {
  it("should have exactly 60 template files", () => {
    expect(templateFiles).toHaveLength(60);
  });

  templateFiles.forEach((filename) => {
    describe(`${filename}`, () => {
      // Parse the file once for all assertions in this describe block
      const raw = readFileSync(join(TEMPLATES_DIR, filename), "utf-8");
      const tpl = JSON.parse(raw);

      it("parses as valid JSON", () => {
        // If JSON.parse above threw, this test would never be reached;
        // the describe-level parse serves as the implicit parse test.
        expect(tpl).toBeDefined();
      });

      it("has required top-level keys", () => {
        const required = [
          "id", "name", "description", "category", "industry", "tags",
          "stepCount", "estimatedSetupMinutes", "workflowJson",
        ];
        for (const key of required) {
          expect(tpl, `Missing key: ${key}`).toHaveProperty(key);
        }
      });

      it("id matches filename prefix", () => {
        const prefix = filename.replace(/^(tpl-\d{3}).*\.json$/, "$1");
        expect(tpl.id).toBe(prefix);
      });

      it("workflowJson.nodes is a non-empty array", () => {
        expect(Array.isArray(tpl.workflowJson.nodes)).toBe(true);
        expect(tpl.workflowJson.nodes.length).toBeGreaterThan(0);
      });

      it("workflowJson.edges is an array", () => {
        expect(Array.isArray(tpl.workflowJson.edges)).toBe(true);
      });

      it('every node has type === "workflow"', () => {
        // CRITICAL: ReactFlow custom component is registered under "workflow"
        for (const node of tpl.workflowJson.nodes) {
          expect(node.type, `Node ${node.id} has wrong type: ${node.type}`).toBe("workflow");
        }
      });

      it("every node has data.nodeType in the known set", () => {
        for (const node of tpl.workflowJson.nodes) {
          expect(
            KNOWN_NODE_TYPES.has(node.data.nodeType),
            `Unknown nodeType: ${node.data.nodeType} on node ${node.id}`
          ).toBe(true);
        }
      });

      it("every edge source and target reference existing node IDs", () => {
        const nodeIds = new Set(tpl.workflowJson.nodes.map((n: any) => n.id));
        for (const edge of tpl.workflowJson.edges) {
          expect(nodeIds.has(edge.source), `edge.source "${edge.source}" not found`).toBe(true);
          expect(nodeIds.has(edge.target), `edge.target "${edge.target}" not found`).toBe(true);
        }
      });

      it("has at least one trigger node", () => {
        const hasTrigger = tpl.workflowJson.nodes.some(
          (n: any) => TRIGGER_NODE_TYPES.has(n.data.nodeType)
        );
        expect(hasTrigger).toBe(true);
      });

      it("stepCount === workflowJson.nodes.length", () => {
        expect(tpl.stepCount).toBe(tpl.workflowJson.nodes.length);
      });

      it("category is one of the 15 defined categories", () => {
        expect(KNOWN_CATEGORIES).toContain(tpl.category);
      });

      it("no node config value contains a real-looking API key", () => {
        // Rejects strings of 32+ alphanumeric chars that look like real secrets
        const configStr = JSON.stringify(tpl.workflowJson.nodes.map((n: any) => n.data.config));
        expect(configStr).not.toMatch(/[A-Za-z0-9]{32,}/);
      });
    });
  });
});
```

---

## File Location

All 60 files go in:

```
/home/dev/projects/SmartSpecPro/specs/feature/017-VirtualWorkflowExam/templates/
```

Create this directory before creating files:

```bash
mkdir -p /home/dev/projects/SmartSpecPro/specs/feature/017-VirtualWorkflowExam/templates
```

---

## File Naming Convention

```
tpl-{NNN}-{kebab-slug}.json
```

where NNN is zero-padded (001 through 060) and the kebab-slug is a short, URL-safe description of the workflow name (e.g., `tpl-001-daily-sales-report.json`).

---

## Per-File JSON Structure

Every file must be a JSON object with these exact top-level keys:

```json
{
  "id": "tpl-001",
  "name": "Daily Sales Report",
  "description": "Automatically queries yesterday's orders from the database each morning, analyzes performance against targets with AI, and emails a formatted summary report to management. Designed for e-commerce stores and B2B sales teams who need daily visibility without manual reporting.",
  "category": "Sales & Marketing",
  "industry": ["E-commerce", "Retail"],
  "tags": ["scheduled", "reporting", "email", "sales", "database", "beginner"],
  "stepCount": 6,
  "estimatedSetupMinutes": 20,
  "workflowJson": {
    "nodes": [...],
    "edges": [...]
  }
}
```

### Field Rules

| Field | Type | Rules |
|---|---|---|
| `id` | string | Must match filename prefix exactly: `"tpl-001"` for `tpl-001-*.json` |
| `name` | string | Human-readable, English, action-oriented title |
| `description` | string | 2–4 sentences: who uses it, when, what problem it solves |
| `category` | string | Must be one of the 15 category names listed below |
| `industry` | string[] | 1–3 sector names (e.g., `"E-commerce"`, `"Healthcare"`) |
| `tags` | string[] | Trigger type, output type, complexity level, key app types |
| `stepCount` | integer | Must equal `workflowJson.nodes.length` exactly |
| `estimatedSetupMinutes` | integer | Honest estimate for a typical user; range 5–120 |
| `workflowJson` | object | ReactFlow JSON with `nodes[]` and `edges[]` |

---

## Critical Node Requirements

### `type` Field — MUST be `"workflow"`

Every node object in `workflowJson.nodes` **must** have `"type": "workflow"`. This is the ReactFlow custom node component name registered in the editor under the key `"workflow"`. Using any other value causes ReactFlow to silently fall back to a default renderer and breaks the editor.

```json
{
  "id": "node-1",
  "type": "workflow",
  "position": { "x": 100, "y": 200 },
  "data": {
    "nodeType": "schedule_trigger",
    "label": "Run every morning at 7 AM",
    "config": { "schedule": "0 7 * * *" }
  }
}
```

Do NOT use `"workflowNode"`, `"custom"`, `"default"`, or any other string.

### Node Positions

Use these spacing rules for node layout:
- Canvas origin: `(100, 200)`
- Horizontal spacing between sequential nodes: 250px
- Vertical spacing for parallel branches: 150px

Example positions for a linear 4-node workflow:
```
node-1: { x: 100, y: 200 }
node-2: { x: 350, y: 200 }
node-3: { x: 600, y: 200 }
node-4: { x: 850, y: 200 }
```

Example positions for a fork (parallel) at node-2:
```
node-1:   { x: 100, y: 275 }  // trigger (centered)
node-2a:  { x: 350, y: 125 }  // parallel branch A
node-2b:  { x: 350, y: 350 }  // parallel branch B  (offset by 225px)
node-3:   { x: 600, y: 275 }  // join
```

### Node Labels

Every node must have a specific, descriptive `data.label`. Do not use the node type as the label.

```json
// GOOD
"label": "Query yesterday's orders from orders table"

// BAD
"label": "database_query"
```

### Config Values

Every `data.config` must contain realistic, production-quality example values:

| Node Type | Required Config Field | Example Value |
|---|---|---|
| `schedule_trigger` | `schedule` | `"0 7 * * *"` (not `""`) |
| `llm_call` | `prompt` | A complete, multi-line prompt template with placeholders |
| `database_query` | `query` | A real SELECT/INSERT/UPDATE SQL statement |
| `http_request` | `url` | Real API endpoint URL pattern (e.g., `"https://api.stripe.com/v1/invoices"`) |
| `send_email` | `subject` | The actual email subject line |
| `template_engine` | `template` | A real template string with `{{variable}}` placeholders |

### Credential Placeholders

For values that require real secrets, use placeholder syntax. Never use real values.

```json
"config": {
  "connectionString": "{{env.DATABASE_URL}}",
  "webhookUrl": "{{env.SLACK_WEBHOOK_URL}}",
  "apiKey": "{{secrets.OPENAI_API_KEY}}",
  "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
}
```

### Edge Format

```json
{
  "id": "edge-1-2",
  "source": "node-1",
  "target": "node-2",
  "sourceHandle": "output",
  "targetHandle": "input"
}
```

---

## 15 Category Names (Exact Strings)

The `category` field must be one of these 15 strings exactly (case-sensitive):

1. `"Sales & Marketing"`
2. `"HR & People"`
3. `"Finance & Accounting"`
4. `"IT & DevOps"`
5. `"Healthcare"`
6. `"Education"`
7. `"Government & Public"`
8. `"Personal Productivity"`
9. `"Real Estate"`
10. `"Logistics & Supply Chain"`
11. `"Content & Media"`
12. `"Food & Restaurant"`
13. `"Legal & Compliance"`
14. `"Customer Service"`
15. `"AI & Automation"`

---

## Category Distribution (60 Templates)

| Category | Template IDs | Count | Source Use Cases |
|---|---|---|---|
| Sales & Marketing | tpl-001 to tpl-008 | 8 | Group A (UC 1–8) |
| HR & People | tpl-009 to tpl-013 | 5 | Group B (UC 9–13) |
| Finance & Accounting | tpl-014 to tpl-017 | 4 | Group C (UC 14–17) |
| IT & DevOps | tpl-018 to tpl-021 | 4 | Group D (UC 18–21) |
| Healthcare | tpl-022 to tpl-024 | 3 | Group E (UC 22–24) |
| Education | tpl-025 to tpl-028 | 4 | Group F (UC 25–28) |
| Government & Public | tpl-029 to tpl-031 | 3 | Group G (UC 29–31) |
| Personal Productivity | tpl-032 to tpl-036 | 5 | Group H (UC 32–36) |
| Real Estate | tpl-037 to tpl-038 | 2 | Group I (UC 37–38) |
| Logistics & Supply Chain | tpl-039 to tpl-040 | 2 | Group J (UC 39–40) |
| Content & Media | tpl-041 to tpl-043 | 3 | Group K (UC 41–43) |
| Food & Restaurant | tpl-044 to tpl-045 | 2 | Group L (UC 44–45) |
| Legal & Compliance | tpl-046 to tpl-047 | 2 | Group M (UC 46–47) |
| Customer Service | tpl-048 to tpl-050 | 3 | Group N (UC 48–50) |
| AI & Automation | tpl-051 to tpl-060 | 10 | Group O (UC 51–60) |

---

## Use Case to Template Mapping

Below is the complete mapping from spec use cases to template files. For each template, the spec defines the node flow — use this as the basis for the `workflowJson`.

### Sales & Marketing (tpl-001 to tpl-008)

**tpl-001** — Daily Sales Report
Node flow: `schedule_trigger → database_query → transformer → llm_call → template_engine → send_email`
Suggested slug: `tpl-001-daily-sales-report.json`
Industry: `["E-commerce", "Retail"]`

**tpl-002** — Customer Review Auto-Response
Node flow: `webhook_trigger → http_request → llm_call → output_parser → conditional → approval_gate → http_request → database_query`
Suggested slug: `tpl-002-customer-review-response.json`
Industry: `["Retail", "Hospitality"]`

**tpl-003** — Lead Scoring and Routing
Node flow: `webhook_trigger → validator → rag_query → llm_call → output_parser → http_request → switch → send_notification`
Suggested slug: `tpl-003-lead-scoring-routing.json`
Industry: `["SaaS", "Real Estate", "Insurance"]`

**tpl-004** — Product Description Generator
Node flow: `event_trigger → prompt_template → parallel [llm_call, llm_call, llm_call] → join → approval_gate → database_query → send_notification`
Suggested slug: `tpl-004-product-description-generator.json`
Industry: `["E-commerce", "Retail"]`

**tpl-005** — Competitor Price Monitor
Node flow: `schedule_trigger → database_query → loop → http_request → llm_call → database_query → filter → conditional → send_notification`
Suggested slug: `tpl-005-competitor-price-monitor.json`
Industry: `["E-commerce", "Retail"]`

**tpl-006** — Meeting Summary Distribution
Node flow: `form_input → llm_call → output_parser → parallel [send_email, http_request]`
Suggested slug: `tpl-006-meeting-summary-distribution.json`
Industry: `["Professional Services", "Enterprise"]`

**tpl-007** — Personalized Weekly Newsletter
Node flow: `schedule_trigger → database_query → batch → loop → rag_query → template_engine → send_email → metrics_collector`
Suggested slug: `tpl-007-personalized-newsletter.json`
Industry: `["Media", "SaaS"]`

**tpl-008** — Quote Approval Workflow
Node flow: `form_input → validator → switch → approval_gate → conditional → send_email → database_query`
Suggested slug: `tpl-008-quote-approval-workflow.json`
Industry: `["Professional Services", "Construction"]`

### HR & People (tpl-009 to tpl-013)

**tpl-009** — Resume Screening and Scoring
Node flow: `file_upload_trigger → read_file → prompt_template → llm_call → output_parser → conditional → send_notification → database_query`
Suggested slug: `tpl-009-resume-screening-scoring.json`
Industry: `["Recruiting", "Enterprise"]`

**tpl-010** — Employee Onboarding Process
Node flow: `event_trigger → form_input → parallel [http_request, http_request, http_request, send_email] → join → wait → send_email → wait → send_email`
Suggested slug: `tpl-010-employee-onboarding.json`
Industry: `["Enterprise", "SME"]`

**tpl-011** — Leave Request and Approval
Node flow: `form_input → validator → database_query → conditional → approval_gate → conditional → parallel [database_query, send_email, http_request]`
Suggested slug: `tpl-011-leave-request-approval.json`
Industry: `["Enterprise", "SME"]`

**tpl-012** — Employee Birthday and Anniversary Notifications
Node flow: `schedule_trigger → database_query → filter → loop → template_engine → send_notification`
Suggested slug: `tpl-012-employee-anniversary-notifications.json`
Industry: `["Enterprise", "SME"]`

**tpl-013** — Monthly OKR Report
Node flow: `schedule_trigger → database_query → transformer → llm_call → template_engine → storage_action → send_email`
Suggested slug: `tpl-013-monthly-okr-report.json`
Industry: `["Enterprise", "SaaS"]`

### Finance & Accounting (tpl-014 to tpl-017)

**tpl-014** — Daily Transaction Reconciliation
Node flow: `schedule_trigger → csv_parser → database_query → code_runner → filter → conditional → send_notification → database_query`
Suggested slug: `tpl-014-transaction-reconciliation.json`
Industry: `["Finance", "Retail"]`

**tpl-015** — Budget Overspend Alert
Node flow: `schedule_trigger → database_query → code_runner → filter → loop → switch → send_notification → send_email`
Suggested slug: `tpl-015-budget-overspend-alert.json`
Industry: `["Enterprise", "Government"]`

**tpl-016** — Monthly P&L Summary
Node flow: `schedule_trigger → database_query → transformer → merge_data → llm_call → template_engine → send_email`
Suggested slug: `tpl-016-monthly-pl-summary.json`
Industry: `["Finance", "Enterprise"]`

**tpl-017** — Overdue Invoice Reminder
Node flow: `schedule_trigger → database_query → filter → loop → switch → template_engine → send_email → database_query`
Suggested slug: `tpl-017-overdue-invoice-reminder.json`
Industry: `["Finance", "Professional Services"]`

### IT & DevOps (tpl-018 to tpl-021)

**tpl-018** — System Health Monitoring
Node flow: `schedule_trigger → loop → http_request → try_catch → conditional → circuit_breaker → send_notification → metrics_collector`
Suggested slug: `tpl-018-system-health-monitoring.json`
Industry: `["SaaS", "IT Services"]`

**tpl-019** — Error Log Analysis
Node flow: `schedule_trigger → read_file → split → filter → batch → llm_call → output_parser → conditional → send_notification`
Suggested slug: `tpl-019-error-log-analysis.json`
Industry: `["SaaS", "IT Services"]`

**tpl-020** — Deployment Approval Pipeline
Node flow: `webhook_trigger → llm_call → approval_gate → conditional → http_request → wait → http_request → send_notification`
Suggested slug: `tpl-020-deployment-approval-pipeline.json`
Industry: `["SaaS", "IT Services"]`

**tpl-021** — Database Backup Verification
Node flow: `schedule_trigger → http_request → storage_action → database_query → conditional → send_notification → metrics_collector → send_email`
Suggested slug: `tpl-021-backup-verification.json`
Industry: `["SaaS", "Enterprise"]`

### Healthcare (tpl-022 to tpl-024)

**tpl-022** — Patient Appointment Reminder
Node flow: `schedule_trigger → database_query → filter → loop → template_engine → send_notification → database_query`
Suggested slug: `tpl-022-patient-appointment-reminder.json`
Industry: `["Healthcare"]`

**tpl-023** — Lab Result Notification
Node flow: `event_trigger → validator → code_runner → conditional → parallel [send_notification, send_notification]`
Suggested slug: `tpl-023-lab-result-notification.json`
Industry: `["Healthcare"]`

**tpl-024** — Pre-Visit Patient Summary
Node flow: `schedule_trigger → database_query → loop → rag_query → llm_call → send_notification`
Suggested slug: `tpl-024-pre-visit-patient-summary.json`
Industry: `["Healthcare"]`

### Education (tpl-025 to tpl-028)

**tpl-025** — Assignment Deadline Reminder
Node flow: `schedule_trigger → database_query → filter → loop → switch → template_engine → send_notification`
Suggested slug: `tpl-025-assignment-deadline-reminder.json`
Industry: `["Education"]`

**tpl-026** — Plagiarism Detection
Node flow: `file_upload_trigger → read_file → split → rag_query → llm_call → output_parser → conditional → send_notification`
Suggested slug: `tpl-026-plagiarism-detection.json`
Industry: `["Education"]`

**tpl-027** — Auto Quiz Generation
Node flow: `form_input → read_file → prompt_template → llm_call → output_parser → approval_gate → http_request → send_notification`
Suggested slug: `tpl-027-auto-quiz-generation.json`
Industry: `["Education", "EdTech"]`

**tpl-028** — Student Progress Report
Node flow: `schedule_trigger → database_query → batch → loop → llm_call → template_engine → send_email`
Suggested slug: `tpl-028-student-progress-report.json`
Industry: `["Education"]`

### Government & Public (tpl-029 to tpl-031)

**tpl-029** — Citizen Service Request Processing
Node flow: `webhook_trigger → validator → llm_call → switch → database_query → parallel [send_notification, send_notification]`
Suggested slug: `tpl-029-citizen-service-request.json`
Industry: `["Government"]`

**tpl-030** — Executive News Brief
Node flow: `schedule_trigger → parallel [http_request, http_request, http_request] → join → merge_data → llm_call → template_engine → send_email`
Suggested slug: `tpl-030-executive-news-brief.json`
Industry: `["Government", "Enterprise"]`

**tpl-031** — Project Budget Alert
Node flow: `schedule_trigger → database_query → code_runner → filter → loop → switch → send_notification → send_email`
Suggested slug: `tpl-031-project-budget-alert.json`
Industry: `["Government", "Enterprise"]`

### Personal Productivity (tpl-032 to tpl-036)

**tpl-032** — Personal News Digest
Node flow: `schedule_trigger → parallel [http_request, http_request] → join → llm_call → template_engine → send_email`
Suggested slug: `tpl-032-personal-news-digest.json`
Industry: `["Personal Productivity"]`

**tpl-033** — Stock Price Alert
Node flow: `schedule_trigger → database_query → loop → http_request → conditional → send_notification → rate_limiter`
Suggested slug: `tpl-033-stock-price-alert.json`
Industry: `["Finance", "Personal Productivity"]`

**tpl-034** — Personal Expense Tracker
Node flow: `schedule_trigger → database_query → transformer → llm_call → template_engine → send_email`
Suggested slug: `tpl-034-personal-expense-tracker.json`
Industry: `["Personal Productivity"]`

**tpl-035** — Travel Itinerary Generator
Node flow: `form_input → http_request → rag_query → prompt_template → llm_call → template_engine → send_email`
Suggested slug: `tpl-035-travel-itinerary-generator.json`
Industry: `["Travel", "Personal Productivity"]`

**tpl-036** — Recipe Suggestion from Ingredients
Node flow: `form_input → prompt_template → llm_call → output_parser → workflow_response`
Suggested slug: `tpl-036-recipe-suggestion.json`
Industry: `["Personal Productivity", "Food & Beverage"]`

### Real Estate (tpl-037 to tpl-038)

**tpl-037** — Property Buyer Matching
Node flow: `event_trigger → rag_query → llm_call → filter → loop → send_notification`
Suggested slug: `tpl-037-property-buyer-matching.json`
Industry: `["Real Estate"]`

**tpl-038** — Property Valuation Report
Node flow: `form_input → database_query → http_request → llm_call → template_engine → send_email`
Suggested slug: `tpl-038-property-valuation-report.json`
Industry: `["Real Estate", "Finance"]`

### Logistics & Supply Chain (tpl-039 to tpl-040)

**tpl-039** — Shipment Status Notification
Node flow: `webhook_trigger → database_query → switch → template_engine → send_notification`
Suggested slug: `tpl-039-shipment-status-notification.json`
Industry: `["Logistics", "E-commerce"]`

**tpl-040** — Daily Delivery Route Planning
Node flow: `schedule_trigger → database_query → http_request → llm_call → batch → send_notification`
Suggested slug: `tpl-040-delivery-route-planning.json`
Industry: `["Logistics", "Food & Beverage"]`

### Content & Media (tpl-041 to tpl-043)

**tpl-041** — Social Media Content Calendar
Node flow: `form_input → rag_query → prompt_template → llm_call → output_parser → parallel [send_email, http_request]`
Suggested slug: `tpl-041-content-calendar-planning.json`
Industry: `["Media", "Marketing"]`

**tpl-042** — Content Repurposing (Podcast/YouTube)
Node flow: `form_input → http_request → split → parallel [llm_call, llm_call, llm_call] → join → approval_gate → http_request`
Suggested slug: `tpl-042-content-repurposing.json`
Industry: `["Media", "Marketing"]`

**tpl-043** — Auto Blog Image Generation
Node flow: `event_trigger → llm_call → parallel [generate_image, generate_image, generate_image] → join → storage_action → http_request → send_notification`
Suggested slug: `tpl-043-blog-image-generation.json`
Industry: `["Media", "E-commerce"]`

### Food & Restaurant (tpl-044 to tpl-045)

**tpl-044** — Inventory Analysis and Auto-Order
Node flow: `schedule_trigger → database_query → filter → loop → template_engine → approval_gate → send_email → database_query`
Suggested slug: `tpl-044-inventory-auto-order.json`
Industry: `["Food & Beverage", "Hospitality"]`

**tpl-045** — Menu Performance Analysis
Node flow: `schedule_trigger → database_query → code_runner → llm_call → template_engine → send_email`
Suggested slug: `tpl-045-menu-performance-analysis.json`
Industry: `["Food & Beverage"]`

### Legal & Compliance (tpl-046 to tpl-047)

**tpl-046** — Contract Review and Summary
Node flow: `file_upload_trigger → read_file → split → batch → llm_call → merge_data → llm_call → approval_gate → send_email`
Suggested slug: `tpl-046-contract-review-summary.json`
Industry: `["Legal", "Professional Services"]`

**tpl-047** — License and Permit Expiry Tracking
Node flow: `schedule_trigger → database_query → filter → loop → switch → send_notification → send_email`
Suggested slug: `tpl-047-license-expiry-tracking.json`
Industry: `["Legal", "Government", "Food & Beverage"]`

### Customer Service (tpl-048 to tpl-050)

**tpl-048** — Support Ticket Triage
Node flow: `webhook_trigger → rag_query → llm_call → output_parser → parallel [http_request, send_email]`
Suggested slug: `tpl-048-support-ticket-triage.json`
Industry: `["SaaS", "E-commerce"]`

**tpl-049** — Churn Risk Detection
Node flow: `schedule_trigger → database_query → llm_call → output_parser → filter → loop → send_notification`
Suggested slug: `tpl-049-churn-risk-detection.json`
Industry: `["SaaS"]`

**tpl-050** — FAQ Auto-Responder (Line / Webhook)
Node flow: `webhook_trigger → rag_query → llm_call → output_parser → conditional → webhook_response → database_query`
Suggested slug: `tpl-050-faq-auto-responder.json`
Industry: `["Retail", "SME"]`

### AI & Automation (tpl-051 to tpl-060)

**tpl-051** — Daily News Video Generation
Node flow: `schedule_trigger → http_request → llm_call → parallel [generate_image, skill] → join → storage_action → send_notification`
Note: Uses `skill` node with a video generation skill.
Suggested slug: `tpl-051-daily-news-video.json`
Industry: `["Media"]`

**tpl-052** — PDF to Knowledge Base
Node flow: `file_upload_trigger → read_file → split → batch → loop → http_request → storage_action → send_notification`
Suggested slug: `tpl-052-pdf-to-knowledge-base.json`
Industry: `["Enterprise", "Education"]`

**tpl-053** — Personalized Learning Path (AI Tutor)
Node flow: `form_input → rag_query → llm_call → output_parser → database_query → loop → schedule_trigger → send_notification`
Suggested slug: `tpl-053-personalized-learning-path.json`
Industry: `["EdTech", "Education"]`

**tpl-054** — Supply Chain Risk Monitoring
Node flow: `schedule_trigger → parallel [http_request, http_request] → join → llm_call → output_parser → filter → send_notification`
Suggested slug: `tpl-054-supply-chain-risk-monitoring.json`
Industry: `["Manufacturing", "Logistics"]`

**tpl-055** — Customer Onboarding Email Sequence
Node flow: `event_trigger → database_query → send_email → wait → send_email → wait → send_email → wait → database_query → conditional → send_email`
Suggested slug: `tpl-055-customer-onboarding-sequence.json`
Industry: `["SaaS"]`

**tpl-056** — SLA Breach Monitor
Node flow: `schedule_trigger → database_query → code_runner → filter → loop → switch → send_notification`
Suggested slug: `tpl-056-sla-breach-monitor.json`
Industry: `["IT Services", "SaaS"]`

**tpl-057** — Multi-language Content Publishing
Node flow: `event_trigger → database_query → parallel [llm_call, llm_call, llm_call] → join → approval_gate → loop → http_request`
Suggested slug: `tpl-057-multilanguage-content-publishing.json`
Industry: `["Media", "Enterprise"]`

**tpl-058** — Emergency Alert System
Node flow: `manual_trigger → form_input → switch → parallel [send_notification, send_email, http_request, database_query] → wait → send_notification`
Suggested slug: `tpl-058-emergency-alert-system.json`
Industry: `["Enterprise", "Government"]`

**tpl-059** — Survey Analysis Automation
Node flow: `file_upload_trigger → csv_parser → filter → batch → loop → llm_call → merge_data → llm_call → template_engine → send_email`
Suggested slug: `tpl-059-survey-analysis-automation.json`
Industry: `["HR", "Marketing"]`

**tpl-060** — Subscription Renewal Workflow
Node flow: `schedule_trigger → database_query → loop → switch → conditional → http_request → conditional → send_email → database_query`
Suggested slug: `tpl-060-subscription-renewal-workflow.json`
Industry: `["SaaS", "Subscription"]`

---

## Example Template (Complete)

Below is a fully worked example for `tpl-001-daily-sales-report.json`. Use this as the reference for all other files — pay particular attention to the `"type": "workflow"` on every node, the layout positions, and the realistic config values.

```json
{
  "id": "tpl-001",
  "name": "Daily Sales Report",
  "description": "Automatically queries yesterday's orders from the database each morning, analyzes performance against weekly and monthly targets using AI, and emails a formatted summary report to management. Designed for e-commerce stores and B2B sales teams who need daily visibility without manual reporting effort.",
  "category": "Sales & Marketing",
  "industry": ["E-commerce", "Retail"],
  "tags": ["scheduled", "reporting", "email", "sales", "database", "analytics", "beginner"],
  "stepCount": 6,
  "estimatedSetupMinutes": 20,
  "workflowJson": {
    "nodes": [
      {
        "id": "node-1",
        "type": "workflow",
        "position": { "x": 100, "y": 200 },
        "data": {
          "nodeType": "schedule_trigger",
          "label": "Run every morning at 7 AM",
          "config": {
            "schedule": "0 7 * * *",
            "timezone": "Asia/Bangkok"
          }
        }
      },
      {
        "id": "node-2",
        "type": "workflow",
        "position": { "x": 350, "y": 200 },
        "data": {
          "nodeType": "database_query",
          "label": "Query yesterday's orders",
          "config": {
            "connectionString": "{{env.DATABASE_URL}}",
            "query": "SELECT o.id, o.total_amount, o.status, p.name as product_name, c.email as customer_email FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id JOIN customers c ON o.customer_id = c.id WHERE o.created_at >= CURRENT_DATE - INTERVAL '1 day' AND o.created_at < CURRENT_DATE ORDER BY o.total_amount DESC"
          }
        }
      },
      {
        "id": "node-3",
        "type": "workflow",
        "position": { "x": 600, "y": 200 },
        "data": {
          "nodeType": "transformer",
          "label": "Compute totals and top sellers",
          "config": {
            "expression": "{ totalRevenue: _.sumBy(input, 'total_amount'), orderCount: input.length, topProducts: _.chain(input).groupBy('product_name').mapValues(v => _.sumBy(v, 'total_amount')).toPairs().sortBy(1).reverse().take(5).value() }"
          }
        }
      },
      {
        "id": "node-4",
        "type": "workflow",
        "position": { "x": 850, "y": 200 },
        "data": {
          "nodeType": "llm_call",
          "label": "Generate performance analysis",
          "config": {
            "model": "gpt-4o-mini",
            "prompt": "You are a business analyst for an e-commerce company. Analyze the following daily sales data and provide a concise performance summary in 3-4 bullet points.\n\nData: {{input}}\n\nInclude:\n1. Revenue trend vs. yesterday (if available in context)\n2. Top-performing product category\n3. Any anomalies or patterns worth noting\n4. One actionable recommendation\n\nKeep the tone professional and data-driven. Format as bullet points."
          }
        }
      },
      {
        "id": "node-5",
        "type": "workflow",
        "position": { "x": 1100, "y": 200 },
        "data": {
          "nodeType": "template_engine",
          "label": "Format HTML email report",
          "config": {
            "template": "<h2>Daily Sales Report — {{date}}</h2><p><strong>Total Revenue:</strong> ${{totalRevenue}}</p><p><strong>Orders:</strong> {{orderCount}}</p><h3>Top Products</h3><ul>{{#each topProducts}}<li>{{this.[0]}}: ${{this.[1]}}</li>{{/each}}</ul><h3>AI Analysis</h3><p>{{aiAnalysis}}</p>"
          }
        }
      },
      {
        "id": "node-6",
        "type": "workflow",
        "position": { "x": 1350, "y": 200 },
        "data": {
          "nodeType": "send_email",
          "label": "Email report to management",
          "config": {
            "to": ["ceo@company.com", "sales-manager@company.com"],
            "subject": "Daily Sales Report — {{date}}",
            "body": "{{emailBody}}",
            "from": "noreply@company.com",
            "smtpHost": "{{env.SMTP_HOST}}",
            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
          }
        }
      }
    ],
    "edges": [
      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
    ]
  }
}
```

---

## Node ID Convention

Use a consistent node ID scheme throughout all files:

- Sequential linear nodes: `node-1`, `node-2`, `node-3`, ...
- Parallel branches: `node-3a`, `node-3b`, `node-3c` (where `node-3` is the split point and the letter indicates branch)
- Join nodes after parallel: `node-4` (continue the parent numbering)
- Edge IDs: `e{source-number}-{target-number}` or `e{source}-{target}` (e.g., `e1-2`, `e3a-4`)

---

## Parallel Branch Layout Example

For a workflow with a parallel fan-out (e.g., tpl-004 Product Description Generator):

```json
{
  "nodes": [
    {
      "id": "node-1", "type": "workflow",
      "position": { "x": 100, "y": 350 },
      "data": { "nodeType": "event_trigger", "label": "New product added to catalog", "config": {} }
    },
    {
      "id": "node-2", "type": "workflow",
      "position": { "x": 350, "y": 350 },
      "data": { "nodeType": "prompt_template", "label": "Build content generation prompt", "config": {
        "template": "Product: {{productName}}\nCategory: {{category}}\nKey specs: {{specs}}\nBrand voice: {{brandVoice}}"
      }}
    },
    {
      "id": "node-3", "type": "workflow",
      "position": { "x": 600, "y": 350 },
      "data": { "nodeType": "parallel", "label": "Generate for all platforms", "config": {} }
    },
    {
      "id": "node-3a", "type": "workflow",
      "position": { "x": 850, "y": 125 },
      "data": { "nodeType": "llm_call", "label": "Write website product description", "config": {
        "prompt": "Write a detailed product description for the company website (150-200 words). Use the product details: {{input}}. Emphasize features, benefits, and use cases. End with a clear call-to-action."
      }}
    },
    {
      "id": "node-3b", "type": "workflow",
      "position": { "x": 850, "y": 350 },
      "data": { "nodeType": "llm_call", "label": "Write Shopee listing description", "config": {
        "prompt": "Write a Shopee product listing (under 300 characters title + 5 bullet points). Use the product details: {{input}}. Optimize for search keywords and mobile readers."
      }}
    },
    {
      "id": "node-3c", "type": "workflow",
      "position": { "x": 850, "y": 575 },
      "data": { "nodeType": "llm_call", "label": "Write Instagram caption with hashtags", "config": {
        "prompt": "Write an engaging Instagram caption (under 125 words) with 10-15 relevant hashtags. Use the product details: {{input}}. Use an enthusiastic, conversational tone."
      }}
    },
    {
      "id": "node-4", "type": "workflow",
      "position": { "x": 1100, "y": 350 },
      "data": { "nodeType": "join", "label": "Collect all descriptions", "config": {} }
    },
    {
      "id": "node-5", "type": "workflow",
      "position": { "x": 1350, "y": 350 },
      "data": { "nodeType": "approval_gate", "label": "Content team review", "config": {
        "assignTo": "{{env.CONTENT_TEAM_EMAIL}}",
        "timeoutHours": 24
      }}
    }
  ]
}
```

---

## Common Anti-Patterns to Avoid

| Anti-Pattern | Correct Approach |
|---|---|
| `"type": "workflowNode"` | Always use `"type": "workflow"` |
| `"type": "custom"` | Always use `"type": "workflow"` |
| `"label": "llm_call"` | Use a descriptive label: `"label": "Analyze sentiment of review"` |
| `"config": {}` on llm_call | Always include a real `"prompt"` field |
| `"config": { "schedule": "" }` | Use a real cron: `"schedule": "0 7 * * *"` |
| `"config": { "apiKey": "sk-abc123..." }` | Use placeholder: `"{{secrets.OPENAI_API_KEY}}"` |
| `"stepCount": 5` when nodes array has 6 items | Keep `stepCount` in sync with `nodes.length` |
| Edge referencing a non-existent node ID | Always verify source/target IDs match a node in the same file |

---

## Implementation Checklist

- [ ] Create directory: `specs/feature/017-VirtualWorkflowExam/templates/`
- [ ] Write the test file at `specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts`
- [ ] Run tests — confirm they fail (no JSON files yet)
- [ ] Create all 60 JSON files following the naming convention
- [ ] Ensure every node has `"type": "workflow"` (not any other string)
- [ ] Ensure `stepCount` equals `workflowJson.nodes.length` in every file
- [ ] Ensure every edge source/target references an existing node ID in the same file
- [ ] Ensure at least one trigger node per workflow
- [ ] Ensure every `data.nodeType` is in the 57-node known set
- [ ] Ensure no config value contains a real-looking secret (32+ alphanumeric chars)
- [ ] Run tests — confirm all pass