diff --git a/specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts b/specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts
new file mode 100644
index 0000000..0affcbf
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts
@@ -0,0 +1,141 @@
+// specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts
+
+import { describe, it, expect } from "vitest";
+import { readdirSync, readFileSync } from "fs";
+import { join } from "path";
+
+const TEMPLATES_DIR = join(__dirname, "../templates");
+const KNOWN_CATEGORIES = [
+  "Sales & Marketing",
+  "HR & People",
+  "Finance & Accounting",
+  "IT & DevOps",
+  "Healthcare",
+  "Education",
+  "Government & Public",
+  "Personal Productivity",
+  "Real Estate",
+  "Logistics & Supply Chain",
+  "Content & Media",
+  "Food & Restaurant",
+  "Legal & Compliance",
+  "Customer Service",
+  "AI & Automation",
+];
+
+// The 57 known node types from the NodeRegistry
+const KNOWN_NODE_TYPES = new Set([
+  "manual_trigger", "form_input", "webhook_trigger", "schedule_trigger",
+  "queue_trigger", "event_trigger", "file_upload_trigger", "error_trigger",
+  "llm_call", "rag_query", "generate_image", "prompt_template", "output_parser",
+  "multi_model_router", "skill",
+  "conditional", "loop", "switch", "wait", "delay", "retry", "try_catch",
+  "parallel", "join", "subworkflow", "execution_timeout", "rate_limiter",
+  "circuit_breaker", "idempotency", "approval_gate",
+  "set_variable", "merge_data", "code_runner", "map_array", "database_query",
+  "filter", "split", "batch", "transformer", "validator", "read_file",
+  "write_file", "csv_parser", "template_engine",
+  "http_request", "storage_action", "mcp_connector", "graphql_request",
+  "websocket_client",
+  "workflow_response", "webhook_response", "send_notification", "send_email",
+  "metrics_collector", "dead_letter_queue", "run_history", "secrets_vault",
+]);
+
+const TRIGGER_NODE_TYPES = new Set([
+  "manual_trigger", "form_input", "webhook_trigger", "schedule_trigger",
+  "queue_trigger", "event_trigger", "file_upload_trigger", "error_trigger",
+]);
+
+// Load all template files
+const templateFiles = readdirSync(TEMPLATES_DIR).filter(
+  (f) => f.match(/^tpl-\d{3}-[\w-]+\.json$/)
+);
+
+describe("Template JSON files", () => {
+  it("should have exactly 60 template files", () => {
+    expect(templateFiles).toHaveLength(60);
+  });
+
+  templateFiles.forEach((filename) => {
+    describe(`${filename}`, () => {
+      // Parse the file once for all assertions in this describe block
+      const raw = readFileSync(join(TEMPLATES_DIR, filename), "utf-8");
+      const tpl = JSON.parse(raw);
+
+      it("parses as valid JSON", () => {
+        // If JSON.parse above threw, this test would never be reached;
+        // the describe-level parse serves as the implicit parse test.
+        expect(tpl).toBeDefined();
+      });
+
+      it("has required top-level keys", () => {
+        const required = [
+          "id", "name", "description", "category", "industry", "tags",
+          "stepCount", "estimatedSetupMinutes", "workflowJson",
+        ];
+        for (const key of required) {
+          expect(tpl, `Missing key: ${key}`).toHaveProperty(key);
+        }
+      });
+
+      it("id matches filename prefix", () => {
+        const prefix = filename.replace(/^(tpl-\d{3}).*\.json$/, "$1");
+        expect(tpl.id).toBe(prefix);
+      });
+
+      it("workflowJson.nodes is a non-empty array", () => {
+        expect(Array.isArray(tpl.workflowJson.nodes)).toBe(true);
+        expect(tpl.workflowJson.nodes.length).toBeGreaterThan(0);
+      });
+
+      it("workflowJson.edges is an array", () => {
+        expect(Array.isArray(tpl.workflowJson.edges)).toBe(true);
+      });
+
+      it('every node has type === "workflow"', () => {
+        // CRITICAL: ReactFlow custom component is registered under "workflow"
+        for (const node of tpl.workflowJson.nodes) {
+          expect(node.type, `Node ${node.id} has wrong type: ${node.type}`).toBe("workflow");
+        }
+      });
+
+      it("every node has data.nodeType in the known set", () => {
+        for (const node of tpl.workflowJson.nodes) {
+          expect(
+            KNOWN_NODE_TYPES.has(node.data.nodeType),
+            `Unknown nodeType: ${node.data.nodeType} on node ${node.id}`
+          ).toBe(true);
+        }
+      });
+
+      it("every edge source and target reference existing node IDs", () => {
+        const nodeIds = new Set(tpl.workflowJson.nodes.map((n: any) => n.id));
+        for (const edge of tpl.workflowJson.edges) {
+          expect(nodeIds.has(edge.source), `edge.source "${edge.source}" not found`).toBe(true);
+          expect(nodeIds.has(edge.target), `edge.target "${edge.target}" not found`).toBe(true);
+        }
+      });
+
+      it("has at least one trigger node", () => {
+        const hasTrigger = tpl.workflowJson.nodes.some(
+          (n: any) => TRIGGER_NODE_TYPES.has(n.data.nodeType)
+        );
+        expect(hasTrigger).toBe(true);
+      });
+
+      it("stepCount === workflowJson.nodes.length", () => {
+        expect(tpl.stepCount).toBe(tpl.workflowJson.nodes.length);
+      });
+
+      it("category is one of the 15 defined categories", () => {
+        expect(KNOWN_CATEGORIES).toContain(tpl.category);
+      });
+
+      it("no node config value contains a real-looking API key", () => {
+        // Rejects strings of 32+ alphanumeric chars that look like real secrets
+        const configStr = JSON.stringify(tpl.workflowJson.nodes.map((n: any) => n.data.config));
+        expect(configStr).not.toMatch(/[A-Za-z0-9]{32,}/);
+      });
+    });
+  });
+});
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-001-daily-sales-report.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-001-daily-sales-report.json
new file mode 100644
index 0000000..c18d763
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-001-daily-sales-report.json
@@ -0,0 +1,101 @@
+{
+  "id": "tpl-001",
+  "name": "Daily Sales Report",
+  "description": "Automatically queries yesterday's orders from the database each morning, analyzes performance against weekly and monthly targets using AI, and emails a formatted summary report to management. Designed for e-commerce stores and B2B sales teams who need daily visibility without manual reporting effort.",
+  "category": "Sales & Marketing",
+  "industry": ["E-commerce", "Retail"],
+  "tags": ["scheduled", "reporting", "email", "sales", "database", "analytics", "beginner"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 20,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every morning at 7 AM",
+          "config": {
+            "schedule": "0 7 * * *",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Query yesterday's orders",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT o.id, o.total_amount, o.status, p.name AS product_name, c.email AS customer_email FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id JOIN customers c ON o.customer_id = c.id WHERE o.created_at >= CURRENT_DATE - INTERVAL '1 day' AND o.created_at < CURRENT_DATE ORDER BY o.total_amount DESC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "transformer",
+          "label": "Compute totals and top sellers",
+          "config": {
+            "expression": "{ totalRevenue: sum(input, 'total_amount'), orderCount: len(input), topProducts: groupBy(input, 'product_name') | sortDesc('total_amount') | take(5) }"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate performance analysis",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a business analyst for an e-commerce company.\nAnalyze the following daily sales data and provide a concise performance summary.\n\nData:\n- Total Revenue: {{totalRevenue}}\n- Order Count: {{orderCount}}\n- Top Products: {{topProducts}}\n\nInclude:\n1. Revenue trend vs. yesterday\n2. Top-performing product category\n3. Any anomalies or patterns worth noting\n4. One actionable recommendation\n\nKeep the tone professional and data-driven. Format as bullet points."
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format HTML email report",
+          "config": {
+            "template": "<h2>Daily Sales Report - {{date}}</h2><p><strong>Total Revenue:</strong> ${{totalRevenue}}</p><p><strong>Orders:</strong> {{orderCount}}</p><h3>Top Products</h3><ul>{{#each topProducts}}<li>{{this.name}}: ${{this.revenue}}</li>{{/each}}</ul><h3>AI Analysis</h3><p>{{aiAnalysis}}</p>"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email report to management",
+          "config": {
+            "to": ["ceo@company.com", "sales-manager@company.com"],
+            "subject": "Daily Sales Report - {{date}}",
+            "body": "{{emailBody}}",
+            "from": "noreply@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-002-customer-review-response.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-002-customer-review-response.json
new file mode 100644
index 0000000..afa2e82
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-002-customer-review-response.json
@@ -0,0 +1,144 @@
+{
+  "id": "tpl-002",
+  "name": "Customer Review Auto-Response",
+  "description": "Listens for new customer reviews via webhook, fetches the full review details, uses AI to draft a professional and empathetic response, and routes it through an approval gate before posting. Negative reviews are flagged for manual intervention. Ideal for retail and hospitality businesses managing reviews across multiple platforms.",
+  "category": "Sales & Marketing",
+  "industry": ["Retail", "Hospitality"],
+  "tags": ["webhook", "ai-response", "reviews", "approval", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "webhook_trigger",
+          "label": "Receive new review notification",
+          "config": {
+            "path": "/webhooks/reviews",
+            "method": "POST",
+            "secret": "{{secrets.REVIEW_WEBHOOK_SECRET}}"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch full review from platform API",
+          "config": {
+            "method": "GET",
+            "url": "https://api.reviews-platform.com/v2/reviews/{{reviewId}}",
+            "headers": {
+              "Authorization": "Bearer {{secrets.REVIEWS_API_KEY}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Draft empathetic review response",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a customer service representative for a {{businessType}} business.\nDraft a professional, empathetic response to the following customer review.\n\nReview Rating: {{rating}}/5\nReview Text: {{reviewText}}\nCustomer Name: {{customerName}}\n\nGuidelines:\n- If rating >= 4: Thank them warmly, highlight what they enjoyed\n- If rating <= 3: Apologize sincerely, acknowledge their specific concern\n- Always invite them back\n- Keep response under 150 words\n- Do NOT offer discounts or freebies (manager approval needed for that)\n- Sign off as the Customer Experience Team"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Extract sentiment and response text",
+          "config": {
+            "format": "json",
+            "schema": {
+              "sentiment": "positive | neutral | negative",
+              "responseText": "string",
+              "flagForManager": "boolean"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Check if negative sentiment",
+          "config": {
+            "condition": "sentiment === 'negative' || rating <= 2",
+            "trueLabel": "Needs manager review",
+            "falseLabel": "Auto-approve"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Manager approves response before posting",
+          "config": {
+            "assignTo": "cs-manager@company.com",
+            "timeoutHours": 12,
+            "message": "Please review the AI-drafted response for a {{rating}}-star review from {{customerName}}"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Post approved response to review platform",
+          "config": {
+            "method": "POST",
+            "url": "https://api.reviews-platform.com/v2/reviews/{{reviewId}}/reply",
+            "headers": {
+              "Authorization": "Bearer {{secrets.REVIEWS_API_KEY}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "text": "{{responseText}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Log response in review history table",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO review_responses (review_id, platform, rating, sentiment, response_text, approved_by, responded_at) VALUES ('{{reviewId}}', '{{platform}}', {{rating}}, '{{sentiment}}', '{{responseText}}', '{{approvedBy}}', NOW())"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-003-lead-scoring-routing.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-003-lead-scoring-routing.json
new file mode 100644
index 0000000..e372a80
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-003-lead-scoring-routing.json
@@ -0,0 +1,159 @@
+{
+  "id": "tpl-003",
+  "name": "Lead Scoring and Routing",
+  "description": "Receives inbound leads via webhook from landing pages or ad platforms, validates the data, enriches the lead profile using a RAG knowledge base of ideal customer profiles, and uses AI to assign a score from 0-100. Based on the score, leads are automatically routed to the appropriate sales team or nurture sequence in the CRM. Built for SaaS, real estate, and insurance companies with high lead volumes.",
+  "category": "Sales & Marketing",
+  "industry": ["SaaS", "Real Estate", "Insurance"],
+  "tags": ["webhook", "lead-scoring", "crm", "routing", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "webhook_trigger",
+          "label": "Receive new lead from landing page",
+          "config": {
+            "path": "/webhooks/leads/inbound",
+            "method": "POST",
+            "secret": "{{secrets.LEAD_WEBHOOK_SECRET}}"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "validator",
+          "label": "Validate lead has email and company",
+          "config": {
+            "rules": {
+              "email": { "type": "string", "format": "email", "required": true },
+              "companyName": { "type": "string", "minLength": 1, "required": true },
+              "fullName": { "type": "string", "required": true },
+              "phone": { "type": "string", "required": false }
+            },
+            "onFailure": "reject"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Lookup ideal customer profile matches",
+          "config": {
+            "collection": "ideal-customer-profiles",
+            "query": "Company: {{companyName}}, Industry: {{industry}}, Size: {{companySize}}, Role: {{jobTitle}}",
+            "topK": 5,
+            "scoreThreshold": 0.7
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Score lead fit from 0 to 100",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a lead scoring specialist.\nScore this lead from 0-100 based on fit with our ideal customer profile.\n\nLead Info:\n- Name: {{fullName}}\n- Email: {{email}}\n- Company: {{companyName}}\n- Job Title: {{jobTitle}}\n- Company Size: {{companySize}}\n- Industry: {{industry}}\n- Source: {{leadSource}}\n\nICP Matches from knowledge base:\n{{ragResults}}\n\nScoring criteria:\n- 80-100: Enterprise buyer, decision maker, matching industry\n- 60-79: Mid-market, influencer role, adjacent industry\n- 40-59: SMB, unclear authority, partial fit\n- 0-39: Poor fit, personal email, no company info\n\nReturn JSON: { \"score\": number, \"tier\": \"hot|warm|cold\", \"reason\": \"string\" }"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse score, tier, and reason",
+          "config": {
+            "format": "json",
+            "schema": {
+              "score": "number (0-100)",
+              "tier": "hot | warm | cold",
+              "reason": "string"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Create or update lead in CRM",
+          "config": {
+            "method": "POST",
+            "url": "https://api.hubspot.com/crm/v3/objects/contacts",
+            "headers": {
+              "Authorization": "Bearer {{secrets.HUBSPOT_API_KEY}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "properties": {
+                "email": "{{email}}",
+                "firstname": "{{firstName}}",
+                "lastname": "{{lastName}}",
+                "company": "{{companyName}}",
+                "lead_score": "{{score}}",
+                "lead_tier": "{{tier}}"
+              }
+            }
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route lead by tier",
+          "config": {
+            "expression": "tier",
+            "cases": {
+              "hot": "Assign to senior AE immediately",
+              "warm": "Add to nurture sequence",
+              "cold": "Add to marketing drip campaign"
+            },
+            "default": "Add to general pool"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify sales team of new scored lead",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_SALES_WEBHOOK_URL}}",
+            "message": "New {{tier}} lead (score: {{score}}): {{fullName}} from {{companyName}}.\nReason: {{reason}}\nCRM link: https://app.hubspot.com/contacts/{{contactId}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-004-product-description-generator.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-004-product-description-generator.json
new file mode 100644
index 0000000..08320ca
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-004-product-description-generator.json
@@ -0,0 +1,152 @@
+{
+  "id": "tpl-004",
+  "name": "Product Description Generator",
+  "description": "Triggered when a new product is added to the catalog, this workflow simultaneously generates optimized descriptions for three channels: the company website, marketplace listings (e.g., Shopee/Amazon), and social media (Instagram). After the content team approves the drafts, they are saved to the product database and a notification is sent. Ideal for e-commerce teams managing multi-channel product content at scale.",
+  "category": "Sales & Marketing",
+  "industry": ["E-commerce", "Retail"],
+  "tags": ["ai-content", "e-commerce", "parallel", "approval", "intermediate"],
+  "stepCount": 10,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 350 },
+        "data": {
+          "nodeType": "event_trigger",
+          "label": "New product added to catalog",
+          "config": {
+            "eventName": "product.created",
+            "source": "catalog-service"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 350 },
+        "data": {
+          "nodeType": "prompt_template",
+          "label": "Build content generation prompt",
+          "config": {
+            "template": "Product: {{productName}}\nCategory: {{category}}\nKey Specs: {{specs}}\nTarget Audience: {{targetAudience}}\nBrand Voice: {{brandVoice}}\nPrice Point: {{priceRange}}"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 350 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Generate descriptions for all platforms",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-3a",
+        "type": "workflow",
+        "position": { "x": 850, "y": 125 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Write website product description",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "Write a detailed product description for the company website (150-200 words).\nUse the following product details:\n{{input}}\n\nGuidelines:\n- Lead with the primary benefit, not the feature\n- Include 3-4 key features with brief explanations\n- Mention the ideal use case or target user\n- End with a clear call-to-action\n- Tone: professional yet approachable\n- Do NOT include pricing"
+          }
+        }
+      },
+      {
+        "id": "node-3b",
+        "type": "workflow",
+        "position": { "x": 850, "y": 350 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Write marketplace listing description",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "Write a marketplace product listing optimized for Shopee/Amazon.\nProduct details: {{input}}\n\nFormat:\n- Title: Under 200 characters, keyword-rich\n- 5 bullet points highlighting key features\n- Short description (under 100 words)\n\nOptimize for:\n- Mobile readability\n- Search keywords relevant to {{category}}\n- Conversion-focused language"
+          }
+        }
+      },
+      {
+        "id": "node-3c",
+        "type": "workflow",
+        "position": { "x": 850, "y": 575 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Write Instagram caption with hashtags",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "Write an engaging Instagram caption for a new product post.\nProduct details: {{input}}\n\nRequirements:\n- Caption: Under 125 words, conversational and enthusiastic\n- Include a question to drive engagement\n- Add 10-15 relevant hashtags\n- Include one emoji per sentence maximum\n- End with a call-to-action (link in bio, shop now, etc.)"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 350 },
+        "data": {
+          "nodeType": "join",
+          "label": "Collect all platform descriptions",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 350 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Content team reviews all drafts",
+          "config": {
+            "assignTo": "{{env.CONTENT_TEAM_EMAIL}}",
+            "timeoutHours": 24,
+            "message": "New product descriptions ready for review: {{productName}}. Please review website, marketplace, and social media drafts."
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 350 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Save approved descriptions to product table",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "UPDATE products SET website_description = '{{websiteDesc}}', marketplace_description = '{{marketplaceDesc}}', social_caption = '{{socialCaption}}', descriptions_approved_at = NOW() WHERE id = '{{productId}}'"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 350 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify team descriptions are live",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_CONTENT_WEBHOOK_URL}}",
+            "message": "Product descriptions approved and saved for {{productName}} (ID: {{productId}}). Ready to publish across all channels."
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3a", "source": "node-3", "target": "node-3a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3b", "source": "node-3", "target": "node-3b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3c", "source": "node-3", "target": "node-3c", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3a-4", "source": "node-3a", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3b-4", "source": "node-3b", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3c-4", "source": "node-3c", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-005-competitor-price-monitor.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-005-competitor-price-monitor.json
new file mode 100644
index 0000000..f075dc6
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-005-competitor-price-monitor.json
@@ -0,0 +1,148 @@
+{
+  "id": "tpl-005",
+  "name": "Competitor Price Monitor",
+  "description": "Runs on a daily schedule to check competitor pricing across tracked products. For each competitor URL in the database, it fetches the current page, uses AI to extract the price, and stores the result. Products with significant price changes are filtered and flagged, triggering notifications to the pricing team. Essential for e-commerce and retail businesses operating in competitive markets.",
+  "category": "Sales & Marketing",
+  "industry": ["E-commerce", "Retail"],
+  "tags": ["scheduled", "monitoring", "pricing", "scraping", "advanced"],
+  "stepCount": 9,
+  "estimatedSetupMinutes": 45,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run daily at 6 AM",
+          "config": {
+            "schedule": "0 6 * * *",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch all tracked competitor product URLs",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT cp.id, cp.product_name, cp.competitor_name, cp.competitor_url, cp.our_price, cp.last_competitor_price FROM competitor_products cp WHERE cp.is_active = true ORDER BY cp.product_name"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Iterate over each competitor product",
+          "config": {
+            "collection": "{{products}}",
+            "itemVariable": "product",
+            "maxIterations": 200
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch competitor product page",
+          "config": {
+            "method": "GET",
+            "url": "{{product.competitor_url}}",
+            "headers": {
+              "User-Agent": "Mozilla/5.0 (compatible; PriceBot/1.0)"
+            },
+            "timeout": 15000
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Extract current price from page HTML",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "Extract the product price from this HTML content.\nProduct name to look for: {{product.product_name}}\nCompetitor: {{product.competitor_name}}\n\nHTML content (truncated):\n{{pageContent}}\n\nReturn ONLY a JSON object:\n{ \"price\": number, \"currency\": \"USD\"|\"EUR\"|\"THB\", \"inStock\": boolean }\n\nIf the price cannot be found, return:\n{ \"price\": null, \"currency\": null, \"inStock\": null }"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Store updated price in price history",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO competitor_price_history (competitor_product_id, price, currency, in_stock, checked_at) VALUES ('{{product.id}}', {{extractedPrice}}, '{{currency}}', {{inStock}}, NOW()); UPDATE competitor_products SET last_competitor_price = {{extractedPrice}}, last_checked_at = NOW() WHERE id = '{{product.id}}'"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Filter products with price drop over 5%",
+          "config": {
+            "condition": "Math.abs(item.extractedPrice - item.last_competitor_price) / item.last_competitor_price > 0.05",
+            "keepMatching": true
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Check if any significant changes found",
+          "config": {
+            "condition": "filteredResults.length > 0",
+            "trueLabel": "Send alert",
+            "falseLabel": "Skip notification"
+          }
+        }
+      },
+      {
+        "id": "node-9",
+        "type": "workflow",
+        "position": { "x": 2100, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert pricing team of significant changes",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_PRICING_WEBHOOK_URL}}",
+            "message": "Price Alert: {{filteredResults.length}} competitor price changes detected (>5% change).\n\n{{#each filteredResults}}{{this.product_name}} ({{this.competitor_name}}): was ${{this.last_competitor_price}} -> now ${{this.extractedPrice}}\n{{/each}}\n\nReview in dashboard: {{env.APP_URL}}/pricing/monitor"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e8-9", "source": "node-8", "target": "node-9", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-006-meeting-summary-distribution.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-006-meeting-summary-distribution.json
new file mode 100644
index 0000000..114a369
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-006-meeting-summary-distribution.json
@@ -0,0 +1,116 @@
+{
+  "id": "tpl-006",
+  "name": "Meeting Summary Distribution",
+  "description": "After a meeting, paste the raw notes or transcript into a simple form. AI generates a structured summary with action items, key decisions, and next steps. The summary is simultaneously emailed to all attendees and posted to the team Slack channel. Perfect for professional services firms and enterprise teams who need consistent meeting documentation without manual effort.",
+  "category": "Sales & Marketing",
+  "industry": ["Professional Services", "Enterprise"],
+  "tags": ["form", "ai-summary", "meetings", "slack", "email", "beginner"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 15,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 275 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Enter meeting notes and attendees",
+          "config": {
+            "fields": [
+              { "name": "meetingTitle", "type": "text", "label": "Meeting Title", "required": true },
+              { "name": "attendees", "type": "text", "label": "Attendee Emails (comma-separated)", "required": true },
+              { "name": "rawNotes", "type": "textarea", "label": "Paste meeting notes or transcript", "required": true },
+              { "name": "meetingDate", "type": "date", "label": "Meeting Date", "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 275 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate structured meeting summary",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a professional executive assistant.\nSummarize the following meeting notes into a structured format.\n\nMeeting: {{meetingTitle}}\nDate: {{meetingDate}}\nAttendees: {{attendees}}\n\nRaw Notes:\n{{rawNotes}}\n\nOutput the summary in this exact structure:\n1. MEETING OVERVIEW (2-3 sentences)\n2. KEY DECISIONS (bullet points)\n3. ACTION ITEMS (who, what, by when)\n4. OPEN QUESTIONS (items needing follow-up)\n5. NEXT MEETING (suggested date/agenda if mentioned)\n\nBe concise but thorough. Use the attendees' names when assigning action items."
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 275 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse summary sections and action items",
+          "config": {
+            "format": "structured",
+            "schema": {
+              "overview": "string",
+              "keyDecisions": "string[]",
+              "actionItems": "{ assignee: string, task: string, dueDate: string }[]",
+              "openQuestions": "string[]",
+              "nextMeeting": "string"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 275 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Distribute via email and Slack",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-4a",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 125 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email summary to all attendees",
+          "config": {
+            "to": "{{attendees}}",
+            "subject": "Meeting Summary: {{meetingTitle}} - {{meetingDate}}",
+            "body": "Hi team,\n\nHere is the summary from our meeting.\n\n{{formattedSummary}}\n\nPlease review your action items and update the team on progress.\n\nBest regards,\nAutomated Meeting Assistant",
+            "from": "meetings@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-4b",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 425 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Post summary to Slack channel",
+          "config": {
+            "method": "POST",
+            "url": "{{env.SLACK_WEBHOOK_URL}}",
+            "headers": {
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "text": "Meeting Summary: *{{meetingTitle}}* ({{meetingDate}})\n\n{{formattedSummary}}"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-4a", "source": "node-4", "target": "node-4a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-4b", "source": "node-4", "target": "node-4b", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-007-personalized-newsletter.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-007-personalized-newsletter.json
new file mode 100644
index 0000000..310e7b7
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-007-personalized-newsletter.json
@@ -0,0 +1,144 @@
+{
+  "id": "tpl-007",
+  "name": "Personalized Weekly Newsletter",
+  "description": "Runs every Friday to generate personalized newsletter content for each subscriber segment. Subscribers are fetched from the database and processed in batches. For each batch, a RAG query retrieves relevant articles based on subscriber interests, then a customized email is assembled and sent. Engagement metrics are tracked for continuous optimization. Built for media companies and SaaS platforms with large subscriber bases.",
+  "category": "Sales & Marketing",
+  "industry": ["Media", "SaaS"],
+  "tags": ["scheduled", "newsletter", "personalization", "email", "advanced"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 40,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every Friday at 9 AM",
+          "config": {
+            "schedule": "0 9 * * 5",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch active subscribers with preferences",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT s.id, s.email, s.first_name, s.interests, s.preferred_frequency, s.last_sent_at FROM subscribers s WHERE s.is_active = true AND s.preferred_frequency IN ('weekly', 'all') AND (s.last_sent_at IS NULL OR s.last_sent_at < CURRENT_DATE - INTERVAL '6 days') ORDER BY s.last_sent_at ASC NULLS FIRST"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "batch",
+          "label": "Batch subscribers into groups of 50",
+          "config": {
+            "batchSize": 50,
+            "collection": "{{subscribers}}"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each subscriber in batch",
+          "config": {
+            "collection": "{{batch}}",
+            "itemVariable": "subscriber",
+            "maxIterations": 50
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Find articles matching subscriber interests",
+          "config": {
+            "collection": "published-articles",
+            "query": "Find the top 5 most relevant articles for a reader interested in: {{subscriber.interests}}. Prioritize articles published in the last 7 days.",
+            "topK": 5,
+            "filter": {
+              "publishedAfter": "{{sevenDaysAgo}}",
+              "status": "published"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Render personalized newsletter HTML",
+          "config": {
+            "template": "<h1>Your Weekly Digest, {{subscriber.first_name}}</h1><p>Here are this week's top picks based on your interests:</p>{{#each articles}}<div style='margin-bottom:16px'><h3><a href='{{this.url}}'>{{this.title}}</a></h3><p>{{this.excerpt}}</p></div>{{/each}}<hr><p style='font-size:12px'><a href='{{unsubscribeUrl}}'>Unsubscribe</a> | <a href='{{preferencesUrl}}'>Update preferences</a></p>"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send personalized newsletter email",
+          "config": {
+            "to": "{{subscriber.email}}",
+            "subject": "Your Weekly Digest - {{weekLabel}}",
+            "body": "{{newsletterHtml}}",
+            "from": "newsletter@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}",
+            "replyTo": "hello@company.com"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "metrics_collector",
+          "label": "Track newsletter send metrics",
+          "config": {
+            "metrics": {
+              "newsletter_sent_total": { "type": "counter", "increment": 1 },
+              "newsletter_batch_size": { "type": "gauge", "value": "{{batchSize}}" },
+              "newsletter_processing_time_ms": { "type": "histogram", "value": "{{elapsedMs}}" }
+            },
+            "labels": {
+              "frequency": "weekly",
+              "date": "{{today}}"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-008-quote-approval-workflow.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-008-quote-approval-workflow.json
new file mode 100644
index 0000000..6fd5ca3
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-008-quote-approval-workflow.json
@@ -0,0 +1,134 @@
+{
+  "id": "tpl-008",
+  "name": "Quote Approval Workflow",
+  "description": "Sales reps submit quotes through a structured form. The quote amount is validated and routed through different approval tiers based on value: small quotes auto-approve, medium quotes go to the sales manager, and large quotes require VP approval. Once approved, a confirmation email is sent to the client and the quote status is updated in the database. Designed for professional services and construction companies with tiered pricing authority.",
+  "category": "Sales & Marketing",
+  "industry": ["Professional Services", "Construction"],
+  "tags": ["form", "approval", "quotes", "email", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Sales rep submits new quote",
+          "config": {
+            "fields": [
+              { "name": "clientName", "type": "text", "label": "Client Name", "required": true },
+              { "name": "clientEmail", "type": "email", "label": "Client Email", "required": true },
+              { "name": "projectDescription", "type": "textarea", "label": "Project Description", "required": true },
+              { "name": "quoteAmount", "type": "number", "label": "Quote Amount (USD)", "required": true },
+              { "name": "validUntil", "type": "date", "label": "Quote Valid Until", "required": true },
+              { "name": "salesRepEmail", "type": "email", "label": "Sales Rep Email", "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "validator",
+          "label": "Validate quote amount and dates",
+          "config": {
+            "rules": {
+              "quoteAmount": { "type": "number", "min": 100, "required": true },
+              "clientEmail": { "type": "string", "format": "email", "required": true },
+              "validUntil": { "type": "string", "format": "date", "required": true }
+            },
+            "onFailure": "reject"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route by quote amount tier",
+          "config": {
+            "expression": "quoteAmount",
+            "cases": {
+              "under_5k": { "condition": "quoteAmount < 5000", "label": "Auto-approve (< $5K)" },
+              "5k_to_50k": { "condition": "quoteAmount >= 5000 && quoteAmount < 50000", "label": "Sales Manager approval ($5K-$50K)" },
+              "over_50k": { "condition": "quoteAmount >= 50000", "label": "VP approval (>= $50K)" }
+            }
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Approver reviews and decides",
+          "config": {
+            "assignTo": "{{approverEmail}}",
+            "timeoutHours": 48,
+            "message": "Quote #{{quoteId}} for {{clientName}} requires your approval.\nAmount: ${{quoteAmount}}\nProject: {{projectDescription}}\nSubmitted by: {{salesRepEmail}}"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Check if quote was approved",
+          "config": {
+            "condition": "approvalStatus === 'approved'",
+            "trueLabel": "Send to client",
+            "falseLabel": "Notify sales rep of rejection"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send quote confirmation to client",
+          "config": {
+            "to": "{{clientEmail}}",
+            "cc": ["{{salesRepEmail}}"],
+            "subject": "Your Quote from {{companyName}} - #{{quoteId}}",
+            "body": "Dear {{clientName}},\n\nThank you for your interest. Please find your quote details below:\n\nProject: {{projectDescription}}\nAmount: ${{quoteAmount}}\nValid Until: {{validUntil}}\n\nTo accept this quote, please reply to this email or contact {{salesRepEmail}}.\n\nBest regards,\n{{companyName}} Sales Team",
+            "from": "quotes@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Update quote status in database",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "UPDATE quotes SET status = '{{approvalStatus}}', approved_by = '{{approverEmail}}', approved_at = NOW(), sent_to_client_at = CASE WHEN '{{approvalStatus}}' = 'approved' THEN NOW() ELSE NULL END WHERE id = '{{quoteId}}'"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-009-resume-screening-scoring.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-009-resume-screening-scoring.json
new file mode 100644
index 0000000..cd988c3
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-009-resume-screening-scoring.json
@@ -0,0 +1,141 @@
+{
+  "id": "tpl-009",
+  "name": "Resume Screening and Scoring",
+  "description": "When a recruiter uploads a resume file (PDF or DOCX), the workflow extracts the text content, builds a structured evaluation prompt based on the job requirements, and uses AI to score the candidate on technical skills, experience, and cultural fit. High-scoring candidates are automatically flagged for interview, while lower scores are logged for review. Saves recruiting teams hours of manual resume screening per open position.",
+  "category": "HR & People",
+  "industry": ["Recruiting", "Enterprise"],
+  "tags": ["file-upload", "ai-screening", "hr", "recruiting", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "file_upload_trigger",
+          "label": "Recruiter uploads resume file",
+          "config": {
+            "acceptedTypes": [".pdf", ".docx", ".doc", ".txt"],
+            "maxSizeMB": 10,
+            "storagePrefix": "resumes/"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "read_file",
+          "label": "Extract text from resume document",
+          "config": {
+            "filePath": "{{uploadedFilePath}}",
+            "encoding": "utf-8",
+            "parser": "auto"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "prompt_template",
+          "label": "Build evaluation prompt with job criteria",
+          "config": {
+            "template": "RESUME TEXT:\n{{resumeText}}\n\nJOB REQUIREMENTS:\n- Position: {{jobTitle}}\n- Department: {{department}}\n- Required Skills: {{requiredSkills}}\n- Minimum Experience: {{minYearsExperience}} years\n- Education: {{requiredEducation}}\n- Nice to Have: {{preferredSkills}}\n\nEvaluate this candidate against the requirements above."
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "AI scores candidate on fit criteria",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are an experienced technical recruiter.\nEvaluate the following candidate resume against the job requirements.\n\n{{evaluationPrompt}}\n\nScore each category from 0-100:\n1. Technical Skills Match\n2. Years of Relevant Experience\n3. Education Fit\n4. Communication Quality (based on resume writing)\n5. Overall Recommendation\n\nReturn JSON:\n{\n  \"candidateName\": \"extracted from resume\",\n  \"technicalScore\": number,\n  \"experienceScore\": number,\n  \"educationScore\": number,\n  \"communicationScore\": number,\n  \"overallScore\": number,\n  \"recommendation\": \"strong_yes | yes | maybe | no\",\n  \"summary\": \"2-3 sentence assessment\",\n  \"keyStrengths\": [\"string\"],\n  \"concerns\": [\"string\"]\n}"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse scoring results and recommendation",
+          "config": {
+            "format": "json",
+            "schema": {
+              "candidateName": "string",
+              "technicalScore": "number",
+              "experienceScore": "number",
+              "educationScore": "number",
+              "communicationScore": "number",
+              "overallScore": "number",
+              "recommendation": "strong_yes | yes | maybe | no",
+              "summary": "string",
+              "keyStrengths": "string[]",
+              "concerns": "string[]"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Check if candidate qualifies for interview",
+          "config": {
+            "condition": "overallScore >= 70 && (recommendation === 'strong_yes' || recommendation === 'yes')",
+            "trueLabel": "Schedule interview",
+            "falseLabel": "Archive for future"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify hiring manager of qualified candidate",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_HIRING_WEBHOOK_URL}}",
+            "message": "New qualified candidate for {{jobTitle}}!\n\nCandidate: {{candidateName}}\nOverall Score: {{overallScore}}/100\nRecommendation: {{recommendation}}\n\nSummary: {{summary}}\n\nStrengths: {{keyStrengths}}\nConcerns: {{concerns}}\n\nResume: {{resumeFileUrl}}"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Save screening results to candidates table",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO candidate_screenings (job_id, candidate_name, resume_file_url, technical_score, experience_score, education_score, communication_score, overall_score, recommendation, summary, screened_at) VALUES ('{{jobId}}', '{{candidateName}}', '{{resumeFileUrl}}', {{technicalScore}}, {{experienceScore}}, {{educationScore}}, {{communicationScore}}, {{overallScore}}, '{{recommendation}}', '{{summary}}', NOW())"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-010-employee-onboarding.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-010-employee-onboarding.json
new file mode 100644
index 0000000..50efdb7
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-010-employee-onboarding.json
@@ -0,0 +1,236 @@
+{
+  "id": "tpl-010",
+  "name": "Employee Onboarding Process",
+  "description": "Triggered when a new hire is confirmed, this workflow collects employee details via a form, then simultaneously provisions accounts across multiple systems (HR platform, email/Google Workspace, project management tool) and sends a welcome email. After a configurable waiting period, it sends a first-week check-in email, then another follow-up at the end of the first month. Designed for enterprise and SME organizations that need consistent, automated onboarding across departments.",
+  "category": "HR & People",
+  "industry": ["Enterprise", "SME"],
+  "tags": ["event", "onboarding", "hr", "parallel", "advanced"],
+  "stepCount": 12,
+  "estimatedSetupMinutes": 45,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 350 },
+        "data": {
+          "nodeType": "event_trigger",
+          "label": "New hire confirmed in HR system",
+          "config": {
+            "eventName": "employee.hired",
+            "source": "hr-platform"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 350 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Collect new employee details",
+          "config": {
+            "fields": [
+              { "name": "fullName", "type": "text", "label": "Full Name", "required": true },
+              { "name": "personalEmail", "type": "email", "label": "Personal Email", "required": true },
+              { "name": "department", "type": "select", "label": "Department", "options": ["Engineering", "Sales", "Marketing", "Operations", "Finance", "HR"], "required": true },
+              { "name": "jobTitle", "type": "text", "label": "Job Title", "required": true },
+              { "name": "startDate", "type": "date", "label": "Start Date", "required": true },
+              { "name": "managerEmail", "type": "email", "label": "Manager Email", "required": true },
+              { "name": "officeLocation", "type": "select", "label": "Office Location", "options": ["HQ", "Remote", "Branch-A", "Branch-B"], "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 350 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Provision accounts and send welcome email",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-3a",
+        "type": "workflow",
+        "position": { "x": 850, "y": 50 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Create account in HR platform (BambooHR)",
+          "config": {
+            "method": "POST",
+            "url": "https://api.bamboohr.com/api/gateway.php/{{env.BAMBOOHR_DOMAIN}}/v1/employees",
+            "headers": {
+              "Authorization": "Basic {{secrets.BAMBOOHR_API_KEY}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "firstName": "{{firstName}}",
+              "lastName": "{{lastName}}",
+              "department": "{{department}}",
+              "jobTitle": "{{jobTitle}}",
+              "hireDate": "{{startDate}}",
+              "workEmail": "{{workEmail}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-3b",
+        "type": "workflow",
+        "position": { "x": 850, "y": 225 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Create Google Workspace account",
+          "config": {
+            "method": "POST",
+            "url": "https://admin.googleapis.com/admin/directory/v1/users",
+            "headers": {
+              "Authorization": "Bearer {{secrets.GOOGLE_ADMIN_TOKEN}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "primaryEmail": "{{workEmail}}",
+              "name": {
+                "givenName": "{{firstName}}",
+                "familyName": "{{lastName}}"
+              },
+              "orgUnitPath": "/{{department}}",
+              "password": "{{tempPassword}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-3c",
+        "type": "workflow",
+        "position": { "x": 850, "y": 400 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Add to project management tool (Asana)",
+          "config": {
+            "method": "POST",
+            "url": "https://app.asana.com/api/1.0/workspaces/{{env.ASANA_WORKSPACE_ID}}/addUser",
+            "headers": {
+              "Authorization": "Bearer {{secrets.ASANA_API_TOKEN}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "data": {
+                "user": "{{workEmail}}"
+              }
+            }
+          }
+        }
+      },
+      {
+        "id": "node-3d",
+        "type": "workflow",
+        "position": { "x": 850, "y": 575 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send welcome email to new hire",
+          "config": {
+            "to": "{{personalEmail}}",
+            "cc": ["{{managerEmail}}", "hr@company.com"],
+            "subject": "Welcome to {{companyName}}, {{firstName}}!",
+            "body": "Dear {{firstName}},\n\nWelcome to {{companyName}}! We are thrilled to have you join the {{department}} team as {{jobTitle}}.\n\nYour start date: {{startDate}}\nOffice: {{officeLocation}}\nManager: {{managerName}} ({{managerEmail}})\n\nBefore your first day:\n1. Your work email ({{workEmail}}) will be ready 24 hours before start\n2. Check your inbox for account setup instructions\n3. Review the employee handbook attached\n\nIf you have any questions, reach out to hr@company.com.\n\nSee you soon!\nThe HR Team",
+            "from": "onboarding@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 350 },
+        "data": {
+          "nodeType": "join",
+          "label": "Wait for all provisioning to complete",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 350 },
+        "data": {
+          "nodeType": "wait",
+          "label": "Wait until end of first week",
+          "config": {
+            "duration": "7d",
+            "resumeAt": "{{startDate + 7 days}}"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 350 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send first-week check-in email",
+          "config": {
+            "to": "{{workEmail}}",
+            "cc": ["{{managerEmail}}"],
+            "subject": "How was your first week, {{firstName}}?",
+            "body": "Hi {{firstName}},\n\nCongratulations on completing your first week at {{companyName}}!\n\nWe would love to hear how things are going:\n- Were you able to access all your tools and systems?\n- Did you have a chance to meet your team?\n- Is there anything you need help with?\n\nPlease take 2 minutes to fill out this quick survey: {{env.APP_URL}}/onboarding/survey/week-1/{{employeeId}}\n\nYour manager {{managerName}} is also available if you need anything.\n\nBest,\nThe HR Team",
+            "from": "onboarding@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 350 },
+        "data": {
+          "nodeType": "wait",
+          "label": "Wait until end of first month",
+          "config": {
+            "duration": "23d",
+            "resumeAt": "{{startDate + 30 days}}"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 2100, "y": 350 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send 30-day onboarding completion email",
+          "config": {
+            "to": "{{workEmail}}",
+            "cc": ["{{managerEmail}}", "hr@company.com"],
+            "subject": "Your First Month at {{companyName}} - Onboarding Complete!",
+            "body": "Hi {{firstName}},\n\nYou have officially completed your first month at {{companyName}}! Here is a quick recap:\n\nDepartment: {{department}}\nRole: {{jobTitle}}\nManager: {{managerName}}\n\nNext steps:\n1. Schedule your 30-day review with {{managerName}}\n2. Complete any remaining compliance training\n3. Update your profile and goals in the HR portal\n\nOnboarding survey (5 min): {{env.APP_URL}}/onboarding/survey/month-1/{{employeeId}}\n\nWe are glad to have you on the team!\n\nBest regards,\nThe HR Team",
+            "from": "onboarding@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3a", "source": "node-3", "target": "node-3a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3b", "source": "node-3", "target": "node-3b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3c", "source": "node-3", "target": "node-3c", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3d", "source": "node-3", "target": "node-3d", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3a-4", "source": "node-3a", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3b-4", "source": "node-3b", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3c-4", "source": "node-3c", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3d-4", "source": "node-3d", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-011-leave-request-approval.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-011-leave-request-approval.json
new file mode 100644
index 0000000..8835016
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-011-leave-request-approval.json
@@ -0,0 +1,177 @@
+{
+  "id": "tpl-011",
+  "name": "Leave Request and Approval",
+  "description": "Handles the complete employee leave request lifecycle from submission through multi-level approval. Validates leave balances, routes to the correct manager for approval, and upon decision updates the HR database, notifies the employee via email, and syncs the calendar via API. Ideal for mid-to-large organizations replacing paper-based or email-based leave workflows.",
+  "category": "HR & People",
+  "industry": ["Enterprise", "SME"],
+  "tags": ["form", "approval", "hr", "leave", "intermediate"],
+  "stepCount": 10,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 275 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Employee submits leave request form",
+          "config": {
+            "fields": [
+              { "name": "employeeId", "type": "text", "required": true },
+              { "name": "leaveType", "type": "select", "options": ["annual", "sick", "personal", "unpaid"], "required": true },
+              { "name": "startDate", "type": "date", "required": true },
+              { "name": "endDate", "type": "date", "required": true },
+              { "name": "reason", "type": "textarea", "required": false }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 275 },
+        "data": {
+          "nodeType": "validator",
+          "label": "Validate dates and leave type",
+          "config": {
+            "rules": [
+              { "field": "startDate", "condition": "isAfter", "value": "today" },
+              { "field": "endDate", "condition": "isAfterOrEqual", "value": "{{startDate}}" },
+              { "field": "leaveType", "condition": "isIn", "value": ["annual", "sick", "personal", "unpaid"] }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 275 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Check remaining leave balance",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT e.id, e.full_name, e.manager_id, e.department, lb.balance_days FROM employees e JOIN leave_balances lb ON e.id = lb.employee_id WHERE e.id = {{employeeId}} AND lb.leave_type = '{{leaveType}}' AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 275 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Has sufficient leave balance?",
+          "config": {
+            "condition": "{{balanceDays}} >= {{requestedDays}}",
+            "trueLabel": "Sufficient",
+            "falseLabel": "Insufficient"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 275 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Manager reviews leave request",
+          "config": {
+            "assignTo": "{{managerId}}",
+            "timeoutHours": 48,
+            "notifyChannel": "email",
+            "message": "{{employeeName}} has requested {{requestedDays}} days of {{leaveType}} leave from {{startDate}} to {{endDate}}. Remaining balance: {{balanceDays}} days."
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 275 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Was the request approved?",
+          "config": {
+            "condition": "{{approvalStatus}} === 'approved'",
+            "trueLabel": "Approved",
+            "falseLabel": "Rejected"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 275 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Process approved leave in parallel",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-7a",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 50 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Update leave balance and record",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "WITH updated_balance AS (UPDATE leave_balances SET balance_days = balance_days - {{requestedDays}} WHERE employee_id = {{employeeId}} AND leave_type = '{{leaveType}}' AND year = EXTRACT(YEAR FROM CURRENT_DATE)) INSERT INTO leave_records (employee_id, leave_type, start_date, end_date, status, approved_by, approved_at) VALUES ({{employeeId}}, '{{leaveType}}', '{{startDate}}', '{{endDate}}', 'approved', {{managerId}}, NOW())"
+          }
+        }
+      },
+      {
+        "id": "node-7b",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 275 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Notify employee of approval",
+          "config": {
+            "to": ["{{employeeEmail}}"],
+            "subject": "Leave Request Approved: {{startDate}} to {{endDate}}",
+            "body": "Hi {{employeeName}},\n\nYour {{leaveType}} leave request from {{startDate}} to {{endDate}} ({{requestedDays}} days) has been approved by your manager.\n\nRemaining balance: {{newBalance}} days.\n\nBest regards,\nHR System",
+            "from": "hr@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-7c",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 500 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Sync leave to company calendar",
+          "config": {
+            "method": "POST",
+            "url": "https://www.googleapis.com/calendar/v3/calendars/{{env.HR_CALENDAR_ID}}/events",
+            "headers": {
+              "Authorization": "Bearer {{secrets.GOOGLE_CALENDAR_TOKEN}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "summary": "{{employeeName}} - {{leaveType}} Leave",
+              "start": { "date": "{{startDate}}" },
+              "end": { "date": "{{endDate}}" }
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-7a", "source": "node-7", "target": "node-7a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-7b", "source": "node-7", "target": "node-7b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-7c", "source": "node-7", "target": "node-7c", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-012-employee-anniversary-notifications.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-012-employee-anniversary-notifications.json
new file mode 100644
index 0000000..887eeef
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-012-employee-anniversary-notifications.json
@@ -0,0 +1,99 @@
+{
+  "id": "tpl-012",
+  "name": "Employee Birthday and Anniversary Notifications",
+  "description": "Runs daily to check for upcoming employee birthdays and work anniversaries within the next 7 days. Filters matching employees, generates personalized congratulatory messages using a template, and sends notifications to the relevant team channels. Helps HR teams build company culture and ensure no milestone goes unrecognized.",
+  "category": "HR & People",
+  "industry": ["Enterprise", "SME"],
+  "tags": ["scheduled", "hr", "notifications", "beginner"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 15,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run daily at 8 AM on weekdays",
+          "config": {
+            "schedule": "0 8 * * 1-5",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Find upcoming birthdays and anniversaries",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT e.id, e.full_name, e.email, e.department, e.hire_date, e.birth_date, e.manager_email, CASE WHEN EXTRACT(MONTH FROM e.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(DAY FROM e.birth_date) BETWEEN EXTRACT(DAY FROM CURRENT_DATE) AND EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '7 days') THEN 'birthday' WHEN EXTRACT(MONTH FROM e.hire_date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(DAY FROM e.hire_date) BETWEEN EXTRACT(DAY FROM CURRENT_DATE) AND EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '7 days') THEN 'anniversary' END AS milestone_type, EXTRACT(YEAR FROM AGE(CURRENT_DATE, e.hire_date)) AS years_of_service FROM employees e WHERE e.status = 'active' AND (EXTRACT(MONTH FROM e.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE) OR EXTRACT(MONTH FROM e.hire_date) = EXTRACT(MONTH FROM CURRENT_DATE))"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Keep only employees with milestones this week",
+          "config": {
+            "condition": "item.milestone_type !== null"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each employee milestone",
+          "config": {
+            "iterateOver": "{{filteredEmployees}}",
+            "itemVariable": "employee"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Generate milestone notification message",
+          "config": {
+            "template": "{{#if (eq employee.milestone_type 'birthday')}}Happy Birthday, {{employee.full_name}}! The {{employee.department}} team wishes you a wonderful day ahead.{{else}}Congratulations, {{employee.full_name}}! Today marks your {{employee.years_of_service}}-year work anniversary with us. Thank you for your dedication and contributions to the {{employee.department}} team.{{/if}}"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Post to team Slack channel",
+          "config": {
+            "channel": "#{{employee.department}}-general",
+            "webhookUrl": "{{env.SLACK_WEBHOOK_URL}}",
+            "message": "{{notificationMessage}}",
+            "iconEmoji": "{{#if (eq employee.milestone_type 'birthday')}}:birthday:{{else}}:tada:{{/if}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-013-monthly-okr-report.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-013-monthly-okr-report.json
new file mode 100644
index 0000000..fa8f0fe
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-013-monthly-okr-report.json
@@ -0,0 +1,118 @@
+{
+  "id": "tpl-013",
+  "name": "Monthly OKR Report",
+  "description": "Generates a comprehensive monthly Objectives and Key Results report by pulling progress data from the database, transforming metrics into a structured summary, using AI to provide qualitative analysis and recommendations, and delivering a polished HTML report via email to leadership. Built for organizations practicing OKR methodology who want automated progress visibility without manual report compilation.",
+  "category": "HR & People",
+  "industry": ["Enterprise", "SaaS"],
+  "tags": ["scheduled", "reporting", "okr", "ai-analysis", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run on the 1st of every month at 9 AM",
+          "config": {
+            "schedule": "0 9 1 * *",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch all OKR progress for the period",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT o.id AS objective_id, o.title AS objective, o.owner_name, o.department, kr.title AS key_result, kr.target_value, kr.current_value, ROUND((kr.current_value::numeric / NULLIF(kr.target_value, 0)) * 100, 1) AS progress_pct, kr.status, kr.updated_at FROM objectives o JOIN key_results kr ON o.id = kr.objective_id WHERE o.cycle_end >= DATE_TRUNC('month', CURRENT_DATE) AND o.cycle_start <= CURRENT_DATE ORDER BY o.department, o.id, kr.id"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "transformer",
+          "label": "Aggregate OKR metrics by department",
+          "config": {
+            "expression": "{ departments: _.chain(input).groupBy('department').mapValues(dept => ({ avgProgress: _.meanBy(dept, 'progress_pct'), totalObjectives: _.uniqBy(dept, 'objective_id').length, atRisk: _.filter(dept, kr => kr.progress_pct < 30 && kr.status !== 'completed').length, completed: _.filter(dept, kr => kr.status === 'completed').length })).value(), overallAvg: _.meanBy(input, 'progress_pct'), reportMonth: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "AI analysis of OKR performance trends",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a strategic planning advisor. Analyze the following monthly OKR progress data and provide actionable insights.\n\nOKR Data:\n{{input}}\n\nPlease provide:\n1. **Executive Summary** (2-3 sentences on overall health)\n2. **Top Performers** - departments or objectives exceeding targets\n3. **At-Risk Items** - key results below 30% progress that need intervention\n4. **Recommendations** - 3 specific actions leadership should take this month\n5. **Trend Analysis** - compare against typical progress for this point in the cycle\n\nKeep the analysis concise, data-driven, and actionable. Use percentages and specific objective names where relevant."
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format OKR report as HTML email",
+          "config": {
+            "template": "<h1>Monthly OKR Report - {{reportMonth}}</h1><h2>Overall Progress: {{overallAvg}}%</h2><div style='background:#f0f9ff;padding:16px;border-radius:8px;margin:16px 0;'>{{aiAnalysis}}</div><h2>Department Breakdown</h2><table border='1' cellpadding='8' cellspacing='0' style='border-collapse:collapse;width:100%;'><thead><tr><th>Department</th><th>Avg Progress</th><th>Objectives</th><th>Completed</th><th>At Risk</th></tr></thead><tbody>{{#each departments}}<tr><td>{{@key}}</td><td>{{this.avgProgress}}%</td><td>{{this.totalObjectives}}</td><td>{{this.completed}}</td><td style='{{#if (gt this.atRisk 2)}}color:red;font-weight:bold;{{/if}}'>{{this.atRisk}}</td></tr>{{/each}}</tbody></table><p style='color:#6b7280;font-size:12px;margin-top:24px;'>Generated automatically by SmartSpecPro OKR Workflow</p>"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "storage_action",
+          "label": "Archive report to cloud storage",
+          "config": {
+            "action": "upload",
+            "bucket": "{{env.REPORTS_BUCKET}}",
+            "key": "okr-reports/{{reportMonth}}/monthly-okr-report.html",
+            "contentType": "text/html",
+            "body": "{{emailBody}}"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email OKR report to leadership team",
+          "config": {
+            "to": ["ceo@company.com", "coo@company.com", "hr-director@company.com"],
+            "subject": "Monthly OKR Report - {{reportMonth}}",
+            "body": "{{emailBody}}",
+            "from": "okr-reports@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-014-transaction-reconciliation.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-014-transaction-reconciliation.json
new file mode 100644
index 0000000..5f81f36
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-014-transaction-reconciliation.json
@@ -0,0 +1,131 @@
+{
+  "id": "tpl-014",
+  "name": "Daily Transaction Reconciliation",
+  "description": "Automates daily reconciliation between payment processor transaction exports and internal database records. Parses incoming CSV bank statements, cross-references each transaction against the orders database, runs a matching algorithm to flag discrepancies, and notifies the finance team of any mismatches requiring manual review. Designed for retailers and financial institutions that process high volumes of daily transactions.",
+  "category": "Finance & Accounting",
+  "industry": ["Finance", "Retail"],
+  "tags": ["scheduled", "finance", "reconciliation", "csv", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run daily at 6 AM after bank file arrives",
+          "config": {
+            "schedule": "0 6 * * *",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "csv_parser",
+          "label": "Parse bank transaction CSV export",
+          "config": {
+            "source": "{{env.BANK_SFTP_PATH}}/transactions_{{date}}.csv",
+            "delimiter": ",",
+            "hasHeader": true,
+            "columns": ["txn_id", "date", "amount", "currency", "reference", "description", "status"],
+            "encoding": "utf-8"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch internal payment records for same period",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT p.id, p.order_id, p.amount, p.currency, p.gateway_reference, p.status, p.created_at, o.customer_email FROM payments p JOIN orders o ON p.order_id = o.id WHERE p.created_at >= CURRENT_DATE - INTERVAL '1 day' AND p.created_at < CURRENT_DATE AND p.status IN ('completed', 'refunded') ORDER BY p.created_at"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "code_runner",
+          "label": "Match transactions and identify discrepancies",
+          "config": {
+            "language": "javascript",
+            "code": "const bankTxns = input.bankTransactions;\nconst internalPayments = input.internalPayments;\nconst matched = [];\nconst unmatched_bank = [];\nconst unmatched_internal = [];\nconst amount_mismatches = [];\n\nconst internalMap = new Map(internalPayments.map(p => [p.gateway_reference, p]));\n\nfor (const txn of bankTxns) {\n  const internal = internalMap.get(txn.reference);\n  if (!internal) {\n    unmatched_bank.push(txn);\n  } else if (Math.abs(parseFloat(txn.amount) - parseFloat(internal.amount)) > 0.01) {\n    amount_mismatches.push({ bank: txn, internal });\n    internalMap.delete(txn.reference);\n  } else {\n    matched.push({ bank: txn, internal });\n    internalMap.delete(txn.reference);\n  }\n}\n\nfor (const [ref, payment] of internalMap) {\n  unmatched_internal.push(payment);\n}\n\nreturn { matched, unmatched_bank, unmatched_internal, amount_mismatches, summary: { totalBank: bankTxns.length, totalInternal: internalPayments.length, matchedCount: matched.length, discrepancies: unmatched_bank.length + unmatched_internal.length + amount_mismatches.length } };"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Filter for records with discrepancies only",
+          "config": {
+            "condition": "input.summary.discrepancies > 0"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Are there critical discrepancies?",
+          "config": {
+            "condition": "{{summary.discrepancies}} > 0",
+            "trueLabel": "Discrepancies found",
+            "falseLabel": "All matched"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert finance team about mismatches",
+          "config": {
+            "channel": "#finance-reconciliation",
+            "webhookUrl": "{{env.SLACK_WEBHOOK_URL}}",
+            "message": "Reconciliation Alert: {{summary.discrepancies}} discrepancies found in yesterday's transactions.\n- Unmatched bank: {{unmatched_bank.length}}\n- Unmatched internal: {{unmatched_internal.length}}\n- Amount mismatches: {{amount_mismatches.length}}\n\nTotal processed: {{summary.totalBank}} bank / {{summary.totalInternal}} internal"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Log reconciliation results to audit table",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO reconciliation_log (run_date, total_bank_txns, total_internal_txns, matched_count, unmatched_bank_count, unmatched_internal_count, amount_mismatch_count, status) VALUES (CURRENT_DATE - INTERVAL '1 day', {{summary.totalBank}}, {{summary.totalInternal}}, {{summary.matchedCount}}, {{unmatched_bank.length}}, {{unmatched_internal.length}}, {{amount_mismatches.length}}, CASE WHEN {{summary.discrepancies}} = 0 THEN 'clean' ELSE 'needs_review' END)"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-015-budget-overspend-alert.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-015-budget-overspend-alert.json
new file mode 100644
index 0000000..83952a8
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-015-budget-overspend-alert.json
@@ -0,0 +1,135 @@
+{
+  "id": "tpl-015",
+  "name": "Budget Overspend Alert",
+  "description": "Monitors departmental budgets on a weekly basis by comparing actual expenditures against allocated budgets. Calculates spend rates, identifies departments approaching or exceeding their limits, and routes alerts through severity-based channels. Critical overspends trigger executive email escalation while warnings go to department heads via Slack. Designed for enterprises and government organizations with strict fiscal accountability requirements.",
+  "category": "Finance & Accounting",
+  "industry": ["Enterprise", "Government"],
+  "tags": ["scheduled", "finance", "budget", "alerts", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every Monday at 7 AM",
+          "config": {
+            "schedule": "0 7 * * 1",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch budget allocations and actual spend",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT d.id AS dept_id, d.name AS department, d.head_email, b.fiscal_year, b.allocated_amount, COALESCE(SUM(e.amount), 0) AS spent_amount, b.allocated_amount - COALESCE(SUM(e.amount), 0) AS remaining, ROUND((COALESCE(SUM(e.amount), 0) / NULLIF(b.allocated_amount, 0)) * 100, 1) AS spend_pct FROM departments d JOIN budgets b ON d.id = b.department_id LEFT JOIN expenditures e ON d.id = e.department_id AND e.fiscal_year = b.fiscal_year WHERE b.fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE) GROUP BY d.id, d.name, d.head_email, b.fiscal_year, b.allocated_amount ORDER BY spend_pct DESC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "code_runner",
+          "label": "Calculate spend rates and project end-of-year",
+          "config": {
+            "language": "javascript",
+            "code": "const now = new Date();\nconst yearStart = new Date(now.getFullYear(), 0, 1);\nconst yearEnd = new Date(now.getFullYear(), 11, 31);\nconst daysPassed = Math.floor((now - yearStart) / 86400000);\nconst daysTotal = Math.floor((yearEnd - yearStart) / 86400000);\nconst expectedPct = (daysPassed / daysTotal) * 100;\n\nreturn input.map(dept => ({\n  ...dept,\n  expectedPct: Math.round(expectedPct * 10) / 10,\n  overBudgetPct: Math.round((dept.spend_pct - expectedPct) * 10) / 10,\n  projectedTotal: Math.round((dept.spent_amount / daysPassed) * daysTotal),\n  severity: dept.spend_pct >= 100 ? 'critical' : dept.spend_pct >= 85 ? 'warning' : dept.spend_pct >= expectedPct * 1.1 ? 'watch' : 'healthy'\n}));"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Keep only departments with warning or critical status",
+          "config": {
+            "condition": "item.severity === 'critical' || item.severity === 'warning'"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each flagged department",
+          "config": {
+            "iterateOver": "{{flaggedDepartments}}",
+            "itemVariable": "dept"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route by severity level",
+          "config": {
+            "expression": "{{dept.severity}}",
+            "cases": {
+              "critical": "Escalate to CFO and department head",
+              "warning": "Notify department head only"
+            },
+            "default": "Log for review"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 125 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert department head via Slack",
+          "config": {
+            "channel": "#finance-alerts",
+            "webhookUrl": "{{env.SLACK_WEBHOOK_URL}}",
+            "message": "Budget Alert ({{dept.severity}}): {{dept.department}} has spent {{dept.spend_pct}}% of annual budget (expected: {{dept.expectedPct}}%). Projected year-end spend: ${{dept.projectedTotal}} vs allocated ${{dept.allocated_amount}}. Remaining: ${{dept.remaining}}."
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 350 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Escalate critical overspend to CFO",
+          "config": {
+            "to": ["{{dept.head_email}}", "cfo@company.com"],
+            "subject": "CRITICAL: {{dept.department}} Budget Overspend - {{dept.spend_pct}}% Used",
+            "body": "Dear {{dept.department}} Leadership,\n\nThis is an automated budget overspend alert.\n\nDepartment: {{dept.department}}\nBudget Allocated: ${{dept.allocated_amount}}\nAmount Spent: ${{dept.spent_amount}} ({{dept.spend_pct}}%)\nRemaining: ${{dept.remaining}}\nProjected Year-End: ${{dept.projectedTotal}}\n\nThe department is {{dept.overBudgetPct}}% ahead of the expected spend rate for this point in the fiscal year.\n\nPlease review and submit a budget remediation plan within 5 business days.\n\nRegards,\nFinance Automation System",
+            "from": "finance-alerts@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-8", "source": "node-6", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-016-monthly-pl-summary.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-016-monthly-pl-summary.json
new file mode 100644
index 0000000..bd29ffe
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-016-monthly-pl-summary.json
@@ -0,0 +1,121 @@
+{
+  "id": "tpl-016",
+  "name": "Monthly P&L Summary",
+  "description": "Produces a comprehensive monthly Profit and Loss statement by aggregating revenue and expense data from the accounting database, transforming raw figures into structured financial categories, merging with prior period data for trend comparison, and using AI to generate executive commentary. The formatted report is emailed to the finance team and CFO on the first business day of each month.",
+  "category": "Finance & Accounting",
+  "industry": ["Finance", "Enterprise"],
+  "tags": ["scheduled", "finance", "reporting", "ai-analysis", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run on the 2nd of every month at 8 AM",
+          "config": {
+            "schedule": "0 8 2 * *",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch revenue and expense entries for the period",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT gl.account_code, coa.account_name, coa.category, coa.subcategory, coa.account_type, SUM(CASE WHEN gl.entry_type = 'credit' THEN gl.amount ELSE 0 END) AS credits, SUM(CASE WHEN gl.entry_type = 'debit' THEN gl.amount ELSE 0 END) AS debits, SUM(CASE WHEN gl.entry_type = 'credit' THEN gl.amount ELSE -gl.amount END) AS net_amount FROM general_ledger gl JOIN chart_of_accounts coa ON gl.account_code = coa.code WHERE gl.posting_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND gl.posting_date < DATE_TRUNC('month', CURRENT_DATE) AND gl.status = 'posted' GROUP BY gl.account_code, coa.account_name, coa.category, coa.subcategory, coa.account_type ORDER BY coa.category, coa.subcategory"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "transformer",
+          "label": "Structure data into P&L categories",
+          "config": {
+            "expression": "{ revenue: { total: _.sumBy(_.filter(input, {account_type: 'revenue'}), 'net_amount'), byCategory: _.groupBy(_.filter(input, {account_type: 'revenue'}), 'subcategory') }, cogs: { total: _.sumBy(_.filter(input, {account_type: 'cogs'}), 'net_amount') }, grossProfit: _.sumBy(_.filter(input, {account_type: 'revenue'}), 'net_amount') - Math.abs(_.sumBy(_.filter(input, {account_type: 'cogs'}), 'net_amount')), opex: { total: _.sumBy(_.filter(input, {account_type: 'expense'}), 'net_amount'), byCategory: _.groupBy(_.filter(input, {account_type: 'expense'}), 'subcategory') }, netIncome: _.sumBy(_.filter(input, {account_type: 'revenue'}), 'net_amount') - Math.abs(_.sumBy(_.filter(input, {account_type: 'cogs'}), 'net_amount')) - Math.abs(_.sumBy(_.filter(input, {account_type: 'expense'}), 'net_amount')), period: new Date(Date.now() - 30*86400000).toLocaleDateString('en-US', {month:'long', year:'numeric'}) }"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "merge_data",
+          "label": "Merge with prior month for comparison",
+          "config": {
+            "sources": ["currentPeriodPL", "priorPeriodPL"],
+            "mergeStrategy": "combine",
+            "outputFields": {
+              "current": "{{currentPeriodPL}}",
+              "prior": "{{priorPeriodPL}}",
+              "revenueChange": "(({{currentPeriodPL.revenue.total}} - {{priorPeriodPL.revenue.total}}) / {{priorPeriodPL.revenue.total}}) * 100",
+              "netIncomeChange": "(({{currentPeriodPL.netIncome}} - {{priorPeriodPL.netIncome}}) / {{priorPeriodPL.netIncome}}) * 100"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate executive financial commentary",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a CFO preparing a monthly financial commentary for the board. Analyze the following P&L data and provide a concise executive summary.\n\nCurrent Period: {{period}}\nRevenue: ${{revenue.total}} ({{revenueChange}}% vs prior month)\nGross Profit: ${{grossProfit}}\nOperating Expenses: ${{opex.total}}\nNet Income: ${{netIncome}} ({{netIncomeChange}}% vs prior month)\n\nRevenue Breakdown:\n{{#each revenue.byCategory}}{{@key}}: ${{this}}\\n{{/each}}\n\nExpense Breakdown:\n{{#each opex.byCategory}}{{@key}}: ${{this}}\\n{{/each}}\n\nProvide:\n1. **Summary** (2 sentences on overall financial health)\n2. **Revenue Analysis** - key drivers and trends\n3. **Cost Management** - notable expense changes\n4. **Gross Margin** - current margin % and trend\n5. **Outlook** - one forward-looking statement\n\nUse precise dollar amounts and percentages. Keep it under 200 words."
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format P&L report as professional HTML",
+          "config": {
+            "template": "<div style='font-family:Arial,sans-serif;max-width:800px;margin:0 auto;'><h1 style='border-bottom:2px solid #1a365d;padding-bottom:8px;'>Profit & Loss Statement - {{period}}</h1><table style='width:100%;border-collapse:collapse;margin:16px 0;'><tr style='background:#f7fafc;'><td style='padding:8px;font-weight:bold;'>Revenue</td><td style='padding:8px;text-align:right;'>${{revenue.total}}</td><td style='padding:8px;text-align:right;color:{{#if (gt revenueChange 0)}}green{{else}}red{{/if}};'>{{revenueChange}}%</td></tr><tr><td style='padding:8px;font-weight:bold;'>Cost of Goods Sold</td><td style='padding:8px;text-align:right;'>(${{cogs.total}})</td><td></td></tr><tr style='background:#ebf8ff;font-weight:bold;'><td style='padding:8px;'>Gross Profit</td><td style='padding:8px;text-align:right;'>${{grossProfit}}</td><td></td></tr><tr><td style='padding:8px;font-weight:bold;'>Operating Expenses</td><td style='padding:8px;text-align:right;'>(${{opex.total}})</td><td></td></tr><tr style='background:#f0fff4;font-weight:bold;font-size:18px;'><td style='padding:12px;'>Net Income</td><td style='padding:12px;text-align:right;'>${{netIncome}}</td><td style='padding:12px;text-align:right;color:{{#if (gt netIncomeChange 0)}}green{{else}}red{{/if}};'>{{netIncomeChange}}%</td></tr></table><div style='background:#f7fafc;padding:16px;border-radius:8px;margin:16px 0;'><h3>Executive Commentary</h3>{{aiCommentary}}</div></div>"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email P&L report to finance leadership",
+          "config": {
+            "to": ["cfo@company.com", "finance-team@company.com", "controller@company.com"],
+            "subject": "Monthly P&L Summary - {{period}}",
+            "body": "{{emailBody}}",
+            "from": "finance-reports@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-017-overdue-invoice-reminder.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-017-overdue-invoice-reminder.json
new file mode 100644
index 0000000..f123ab0
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-017-overdue-invoice-reminder.json
@@ -0,0 +1,135 @@
+{
+  "id": "tpl-017",
+  "name": "Overdue Invoice Reminder",
+  "description": "Automatically identifies overdue invoices from the accounting system, categorizes them by days overdue, generates appropriately-toned reminder emails based on severity, and tracks all communication attempts in the database. Supports escalating tone from friendly reminder to final notice, helping professional services and finance teams reduce accounts receivable aging without manual follow-up.",
+  "category": "Finance & Accounting",
+  "industry": ["Finance", "Professional Services"],
+  "tags": ["scheduled", "finance", "invoicing", "email", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every weekday at 9 AM",
+          "config": {
+            "schedule": "0 9 * * 1-5",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch all overdue unpaid invoices",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT i.id AS invoice_id, i.invoice_number, i.amount, i.currency, i.due_date, i.issued_date, CURRENT_DATE - i.due_date AS days_overdue, c.company_name, c.contact_name, c.email AS customer_email, c.phone, COALESCE(r.reminder_count, 0) AS reminders_sent, r.last_reminder_date FROM invoices i JOIN customers c ON i.customer_id = c.id LEFT JOIN (SELECT invoice_id, COUNT(*) AS reminder_count, MAX(sent_at) AS last_reminder_date FROM invoice_reminders GROUP BY invoice_id) r ON i.id = r.invoice_id WHERE i.status = 'unpaid' AND i.due_date < CURRENT_DATE AND (r.last_reminder_date IS NULL OR r.last_reminder_date < CURRENT_DATE - INTERVAL '3 days') ORDER BY days_overdue DESC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Exclude invoices reminded within last 3 days",
+          "config": {
+            "condition": "item.days_overdue > 0 && (item.last_reminder_date === null || item.days_overdue > 3)"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each overdue invoice",
+          "config": {
+            "iterateOver": "{{overdueInvoices}}",
+            "itemVariable": "invoice"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Categorize by overdue severity",
+          "config": {
+            "expression": "invoice.days_overdue <= 7 ? 'gentle' : invoice.days_overdue <= 30 ? 'firm' : invoice.days_overdue <= 60 ? 'urgent' : 'final'",
+            "cases": {
+              "gentle": "1-7 days: Friendly reminder",
+              "firm": "8-30 days: Firm follow-up",
+              "urgent": "31-60 days: Urgent notice",
+              "final": "60+ days: Final notice before collections"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Generate severity-appropriate email content",
+          "config": {
+            "template": "{{#if (eq severity 'gentle')}}Dear {{invoice.contact_name}},\n\nThis is a friendly reminder that invoice #{{invoice.invoice_number}} for {{invoice.currency}} {{invoice.amount}} was due on {{invoice.due_date}}. If payment has already been sent, please disregard this message.\n\nPlease let us know if you have any questions about this invoice.\n\nBest regards{{else if (eq severity 'firm')}}Dear {{invoice.contact_name}},\n\nOur records indicate that invoice #{{invoice.invoice_number}} for {{invoice.currency}} {{invoice.amount}} is now {{invoice.days_overdue}} days past due (due date: {{invoice.due_date}}).\n\nPlease arrange payment at your earliest convenience. If there are any issues with this invoice, please contact our accounts receivable team.\n\nThank you for your prompt attention{{else if (eq severity 'urgent')}}Dear {{invoice.contact_name}},\n\nURGENT: Invoice #{{invoice.invoice_number}} for {{invoice.currency}} {{invoice.amount}} is now {{invoice.days_overdue}} days overdue. This is our third notice regarding this outstanding balance.\n\nImmediate payment is required. Please contact us within 5 business days to resolve this matter.\n\nIf payment arrangements need to be discussed, please call us directly{{else}}FINAL NOTICE\n\nDear {{invoice.contact_name}},\n\nDespite previous reminders, invoice #{{invoice.invoice_number}} for {{invoice.currency}} {{invoice.amount}} remains unpaid after {{invoice.days_overdue}} days. This is our final notice before this account is referred to our collections department.\n\nPlease remit payment immediately or contact us to discuss payment arrangements.{{/if}}"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send overdue reminder to customer",
+          "config": {
+            "to": ["{{invoice.customer_email}}"],
+            "cc": ["{{#if (eq severity 'final')}}collections@company.com{{/if}}"],
+            "subject": "{{#if (eq severity 'gentle')}}Reminder: Invoice #{{invoice.invoice_number}} Due{{else if (eq severity 'firm')}}Past Due: Invoice #{{invoice.invoice_number}} - {{invoice.days_overdue}} Days Overdue{{else if (eq severity 'urgent')}}URGENT: Invoice #{{invoice.invoice_number}} - Action Required{{else}}FINAL NOTICE: Invoice #{{invoice.invoice_number}}{{/if}}",
+            "body": "{{emailBody}}",
+            "from": "accounts-receivable@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Log reminder sent to invoice history",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO invoice_reminders (invoice_id, severity, sent_at, recipient_email, reminder_number) VALUES ({{invoice.invoice_id}}, '{{severity}}', NOW(), '{{invoice.customer_email}}', {{invoice.reminders_sent}} + 1)"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-018-system-health-monitoring.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-018-system-health-monitoring.json
new file mode 100644
index 0000000..c06832d
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-018-system-health-monitoring.json
@@ -0,0 +1,166 @@
+{
+  "id": "tpl-018",
+  "name": "System Health Monitoring",
+  "description": "Continuously monitors the health of critical infrastructure services by cycling through a configurable list of endpoints, making HTTP health check requests with error handling, and tracking response times and availability. Incorporates circuit breaker logic to prevent alert storms during extended outages, and publishes metrics for dashboarding. Ideal for SaaS platforms and IT teams managing multiple microservices or third-party dependencies.",
+  "category": "IT & DevOps",
+  "industry": ["SaaS", "IT Services"],
+  "tags": ["scheduled", "monitoring", "devops", "alerts", "advanced"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 40,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run health checks every 5 minutes",
+          "config": {
+            "schedule": "*/5 * * * *",
+            "timezone": "UTC"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Iterate over each monitored service",
+          "config": {
+            "iterateOver": [
+              { "name": "API Gateway", "url": "{{env.API_GATEWAY_URL}}/health", "expectedStatus": 200, "timeoutMs": 5000 },
+              { "name": "Auth Service", "url": "{{env.AUTH_SERVICE_URL}}/health", "expectedStatus": 200, "timeoutMs": 3000 },
+              { "name": "Database", "url": "{{env.DB_MONITOR_URL}}/status", "expectedStatus": 200, "timeoutMs": 5000 },
+              { "name": "Redis Cache", "url": "{{env.REDIS_MONITOR_URL}}/ping", "expectedStatus": 200, "timeoutMs": 2000 },
+              { "name": "Payment Service", "url": "https://api.stripe.com/v1/health", "expectedStatus": 200, "timeoutMs": 5000 },
+              { "name": "Email Service", "url": "{{env.EMAIL_SERVICE_URL}}/health", "expectedStatus": 200, "timeoutMs": 3000 }
+            ],
+            "itemVariable": "service"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Ping service health endpoint",
+          "config": {
+            "method": "GET",
+            "url": "{{service.url}}",
+            "timeout": "{{service.timeoutMs}}",
+            "headers": {
+              "User-Agent": "SmartSpec-HealthCheck/1.0",
+              "Authorization": "Bearer {{secrets.MONITORING_TOKEN}}"
+            },
+            "retries": 1,
+            "captureResponseTime": true
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "try_catch",
+          "label": "Handle connection failures gracefully",
+          "config": {
+            "onError": "continue",
+            "errorVariable": "healthCheckError",
+            "defaultResult": {
+              "status": "down",
+              "responseTime": -1,
+              "error": "{{healthCheckError.message}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Is the service unhealthy?",
+          "config": {
+            "condition": "{{responseStatus}} !== {{service.expectedStatus}} || {{responseTime}} > {{service.timeoutMs}}",
+            "trueLabel": "Unhealthy",
+            "falseLabel": "Healthy"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "circuit_breaker",
+          "label": "Suppress alerts if service already flagged",
+          "config": {
+            "key": "health_{{service.name}}",
+            "failureThreshold": 3,
+            "resetTimeoutSeconds": 300,
+            "halfOpenRequests": 1,
+            "onOpen": "skip_notification",
+            "onClosed": "allow_notification"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert on-call team via PagerDuty",
+          "config": {
+            "channel": "#ops-alerts",
+            "webhookUrl": "{{env.PAGERDUTY_WEBHOOK_URL}}",
+            "message": "SERVICE DOWN: {{service.name}}\nURL: {{service.url}}\nExpected status: {{service.expectedStatus}}\nActual status: {{responseStatus}}\nResponse time: {{responseTime}}ms\nError: {{healthCheckError.message}}\nTimestamp: {{timestamp}}\n\nCircuit breaker state: {{circuitState}}",
+            "severity": "critical"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "metrics_collector",
+          "label": "Record health check metrics",
+          "config": {
+            "metrics": [
+              {
+                "name": "service_health_status",
+                "type": "gauge",
+                "value": "{{responseStatus === service.expectedStatus ? 1 : 0}}",
+                "labels": { "service": "{{service.name}}" }
+              },
+              {
+                "name": "service_response_time_ms",
+                "type": "histogram",
+                "value": "{{responseTime}}",
+                "labels": { "service": "{{service.name}}" }
+              }
+            ],
+            "endpoint": "{{env.PROMETHEUS_PUSH_URL}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-019-error-log-analysis.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-019-error-log-analysis.json
new file mode 100644
index 0000000..5648f8a
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-019-error-log-analysis.json
@@ -0,0 +1,152 @@
+{
+  "id": "tpl-019",
+  "name": "Error Log Analysis",
+  "description": "Performs automated analysis of application error logs by reading log files, splitting entries, filtering for errors and warnings, batching them for efficient AI processing, and generating a categorized incident report. Uses LLM to identify patterns, group related errors, suggest root causes, and prioritize remediation. Alerts the engineering team when critical patterns emerge. Built for SaaS and IT teams drowning in log data who need actionable insights, not raw output.",
+  "category": "IT & DevOps",
+  "industry": ["SaaS", "IT Services"],
+  "tags": ["scheduled", "devops", "ai-analysis", "logs", "intermediate"],
+  "stepCount": 9,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every 6 hours",
+          "config": {
+            "schedule": "0 */6 * * *",
+            "timezone": "UTC"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "read_file",
+          "label": "Read application error log file",
+          "config": {
+            "path": "{{env.APP_LOG_DIR}}/app-error.log",
+            "encoding": "utf-8",
+            "tailLines": 5000,
+            "sinceTimestamp": "{{lastRunTimestamp}}"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "split",
+          "label": "Split log into individual entries",
+          "config": {
+            "delimiter": "\n",
+            "removeEmpty": true,
+            "parseJson": true
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Keep only ERROR and WARN level entries",
+          "config": {
+            "condition": "item.level === 'ERROR' || item.level === 'WARN' || item.level === 'FATAL'"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "batch",
+          "label": "Batch errors into groups of 50 for AI analysis",
+          "config": {
+            "batchSize": 50,
+            "strategy": "fixed"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Analyze error patterns with AI",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a senior SRE engineer analyzing application error logs. Review the following batch of error log entries and provide a structured analysis.\n\nLog Entries:\n{{input}}\n\nAnalyze and provide:\n1. **Error Categories** - Group similar errors together with count and frequency\n2. **Root Cause Hypothesis** - For each category, suggest the most likely root cause\n3. **Impact Assessment** - Rate each category as Critical/High/Medium/Low based on:\n   - Frequency of occurrence\n   - Whether it affects user-facing functionality\n   - Whether it indicates data loss or security concerns\n4. **Recommended Actions** - Specific next steps for each category (e.g., 'Check database connection pool size', 'Review auth token expiry logic')\n5. **Patterns** - Any time-based patterns, correlated failures, or cascading errors\n\nFormat as JSON with keys: categories, rootCauses, impact, actions, patterns.\nBe specific with file names, error codes, and stack trace references where available."
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse AI analysis into structured format",
+          "config": {
+            "format": "json",
+            "schema": {
+              "categories": "array",
+              "rootCauses": "object",
+              "impact": "object",
+              "actions": "array",
+              "patterns": "array"
+            },
+            "fallback": "raw_text"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Are there critical or high-impact errors?",
+          "config": {
+            "condition": "Object.values({{impact}}).some(v => v === 'Critical' || v === 'High')",
+            "trueLabel": "Critical errors found",
+            "falseLabel": "No critical errors"
+          }
+        }
+      },
+      {
+        "id": "node-9",
+        "type": "workflow",
+        "position": { "x": 2100, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert engineering team on critical errors",
+          "config": {
+            "channel": "#engineering-alerts",
+            "webhookUrl": "{{env.SLACK_WEBHOOK_URL}}",
+            "message": "Error Log Analysis Report (Last 6 hours)\n\nTotal errors analyzed: {{totalErrors}}\nCritical categories found: {{criticalCount}}\n\nTop Issues:\n{{#each categories}}{{this.count}}x {{this.name}} ({{this.impact}})\n{{/each}}\n\nRecommended Actions:\n{{#each actions}}* {{this}}\n{{/each}}\n\nFull report: {{env.APP_URL}}/reports/error-analysis/{{reportId}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e8-9", "source": "node-8", "target": "node-9", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-020-deployment-approval-pipeline.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-020-deployment-approval-pipeline.json
new file mode 100644
index 0000000..09b2e82
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-020-deployment-approval-pipeline.json
@@ -0,0 +1,165 @@
+{
+  "id": "tpl-020",
+  "name": "Deployment Approval Pipeline",
+  "description": "Orchestrates a production deployment approval workflow triggered by CI/CD webhook events. Uses AI to analyze the deployment diff for risk assessment, routes through a human approval gate for production releases, triggers the deployment via API, waits for rollout completion, verifies health, and notifies the team of the outcome. Ensures every production deployment is reviewed, risk-assessed, and traceable. Built for SaaS engineering teams practicing continuous delivery with guardrails.",
+  "category": "IT & DevOps",
+  "industry": ["SaaS", "IT Services"],
+  "tags": ["webhook", "devops", "deployment", "approval", "advanced"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "webhook_trigger",
+          "label": "Receive deployment request from CI/CD",
+          "config": {
+            "path": "/webhooks/deploy-request",
+            "method": "POST",
+            "secret": "{{secrets.WEBHOOK_DEPLOY_SECRET}}",
+            "expectedPayload": {
+              "repo": "string",
+              "branch": "string",
+              "commitSha": "string",
+              "environment": "string",
+              "author": "string",
+              "prNumber": "number",
+              "diffStats": "object"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "AI risk assessment of deployment changes",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a senior DevOps engineer performing a deployment risk assessment. Analyze the following deployment details and provide a risk evaluation.\n\nRepository: {{repo}}\nBranch: {{branch}}\nCommit: {{commitSha}}\nTarget Environment: {{environment}}\nAuthor: {{author}}\nPR #{{prNumber}}\n\nChange Statistics:\n- Files changed: {{diffStats.filesChanged}}\n- Insertions: {{diffStats.insertions}}\n- Deletions: {{diffStats.deletions}}\n- Modified paths: {{diffStats.paths}}\n\nAssess the following:\n1. **Risk Level**: LOW / MEDIUM / HIGH / CRITICAL\n2. **Risk Factors**: List specific concerns (e.g., database migrations, auth changes, config changes)\n3. **Blast Radius**: Which services/features could be affected\n4. **Recommended Checks**: Pre-deployment verification steps\n5. **Rollback Complexity**: Easy / Moderate / Complex\n6. **Approval Recommendation**: Auto-approve / Require human review / Block deployment\n\nOutput as JSON with keys: riskLevel, riskFactors, blastRadius, checks, rollbackComplexity, recommendation"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Engineering lead approves production deploy",
+          "config": {
+            "assignTo": "{{env.DEPLOY_APPROVERS}}",
+            "timeoutHours": 4,
+            "notifyChannel": "#deployments",
+            "message": "Deployment Approval Required\n\nRepo: {{repo}} ({{branch}})\nAuthor: {{author}}\nPR: #{{prNumber}}\nEnvironment: {{environment}}\n\nAI Risk Assessment: {{riskLevel}}\nRisk Factors: {{riskFactors}}\nRecommendation: {{recommendation}}\n\nApprove or reject this deployment."
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Was the deployment approved?",
+          "config": {
+            "condition": "{{approvalStatus}} === 'approved'",
+            "trueLabel": "Deploy",
+            "falseLabel": "Rejected"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Trigger deployment via CI/CD API",
+          "config": {
+            "method": "POST",
+            "url": "https://api.github.com/repos/{{repo}}/deployments",
+            "headers": {
+              "Authorization": "token {{secrets.GITHUB_DEPLOY_TOKEN}}",
+              "Accept": "application/vnd.github.v3+json",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "ref": "{{commitSha}}",
+              "environment": "{{environment}}",
+              "auto_merge": false,
+              "required_contexts": [],
+              "description": "Approved by {{approvedBy}} via SmartSpec deploy pipeline"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "wait",
+          "label": "Wait for deployment rollout (up to 10 min)",
+          "config": {
+            "duration": 120,
+            "unit": "seconds",
+            "pollUrl": "https://api.github.com/repos/{{repo}}/deployments/{{deploymentId}}/statuses",
+            "pollInterval": 15,
+            "successCondition": "response.state === 'success'",
+            "failureCondition": "response.state === 'failure' || response.state === 'error'",
+            "maxWait": 600
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Run post-deployment health check",
+          "config": {
+            "method": "GET",
+            "url": "{{env.APP_URL}}/api/health",
+            "headers": {
+              "Authorization": "Bearer {{secrets.MONITORING_TOKEN}}"
+            },
+            "timeout": 10000,
+            "expectedStatus": 200,
+            "retries": 3,
+            "retryDelay": 5000
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify team of deployment result",
+          "config": {
+            "channel": "#deployments",
+            "webhookUrl": "{{env.SLACK_WEBHOOK_URL}}",
+            "message": "Deployment {{#if deploySuccess}}Succeeded{{else}}Failed{{/if}}\n\nRepo: {{repo}} ({{branch}})\nCommit: {{commitSha}}\nEnvironment: {{environment}}\nAuthor: {{author}}\nApproved by: {{approvedBy}}\nRisk Level: {{riskLevel}}\n\n{{#if deploySuccess}}Health check: PASSING\nDeployment completed successfully.{{else}}Health check: {{healthStatus}}\nPlease investigate immediately. Rollback may be required.\nRollback complexity: {{rollbackComplexity}}{{/if}}\n\nDeploy log: {{env.APP_URL}}/deploys/{{deploymentId}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-021-backup-verification.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-021-backup-verification.json
new file mode 100644
index 0000000..6bd1f4e
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-021-backup-verification.json
@@ -0,0 +1,150 @@
+{
+  "id": "tpl-021",
+  "name": "Database Backup Verification",
+  "description": "Runs on a nightly schedule to verify that database backups completed successfully by checking the backup storage endpoint, validating file integrity, recording results in an audit table, and alerting the on-call engineer if any backup is missing or corrupted. Essential for SaaS platforms and enterprises with strict RPO/RTO requirements.",
+  "category": "IT & DevOps",
+  "industry": ["SaaS", "Enterprise"],
+  "tags": ["scheduled", "devops", "backup", "monitoring", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run nightly at 3 AM after backup window",
+          "config": {
+            "schedule": "0 3 * * *",
+            "timezone": "UTC"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Check backup API for latest snapshot",
+          "config": {
+            "method": "GET",
+            "url": "{{env.BACKUP_API_URL}}/api/v1/snapshots/latest",
+            "headers": {
+              "Authorization": "Bearer {{secrets.BACKUP_API_TOKEN}}"
+            },
+            "timeout": 30000
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "storage_action",
+          "label": "Verify backup file exists in S3",
+          "config": {
+            "action": "headObject",
+            "bucket": "{{env.BACKUP_S3_BUCKET}}",
+            "key": "db-backups/{{date}}/full-backup.sql.gz",
+            "accessKeyId": "{{secrets.AWS_ACCESS_KEY}}",
+            "secretAccessKey": "{{secrets.AWS_SECRET_KEY}}",
+            "region": "us-east-1"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Record verification result in audit log",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO backup_audit_log (backup_date, file_size_bytes, checksum, storage_path, verified_at, status) VALUES (CURRENT_DATE, {{fileSize}}, '{{checksum}}', '{{storagePath}}', NOW(), '{{verificationStatus}}')"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Check if backup verification passed",
+          "config": {
+            "condition": "verificationStatus === 'passed' && fileSizeBytes > 1048576",
+            "trueLabel": "Backup OK",
+            "falseLabel": "Backup Failed"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert on-call engineer if backup failed",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_DEVOPS_WEBHOOK}}",
+            "message": "ALERT: Database backup verification FAILED for {{date}}. Status: {{verificationStatus}}. File size: {{fileSizeBytes}} bytes. Immediate investigation required.",
+            "priority": "high"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "metrics_collector",
+          "label": "Record backup health metrics",
+          "config": {
+            "metricName": "backup_verification",
+            "dimensions": {
+              "database": "primary",
+              "environment": "production"
+            },
+            "values": {
+              "status": "{{verificationStatus}}",
+              "file_size_mb": "{{fileSizeMB}}",
+              "duration_seconds": "{{backupDuration}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send daily backup summary to infrastructure team",
+          "config": {
+            "to": ["infra-team@company.com"],
+            "subject": "Backup Verification Report - {{date}}",
+            "body": "Database backup verification completed.\n\nStatus: {{verificationStatus}}\nBackup Size: {{fileSizeMB}} MB\nStorage Path: {{storagePath}}\nChecksum: {{checksum}}\nVerified At: {{verifiedAt}}\n\nThis is an automated report from the backup verification workflow.",
+            "from": "devops-bot@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-022-patient-appointment-reminder.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-022-patient-appointment-reminder.json
new file mode 100644
index 0000000..a9128a9
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-022-patient-appointment-reminder.json
@@ -0,0 +1,119 @@
+{
+  "id": "tpl-022",
+  "name": "Patient Appointment Reminder",
+  "description": "Runs daily to query upcoming patient appointments from the clinic database, filters for appointments within the next 24-48 hours, and sends personalized SMS and email reminders to each patient with appointment details, provider name, and preparation instructions. Reduces no-show rates for healthcare clinics and hospitals.",
+  "category": "Healthcare",
+  "industry": ["Healthcare"],
+  "tags": ["scheduled", "healthcare", "reminders", "sms", "beginner"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 20,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every morning at 8 AM",
+          "config": {
+            "schedule": "0 8 * * *",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch appointments for next 24-48 hours",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT a.id, a.appointment_date, a.appointment_time, a.duration_minutes, a.notes, p.first_name, p.last_name, p.phone, p.email, p.preferred_language, d.name as provider_name, d.specialty, l.address as location_address, l.name as location_name FROM appointments a JOIN patients p ON a.patient_id = p.id JOIN providers d ON a.provider_id = d.id JOIN locations l ON a.location_id = l.id WHERE a.appointment_date BETWEEN CURRENT_DATE + INTERVAL '1 day' AND CURRENT_DATE + INTERVAL '2 days' AND a.status = 'confirmed' AND a.reminder_sent = false ORDER BY a.appointment_date, a.appointment_time"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Filter patients with valid contact info",
+          "config": {
+            "condition": "item.phone !== null || item.email !== null",
+            "description": "Exclude patients who have no phone and no email on file"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each patient appointment",
+          "config": {
+            "iterateOver": "filteredAppointments",
+            "itemVariable": "appointment",
+            "maxIterations": 500
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Build personalized reminder message",
+          "config": {
+            "template": "Hi {{appointment.first_name}}, this is a reminder for your appointment:\n\nDate: {{appointment.appointment_date}}\nTime: {{appointment.appointment_time}}\nProvider: Dr. {{appointment.provider_name}} ({{appointment.specialty}})\nLocation: {{appointment.location_name}}, {{appointment.location_address}}\n\nPlease arrive 15 minutes early. If you need to reschedule, call us at (555) 123-4567.\n\nThank you!"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send SMS/email reminder to patient",
+          "config": {
+            "channel": "sms",
+            "provider": "twilio",
+            "accountSid": "{{secrets.TWILIO_SID}}",
+            "authToken": "{{secrets.TWILIO_TOKEN}}",
+            "from": "{{env.TWILIO_PHONE}}",
+            "to": "{{appointment.phone}}",
+            "message": "{{reminderMessage}}",
+            "fallbackChannel": "email"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Mark reminder as sent in database",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "UPDATE appointments SET reminder_sent = true, reminder_sent_at = NOW(), reminder_channel = '{{channelUsed}}' WHERE id = {{appointment.id}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-023-lab-result-notification.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-023-lab-result-notification.json
new file mode 100644
index 0000000..8e4598c
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-023-lab-result-notification.json
@@ -0,0 +1,151 @@
+{
+  "id": "tpl-023",
+  "name": "Lab Result Notification",
+  "description": "Triggered when a lab result is finalized in the laboratory information system. Validates the result data against expected ranges, classifies results as normal or abnormal using a code runner, and sends parallel notifications to both the patient and the ordering physician. Critical abnormal results are flagged for immediate follow-up.",
+  "category": "Healthcare",
+  "industry": ["Healthcare"],
+  "tags": ["event", "healthcare", "lab-results", "notifications", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 275 },
+        "data": {
+          "nodeType": "event_trigger",
+          "label": "Lab result finalized in LIS",
+          "config": {
+            "eventName": "lab.result.finalized",
+            "source": "laboratory-information-system",
+            "filters": {
+              "status": "final"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 275 },
+        "data": {
+          "nodeType": "validator",
+          "label": "Validate lab result data completeness",
+          "config": {
+            "schema": {
+              "required": ["patientId", "testCode", "resultValue", "unit", "referenceRange", "orderingPhysicianId"],
+              "types": {
+                "patientId": "string",
+                "testCode": "string",
+                "resultValue": "number",
+                "unit": "string"
+              }
+            },
+            "onFailure": "reject"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 275 },
+        "data": {
+          "nodeType": "code_runner",
+          "label": "Classify result as normal, abnormal, or critical",
+          "config": {
+            "language": "javascript",
+            "code": "const { resultValue, referenceRange } = input;\nconst [low, high] = referenceRange.split('-').map(Number);\nconst criticalLow = low * 0.5;\nconst criticalHigh = high * 2;\nlet classification = 'normal';\nif (resultValue < criticalLow || resultValue > criticalHigh) classification = 'critical';\nelse if (resultValue < low || resultValue > high) classification = 'abnormal';\nreturn { ...input, classification, isOutOfRange: classification !== 'normal' };"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 275 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Check if result requires notification",
+          "config": {
+            "condition": "classification !== 'normal' || input.alwaysNotify === true",
+            "trueLabel": "Send notifications",
+            "falseLabel": "Skip - normal result, no notification needed"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 275 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Notify patient and physician simultaneously",
+          "config": {
+            "branches": ["patient-notification", "physician-notification"],
+            "waitForAll": true
+          }
+        }
+      },
+      {
+        "id": "node-5a",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 125 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify patient of lab results availability",
+          "config": {
+            "channel": "sms",
+            "provider": "twilio",
+            "accountSid": "{{secrets.TWILIO_SID}}",
+            "authToken": "{{secrets.TWILIO_TOKEN}}",
+            "from": "{{env.TWILIO_PHONE}}",
+            "to": "{{patient.phone}}",
+            "message": "Your lab results for {{testName}} are now available. Please log in to your patient portal to view them or contact your provider at (555) 234-5678. Classification: {{classification}}."
+          }
+        }
+      },
+      {
+        "id": "node-5b",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 425 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert ordering physician of abnormal result",
+          "config": {
+            "channel": "push",
+            "provider": "internal",
+            "recipientId": "{{orderingPhysicianId}}",
+            "title": "{{classification | upper}} Lab Result - {{patient.lastName}}",
+            "message": "Patient {{patient.firstName}} {{patient.lastName}} (MRN: {{patient.mrn}}): {{testName}} result {{resultValue}} {{unit}} (Ref: {{referenceRange}}). Classification: {{classification}}.",
+            "priority": "{{classification === 'critical' ? 'urgent' : 'normal'}}",
+            "requiresAck": true
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 275 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Log notification delivery status",
+          "config": {
+            "channel": "webhook",
+            "webhookUrl": "{{env.AUDIT_WEBHOOK_URL}}",
+            "message": "Lab result notification sent for patient {{patient.mrn}}, test {{testCode}}, classification: {{classification}}. Patient notified: {{patientNotified}}. Physician notified: {{physicianNotified}}."
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-5a", "source": "node-5", "target": "node-5a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-5b", "source": "node-5", "target": "node-5b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5a-6", "source": "node-5a", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5b-6", "source": "node-5b", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-024-pre-visit-patient-summary.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-024-pre-visit-patient-summary.json
new file mode 100644
index 0000000..feefcfc
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-024-pre-visit-patient-summary.json
@@ -0,0 +1,112 @@
+{
+  "id": "tpl-024",
+  "name": "Pre-Visit Patient Summary",
+  "description": "Runs each evening before clinic hours to prepare AI-generated patient summaries for the next day's appointments. Retrieves patient records from the database, searches the medical knowledge base using RAG for relevant clinical context, and uses an LLM to generate a concise pre-visit brief that is sent to each provider. Helps physicians prepare efficiently and improves quality of care.",
+  "category": "Healthcare",
+  "industry": ["Healthcare"],
+  "tags": ["scheduled", "healthcare", "ai-summary", "rag", "advanced"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every evening at 7 PM before next clinic day",
+          "config": {
+            "schedule": "0 19 * * 0-4",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch tomorrow's appointments with patient history",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT a.id as appointment_id, a.appointment_date, a.appointment_time, a.reason_for_visit, p.id as patient_id, p.first_name, p.last_name, p.date_of_birth, p.allergies, p.active_medications, d.name as provider_name, d.email as provider_email, (SELECT json_agg(json_build_object('date', v.visit_date, 'diagnosis', v.diagnosis, 'notes', v.clinical_notes)) FROM visits v WHERE v.patient_id = p.id ORDER BY v.visit_date DESC LIMIT 5) as recent_visits FROM appointments a JOIN patients p ON a.patient_id = p.id JOIN providers d ON a.provider_id = d.id WHERE a.appointment_date = CURRENT_DATE + INTERVAL '1 day' AND a.status = 'confirmed' ORDER BY d.id, a.appointment_time"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each scheduled appointment",
+          "config": {
+            "iterateOver": "appointments",
+            "itemVariable": "appt",
+            "maxIterations": 200
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Search clinical guidelines for visit reason",
+          "config": {
+            "collection": "clinical-guidelines",
+            "query": "{{appt.reason_for_visit}} treatment guidelines and differential diagnosis for patient with allergies: {{appt.allergies}}",
+            "topK": 5,
+            "minScore": 0.7,
+            "embeddingModel": "text-embedding-3-small",
+            "apiKey": "{{secrets.OPENAI_API_KEY}}"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate pre-visit clinical summary",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a clinical decision support assistant. Generate a concise pre-visit summary for the following patient appointment.\n\nPatient: {{appt.first_name}} {{appt.last_name}} (DOB: {{appt.date_of_birth}})\nReason for Visit: {{appt.reason_for_visit}}\nAllergies: {{appt.allergies}}\nActive Medications: {{appt.active_medications}}\n\nRecent Visits:\n{{#each appt.recent_visits}}\n- {{this.date}}: {{this.diagnosis}} - {{this.notes}}\n{{/each}}\n\nRelevant Clinical Guidelines:\n{{ragResults}}\n\nPlease provide:\n1. Patient Overview (2-3 sentences)\n2. Key History Points (bullet list)\n3. Potential Concerns Based on History\n4. Suggested Topics to Address During Visit\n5. Medication Interaction Alerts (if any)\n\nKeep the summary under 300 words. Use clinical terminology appropriate for a physician audience.",
+            "maxTokens": 800,
+            "temperature": 0.3
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send pre-visit summary to provider",
+          "config": {
+            "channel": "email",
+            "to": "{{appt.provider_email}}",
+            "subject": "Pre-Visit Summary: {{appt.first_name}} {{appt.last_name}} - {{appt.appointment_time}}",
+            "message": "{{clinicalSummary}}",
+            "from": "clinical-support@clinic.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}",
+            "priority": "normal"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-025-assignment-deadline-reminder.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-025-assignment-deadline-reminder.json
new file mode 100644
index 0000000..a350002
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-025-assignment-deadline-reminder.json
@@ -0,0 +1,125 @@
+{
+  "id": "tpl-025",
+  "name": "Assignment Deadline Reminder",
+  "description": "Runs daily to check for upcoming assignment deadlines across all courses. Queries the learning management system database, filters assignments due within the next 48 hours, and sends personalized reminders via the student's preferred notification channel. Supports different urgency levels based on time remaining and whether the student has started their submission.",
+  "category": "Education",
+  "industry": ["Education"],
+  "tags": ["scheduled", "education", "reminders", "deadlines", "beginner"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 20,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every morning at 9 AM on weekdays",
+          "config": {
+            "schedule": "0 9 * * 1-5",
+            "timezone": "America/Chicago"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch assignments due in next 48 hours",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT a.id as assignment_id, a.title, a.description, a.due_date, a.max_points, c.name as course_name, c.code as course_code, s.id as student_id, s.first_name, s.last_name, s.email, s.phone, s.notification_preference, sub.status as submission_status, sub.submitted_at FROM assignments a JOIN courses c ON a.course_id = c.id JOIN enrollments e ON c.id = e.course_id JOIN students s ON e.student_id = s.id LEFT JOIN submissions sub ON a.id = sub.assignment_id AND s.id = sub.student_id WHERE a.due_date BETWEEN NOW() AND NOW() + INTERVAL '48 hours' AND a.status = 'published' AND (sub.status IS NULL OR sub.status = 'draft') ORDER BY a.due_date ASC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Exclude students who already submitted",
+          "config": {
+            "condition": "item.submission_status !== 'submitted' && item.submission_status !== 'graded'",
+            "description": "Only remind students who have not yet submitted their work"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each student-assignment pair",
+          "config": {
+            "iterateOver": "pendingReminders",
+            "itemVariable": "reminder",
+            "maxIterations": 1000
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route by urgency level",
+          "config": {
+            "expression": "hoursUntilDue",
+            "cases": [
+              { "value": "lessThan6", "condition": "hoursUntilDue < 6", "label": "Critical - due very soon" },
+              { "value": "lessThan24", "condition": "hoursUntilDue < 24", "label": "Urgent - due today" },
+              { "value": "lessThan48", "condition": "hoursUntilDue < 48", "label": "Reminder - due tomorrow" }
+            ],
+            "default": "lessThan48"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format reminder based on urgency",
+          "config": {
+            "template": "{{#if (eq urgency 'critical')}}URGENT: {{/if}}Hi {{reminder.first_name}},\n\n{{#if (eq urgency 'critical')}}Your assignment is due in less than 6 hours!{{else if (eq urgency 'urgent')}}Your assignment is due today.{{else}}Friendly reminder: your assignment is due tomorrow.{{/if}}\n\nAssignment: {{reminder.title}}\nCourse: {{reminder.course_name}} ({{reminder.course_code}})\nDue: {{reminder.due_date}}\nPoints: {{reminder.max_points}}\n{{#if (eq reminder.submission_status 'draft')}}You have a draft saved. Don't forget to submit it!{{else}}You haven't started yet. Log in to begin.{{/if}}\n\nGood luck!"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send reminder via student's preferred channel",
+          "config": {
+            "channel": "{{reminder.notification_preference}}",
+            "to": "{{reminder.email}}",
+            "phone": "{{reminder.phone}}",
+            "message": "{{formattedReminder}}",
+            "provider": "twilio",
+            "accountSid": "{{secrets.TWILIO_SID}}",
+            "authToken": "{{secrets.TWILIO_TOKEN}}",
+            "from": "{{env.TWILIO_PHONE}}",
+            "fallbackChannel": "email"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-026-plagiarism-detection.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-026-plagiarism-detection.json
new file mode 100644
index 0000000..38d0bbd
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-026-plagiarism-detection.json
@@ -0,0 +1,158 @@
+{
+  "id": "tpl-026",
+  "name": "Plagiarism Detection",
+  "description": "Triggered when a student uploads a document for submission. Reads the file content, splits it into analyzable passages, searches the institutional knowledge base using RAG for similar existing submissions and published sources, then uses an LLM to assess originality and flag potential plagiarism with detailed similarity reports. Sends results to the instructor for review.",
+  "category": "Education",
+  "industry": ["Education"],
+  "tags": ["file-upload", "education", "ai-detection", "rag", "advanced"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "file_upload_trigger",
+          "label": "Student submits document for plagiarism check",
+          "config": {
+            "acceptedTypes": [".pdf", ".docx", ".txt", ".md"],
+            "maxSizeMB": 25,
+            "storagePath": "submissions/{{courseId}}/{{assignmentId}}/"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "read_file",
+          "label": "Extract text content from uploaded document",
+          "config": {
+            "filePath": "{{uploadedFilePath}}",
+            "encoding": "utf-8",
+            "extractText": true,
+            "supportedFormats": ["pdf", "docx", "txt", "md"]
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "split",
+          "label": "Split document into paragraph-level passages",
+          "config": {
+            "delimiter": "\n\n",
+            "minChunkSize": 100,
+            "maxChunkSize": 1500,
+            "overlapSize": 50
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Search submissions database for similar passages",
+          "config": {
+            "collection": "academic-submissions",
+            "query": "{{passage}}",
+            "topK": 10,
+            "minScore": 0.75,
+            "embeddingModel": "text-embedding-3-small",
+            "apiKey": "{{secrets.OPENAI_API_KEY}}",
+            "filters": {
+              "excludeStudentId": "{{studentId}}",
+              "courseId": "{{courseId}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Analyze passages for originality and plagiarism",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are an academic integrity analyst. Compare the submitted text passages with the retrieved similar passages from the database.\n\nSubmitted Passage:\n{{passage}}\n\nSimilar Matches Found:\n{{#each ragResults}}\n- Source: {{this.metadata.source}} (Similarity: {{this.score}})\n  Text: {{this.content}}\n{{/each}}\n\nFor each match, assess:\n1. Is this a direct copy (>90% similar)?\n2. Is this paraphrased content (70-90% similar)?\n3. Is this coincidental similarity (<70%)?\n4. Is this properly cited?\n\nReturn a JSON object with:\n- overallScore: 0-100 (100 = fully original)\n- flaggedPassages: array of { passage, matchSource, similarityType, confidence }\n- recommendation: 'clear' | 'review_needed' | 'likely_plagiarism'\n- summary: brief explanation",
+            "maxTokens": 1000,
+            "temperature": 0.1
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse plagiarism analysis into structured report",
+          "config": {
+            "format": "json",
+            "schema": {
+              "overallScore": "number",
+              "flaggedPassages": "array",
+              "recommendation": "string",
+              "summary": "string"
+            },
+            "fallbackOnError": {
+              "overallScore": 0,
+              "recommendation": "review_needed",
+              "summary": "Analysis could not be parsed. Manual review required."
+            }
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Check if plagiarism was detected",
+          "config": {
+            "condition": "overallScore < 70 || recommendation === 'likely_plagiarism' || recommendation === 'review_needed'",
+            "trueLabel": "Flag for instructor review",
+            "falseLabel": "Mark as clear"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify instructor of plagiarism report",
+          "config": {
+            "channel": "email",
+            "to": "{{instructorEmail}}",
+            "subject": "Plagiarism Report: {{studentName}} - {{assignmentTitle}}",
+            "message": "A plagiarism check has been completed for the following submission:\n\nStudent: {{studentName}}\nCourse: {{courseName}} ({{courseCode}})\nAssignment: {{assignmentTitle}}\n\nOriginality Score: {{overallScore}}/100\nRecommendation: {{recommendation}}\n\nSummary: {{summary}}\n\n{{#if flaggedPassages.length}}Flagged Passages: {{flaggedPassages.length}} passages require review.{{/if}}\n\nPlease log in to the LMS to view the full report.",
+            "from": "integrity@university.edu",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-027-auto-quiz-generation.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-027-auto-quiz-generation.json
new file mode 100644
index 0000000..7a8fdca
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-027-auto-quiz-generation.json
@@ -0,0 +1,171 @@
+{
+  "id": "tpl-027",
+  "name": "Auto Quiz Generation",
+  "description": "Allows instructors to upload course material and automatically generate quiz questions using AI. Reads the uploaded content, builds a structured prompt with difficulty and question type preferences, generates questions with an LLM, parses them into a standard format, and publishes to the LMS after instructor approval. Dramatically reduces quiz creation time for educators.",
+  "category": "Education",
+  "industry": ["Education", "EdTech"],
+  "tags": ["form", "education", "ai-content", "quiz", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Instructor provides course material and preferences",
+          "config": {
+            "fields": [
+              { "name": "materialFile", "type": "file", "label": "Upload course material (PDF, DOCX, or TXT)", "required": true },
+              { "name": "courseId", "type": "select", "label": "Course", "required": true },
+              { "name": "questionCount", "type": "number", "label": "Number of questions", "default": 10, "min": 5, "max": 50 },
+              { "name": "difficulty", "type": "select", "label": "Difficulty level", "options": ["easy", "medium", "hard", "mixed"], "default": "mixed" },
+              { "name": "questionTypes", "type": "multiselect", "label": "Question types", "options": ["multiple-choice", "true-false", "short-answer", "fill-in-blank"], "default": ["multiple-choice", "true-false"] },
+              { "name": "topic", "type": "text", "label": "Specific topic or chapter (optional)", "required": false }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "read_file",
+          "label": "Extract text from uploaded course material",
+          "config": {
+            "filePath": "{{materialFile.path}}",
+            "encoding": "utf-8",
+            "extractText": true,
+            "supportedFormats": ["pdf", "docx", "txt"]
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "prompt_template",
+          "label": "Build quiz generation prompt with constraints",
+          "config": {
+            "template": "You are an experienced educator creating a quiz for a college-level course.\n\nSource Material:\n{{extractedText}}\n\n{{#if topic}}Focus specifically on: {{topic}}{{/if}}\n\nRequirements:\n- Generate exactly {{questionCount}} questions\n- Difficulty: {{difficulty}}\n- Question types: {{questionTypes}}\n- Each question must be directly answerable from the source material\n- For multiple-choice: provide 4 options (A-D) with exactly one correct answer\n- For true-false: provide the statement and correct answer\n- For short-answer: provide the question and a model answer\n- For fill-in-blank: provide the sentence with a blank and the correct word/phrase\n\nReturn as a JSON array where each item has: { questionNumber, type, question, options (if MC), correctAnswer, explanation, difficulty }"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate quiz questions from course material",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "{{formattedPrompt}}",
+            "maxTokens": 4000,
+            "temperature": 0.7,
+            "responseFormat": "json"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse and validate generated quiz questions",
+          "config": {
+            "format": "json",
+            "schema": {
+              "type": "array",
+              "items": {
+                "questionNumber": "number",
+                "type": "string",
+                "question": "string",
+                "correctAnswer": "string",
+                "explanation": "string"
+              }
+            },
+            "validation": {
+              "minItems": 5,
+              "requiredFields": ["questionNumber", "type", "question", "correctAnswer"]
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Instructor reviews and approves quiz",
+          "config": {
+            "assignTo": "{{instructorEmail}}",
+            "timeoutHours": 72,
+            "message": "Please review the AI-generated quiz ({{questionCount}} questions, {{difficulty}} difficulty) before it is published to the LMS.",
+            "actions": ["approve", "reject", "edit"],
+            "showPreview": true
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Publish approved quiz to LMS API",
+          "config": {
+            "method": "POST",
+            "url": "{{env.LMS_API_URL}}/api/v1/courses/{{courseId}}/quizzes",
+            "headers": {
+              "Authorization": "Bearer {{secrets.LMS_API_TOKEN}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "title": "Auto-Generated Quiz - {{topic}}",
+              "questions": "{{approvedQuestions}}",
+              "settings": {
+                "timeLimit": "{{questionCount * 2}}",
+                "shuffleQuestions": true,
+                "showResults": "after_submission"
+              }
+            }
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Confirm quiz publication to instructor",
+          "config": {
+            "channel": "email",
+            "to": "{{instructorEmail}}",
+            "subject": "Quiz Published: {{topic}} - {{courseName}}",
+            "message": "Your AI-generated quiz has been successfully published to the LMS.\n\nCourse: {{courseName}}\nQuiz: Auto-Generated Quiz - {{topic}}\nQuestions: {{questionCount}}\nDifficulty: {{difficulty}}\nLink: {{env.LMS_URL}}/courses/{{courseId}}/quizzes/{{quizId}}\n\nStudents can now access this quiz.",
+            "from": "lms-bot@university.edu",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-028-student-progress-report.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-028-student-progress-report.json
new file mode 100644
index 0000000..6c5e277
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-028-student-progress-report.json
@@ -0,0 +1,121 @@
+{
+  "id": "tpl-028",
+  "name": "Student Progress Report",
+  "description": "Runs weekly to generate AI-powered progress reports for each student across all their enrolled courses. Queries grades and participation data, processes students in batches for efficiency, uses an LLM to generate personalized insights and recommendations, formats the report using a template engine, and emails it to parents or guardians. Helps educators and families stay informed about student performance.",
+  "category": "Education",
+  "industry": ["Education"],
+  "tags": ["scheduled", "education", "reporting", "ai-analysis", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every Friday at 4 PM",
+          "config": {
+            "schedule": "0 16 * * 5",
+            "timezone": "America/Chicago"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch student grades and participation data",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT s.id as student_id, s.first_name, s.last_name, s.guardian_email, c.name as course_name, c.code as course_code, ROUND(AVG(g.score / g.max_score * 100), 1) as avg_grade, COUNT(DISTINCT g.id) as assignments_completed, COUNT(DISTINCT a.id) as total_assignments, SUM(CASE WHEN att.status = 'present' THEN 1 ELSE 0 END) as days_present, COUNT(DISTINCT att.id) as total_class_days, (SELECT json_agg(json_build_object('assignment', a2.title, 'score', g2.score, 'maxScore', g2.max_score, 'date', g2.graded_at)) FROM grades g2 JOIN assignments a2 ON g2.assignment_id = a2.id WHERE g2.student_id = s.id AND g2.graded_at >= NOW() - INTERVAL '7 days') as recent_grades FROM students s JOIN enrollments e ON s.id = e.student_id JOIN courses c ON e.course_id = c.id LEFT JOIN assignments a ON c.id = a.course_id AND a.due_date <= NOW() LEFT JOIN grades g ON a.id = g.assignment_id AND s.id = g.student_id LEFT JOIN attendance att ON s.id = att.student_id AND c.id = att.course_id WHERE e.status = 'active' AND s.guardian_email IS NOT NULL GROUP BY s.id, s.first_name, s.last_name, s.guardian_email, c.name, c.code ORDER BY s.last_name, s.first_name"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "batch",
+          "label": "Group records by student for batch processing",
+          "config": {
+            "groupBy": "student_id",
+            "batchSize": 25,
+            "description": "Group all course records per student so each LLM call gets a complete picture"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Generate report for each student",
+          "config": {
+            "iterateOver": "studentBatches",
+            "itemVariable": "student",
+            "maxIterations": 500
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate personalized progress insights",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a supportive academic advisor generating a weekly progress report for a parent/guardian.\n\nStudent: {{student.first_name}} {{student.last_name}}\n\nCourse Performance:\n{{#each student.courses}}\n- {{this.course_name}} ({{this.course_code}}): {{this.avg_grade}}% average, {{this.assignments_completed}}/{{this.total_assignments}} assignments completed, {{this.days_present}}/{{this.total_class_days}} attendance\n{{/each}}\n\nRecent Grades This Week:\n{{#each student.recent_grades}}\n- {{this.assignment}}: {{this.score}}/{{this.maxScore}}\n{{/each}}\n\nPlease provide:\n1. Overall Performance Summary (2-3 sentences, positive tone)\n2. Strengths (what the student is doing well)\n3. Areas for Improvement (constructive and specific)\n4. Recommended Actions for Parents (2-3 actionable suggestions)\n\nKeep the tone encouraging and constructive. Address parents directly. Use plain language without jargon.",
+            "maxTokens": 600,
+            "temperature": 0.5
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format progress report as HTML email",
+          "config": {
+            "template": "<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'><h2 style='color: #2563eb;'>Weekly Progress Report</h2><p><strong>Student:</strong> {{student.first_name}} {{student.last_name}}</p><p><strong>Week Ending:</strong> {{reportDate}}</p><hr><h3>Course Summary</h3><table style='width: 100%; border-collapse: collapse;'><tr style='background: #f1f5f9;'><th style='padding: 8px; text-align: left;'>Course</th><th>Grade</th><th>Assignments</th><th>Attendance</th></tr>{{#each student.courses}}<tr><td style='padding: 8px;'>{{this.course_name}}</td><td style='text-align: center;'>{{this.avg_grade}}%</td><td style='text-align: center;'>{{this.assignments_completed}}/{{this.total_assignments}}</td><td style='text-align: center;'>{{this.days_present}}/{{this.total_class_days}}</td></tr>{{/each}}</table><h3>AI-Powered Insights</h3><div>{{aiInsights}}</div><hr><p style='color: #64748b; font-size: 12px;'>This report is generated automatically by the school's learning management system.</p></div>"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email weekly report to parent or guardian",
+          "config": {
+            "to": ["{{student.guardian_email}}"],
+            "subject": "Weekly Progress Report - {{student.first_name}} {{student.last_name}} (Week of {{reportDate}})",
+            "body": "{{formattedReport}}",
+            "contentType": "html",
+            "from": "reports@school.edu",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-029-citizen-service-request.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-029-citizen-service-request.json
new file mode 100644
index 0000000..c4d4ffd
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-029-citizen-service-request.json
@@ -0,0 +1,176 @@
+{
+  "id": "tpl-029",
+  "name": "Citizen Service Request Processing",
+  "description": "Receives citizen service requests via a public-facing webhook, validates the submission data, uses AI to classify the request type and route it to the appropriate department, stores the ticket in the case management database, and sends parallel notifications to both the citizen (confirmation) and the assigned department (new case alert). Streamlines municipal service delivery for government agencies.",
+  "category": "Government & Public",
+  "industry": ["Government"],
+  "tags": ["webhook", "government", "service-request", "ai-routing", "intermediate"],
+  "stepCount": 9,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 275 },
+        "data": {
+          "nodeType": "webhook_trigger",
+          "label": "Receive citizen service request from portal",
+          "config": {
+            "path": "/api/webhooks/citizen-request",
+            "method": "POST",
+            "authentication": "api-key",
+            "apiKeyHeader": "X-Portal-Key",
+            "apiKey": "{{secrets.PORTAL_WEBHOOK_KEY}}"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 275 },
+        "data": {
+          "nodeType": "validator",
+          "label": "Validate citizen request fields",
+          "config": {
+            "schema": {
+              "required": ["citizenName", "email", "category", "description", "location"],
+              "types": {
+                "citizenName": "string",
+                "email": "string",
+                "description": "string",
+                "location": "string"
+              },
+              "constraints": {
+                "description": { "minLength": 20, "maxLength": 5000 },
+                "email": { "format": "email" }
+              }
+            },
+            "onFailure": "reject",
+            "errorMessage": "Please provide all required fields with valid data."
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 275 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Classify request and determine department routing",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a municipal service request classifier for a city government. Analyze the following citizen service request and classify it.\n\nRequest:\nCategory Selected: {{category}}\nDescription: {{description}}\nLocation: {{location}}\n\nClassify into exactly ONE department:\n- PUBLIC_WORKS: roads, sidewalks, streetlights, water, sewage\n- PARKS_AND_REC: parks, playgrounds, trails, community centers\n- SANITATION: garbage, recycling, illegal dumping, street cleaning\n- CODE_ENFORCEMENT: building violations, zoning, noise complaints\n- PUBLIC_SAFETY: traffic hazards, damaged signs, emergency prep\n- UTILITIES: power outages, water quality, gas leaks\n- GENERAL: anything that doesn't fit above categories\n\nAlso determine:\n- Priority: LOW, MEDIUM, HIGH, URGENT\n- Estimated resolution time in business days\n- A brief summary (1 sentence) for the case title\n\nReturn JSON: { department, priority, estimatedDays, caseTitle }",
+            "maxTokens": 300,
+            "temperature": 0.2
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 275 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route to department based on AI classification",
+          "config": {
+            "expression": "department",
+            "cases": [
+              { "value": "PUBLIC_WORKS", "label": "Public Works Department" },
+              { "value": "PARKS_AND_REC", "label": "Parks and Recreation" },
+              { "value": "SANITATION", "label": "Sanitation Department" },
+              { "value": "CODE_ENFORCEMENT", "label": "Code Enforcement" },
+              { "value": "PUBLIC_SAFETY", "label": "Public Safety" },
+              { "value": "UTILITIES", "label": "Utilities Department" }
+            ],
+            "default": "GENERAL"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 275 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Create service case in case management system",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO service_cases (case_number, citizen_name, citizen_email, category, department, priority, description, location, case_title, estimated_resolution_days, status, created_at) VALUES (CONCAT('SR-', TO_CHAR(NOW(), 'YYYYMMDD'), '-', LPAD(nextval('case_seq')::text, 4, '0')), '{{citizenName}}', '{{email}}', '{{category}}', '{{department}}', '{{priority}}', '{{description}}', '{{location}}', '{{caseTitle}}', {{estimatedDays}}, 'open', NOW()) RETURNING case_number, id"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 275 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Notify citizen and department simultaneously",
+          "config": {
+            "branches": ["citizen-confirmation", "department-alert"],
+            "waitForAll": true
+          }
+        }
+      },
+      {
+        "id": "node-6a",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 125 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send confirmation to citizen",
+          "config": {
+            "channel": "email",
+            "to": "{{email}}",
+            "subject": "Service Request Received - {{caseNumber}}",
+            "message": "Dear {{citizenName}},\n\nThank you for contacting City Services. Your request has been received and assigned to the {{department}} department.\n\nCase Number: {{caseNumber}}\nCategory: {{category}}\nPriority: {{priority}}\nEstimated Resolution: {{estimatedDays}} business days\n\nYou can track your request status at {{env.PORTAL_URL}}/track/{{caseNumber}}\n\nThank you for helping us improve our community.",
+            "from": "cityservices@city.gov",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-6b",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 425 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert assigned department of new case",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.DEPT_SLACK_WEBHOOK}}",
+            "message": "New Service Request Assigned\n\nCase: {{caseNumber}}\nTitle: {{caseTitle}}\nPriority: {{priority}}\nDepartment: {{department}}\nLocation: {{location}}\nDescription: {{description}}\n\nPlease review and assign a field agent within {{estimatedDays}} business days.",
+            "priority": "{{priority === 'URGENT' ? 'high' : 'normal'}}"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 275 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Log case creation for audit trail",
+          "config": {
+            "channel": "webhook",
+            "webhookUrl": "{{env.AUDIT_LOG_URL}}",
+            "message": "Case {{caseNumber}} created. Department: {{department}}. Priority: {{priority}}. Citizen notified: true. Department notified: true."
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-6a", "source": "node-6", "target": "node-6a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-6b", "source": "node-6", "target": "node-6b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6a-7", "source": "node-6a", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6b-7", "source": "node-6b", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-030-executive-news-brief.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-030-executive-news-brief.json
new file mode 100644
index 0000000..8a7aed5
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-030-executive-news-brief.json
@@ -0,0 +1,188 @@
+{
+  "id": "tpl-030",
+  "name": "Executive News Brief",
+  "description": "Runs every weekday morning to compile a curated executive news briefing from multiple news sources. Fetches articles in parallel from government news feeds, industry publications, and policy databases, then merges the results, uses an LLM to summarize key developments and assess their strategic implications, formats the brief using a professional template, and emails it to senior leadership. Designed for government officials and enterprise executives who need concise, actionable intelligence.",
+  "category": "Government & Public",
+  "industry": ["Government", "Enterprise"],
+  "tags": ["scheduled", "news", "ai-summary", "parallel", "advanced"],
+  "stepCount": 10,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 350 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every weekday at 6 AM",
+          "config": {
+            "schedule": "0 6 * * 1-5",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 350 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Fetch news from three sources simultaneously",
+          "config": {
+            "branches": ["government-news", "industry-news", "policy-feed"],
+            "waitForAll": true,
+            "timeoutSeconds": 60
+          }
+        }
+      },
+      {
+        "id": "node-2a",
+        "type": "workflow",
+        "position": { "x": 600, "y": 125 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch government and regulatory news",
+          "config": {
+            "method": "GET",
+            "url": "{{env.GOV_NEWS_API_URL}}/api/v2/articles?category=government&since=24h&limit=20",
+            "headers": {
+              "Authorization": "Bearer {{secrets.NEWS_API_KEY}}"
+            },
+            "timeout": 30000,
+            "retryOnFailure": true,
+            "maxRetries": 2
+          }
+        }
+      },
+      {
+        "id": "node-2b",
+        "type": "workflow",
+        "position": { "x": 600, "y": 350 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch industry and economic news",
+          "config": {
+            "method": "GET",
+            "url": "{{env.INDUSTRY_NEWS_URL}}/api/feed?topics=economy,policy,regulation&period=24h&limit=20",
+            "headers": {
+              "Authorization": "Bearer {{secrets.INDUSTRY_API_KEY}}"
+            },
+            "timeout": 30000,
+            "retryOnFailure": true,
+            "maxRetries": 2
+          }
+        }
+      },
+      {
+        "id": "node-2c",
+        "type": "workflow",
+        "position": { "x": 600, "y": 575 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch policy and legislative updates",
+          "config": {
+            "method": "GET",
+            "url": "{{env.POLICY_FEED_URL}}/api/v1/updates?type=legislative,executive_order,regulation&since=yesterday",
+            "headers": {
+              "Authorization": "Bearer {{secrets.POLICY_API_KEY}}"
+            },
+            "timeout": 30000,
+            "retryOnFailure": true,
+            "maxRetries": 2
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 850, "y": 350 },
+        "data": {
+          "nodeType": "join",
+          "label": "Collect all news feed results",
+          "config": {
+            "strategy": "waitAll",
+            "timeout": 90
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 350 },
+        "data": {
+          "nodeType": "merge_data",
+          "label": "Merge and deduplicate articles from all sources",
+          "config": {
+            "strategy": "concat",
+            "deduplicateBy": "title",
+            "sortBy": "publishedAt",
+            "sortOrder": "desc",
+            "maxItems": 50,
+            "inputs": ["governmentNews", "industryNews", "policyUpdates"]
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 350 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate executive briefing with strategic analysis",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a senior policy analyst preparing a daily executive news briefing for government leadership.\n\nArticles from the past 24 hours:\n{{#each mergedArticles}}\n[{{@index}}] {{this.title}} (Source: {{this.source}}, Published: {{this.publishedAt}})\n{{this.summary}}\n{{/each}}\n\nPrepare an executive briefing with these sections:\n\n1. TOP STORIES (3-5 most important developments, 2-3 sentences each)\n   - Include why each matters for policy and operations\n\n2. REGULATORY & LEGISLATIVE UPDATE\n   - New regulations, pending legislation, or executive actions\n\n3. ECONOMIC INDICATORS\n   - Key economic data points or market movements\n\n4. STRATEGIC IMPLICATIONS\n   - What these developments mean for our organization\n   - Recommended actions or watch items\n\n5. UPCOMING EVENTS\n   - Hearings, deadlines, or events in the next 7 days (if mentioned)\n\nWrite in a concise, authoritative style. Use bullet points. Keep the total briefing under 800 words. Flag any items requiring immediate attention with [ACTION REQUIRED].",
+            "maxTokens": 2000,
+            "temperature": 0.3
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 350 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format briefing as professional HTML email",
+          "config": {
+            "template": "<div style='font-family: Georgia, serif; max-width: 700px; margin: 0 auto; color: #1a1a2e;'><div style='background: #16213e; color: white; padding: 20px; text-align: center;'><h1 style='margin: 0; font-size: 24px;'>Executive News Brief</h1><p style='margin: 5px 0 0; opacity: 0.8;'>{{briefingDate}} | Daily Intelligence Summary</p></div><div style='padding: 20px; background: #f8f9fa;'><div style='background: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;'>{{executiveBriefing}}</div><div style='background: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 8px; margin-bottom: 16px;'><strong>Sources Analyzed:</strong> {{articleCount}} articles from {{sourceCount}} sources</div></div><div style='padding: 16px; text-align: center; color: #6c757d; font-size: 12px;'><p>This briefing is auto-generated. Sources include government feeds, industry publications, and policy databases.</p><p>Prepared by the Office of Strategic Intelligence</p></div></div>"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 350 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Deliver briefing to executive leadership",
+          "config": {
+            "to": ["{{env.EXEC_DISTRO_LIST}}"],
+            "cc": ["{{env.POLICY_TEAM_EMAIL}}"],
+            "subject": "Executive News Brief - {{briefingDate}}",
+            "body": "{{formattedBriefing}}",
+            "contentType": "html",
+            "from": "intel-brief@agency.gov",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}",
+            "priority": "high"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-2a", "source": "node-2", "target": "node-2a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-2b", "source": "node-2", "target": "node-2b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-2c", "source": "node-2", "target": "node-2c", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2a-3", "source": "node-2a", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2b-3", "source": "node-2b", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2c-3", "source": "node-2c", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-031-project-budget-alert.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-031-project-budget-alert.json
new file mode 100644
index 0000000..0b9ecf3
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-031-project-budget-alert.json
@@ -0,0 +1,136 @@
+{
+  "id": "tpl-031",
+  "name": "Project Budget Alert",
+  "description": "Monitors government and enterprise project budgets on a recurring schedule. Queries the project finance database for spending across all active projects, runs variance analysis against approved budget ceilings, filters projects that exceed configurable thresholds, and routes notifications by severity level — email for warnings, push notification for critical overruns. Designed for public-sector financial controllers and enterprise PMOs who need proactive budget oversight.",
+  "category": "Government & Public",
+  "industry": ["Government", "Enterprise"],
+  "tags": ["scheduled", "government", "budget", "alerts", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run budget check every weekday at 8 AM",
+          "config": {
+            "schedule": "0 8 * * 1-5",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Query active project budgets and expenditures",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT p.id, p.name, p.department, p.approved_budget, COALESCE(SUM(e.amount), 0) AS total_spent, p.approved_budget - COALESCE(SUM(e.amount), 0) AS remaining, ROUND(COALESCE(SUM(e.amount), 0) / p.approved_budget * 100, 2) AS pct_used FROM projects p LEFT JOIN expenditures e ON p.id = e.project_id WHERE p.status = 'active' AND p.fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE) GROUP BY p.id ORDER BY pct_used DESC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "code_runner",
+          "label": "Compute budget variance and risk scores",
+          "config": {
+            "language": "javascript",
+            "code": "const projects = input.rows; return projects.map(p => ({ ...p, variance: p.approved_budget - p.total_spent, riskScore: p.pct_used >= 100 ? 'critical' : p.pct_used >= 85 ? 'warning' : 'healthy', daysRemaining: Math.ceil((new Date(p.end_date) - new Date()) / 86400000), burnRate: p.total_spent / Math.max(1, Math.ceil((new Date() - new Date(p.start_date)) / 86400000)) }));"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Keep only projects exceeding 80% budget usage",
+          "config": {
+            "condition": "item.pct_used >= 80"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Iterate over each flagged project",
+          "config": {
+            "iterateOver": "{{filteredProjects}}",
+            "itemVariable": "project"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route by risk severity level",
+          "config": {
+            "expression": "{{project.riskScore}}",
+            "cases": {
+              "critical": "output_critical",
+              "warning": "output_warning"
+            },
+            "default": "output_healthy"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 150 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Push critical budget overrun alert",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_WEBHOOK_FINANCE}}",
+            "message": "CRITICAL: Project '{{project.name}}' ({{project.department}}) has used {{project.pct_used}}% of its ${{project.approved_budget}} budget. Only ${{project.remaining}} remains. Immediate review required.",
+            "priority": "high"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 300 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email budget warning to project manager",
+          "config": {
+            "to": ["{{project.manager_email}}"],
+            "subject": "Budget Warning: {{project.name}} at {{project.pct_used}}% utilization",
+            "body": "Dear {{project.manager_name}},\n\nThis is an automated alert that project '{{project.name}}' in the {{project.department}} department has reached {{project.pct_used}}% of its approved budget of ${{project.approved_budget}}.\n\nTotal Spent: ${{project.total_spent}}\nRemaining: ${{project.remaining}}\nEstimated Burn Rate: ${{project.burnRate}}/day\n\nPlease review current commitments and submit a budget amendment if needed.\n\nRegards,\nBudget Monitoring System",
+            "from": "budget-alerts@agency.gov",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output_critical", "targetHandle": "input" },
+      { "id": "e6-8", "source": "node-6", "target": "node-8", "sourceHandle": "output_warning", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-032-personal-news-digest.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-032-personal-news-digest.json
new file mode 100644
index 0000000..251d268
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-032-personal-news-digest.json
@@ -0,0 +1,151 @@
+{
+  "id": "tpl-032",
+  "name": "Personal News Digest",
+  "description": "Aggregates top stories from multiple news sources every morning, uses AI to summarize and deduplicate articles, then delivers a clean formatted digest via email. The parallel fetch ensures fast collection from multiple APIs simultaneously. Perfect for professionals who want a curated briefing without scrolling through multiple apps.",
+  "category": "Personal Productivity",
+  "industry": ["Personal Productivity"],
+  "tags": ["scheduled", "news", "ai-summary", "email", "beginner"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 20,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run daily at 6:30 AM",
+          "config": {
+            "schedule": "30 6 * * *",
+            "timezone": "America/Chicago"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Fetch news from multiple sources simultaneously",
+          "config": {
+            "branches": ["branch_a", "branch_b"],
+            "waitForAll": true
+          }
+        }
+      },
+      {
+        "id": "node-3a",
+        "type": "workflow",
+        "position": { "x": 600, "y": 150 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch top headlines from NewsAPI",
+          "config": {
+            "method": "GET",
+            "url": "https://newsapi.org/v2/top-headlines",
+            "params": {
+              "country": "us",
+              "category": "technology,business",
+              "pageSize": 15
+            },
+            "headers": {
+              "X-Api-Key": "{{secrets.NEWS_API_KEY}}"
+            },
+            "timeout": 10000
+          }
+        }
+      },
+      {
+        "id": "node-3b",
+        "type": "workflow",
+        "position": { "x": 600, "y": 300 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch latest articles from RSS aggregator",
+          "config": {
+            "method": "GET",
+            "url": "{{env.RSS_AGGREGATOR_URL}}/api/articles",
+            "params": {
+              "limit": 15,
+              "since": "24h",
+              "feeds": "techcrunch,hackernews,arstechnica"
+            },
+            "headers": {
+              "Authorization": "Bearer {{secrets.RSS_API_TOKEN}}"
+            },
+            "timeout": 10000
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "join",
+          "label": "Merge results from all news sources",
+          "config": {
+            "mergeStrategy": "concatenate",
+            "deduplicateBy": "url"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Summarize and rank articles by relevance",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a personal news curator. Given the following {{articleCount}} articles, perform these tasks:\n\n1. Remove duplicate stories covering the same event\n2. Rank the remaining articles by importance and relevance\n3. Write a 2-3 sentence summary for each of the top 10 articles\n4. Group articles into categories: Tech, Business, Science, World\n\nArticles:\n{{articles}}\n\nReturn a JSON array with: title, source, summary, category, originalUrl",
+            "maxTokens": 2000,
+            "temperature": 0.3
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format digest as HTML email",
+          "config": {
+            "template": "<h1>Your Daily News Digest - {{date}}</h1><p>Here are today's top stories, curated and summarized by AI.</p>{{#each categories}}<h2>{{this.name}}</h2>{{#each this.articles}}<div style='margin-bottom:16px;border-left:3px solid #0066cc;padding-left:12px;'><h3><a href='{{this.originalUrl}}'>{{this.title}}</a></h3><p style='color:#555;font-size:13px;'>{{this.source}}</p><p>{{this.summary}}</p></div>{{/each}}{{/each}}<hr><p style='color:#999;font-size:12px;'>Generated automatically. Powered by SmartSpecPro.</p>"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send daily digest to personal inbox",
+          "config": {
+            "to": ["{{env.DIGEST_RECIPIENT_EMAIL}}"],
+            "subject": "Your News Digest for {{date}}",
+            "body": "{{emailBody}}",
+            "from": "digest@smartspechub.app",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3a", "source": "node-2", "target": "node-3a", "sourceHandle": "branch_a", "targetHandle": "input" },
+      { "id": "e2-3b", "source": "node-2", "target": "node-3b", "sourceHandle": "branch_b", "targetHandle": "input" },
+      { "id": "e3a-4", "source": "node-3a", "target": "node-4", "sourceHandle": "output", "targetHandle": "input_a" },
+      { "id": "e3b-4", "source": "node-3b", "target": "node-4", "sourceHandle": "output", "targetHandle": "input_b" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-033-stock-price-alert.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-033-stock-price-alert.json
new file mode 100644
index 0000000..062c4ce
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-033-stock-price-alert.json
@@ -0,0 +1,144 @@
+{
+  "id": "tpl-033",
+  "name": "Stock Price Alert",
+  "description": "Monitors a personal watchlist of stocks on a regular schedule. Queries the user's watchlist from the database, loops through each ticker to fetch real-time price data from a market API, evaluates user-defined alert conditions (price thresholds, percentage changes), and sends push notifications when conditions are met. Includes rate limiting to avoid exceeding API quotas. Ideal for retail investors and finance enthusiasts tracking multiple positions.",
+  "category": "Personal Productivity",
+  "industry": ["Finance", "Personal Productivity"],
+  "tags": ["scheduled", "finance", "stocks", "alerts", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Check prices every 15 minutes during market hours",
+          "config": {
+            "schedule": "*/15 9-16 * * 1-5",
+            "timezone": "America/New_York"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch user watchlist with alert thresholds",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT w.id, w.ticker, w.alert_price_above, w.alert_price_below, w.alert_pct_change, w.user_id, u.push_token, u.email FROM watchlist w JOIN users u ON w.user_id = u.id WHERE w.alerts_enabled = true AND w.deleted_at IS NULL ORDER BY w.ticker"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Iterate over each watched ticker",
+          "config": {
+            "iterateOver": "{{watchlist}}",
+            "itemVariable": "stock"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch current price from market data API",
+          "config": {
+            "method": "GET",
+            "url": "{{env.MARKET_DATA_API_URL}}/v1/quote",
+            "params": {
+              "symbol": "{{stock.ticker}}",
+              "fields": "price,change,changePercent,volume,previousClose"
+            },
+            "headers": {
+              "Authorization": "Bearer {{secrets.MARKET_DATA_API_KEY}}"
+            },
+            "timeout": 5000
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Check if price meets alert conditions",
+          "config": {
+            "conditions": [
+              {
+                "name": "price_above_threshold",
+                "expression": "stock.alert_price_above != null && quote.price >= stock.alert_price_above"
+              },
+              {
+                "name": "price_below_threshold",
+                "expression": "stock.alert_price_below != null && quote.price <= stock.alert_price_below"
+              },
+              {
+                "name": "pct_change_exceeded",
+                "expression": "stock.alert_pct_change != null && Math.abs(quote.changePercent) >= stock.alert_pct_change"
+              }
+            ],
+            "operator": "OR"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send stock price alert notification",
+          "config": {
+            "channel": "push",
+            "pushToken": "{{stock.push_token}}",
+            "title": "Stock Alert: {{stock.ticker}}",
+            "message": "{{stock.ticker}} is now ${{quote.price}} ({{quote.changePercent}}% today). Previous close: ${{quote.previousClose}}. Volume: {{quote.volume}}.",
+            "priority": "high",
+            "data": {
+              "ticker": "{{stock.ticker}}",
+              "price": "{{quote.price}}",
+              "action": "open_stock_detail"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "rate_limiter",
+          "label": "Throttle to avoid API quota exhaustion",
+          "config": {
+            "maxRequests": 50,
+            "windowMs": 60000,
+            "strategy": "sliding_window",
+            "onLimitReached": "queue"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "true", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-034-personal-expense-tracker.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-034-personal-expense-tracker.json
new file mode 100644
index 0000000..9371307
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-034-personal-expense-tracker.json
@@ -0,0 +1,103 @@
+{
+  "id": "tpl-034",
+  "name": "Personal Expense Tracker",
+  "description": "Generates a weekly personal expense analysis by querying transaction data, transforming it into categorized spending summaries, and using AI to identify spending patterns and provide budgeting advice. The formatted report is delivered via email every Monday morning, giving users a clear picture of the previous week's finances with actionable recommendations for saving money.",
+  "category": "Personal Productivity",
+  "industry": ["Personal Productivity"],
+  "tags": ["scheduled", "finance", "expense", "ai-analysis", "beginner"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 15,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every Monday at 7 AM",
+          "config": {
+            "schedule": "0 7 * * 1",
+            "timezone": "America/Los_Angeles"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch last week's transactions",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT t.id, t.amount, t.description, t.merchant_name, t.category, t.transaction_date, t.payment_method FROM transactions t WHERE t.user_id = '{{env.USER_ID}}' AND t.transaction_date >= CURRENT_DATE - INTERVAL '7 days' AND t.transaction_date < CURRENT_DATE ORDER BY t.transaction_date DESC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "transformer",
+          "label": "Categorize and aggregate spending totals",
+          "config": {
+            "expression": "{ totalSpent: sum(input, 'amount'), transactionCount: len(input), byCategory: groupBy(input, 'category') | mapValues(sum, 'amount') | sortDesc, byPaymentMethod: groupBy(input, 'payment_method') | mapValues(sum, 'amount'), topMerchants: groupBy(input, 'merchant_name') | mapValues(sum, 'amount') | sortDesc | take(10), dailySpending: groupBy(input, 'transaction_date') | mapValues(sum, 'amount') }"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Analyze spending patterns and generate advice",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a friendly personal finance advisor. Analyze the following weekly spending data and provide helpful insights.\n\nWeek: {{weekStart}} to {{weekEnd}}\nTotal Spent: ${{totalSpent}}\nTransaction Count: {{transactionCount}}\n\nSpending by Category:\n{{#each byCategory}}  - {{@key}}: ${{this}}\n{{/each}}\n\nTop Merchants:\n{{#each topMerchants}}  - {{@key}}: ${{this}}\n{{/each}}\n\nProvide:\n1. A brief spending summary (2-3 sentences)\n2. The biggest spending category and whether it seems reasonable\n3. Any unusual patterns or outliers\n4. Two specific, actionable tips to save money next week\n\nKeep the tone encouraging and non-judgmental.",
+            "maxTokens": 800,
+            "temperature": 0.4
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format weekly expense report email",
+          "config": {
+            "template": "<h2>Weekly Expense Report</h2><p style='color:#666;'>{{weekStart}} - {{weekEnd}}</p><div style='background:#f0f8ff;padding:16px;border-radius:8px;margin:16px 0;'><h3 style='margin:0;'>Total Spent: ${{totalSpent}}</h3><p style='margin:4px 0;color:#666;'>{{transactionCount}} transactions</p></div><h3>By Category</h3><table style='width:100%;border-collapse:collapse;'>{{#each byCategory}}<tr><td style='padding:8px;border-bottom:1px solid #eee;'>{{@key}}</td><td style='padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;'>${{this}}</td></tr>{{/each}}</table><h3>AI Insights</h3><div style='background:#f9f9f9;padding:16px;border-radius:8px;'>{{aiAnalysis}}</div><hr><p style='color:#999;font-size:12px;'>Your personal expense tracker. Powered by SmartSpecPro.</p>"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email weekly expense report",
+          "config": {
+            "to": ["{{env.USER_EMAIL}}"],
+            "subject": "Your Weekly Expense Report: ${{totalSpent}} spent",
+            "body": "{{emailBody}}",
+            "from": "expenses@smartspechub.app",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-035-travel-itinerary-generator.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-035-travel-itinerary-generator.json
new file mode 100644
index 0000000..d4afa7e
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-035-travel-itinerary-generator.json
@@ -0,0 +1,139 @@
+{
+  "id": "tpl-035",
+  "name": "Travel Itinerary Generator",
+  "description": "Generates a personalized travel itinerary based on user preferences submitted through a form. Fetches destination data from a travel API, enriches it with local knowledge from a RAG-indexed travel guide, constructs a detailed prompt for AI-powered itinerary planning, and delivers the final day-by-day plan via email. Supports preferences for budget, travel style, dietary restrictions, and activity types. Ideal for trip planning and travel agencies.",
+  "category": "Personal Productivity",
+  "industry": ["Travel", "Personal Productivity"],
+  "tags": ["form", "travel", "ai-content", "rag", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Collect travel preferences from user",
+          "config": {
+            "fields": [
+              { "name": "destination", "type": "text", "label": "Destination City/Country", "required": true },
+              { "name": "startDate", "type": "date", "label": "Trip Start Date", "required": true },
+              { "name": "endDate", "type": "date", "label": "Trip End Date", "required": true },
+              { "name": "budget", "type": "select", "label": "Budget Level", "options": ["budget", "mid-range", "luxury"], "required": true },
+              { "name": "travelStyle", "type": "multiselect", "label": "Travel Style", "options": ["adventure", "cultural", "relaxation", "foodie", "nightlife", "family-friendly"] },
+              { "name": "dietary", "type": "text", "label": "Dietary Restrictions (optional)" },
+              { "name": "email", "type": "email", "label": "Send itinerary to", "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch destination info from travel data API",
+          "config": {
+            "method": "GET",
+            "url": "{{env.TRAVEL_API_URL}}/v2/destinations/search",
+            "params": {
+              "query": "{{form.destination}}",
+              "include": "weather,currency,safety,transport,topAttractions",
+              "month": "{{form.startDate | dateFormat:'MM'}}"
+            },
+            "headers": {
+              "Authorization": "Bearer {{secrets.TRAVEL_API_KEY}}"
+            },
+            "timeout": 10000
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Search travel guide knowledge base",
+          "config": {
+            "indexName": "travel-guides",
+            "query": "Best things to do in {{form.destination}} for {{form.travelStyle}} travelers on a {{form.budget}} budget",
+            "topK": 8,
+            "minScore": 0.7,
+            "filters": {
+              "destination": "{{form.destination}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "prompt_template",
+          "label": "Build detailed itinerary generation prompt",
+          "config": {
+            "template": "You are an expert travel planner. Create a detailed day-by-day itinerary for the following trip.\n\nDestination: {{form.destination}}\nDates: {{form.startDate}} to {{form.endDate}} ({{tripDays}} days)\nBudget: {{form.budget}}\nTravel Style: {{form.travelStyle}}\nDietary Restrictions: {{form.dietary | default:'None'}}\n\nDestination Info:\n- Weather: {{destinationInfo.weather}}\n- Currency: {{destinationInfo.currency}}\n- Safety Rating: {{destinationInfo.safety}}\n- Top Attractions: {{destinationInfo.topAttractions}}\n\nLocal Knowledge:\n{{ragResults}}\n\nFor each day, include:\n1. Morning, afternoon, and evening activities\n2. Recommended restaurants (respecting dietary restrictions)\n3. Estimated costs in local currency and USD\n4. Transportation tips between locations\n5. Insider tips from local guides\n\nEnd with a packing checklist and budget summary.",
+            "outputVariable": "itineraryPrompt"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate personalized travel itinerary",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "{{itineraryPrompt}}",
+            "maxTokens": 4000,
+            "temperature": 0.7
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format itinerary as styled HTML email",
+          "config": {
+            "template": "<div style='max-width:600px;margin:0 auto;font-family:Georgia,serif;'><h1 style='color:#2c5f2d;'>Your {{form.destination}} Itinerary</h1><p style='color:#666;'>{{form.startDate}} - {{form.endDate}} | {{form.budget}} budget | {{form.travelStyle}}</p><div style='background:#f5f5dc;padding:16px;border-radius:8px;margin:16px 0;'><h3>Destination Quick Facts</h3><p>Weather: {{destinationInfo.weather}}</p><p>Currency: {{destinationInfo.currency}}</p><p>Safety: {{destinationInfo.safety}}</p></div><div>{{itinerary}}</div><hr><p style='color:#999;font-size:12px;'>Created with SmartSpecPro Travel Planner. Have a wonderful trip!</p></div>"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send itinerary to user email",
+          "config": {
+            "to": ["{{form.email}}"],
+            "subject": "Your Personalized {{form.destination}} Itinerary is Ready!",
+            "body": "{{emailBody}}",
+            "from": "travel@smartspechub.app",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-036-recipe-suggestion.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-036-recipe-suggestion.json
new file mode 100644
index 0000000..0afcb65
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-036-recipe-suggestion.json
@@ -0,0 +1,110 @@
+{
+  "id": "tpl-036",
+  "name": "Recipe Suggestion",
+  "description": "A simple AI-powered recipe suggestion workflow triggered by a form where users enter available ingredients, dietary preferences, and desired cuisine type. The input is structured into a prompt template, sent to an LLM for creative recipe generation, parsed into a structured format with ingredients list and step-by-step instructions, and returned directly as a workflow response. Quick to set up and perfect for meal planning apps or personal cooking inspiration.",
+  "category": "Personal Productivity",
+  "industry": ["Personal Productivity", "Food & Beverage"],
+  "tags": ["form", "ai-content", "recipes", "beginner"],
+  "stepCount": 5,
+  "estimatedSetupMinutes": 10,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Enter ingredients and preferences",
+          "config": {
+            "fields": [
+              { "name": "ingredients", "type": "textarea", "label": "Available Ingredients (comma separated)", "required": true, "placeholder": "chicken breast, garlic, olive oil, lemon, rice" },
+              { "name": "cuisine", "type": "select", "label": "Preferred Cuisine", "options": ["any", "italian", "mexican", "asian", "indian", "mediterranean", "american", "french", "thai", "japanese"], "default": "any" },
+              { "name": "dietary", "type": "multiselect", "label": "Dietary Restrictions", "options": ["none", "vegetarian", "vegan", "gluten-free", "dairy-free", "keto", "low-sodium"] },
+              { "name": "servings", "type": "number", "label": "Number of Servings", "default": 2, "min": 1, "max": 12 },
+              { "name": "maxTime", "type": "select", "label": "Max Cooking Time", "options": ["15 minutes", "30 minutes", "45 minutes", "1 hour", "no limit"], "default": "30 minutes" }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "prompt_template",
+          "label": "Build recipe generation prompt",
+          "config": {
+            "template": "You are a creative and experienced home chef. Suggest a delicious recipe based on the following constraints.\n\nAvailable Ingredients: {{form.ingredients}}\nPreferred Cuisine: {{form.cuisine}}\nDietary Restrictions: {{form.dietary | join:', ' | default:'None'}}\nServings: {{form.servings}}\nMax Cooking Time: {{form.maxTime}}\n\nRequirements:\n1. Use as many of the listed ingredients as possible\n2. You may include up to 5 additional common pantry staples if needed\n3. Keep instructions clear and numbered\n4. Include estimated prep time and cook time separately\n5. Provide nutritional estimates per serving (calories, protein, carbs, fat)\n\nReturn your response as JSON with fields: recipeName, description, prepTime, cookTime, totalTime, ingredients (array of {item, quantity, unit}), instructions (numbered array of strings), nutritionPerServing ({calories, protein, carbs, fat}), tips (array of strings).",
+            "outputVariable": "recipePrompt"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate recipe with AI",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "{{recipePrompt}}",
+            "maxTokens": 1500,
+            "temperature": 0.8,
+            "responseFormat": "json"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse and validate recipe JSON structure",
+          "config": {
+            "format": "json",
+            "schema": {
+              "required": ["recipeName", "description", "ingredients", "instructions"],
+              "properties": {
+                "recipeName": { "type": "string" },
+                "description": { "type": "string" },
+                "prepTime": { "type": "string" },
+                "cookTime": { "type": "string" },
+                "ingredients": { "type": "array" },
+                "instructions": { "type": "array" },
+                "nutritionPerServing": { "type": "object" },
+                "tips": { "type": "array" }
+              }
+            },
+            "onParseError": "return_raw"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "workflow_response",
+          "label": "Return recipe to the user",
+          "config": {
+            "statusCode": 200,
+            "contentType": "application/json",
+            "body": {
+              "success": true,
+              "recipe": "{{parsedRecipe}}"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-037-property-buyer-matching.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-037-property-buyer-matching.json
new file mode 100644
index 0000000..f922396
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-037-property-buyer-matching.json
@@ -0,0 +1,119 @@
+{
+  "id": "tpl-037",
+  "name": "Property Buyer Matching",
+  "description": "Listens for new property listing events and automatically matches them against registered buyer preferences using RAG-powered semantic search and AI scoring. When a new listing is published, the system searches the buyer profile index for compatible matches based on location, budget, property type, and lifestyle preferences. An LLM scores and ranks matches, filters out low-confidence results, and sends personalized notifications to matched buyers. Ideal for real estate agencies looking to automate lead distribution.",
+  "category": "Real Estate",
+  "industry": ["Real Estate"],
+  "tags": ["event", "real-estate", "ai-matching", "rag", "intermediate"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "event_trigger",
+          "label": "Listen for new property listing events",
+          "config": {
+            "eventName": "property.listing.published",
+            "source": "listing-service",
+            "filters": {
+              "status": "active",
+              "visibility": "public"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Search buyer profiles matching property attributes",
+          "config": {
+            "indexName": "buyer-preferences",
+            "query": "Buyer looking for {{event.propertyType}} in {{event.neighborhood}}, {{event.city}} with budget around ${{event.listPrice}}. Features: {{event.bedrooms}} bed, {{event.bathrooms}} bath, {{event.squareFeet}} sqft. Amenities: {{event.amenities}}.",
+            "topK": 25,
+            "minScore": 0.6,
+            "filters": {
+              "budgetMax": { "$gte": "{{event.listPrice}}" },
+              "preferredCities": { "$contains": "{{event.city}}" },
+              "isActive": true
+            }
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Score and rank buyer-property compatibility",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a real estate matching specialist. Score how well each buyer profile matches this new property listing.\n\nProperty:\n- Address: {{event.address}}, {{event.city}}\n- Type: {{event.propertyType}}\n- Price: ${{event.listPrice}}\n- Bedrooms: {{event.bedrooms}}, Bathrooms: {{event.bathrooms}}\n- Square Feet: {{event.squareFeet}}\n- Amenities: {{event.amenities}}\n- Year Built: {{event.yearBuilt}}\n- HOA: ${{event.hoaMonthly}}/month\n\nBuyer Profiles:\n{{#each buyers}}  - {{this.name}}: Budget ${{this.budgetMin}}-${{this.budgetMax}}, wants {{this.preferredType}} in {{this.preferredNeighborhoods}}, needs {{this.minBedrooms}}+ bed, priorities: {{this.priorities}}\n{{/each}}\n\nFor each buyer, return JSON array: [{buyerId, name, matchScore (0-100), matchReasons (3 bullet points), concerns (if any)}]. Only include buyers with score >= 70.",
+            "maxTokens": 2000,
+            "temperature": 0.2
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Filter to high-confidence matches only",
+          "config": {
+            "condition": "item.matchScore >= 70"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Iterate over each matched buyer",
+          "config": {
+            "iterateOver": "{{matchedBuyers}}",
+            "itemVariable": "buyer"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify matched buyer about new listing",
+          "config": {
+            "channel": "push",
+            "pushToken": "{{buyer.pushToken}}",
+            "title": "New Listing Match: {{event.address}}",
+            "message": "A new {{event.propertyType}} at {{event.address}} matches your search! ${{event.listPrice}} | {{event.bedrooms}} bed | {{event.squareFeet}} sqft. Match score: {{buyer.matchScore}}%. Reasons: {{buyer.matchReasons}}",
+            "priority": "high",
+            "data": {
+              "listingId": "{{event.listingId}}",
+              "matchScore": "{{buyer.matchScore}}",
+              "action": "open_listing_detail"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-038-property-valuation-report.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-038-property-valuation-report.json
new file mode 100644
index 0000000..e1fba16
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-038-property-valuation-report.json
@@ -0,0 +1,123 @@
+{
+  "id": "tpl-038",
+  "name": "Property Valuation Report",
+  "description": "Generates a comprehensive property valuation report by combining internal sales data with external market intelligence. A real estate agent submits a property address via form, the system queries comparable sales from the database, fetches current market trends from an external API, and uses AI to synthesize a professional valuation report with price estimate, confidence range, and market commentary. The formatted report is emailed to the requesting agent. Designed for real estate brokerages and appraisal firms.",
+  "category": "Real Estate",
+  "industry": ["Real Estate", "Finance"],
+  "tags": ["form", "real-estate", "ai-analysis", "reporting", "intermediate"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Enter property details for valuation",
+          "config": {
+            "fields": [
+              { "name": "address", "type": "text", "label": "Property Address", "required": true },
+              { "name": "city", "type": "text", "label": "City", "required": true },
+              { "name": "state", "type": "text", "label": "State", "required": true },
+              { "name": "zipCode", "type": "text", "label": "ZIP Code", "required": true },
+              { "name": "propertyType", "type": "select", "label": "Property Type", "options": ["single-family", "condo", "townhouse", "multi-family", "land"], "required": true },
+              { "name": "bedrooms", "type": "number", "label": "Bedrooms", "required": true },
+              { "name": "bathrooms", "type": "number", "label": "Bathrooms", "required": true },
+              { "name": "squareFeet", "type": "number", "label": "Square Feet", "required": true },
+              { "name": "yearBuilt", "type": "number", "label": "Year Built" },
+              { "name": "agentEmail", "type": "email", "label": "Agent Email", "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Query comparable recent sales in the area",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT s.address, s.sale_price, s.sale_date, s.bedrooms, s.bathrooms, s.square_feet, s.year_built, s.days_on_market, s.price_per_sqft FROM sales s WHERE s.zip_code = '{{form.zipCode}}' AND s.property_type = '{{form.propertyType}}' AND s.sale_date >= CURRENT_DATE - INTERVAL '12 months' AND s.bedrooms BETWEEN {{form.bedrooms}} - 1 AND {{form.bedrooms}} + 1 AND s.square_feet BETWEEN {{form.squareFeet}} * 0.75 AND {{form.squareFeet}} * 1.25 ORDER BY s.sale_date DESC LIMIT 20"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch current market trends for the area",
+          "config": {
+            "method": "GET",
+            "url": "{{env.MARKET_INTEL_API_URL}}/v1/market-trends",
+            "params": {
+              "zipCode": "{{form.zipCode}}",
+              "propertyType": "{{form.propertyType}}",
+              "metrics": "medianPrice,priceChange12m,inventoryLevel,daysOnMarket,listToSaleRatio"
+            },
+            "headers": {
+              "Authorization": "Bearer {{secrets.MARKET_INTEL_API_KEY}}"
+            },
+            "timeout": 15000
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate AI-powered property valuation",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a certified real estate appraiser. Generate a professional property valuation report.\n\nSubject Property:\n- Address: {{form.address}}, {{form.city}}, {{form.state}} {{form.zipCode}}\n- Type: {{form.propertyType}}\n- Bedrooms: {{form.bedrooms}}, Bathrooms: {{form.bathrooms}}\n- Square Feet: {{form.squareFeet}}\n- Year Built: {{form.yearBuilt}}\n\nComparable Sales (last 12 months):\n{{#each comparables}}- {{this.address}}: ${{this.sale_price}} ({{this.sale_date}}), {{this.bedrooms}}bd/{{this.bathrooms}}ba, {{this.square_feet}}sqft, ${{this.price_per_sqft}}/sqft, {{this.days_on_market}} DOM\n{{/each}}\n\nMarket Trends:\n- Median Price: ${{marketTrends.medianPrice}}\n- 12-Month Price Change: {{marketTrends.priceChange12m}}%\n- Active Inventory: {{marketTrends.inventoryLevel}} listings\n- Average Days on Market: {{marketTrends.daysOnMarket}}\n- List-to-Sale Ratio: {{marketTrends.listToSaleRatio}}%\n\nProvide:\n1. Estimated Market Value with low/mid/high range\n2. Price per square foot analysis\n3. Comparable sales analysis (top 5 most relevant comps)\n4. Market conditions assessment (buyer's/seller's/balanced)\n5. Value adjustment factors (age, condition assumptions, location premium)\n6. Recommended listing price range\n7. Confidence level (high/medium/low) with reasoning\n\nFormat as a professional report.",
+            "maxTokens": 3000,
+            "temperature": 0.3
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format valuation report as professional HTML",
+          "config": {
+            "template": "<div style='max-width:700px;margin:0 auto;font-family:Arial,sans-serif;'><div style='background:#1a365d;color:white;padding:24px;text-align:center;'><h1 style='margin:0;'>Property Valuation Report</h1><p style='margin:8px 0 0;opacity:0.8;'>Comparative Market Analysis</p></div><div style='padding:24px;'><h2>Subject Property</h2><p><strong>{{form.address}}</strong><br>{{form.city}}, {{form.state}} {{form.zipCode}}</p><p>{{form.propertyType}} | {{form.bedrooms}} bed / {{form.bathrooms}} bath | {{form.squareFeet}} sqft | Built {{form.yearBuilt}}</p><hr><div>{{valuationReport}}</div><div style='background:#f7fafc;padding:16px;border-radius:8px;margin-top:24px;'><h3>Market Snapshot</h3><p>Median Price: ${{marketTrends.medianPrice}} | 12M Change: {{marketTrends.priceChange12m}}% | Avg DOM: {{marketTrends.daysOnMarket}}</p></div></div><div style='background:#eee;padding:16px;text-align:center;font-size:12px;color:#666;'>Generated by SmartSpecPro | {{generatedDate}} | For informational purposes only — not a formal appraisal.</div></div>"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email valuation report to requesting agent",
+          "config": {
+            "to": ["{{form.agentEmail}}"],
+            "subject": "Valuation Report: {{form.address}}, {{form.city}}",
+            "body": "{{emailBody}}",
+            "from": "valuations@realty-company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-039-shipment-status-notification.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-039-shipment-status-notification.json
new file mode 100644
index 0000000..37610c3
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-039-shipment-status-notification.json
@@ -0,0 +1,138 @@
+{
+  "id": "tpl-039",
+  "name": "Shipment Status Notification",
+  "description": "Processes incoming shipment status webhook events from carrier APIs and sends targeted customer notifications based on the shipment stage. When a carrier posts a status update, the workflow looks up the order and customer details, routes the notification through a switch based on status type (shipped, in-transit, out-for-delivery, delivered, delayed, exception), formats an appropriate message template, and pushes the notification. Simple to set up and essential for e-commerce and logistics operations.",
+  "category": "Logistics & Supply Chain",
+  "industry": ["Logistics", "E-commerce"],
+  "tags": ["webhook", "logistics", "tracking", "notifications", "beginner"],
+  "stepCount": 5,
+  "estimatedSetupMinutes": 15,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "webhook_trigger",
+          "label": "Receive shipment status update from carrier",
+          "config": {
+            "path": "/webhooks/shipment-status",
+            "method": "POST",
+            "authentication": {
+              "type": "hmac",
+              "secret": "{{secrets.CARRIER_WEBHOOK_SECRET}}",
+              "header": "X-Signature-256"
+            },
+            "expectedFields": ["trackingNumber", "status", "location", "timestamp", "carrier"]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Look up order and customer details",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT o.id AS order_id, o.order_number, o.total_amount, c.id AS customer_id, c.first_name, c.last_name, c.email, c.phone, c.push_token, c.notification_preferences, s.carrier, s.estimated_delivery FROM shipments s JOIN orders o ON s.order_id = o.id JOIN customers c ON o.customer_id = c.id WHERE s.tracking_number = '{{webhook.trackingNumber}}' LIMIT 1"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route by shipment status type",
+          "config": {
+            "expression": "{{webhook.status}}",
+            "cases": {
+              "shipped": "output_shipped",
+              "in_transit": "output_transit",
+              "out_for_delivery": "output_delivery",
+              "delivered": "output_delivered",
+              "delayed": "output_delayed",
+              "exception": "output_exception"
+            },
+            "default": "output_generic"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format status-appropriate notification message",
+          "config": {
+            "templates": {
+              "shipped": {
+                "title": "Order Shipped!",
+                "message": "Hi {{customer.first_name}}, your order #{{order.order_number}} has shipped via {{webhook.carrier}}! Tracking: {{webhook.trackingNumber}}. Estimated delivery: {{order.estimated_delivery}}."
+              },
+              "in_transit": {
+                "title": "Package In Transit",
+                "message": "Your order #{{order.order_number}} is on its way! Current location: {{webhook.location}}. Tracking: {{webhook.trackingNumber}}."
+              },
+              "out_for_delivery": {
+                "title": "Out for Delivery Today!",
+                "message": "Great news, {{customer.first_name}}! Your order #{{order.order_number}} is out for delivery and should arrive today."
+              },
+              "delivered": {
+                "title": "Package Delivered!",
+                "message": "Your order #{{order.order_number}} has been delivered at {{webhook.location}}. Enjoy! If you have any issues, contact support."
+              },
+              "delayed": {
+                "title": "Delivery Update",
+                "message": "Hi {{customer.first_name}}, there's a delay with your order #{{order.order_number}}. New estimated delivery: {{webhook.newEstimate}}. We apologize for the inconvenience."
+              },
+              "exception": {
+                "title": "Delivery Issue",
+                "message": "There's an issue with your order #{{order.order_number}}: {{webhook.exceptionMessage}}. Our team is working on it. Tracking: {{webhook.trackingNumber}}."
+              }
+            },
+            "selectedTemplate": "{{webhook.status}}"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Push notification to customer",
+          "config": {
+            "channel": "push",
+            "pushToken": "{{customer.push_token}}",
+            "title": "{{notification.title}}",
+            "message": "{{notification.message}}",
+            "priority": "{{webhook.status == 'exception' || webhook.status == 'delayed' ? 'high' : 'normal'}}",
+            "data": {
+              "orderId": "{{order.order_id}}",
+              "trackingNumber": "{{webhook.trackingNumber}}",
+              "status": "{{webhook.status}}",
+              "action": "open_order_tracking"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output_shipped", "targetHandle": "input" },
+      { "id": "e3-4b", "source": "node-3", "target": "node-4", "sourceHandle": "output_transit", "targetHandle": "input" },
+      { "id": "e3-4c", "source": "node-3", "target": "node-4", "sourceHandle": "output_delivery", "targetHandle": "input" },
+      { "id": "e3-4d", "source": "node-3", "target": "node-4", "sourceHandle": "output_delivered", "targetHandle": "input" },
+      { "id": "e3-4e", "source": "node-3", "target": "node-4", "sourceHandle": "output_delayed", "targetHandle": "input" },
+      { "id": "e3-4f", "source": "node-3", "target": "node-4", "sourceHandle": "output_exception", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-040-delivery-route-planning.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-040-delivery-route-planning.json
new file mode 100644
index 0000000..f753ed7
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-040-delivery-route-planning.json
@@ -0,0 +1,124 @@
+{
+  "id": "tpl-040",
+  "name": "Delivery Route Planning",
+  "description": "Optimizes daily delivery routes for a fleet of drivers by combining order data, geographic constraints, and AI-powered route optimization. Runs early each morning to query pending deliveries, fetches real-time traffic and road conditions from a mapping API, uses an LLM to generate optimized route sequences considering delivery windows, vehicle capacity, and traffic patterns, then batches the assignments and sends push notifications to each driver with their personalized route. Designed for logistics companies, food delivery operations, and last-mile distribution centers.",
+  "category": "Logistics & Supply Chain",
+  "industry": ["Logistics", "Food & Beverage"],
+  "tags": ["scheduled", "logistics", "routing", "ai-optimization", "advanced"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run route planning at 5 AM daily",
+          "config": {
+            "schedule": "0 5 * * *",
+            "timezone": "America/Chicago"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch today's pending deliveries and driver roster",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT d.id AS delivery_id, d.order_id, d.recipient_name, d.address, d.city, d.zip_code, d.latitude, d.longitude, d.delivery_window_start, d.delivery_window_end, d.package_weight_kg, d.special_instructions, d.priority FROM deliveries d WHERE d.status = 'pending' AND d.scheduled_date = CURRENT_DATE ORDER BY d.priority DESC, d.delivery_window_start ASC; SELECT dr.id AS driver_id, dr.name, dr.phone, dr.push_token, dr.vehicle_type, dr.max_capacity_kg, dr.home_latitude, dr.home_longitude, dr.shift_start, dr.shift_end FROM drivers dr WHERE dr.status = 'available' AND dr.scheduled_date = CURRENT_DATE ORDER BY dr.name"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch traffic conditions and travel time matrix",
+          "config": {
+            "method": "POST",
+            "url": "{{env.ROUTING_API_URL}}/v1/matrix",
+            "headers": {
+              "Authorization": "Bearer {{secrets.ROUTING_API_KEY}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "origins": "{{deliveryCoordinates}}",
+              "destinations": "{{deliveryCoordinates}}",
+              "departureTime": "{{todayDate}}T06:00:00",
+              "trafficModel": "best_guess",
+              "travelMode": "driving",
+              "avoidTolls": false
+            },
+            "timeout": 30000
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Optimize route assignments using AI",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a logistics route optimization specialist. Assign deliveries to drivers and optimize each driver's route sequence.\n\nDrivers Available ({{driverCount}}):\n{{#each drivers}}- {{this.name}} ({{this.vehicle_type}}): Max {{this.max_capacity_kg}}kg, shift {{this.shift_start}}-{{this.shift_end}}, starts at ({{this.home_latitude}}, {{this.home_longitude}})\n{{/each}}\n\nPending Deliveries ({{deliveryCount}}):\n{{#each deliveries}}- #{{this.delivery_id}}: {{this.address}}, {{this.city}} ({{this.latitude}}, {{this.longitude}}), window {{this.delivery_window_start}}-{{this.delivery_window_end}}, {{this.package_weight_kg}}kg, priority: {{this.priority}}{{#if this.special_instructions}}, note: {{this.special_instructions}}{{/if}}\n{{/each}}\n\nTravel Time Matrix:\n{{travelTimeMatrix}}\n\nOptimization objectives (in priority order):\n1. Meet all delivery time windows (hard constraint)\n2. Respect driver shift hours and vehicle capacity\n3. Minimize total driving distance/time\n4. Balance workload across drivers\n5. Prioritize high-priority deliveries early in route\n\nReturn JSON: [{driverId, driverName, routeSequence: [{deliveryId, address, estimatedArrival, estimatedDepartTime}], totalDistance_km, totalTime_min, totalWeight_kg, deliveryCount}].\n\nIf any deliveries cannot be assigned (capacity/time constraints), list them separately as unassigned with the reason.",
+            "maxTokens": 4000,
+            "temperature": 0.1
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "batch",
+          "label": "Batch route assignments by driver",
+          "config": {
+            "groupBy": "driverId",
+            "batchSize": 1,
+            "processingMode": "parallel"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send optimized route to each driver",
+          "config": {
+            "channel": "push",
+            "pushToken": "{{batch.driver.push_token}}",
+            "title": "Your Route for Today - {{batch.deliveryCount}} stops",
+            "message": "Good morning {{batch.driverName}}! You have {{batch.deliveryCount}} deliveries today ({{batch.totalDistance_km}} km, est. {{batch.totalTime_min}} min). First stop: {{batch.routeSequence[0].address}} at {{batch.routeSequence[0].estimatedArrival}}. Open the app for turn-by-turn navigation.",
+            "priority": "high",
+            "data": {
+              "driverId": "{{batch.driverId}}",
+              "routeSequence": "{{batch.routeSequence}}",
+              "totalStops": "{{batch.deliveryCount}}",
+              "action": "open_driver_route"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-041-content-calendar-planning.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-041-content-calendar-planning.json
new file mode 100644
index 0000000..7af6c64
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-041-content-calendar-planning.json
@@ -0,0 +1,181 @@
+{
+  "id": "tpl-041",
+  "name": "Content Calendar Planning",
+  "description": "Collects topic preferences and campaign goals via a form, retrieves existing brand guidelines and past performance data from a RAG knowledge base, builds a structured editorial prompt, generates a month-long content calendar with AI, parses the output into structured JSON, then simultaneously emails the calendar to stakeholders and publishes it to a project management tool via API. Ideal for marketing teams managing multi-channel content pipelines.",
+  "category": "Content & Media",
+  "industry": ["Media", "Marketing"],
+  "tags": ["form", "content", "ai-planning", "social-media", "intermediate"],
+  "stepCount": 9,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Collect campaign brief and preferences",
+          "config": {
+            "fields": [
+              { "name": "campaignName", "type": "text", "label": "Campaign Name", "required": true },
+              { "name": "targetChannels", "type": "multi_select", "label": "Target Channels", "options": ["Blog", "Instagram", "Twitter/X", "LinkedIn", "TikTok", "YouTube", "Newsletter"] },
+              { "name": "monthYear", "type": "text", "label": "Planning Month (e.g., March 2026)", "required": true },
+              { "name": "brandVoice", "type": "textarea", "label": "Brand Voice Notes", "required": false },
+              { "name": "keyThemes", "type": "textarea", "label": "Key Themes or Product Launches", "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Retrieve brand guidelines and past top posts",
+          "config": {
+            "collectionName": "content_knowledge_base",
+            "query": "brand voice guidelines, top-performing posts for {{targetChannels}}, audience engagement patterns",
+            "topK": 10,
+            "scoreThreshold": 0.72
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "prompt_template",
+          "label": "Build editorial calendar prompt",
+          "config": {
+            "template": "You are an expert content strategist.\n\nCampaign: {{campaignName}}\nMonth: {{monthYear}}\nChannels: {{targetChannels}}\nKey Themes: {{keyThemes}}\nBrand Voice: {{brandVoice}}\n\nReference material from our knowledge base:\n{{ragResults}}\n\nCreate a detailed content calendar for the entire month. For each post include:\n- Date and day of week\n- Channel\n- Content type (e.g., carousel, reel, blog post, thread, newsletter)\n- Headline / hook\n- Brief description (2-3 sentences)\n- Suggested hashtags or keywords\n- Estimated engagement tier (high / medium / low)\n\nOrganize by week. Ensure a balanced distribution across channels and a mix of content types. Return the calendar as a structured JSON array."
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate content calendar with AI",
+          "config": {
+            "model": "gpt-4o",
+            "temperature": 0.7,
+            "maxTokens": 4000,
+            "prompt": "{{editorialPrompt}}"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse calendar into structured JSON",
+          "config": {
+            "format": "json",
+            "schema": {
+              "type": "array",
+              "items": {
+                "type": "object",
+                "properties": {
+                  "date": { "type": "string" },
+                  "dayOfWeek": { "type": "string" },
+                  "channel": { "type": "string" },
+                  "contentType": { "type": "string" },
+                  "headline": { "type": "string" },
+                  "description": { "type": "string" },
+                  "hashtags": { "type": "array", "items": { "type": "string" } },
+                  "engagementTier": { "type": "string", "enum": ["high", "medium", "low"] }
+                }
+              }
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Distribute calendar to email and project tool",
+          "config": {
+            "branches": ["emailBranch", "apiPublishBranch"]
+          }
+        }
+      },
+      {
+        "id": "node-7a",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 150 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email calendar to marketing team",
+          "config": {
+            "to": ["marketing-team@company.com", "content-lead@company.com"],
+            "subject": "Content Calendar - {{campaignName}} - {{monthYear}}",
+            "body": "<h2>{{campaignName}} Content Calendar</h2><p>Month: {{monthYear}}</p><p>Total posts planned: {{parsedCalendar.length}}</p><p>Please review the attached calendar and confirm assignments by end of week.</p>",
+            "from": "content-planner@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-7b",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 275 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Publish calendar to project management tool",
+          "config": {
+            "method": "POST",
+            "url": "{{env.PROJECT_MGMT_API_URL}}/boards/{{env.CONTENT_BOARD_ID}}/cards/bulk",
+            "headers": {
+              "Authorization": "Bearer {{secrets.PROJECT_MGMT_API_KEY}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "cards": "{{parsedCalendar}}"
+            },
+            "timeout": 15000
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "workflow_response",
+          "label": "Return calendar summary",
+          "config": {
+            "statusCode": 200,
+            "body": {
+              "campaign": "{{campaignName}}",
+              "month": "{{monthYear}}",
+              "totalPosts": "{{parsedCalendar.length}}",
+              "status": "published"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7a", "source": "node-6", "target": "node-7a", "sourceHandle": "branch-emailBranch", "targetHandle": "input" },
+      { "id": "e6-7b", "source": "node-6", "target": "node-7b", "sourceHandle": "branch-apiPublishBranch", "targetHandle": "input" },
+      { "id": "e7a-8", "source": "node-7a", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7b-8", "source": "node-7b", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-042-content-repurposing.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-042-content-repurposing.json
new file mode 100644
index 0000000..702405e
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-042-content-repurposing.json
@@ -0,0 +1,193 @@
+{
+  "id": "tpl-042",
+  "name": "Content Repurposing Pipeline",
+  "description": "Takes an original long-form article URL via a form, fetches the full content, splits it into logical sections, then runs three parallel AI branches to repurpose the content into a blog summary post, a set of social media snippets, and an email newsletter digest. After all branches complete, a join node merges the outputs, and an approval gate lets editors review before the repurposed assets are pushed to a CMS via API. Designed for content teams that need to maximize reach from a single piece of content.",
+  "category": "Content & Media",
+  "industry": ["Media", "Marketing"],
+  "tags": ["form", "content", "ai-repurpose", "parallel", "advanced"],
+  "stepCount": 10,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Enter article URL and repurposing preferences",
+          "config": {
+            "fields": [
+              { "name": "articleUrl", "type": "url", "label": "Original Article URL", "required": true },
+              { "name": "brandTone", "type": "select", "label": "Brand Tone", "options": ["Professional", "Casual", "Witty", "Authoritative"], "required": true },
+              { "name": "targetAudience", "type": "text", "label": "Target Audience Description", "required": true },
+              { "name": "cmsSlug", "type": "text", "label": "CMS Collection Slug", "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch original article content",
+          "config": {
+            "method": "GET",
+            "url": "{{articleUrl}}",
+            "headers": {
+              "Accept": "text/html"
+            },
+            "timeout": 20000,
+            "responseFormat": "text"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "split",
+          "label": "Split article into logical sections",
+          "config": {
+            "strategy": "semantic",
+            "maxChunkSize": 2000,
+            "overlapTokens": 100,
+            "preserveHeadings": true
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Repurpose into three content formats",
+          "config": {
+            "branches": ["blogSummary", "socialMedia", "emailNewsletter"]
+          }
+        }
+      },
+      {
+        "id": "node-5a",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 50 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate condensed blog summary post",
+          "config": {
+            "model": "gpt-4o",
+            "temperature": 0.6,
+            "maxTokens": 1500,
+            "prompt": "You are a content writer with a {{brandTone}} tone.\n\nOriginal article sections:\n{{articleSections}}\n\nTarget audience: {{targetAudience}}\n\nWrite a condensed blog summary post (400-600 words) that:\n- Captures the key insights from the original article\n- Has an engaging headline and subheadings\n- Includes a call-to-action linking to the full article\n- Uses the specified brand tone consistently\n\nReturn as JSON with fields: title, body (markdown), metaDescription, slug."
+          }
+        }
+      },
+      {
+        "id": "node-5b",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate social media snippets",
+          "config": {
+            "model": "gpt-4o-mini",
+            "temperature": 0.8,
+            "maxTokens": 1200,
+            "prompt": "You are a social media strategist with a {{brandTone}} voice.\n\nOriginal article sections:\n{{articleSections}}\n\nTarget audience: {{targetAudience}}\n\nCreate social media content for each platform:\n1. Twitter/X: 3 tweet-length posts (max 280 chars each) with relevant hashtags\n2. LinkedIn: 1 professional post (150-250 words) with a hook\n3. Instagram: 1 caption (100-200 words) with 10 hashtags and a carousel slide outline (5 slides)\n\nReturn as JSON with fields: tweets (array), linkedinPost (string), instagramCaption (string), instagramHashtags (array), carouselSlides (array of strings)."
+          }
+        }
+      },
+      {
+        "id": "node-5c",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 350 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate email newsletter digest",
+          "config": {
+            "model": "gpt-4o-mini",
+            "temperature": 0.5,
+            "maxTokens": 1000,
+            "prompt": "You are an email copywriter with a {{brandTone}} tone.\n\nOriginal article sections:\n{{articleSections}}\n\nTarget audience: {{targetAudience}}\n\nWrite an email newsletter digest that:\n- Has a compelling subject line (max 60 chars)\n- Opens with a personal, conversational hook\n- Summarizes the article's key takeaways in 3-5 bullet points\n- Includes a prominent CTA to read the full article\n- Has a preview text (max 120 chars)\n\nReturn as JSON with fields: subjectLine, previewText, htmlBody, plainTextBody."
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "join",
+          "label": "Merge all repurposed content",
+          "config": {
+            "strategy": "wait_all",
+            "timeout": 120000,
+            "outputMapping": {
+              "blogSummary": "node-5a.output",
+              "socialMedia": "node-5b.output",
+              "emailNewsletter": "node-5c.output"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Editor reviews repurposed content",
+          "config": {
+            "approvers": ["content-editor@company.com"],
+            "message": "Review the following repurposed content before publishing:\n\nBlog Summary: {{blogSummary.title}}\nSocial Posts: {{socialMedia.tweets.length}} tweets, 1 LinkedIn, 1 Instagram\nNewsletter: {{emailNewsletter.subjectLine}}\n\nApprove to publish to CMS.",
+            "timeout": 172800,
+            "escalateAfter": 86400,
+            "escalateTo": "marketing-director@company.com"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Publish repurposed assets to CMS",
+          "config": {
+            "method": "POST",
+            "url": "{{env.CMS_API_URL}}/collections/{{cmsSlug}}/entries/bulk",
+            "headers": {
+              "Authorization": "Bearer {{secrets.CMS_API_TOKEN}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "entries": [
+                { "type": "blog_summary", "data": "{{blogSummary}}" },
+                { "type": "social_media", "data": "{{socialMedia}}" },
+                { "type": "email_newsletter", "data": "{{emailNewsletter}}" }
+              ]
+            },
+            "timeout": 15000
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5a", "source": "node-4", "target": "node-5a", "sourceHandle": "branch-blogSummary", "targetHandle": "input" },
+      { "id": "e4-5b", "source": "node-4", "target": "node-5b", "sourceHandle": "branch-socialMedia", "targetHandle": "input" },
+      { "id": "e4-5c", "source": "node-4", "target": "node-5c", "sourceHandle": "branch-emailNewsletter", "targetHandle": "input" },
+      { "id": "e5a-6", "source": "node-5a", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5b-6", "source": "node-5b", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5c-6", "source": "node-5c", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "approved", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-043-blog-image-generation.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-043-blog-image-generation.json
new file mode 100644
index 0000000..a7f72d1
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-043-blog-image-generation.json
@@ -0,0 +1,204 @@
+{
+  "id": "tpl-043",
+  "name": "Blog Image Generation Pipeline",
+  "description": "Listens for a new blog post published event, uses AI to analyze the article content and generate tailored image prompts, then runs three parallel image generation branches to create a hero banner, a thumbnail, and a social share card. After all images are generated, they are uploaded to cloud storage, the blog post record is updated with the image URLs via API, and a notification is sent to the content team. Ideal for media and e-commerce teams that need consistent visual assets for every piece of content.",
+  "category": "Content & Media",
+  "industry": ["Media", "E-commerce"],
+  "tags": ["event", "ai-images", "content", "parallel", "advanced"],
+  "stepCount": 10,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "event_trigger",
+          "label": "New blog post published event",
+          "config": {
+            "eventName": "blog.post.published",
+            "source": "cms",
+            "filters": {
+              "status": "published",
+              "hasHeroImage": false
+            }
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Analyze article and generate image prompts",
+          "config": {
+            "model": "gpt-4o",
+            "temperature": 0.7,
+            "maxTokens": 1500,
+            "prompt": "You are a creative director specializing in blog visual assets.\n\nArticle title: {{event.title}}\nArticle excerpt: {{event.excerpt}}\nCategory: {{event.category}}\nTags: {{event.tags}}\n\nGenerate three detailed image generation prompts for:\n1. Hero Banner (1200x630px): A visually striking, editorial-quality image that captures the article's main theme. Should work as a page header.\n2. Thumbnail (400x400px): A compact, recognizable image for grid/list views. Bold and simple composition.\n3. Social Share Card (1200x630px): Eye-catching image optimized for social media feeds. Should include visual elements that create curiosity.\n\nFor each prompt, specify: style (photographic, illustration, 3D render), mood, color palette, key visual elements, and composition notes.\n\nReturn as JSON with fields: heroPrompt, thumbnailPrompt, socialPrompt."
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Generate three image variants simultaneously",
+          "config": {
+            "branches": ["heroBranch", "thumbnailBranch", "socialBranch"]
+          }
+        }
+      },
+      {
+        "id": "node-4a",
+        "type": "workflow",
+        "position": { "x": 850, "y": 50 },
+        "data": {
+          "nodeType": "generate_image",
+          "label": "Generate hero banner image",
+          "config": {
+            "provider": "fal-ai",
+            "model": "flux-pro",
+            "prompt": "{{heroPrompt}}",
+            "width": 1200,
+            "height": 630,
+            "steps": 30,
+            "guidanceScale": 7.5,
+            "negativePrompt": "text, watermark, blurry, low quality, distorted"
+          }
+        }
+      },
+      {
+        "id": "node-4b",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "generate_image",
+          "label": "Generate thumbnail image",
+          "config": {
+            "provider": "fal-ai",
+            "model": "flux-pro",
+            "prompt": "{{thumbnailPrompt}}",
+            "width": 400,
+            "height": 400,
+            "steps": 25,
+            "guidanceScale": 7.0,
+            "negativePrompt": "text, watermark, blurry, low quality, complex background"
+          }
+        }
+      },
+      {
+        "id": "node-4c",
+        "type": "workflow",
+        "position": { "x": 850, "y": 350 },
+        "data": {
+          "nodeType": "generate_image",
+          "label": "Generate social share card image",
+          "config": {
+            "provider": "fal-ai",
+            "model": "flux-pro",
+            "prompt": "{{socialPrompt}}",
+            "width": 1200,
+            "height": 630,
+            "steps": 30,
+            "guidanceScale": 8.0,
+            "negativePrompt": "text, watermark, blurry, low quality, distorted, dull colors"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "join",
+          "label": "Wait for all images to complete",
+          "config": {
+            "strategy": "wait_all",
+            "timeout": 180000,
+            "outputMapping": {
+              "heroImage": "node-4a.output",
+              "thumbnailImage": "node-4b.output",
+              "socialImage": "node-4c.output"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "storage_action",
+          "label": "Upload all images to cloud storage",
+          "config": {
+            "provider": "s3",
+            "bucket": "{{env.MEDIA_BUCKET_NAME}}",
+            "region": "{{env.AWS_REGION}}",
+            "accessKeyId": "{{secrets.AWS_ACCESS_KEY_ID}}",
+            "secretAccessKey": "{{secrets.AWS_SECRET_ACCESS_KEY}}",
+            "uploads": [
+              { "source": "{{heroImage.url}}", "destination": "blog/{{event.slug}}/hero.webp", "contentType": "image/webp" },
+              { "source": "{{thumbnailImage.url}}", "destination": "blog/{{event.slug}}/thumbnail.webp", "contentType": "image/webp" },
+              { "source": "{{socialImage.url}}", "destination": "blog/{{event.slug}}/social.webp", "contentType": "image/webp" }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Update blog post with image URLs",
+          "config": {
+            "method": "PATCH",
+            "url": "{{env.CMS_API_URL}}/posts/{{event.postId}}",
+            "headers": {
+              "Authorization": "Bearer {{secrets.CMS_API_TOKEN}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "heroImageUrl": "{{storageResults.uploads[0].publicUrl}}",
+              "thumbnailUrl": "{{storageResults.uploads[1].publicUrl}}",
+              "socialImageUrl": "{{storageResults.uploads[2].publicUrl}}"
+            },
+            "timeout": 10000
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify content team of generated images",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_CONTENT_WEBHOOK_URL}}",
+            "message": "Images generated for blog post \"{{event.title}}\":\n- Hero: {{storageResults.uploads[0].publicUrl}}\n- Thumbnail: {{storageResults.uploads[1].publicUrl}}\n- Social: {{storageResults.uploads[2].publicUrl}}\n\nAll images have been attached to the post."
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4a", "source": "node-3", "target": "node-4a", "sourceHandle": "branch-heroBranch", "targetHandle": "input" },
+      { "id": "e3-4b", "source": "node-3", "target": "node-4b", "sourceHandle": "branch-thumbnailBranch", "targetHandle": "input" },
+      { "id": "e3-4c", "source": "node-3", "target": "node-4c", "sourceHandle": "branch-socialBranch", "targetHandle": "input" },
+      { "id": "e4a-5", "source": "node-4a", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4b-5", "source": "node-4b", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4c-5", "source": "node-4c", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-044-inventory-auto-order.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-044-inventory-auto-order.json
new file mode 100644
index 0000000..c422a8a
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-044-inventory-auto-order.json
@@ -0,0 +1,140 @@
+{
+  "id": "tpl-044",
+  "name": "Restaurant Inventory Auto-Order",
+  "description": "Runs on a nightly schedule to query current inventory levels from the restaurant's database, filters for items that have dropped below their reorder threshold, loops through each low-stock item to build purchase order line items from a supplier template, routes the order through a manager approval gate, emails the finalized purchase order to the supplier, and updates the inventory records to reflect the pending restock. Designed for restaurants and hospitality businesses that need automated supply chain management to prevent stockouts during peak service.",
+  "category": "Food & Restaurant",
+  "industry": ["Food & Beverage", "Hospitality"],
+  "tags": ["scheduled", "inventory", "restaurant", "ordering", "intermediate"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run nightly at 11 PM after service",
+          "config": {
+            "schedule": "0 23 * * *",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Query current inventory levels",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT i.id, i.item_name, i.current_quantity, i.unit, i.reorder_threshold, i.reorder_quantity, i.category, s.supplier_name, s.email AS supplier_email, s.lead_time_days FROM inventory i JOIN suppliers s ON i.preferred_supplier_id = s.id WHERE i.current_quantity <= i.reorder_threshold AND i.is_active = true ORDER BY i.category, i.item_name"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Filter items not already on pending order",
+          "config": {
+            "condition": "item.pending_order_id IS NULL AND item.current_quantity <= item.reorder_threshold",
+            "passThrough": "matching"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Build purchase order line items",
+          "config": {
+            "collection": "{{filteredItems}}",
+            "itemVariable": "item",
+            "indexVariable": "idx",
+            "operation": {
+              "type": "map",
+              "expression": "{ lineNumber: idx + 1, itemId: item.id, itemName: item.item_name, quantity: item.reorder_quantity, unit: item.unit, category: item.category, supplierName: item.supplier_name, supplierEmail: item.supplier_email, estimatedDelivery: addDays(now(), item.lead_time_days) }"
+            },
+            "maxIterations": 200
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format purchase order document",
+          "config": {
+            "template": "<h2>Purchase Order - {{formatDate(now(), 'YYYY-MM-DD')}}</h2><p><strong>Restaurant:</strong> {{env.RESTAURANT_NAME}}</p><p><strong>Order Date:</strong> {{formatDate(now(), 'MMMM D, YYYY')}}</p><table border='1' cellpadding='8'><thead><tr><th>#</th><th>Item</th><th>Quantity</th><th>Unit</th><th>Category</th><th>Est. Delivery</th></tr></thead><tbody>{{#each orderLines}}<tr><td>{{this.lineNumber}}</td><td>{{this.itemName}}</td><td>{{this.quantity}}</td><td>{{this.unit}}</td><td>{{this.category}}</td><td>{{formatDate(this.estimatedDelivery, 'MMM D')}}</td></tr>{{/each}}</tbody></table><p><strong>Total Items:</strong> {{orderLines.length}}</p>"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Manager approves purchase order",
+          "config": {
+            "approvers": ["kitchen-manager@restaurant.com", "owner@restaurant.com"],
+            "message": "Review the auto-generated purchase order for {{orderLines.length}} items below reorder threshold.\n\nItems include: {{orderLines | map('itemName') | join(', ')}}",
+            "timeout": 28800,
+            "autoApproveAfter": null,
+            "escalateTo": "owner@restaurant.com"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email purchase order to suppliers",
+          "config": {
+            "to": "{{uniqueSupplierEmails}}",
+            "subject": "Purchase Order from {{env.RESTAURANT_NAME}} - {{formatDate(now(), 'YYYY-MM-DD')}}",
+            "body": "{{purchaseOrderHtml}}",
+            "from": "orders@restaurant.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}",
+            "replyTo": "kitchen-manager@restaurant.com"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Update inventory with pending order status",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "UPDATE inventory SET pending_order_id = {{orderId}}, pending_order_date = NOW(), last_reorder_date = NOW() WHERE id = ANY({{orderItemIds}}) RETURNING id, item_name, pending_order_id"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "approved", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-045-menu-performance-analysis.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-045-menu-performance-analysis.json
new file mode 100644
index 0000000..4f01616
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-045-menu-performance-analysis.json
@@ -0,0 +1,105 @@
+{
+  "id": "tpl-045",
+  "name": "Menu Performance Analysis",
+  "description": "Runs weekly to query POS sales data by menu item, calculates performance metrics such as contribution margin, popularity ranking, and food cost percentage using a code runner, sends the aggregated data to an LLM for strategic menu engineering recommendations, formats the analysis into a professional HTML report, and emails it to restaurant management. Ideal for food and beverage businesses that want data-driven menu optimization without manual spreadsheet work.",
+  "category": "Food & Restaurant",
+  "industry": ["Food & Beverage"],
+  "tags": ["scheduled", "restaurant", "analytics", "ai-analysis", "intermediate"],
+  "stepCount": 6,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every Monday at 6 AM",
+          "config": {
+            "schedule": "0 6 * * 1",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Query last week's sales by menu item",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT mi.id, mi.name AS item_name, mi.category, mi.price, mi.food_cost, COUNT(oi.id) AS units_sold, SUM(oi.quantity * oi.unit_price) AS total_revenue, AVG(r.rating) AS avg_rating, COUNT(DISTINCT o.id) AS order_appearances FROM menu_items mi LEFT JOIN order_items oi ON mi.id = oi.menu_item_id LEFT JOIN orders o ON oi.order_id = o.id AND o.created_at >= CURRENT_DATE - INTERVAL '7 days' AND o.created_at < CURRENT_DATE LEFT JOIN reviews r ON mi.id = r.menu_item_id AND r.created_at >= CURRENT_DATE - INTERVAL '7 days' WHERE mi.is_active = true GROUP BY mi.id, mi.name, mi.category, mi.price, mi.food_cost ORDER BY total_revenue DESC NULLS LAST"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "code_runner",
+          "label": "Calculate menu engineering metrics",
+          "config": {
+            "language": "javascript",
+            "code": "const items = input.rows;\nconst totalRevenue = items.reduce((sum, i) => sum + (i.total_revenue || 0), 0);\nconst totalUnits = items.reduce((sum, i) => sum + (i.units_sold || 0), 0);\nconst avgPopularity = totalUnits / Math.max(items.length, 1);\nconst avgMargin = items.reduce((sum, i) => sum + ((i.price - i.food_cost) / Math.max(i.price, 0.01)), 0) / Math.max(items.length, 1);\n\nconst analyzed = items.map(item => {\n  const margin = item.price > 0 ? (item.price - item.food_cost) / item.price : 0;\n  const foodCostPct = item.price > 0 ? (item.food_cost / item.price) * 100 : 0;\n  const isPopular = (item.units_sold || 0) >= avgPopularity;\n  const isProfitable = margin >= avgMargin;\n  let classification;\n  if (isPopular && isProfitable) classification = 'Star';\n  else if (isPopular && !isProfitable) classification = 'Plow Horse';\n  else if (!isPopular && isProfitable) classification = 'Puzzle';\n  else classification = 'Dog';\n  return { ...item, contributionMargin: margin, foodCostPercentage: foodCostPct, classification, revenueShare: totalRevenue > 0 ? ((item.total_revenue || 0) / totalRevenue * 100) : 0 };\n});\n\nreturn { items: analyzed, summary: { totalRevenue, totalUnits, itemCount: items.length, avgMargin: (avgMargin * 100), stars: analyzed.filter(i => i.classification === 'Star').length, dogs: analyzed.filter(i => i.classification === 'Dog').length } };",
+            "timeout": 10000
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate menu optimization recommendations",
+          "config": {
+            "model": "gpt-4o",
+            "temperature": 0.5,
+            "maxTokens": 2000,
+            "prompt": "You are a restaurant consultant specializing in menu engineering.\n\nWeekly Performance Summary:\n- Total Revenue: ${{summary.totalRevenue}}\n- Total Units Sold: {{summary.totalUnits}}\n- Active Menu Items: {{summary.itemCount}}\n- Stars (high popularity + high margin): {{summary.stars}}\n- Dogs (low popularity + low margin): {{summary.dogs}}\n\nDetailed Item Analysis:\n{{#each items}}{{this.item_name}} | Category: {{this.category}} | Price: ${{this.price}} | Food Cost: ${{this.food_cost}} | Units Sold: {{this.units_sold}} | Revenue: ${{this.total_revenue}} | Margin: {{this.contributionMargin}}% | Classification: {{this.classification}} | Avg Rating: {{this.avg_rating}}\n{{/each}}\n\nProvide:\n1. Top 3 actionable recommendations for menu optimization\n2. Items to consider removing or repricing (Dogs with low ratings)\n3. Items with upsell potential (Puzzles with high margins)\n4. Suggested new item categories based on gaps\n5. Food cost alerts (items with food cost percentage above 35%)\n\nBe specific with numbers and item names. Keep recommendations practical for a restaurant operator."
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Format menu performance report",
+          "config": {
+            "template": "<h2>Weekly Menu Performance Report</h2><p>Period: {{formatDate(subtractDays(now(), 7), 'MMM D')}} - {{formatDate(now(), 'MMM D, YYYY')}}</p><h3>Summary</h3><table border='1' cellpadding='6'><tr><td><strong>Total Revenue</strong></td><td>${{summary.totalRevenue}}</td></tr><tr><td><strong>Units Sold</strong></td><td>{{summary.totalUnits}}</td></tr><tr><td><strong>Stars</strong></td><td>{{summary.stars}} items</td></tr><tr><td><strong>Dogs</strong></td><td>{{summary.dogs}} items</td></tr></table><h3>Item Details</h3><table border='1' cellpadding='6'><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Units</th><th>Revenue</th><th>Margin</th><th>Class</th></tr></thead><tbody>{{#each items}}<tr><td>{{this.item_name}}</td><td>{{this.category}}</td><td>${{this.price}}</td><td>{{this.units_sold}}</td><td>${{this.total_revenue}}</td><td>{{this.contributionMargin}}%</td><td>{{this.classification}}</td></tr>{{/each}}</tbody></table><h3>AI Recommendations</h3><div>{{aiRecommendations}}</div>"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email report to restaurant management",
+          "config": {
+            "to": ["owner@restaurant.com", "head-chef@restaurant.com", "gm@restaurant.com"],
+            "subject": "Weekly Menu Performance Report - {{formatDate(now(), 'MMM D, YYYY')}}",
+            "body": "{{menuReportHtml}}",
+            "from": "analytics@restaurant.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-046-contract-review-summary.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-046-contract-review-summary.json
new file mode 100644
index 0000000..5a6fee7
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-046-contract-review-summary.json
@@ -0,0 +1,170 @@
+{
+  "id": "tpl-046",
+  "name": "Contract Review & Summary",
+  "description": "Accepts a contract document via file upload, reads the full text content, splits the document into clause-level sections, processes sections in batches through an LLM for detailed clause-by-clause analysis, merges all clause analyses into a unified dataset, runs a second LLM pass to produce an executive summary with risk assessments and key obligations, routes the summary through a legal team approval gate, and emails the finalized review to stakeholders. Designed for legal teams and professional services firms that review high volumes of contracts and need consistent, AI-assisted due diligence.",
+  "category": "Legal & Compliance",
+  "industry": ["Legal", "Professional Services"],
+  "tags": ["file-upload", "legal", "ai-review", "contracts", "advanced"],
+  "stepCount": 9,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "file_upload_trigger",
+          "label": "Contract document uploaded",
+          "config": {
+            "allowedMimeTypes": ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
+            "maxFileSizeMb": 25,
+            "storagePath": "uploads/contracts/{{timestamp}}-{{originalFilename}}"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "read_file",
+          "label": "Extract text from uploaded contract",
+          "config": {
+            "filePath": "{{uploadedFile.storagePath}}",
+            "extractionMode": "full_text",
+            "ocrEnabled": true,
+            "preserveStructure": true,
+            "maxPages": 100
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "split",
+          "label": "Split contract into clause-level sections",
+          "config": {
+            "strategy": "heading_based",
+            "headingPatterns": ["^\\d+\\.\\s+", "^ARTICLE\\s+", "^Section\\s+", "^CLAUSE\\s+"],
+            "fallbackChunkSize": 3000,
+            "overlapTokens": 150,
+            "preserveClauseNumbers": true
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "batch",
+          "label": "Batch clauses for parallel LLM processing",
+          "config": {
+            "batchSize": 5,
+            "concurrency": 3,
+            "retryOnFailure": true,
+            "maxRetries": 2
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Analyze each clause for risks and obligations",
+          "config": {
+            "model": "gpt-4o",
+            "temperature": 0.2,
+            "maxTokens": 1500,
+            "prompt": "You are a senior contract attorney performing due diligence.\n\nAnalyze the following contract clause:\n\n{{clauseText}}\n\nFor this clause, provide:\n1. **Clause Type**: (e.g., Indemnification, Limitation of Liability, Confidentiality, Term/Termination, Payment, IP Rights, Force Majeure, Non-Compete, Data Protection, Governing Law, Other)\n2. **Risk Level**: HIGH / MEDIUM / LOW with specific justification\n3. **Key Obligations**: List each party's obligations under this clause\n4. **Red Flags**: Any unusual, one-sided, or potentially problematic terms\n5. **Missing Protections**: Standard protections that are absent\n6. **Recommended Changes**: Specific suggested edits or additions\n\nReturn as JSON with fields: clauseNumber, clauseType, riskLevel, riskJustification, obligations (array), redFlags (array), missingProtections (array), recommendations (array)."
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "merge_data",
+          "label": "Merge all clause analyses into unified report",
+          "config": {
+            "strategy": "array_concat",
+            "sortBy": "clauseNumber",
+            "deduplication": false,
+            "addSummaryStats": true,
+            "statsFields": {
+              "totalClauses": "count",
+              "highRiskClauses": "count(riskLevel == 'HIGH')",
+              "mediumRiskClauses": "count(riskLevel == 'MEDIUM')",
+              "clauseTypes": "distinct(clauseType)"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate executive summary and risk assessment",
+          "config": {
+            "model": "gpt-4o",
+            "temperature": 0.3,
+            "maxTokens": 2500,
+            "prompt": "You are a senior legal advisor preparing an executive contract review summary.\n\nContract: {{uploadedFile.originalFilename}}\nTotal Clauses Analyzed: {{stats.totalClauses}}\nHigh Risk: {{stats.highRiskClauses}} | Medium Risk: {{stats.mediumRiskClauses}}\n\nClause-by-Clause Analysis:\n{{#each clauseAnalyses}}Clause {{this.clauseNumber}}: {{this.clauseType}} ({{this.riskLevel}})\n- Red Flags: {{this.redFlags}}\n- Recommendations: {{this.recommendations}}\n{{/each}}\n\nProduce an executive summary that includes:\n1. **Overall Risk Assessment**: Overall contract risk rating with justification\n2. **Critical Issues** (must address before signing): List with clause references\n3. **Negotiation Points**: Top 5 terms to negotiate, ordered by business impact\n4. **Key Dates and Deadlines**: Any time-sensitive obligations\n5. **Financial Exposure**: Summary of payment terms, penalties, liability caps\n6. **Recommendation**: Sign as-is / Sign with modifications / Do not sign / Needs further review\n\nFormat as professional HTML suitable for executive stakeholders."
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Legal team reviews and approves summary",
+          "config": {
+            "approvers": ["lead-counsel@company.com", "legal-director@company.com"],
+            "message": "Review the AI-assisted contract analysis for {{uploadedFile.originalFilename}}.\n\nHigh-risk clauses found: {{stats.highRiskClauses}}\nOverall recommendation: {{executiveSummary.recommendation}}\n\nPlease verify accuracy before distributing to business stakeholders.",
+            "timeout": 259200,
+            "escalateAfter": 172800,
+            "escalateTo": "general-counsel@company.com"
+          }
+        }
+      },
+      {
+        "id": "node-9",
+        "type": "workflow",
+        "position": { "x": 2100, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email approved review to stakeholders",
+          "config": {
+            "to": ["business-dev@company.com", "cfo@company.com"],
+            "cc": ["lead-counsel@company.com"],
+            "subject": "Contract Review Complete: {{uploadedFile.originalFilename}}",
+            "body": "{{executiveSummaryHtml}}",
+            "from": "legal@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e8-9", "source": "node-8", "target": "node-9", "sourceHandle": "approved", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-047-license-expiry-tracking.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-047-license-expiry-tracking.json
new file mode 100644
index 0000000..9916be7
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-047-license-expiry-tracking.json
@@ -0,0 +1,145 @@
+{
+  "id": "tpl-047",
+  "name": "License & Permit Expiry Tracking",
+  "description": "Runs daily to check a database of business licenses, health permits, and regulatory certifications for upcoming expirations. Filters for licenses expiring within configurable warning windows, loops through each expiring license, and uses a switch node to route notifications by urgency level: critical (expired or within 7 days), warning (within 30 days), or advisory (within 90 days). Critical items trigger immediate Slack/SMS notifications, while warnings and advisories go via email. Designed for restaurants, food businesses, government agencies, and any organization that must maintain current licenses to operate legally.",
+  "category": "Legal & Compliance",
+  "industry": ["Legal", "Government", "Food & Beverage"],
+  "tags": ["scheduled", "legal", "compliance", "tracking", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run daily at 8 AM",
+          "config": {
+            "schedule": "0 8 * * *",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Query all licenses expiring within 90 days",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT l.id, l.license_type, l.license_number, l.issuing_authority, l.expiry_date, l.holder_name, l.holder_email, l.department, l.renewal_url, l.notes, EXTRACT(DAY FROM l.expiry_date - CURRENT_DATE) AS days_until_expiry, CASE WHEN l.expiry_date < CURRENT_DATE THEN 'expired' WHEN l.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'critical' WHEN l.expiry_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'warning' ELSE 'advisory' END AS urgency FROM licenses l WHERE l.expiry_date <= CURRENT_DATE + INTERVAL '90 days' AND l.is_active = true AND l.renewal_status != 'completed' ORDER BY l.expiry_date ASC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Exclude already-notified licenses (today)",
+          "config": {
+            "condition": "license.last_notification_date IS NULL OR license.last_notification_date < CURRENT_DATE",
+            "passThrough": "matching"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each expiring license",
+          "config": {
+            "collection": "{{filteredLicenses}}",
+            "itemVariable": "license",
+            "indexVariable": "idx",
+            "maxIterations": 500
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route by urgency level",
+          "config": {
+            "expression": "{{license.urgency}}",
+            "cases": [
+              {
+                "value": "expired",
+                "label": "Already expired - critical alert",
+                "targetNode": "node-6"
+              },
+              {
+                "value": "critical",
+                "label": "Expiring within 7 days - critical alert",
+                "targetNode": "node-6"
+              },
+              {
+                "value": "warning",
+                "label": "Expiring within 30 days - email warning",
+                "targetNode": "node-7"
+              },
+              {
+                "value": "advisory",
+                "label": "Expiring within 90 days - email advisory",
+                "targetNode": "node-7"
+              }
+            ],
+            "default": "node-7"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 150 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send critical Slack alert for urgent expirations",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_COMPLIANCE_WEBHOOK_URL}}",
+            "message": "URGENT LICENSE ALERT\n\nLicense: {{license.license_type}}\nNumber: {{license.license_number}}\nHolder: {{license.holder_name}} ({{license.department}})\nExpiry: {{license.expiry_date}} ({{license.days_until_expiry}} days)\nStatus: {{license.urgency | uppercase}}\nIssuing Authority: {{license.issuing_authority}}\n\nRenewal Link: {{license.renewal_url}}\n\nImmediate action required to avoid regulatory penalties.",
+            "priority": "high"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 275 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email license expiry notice to holder",
+          "config": {
+            "to": ["{{license.holder_email}}", "compliance@company.com"],
+            "subject": "[{{license.urgency | uppercase}}] License Expiring: {{license.license_type}} - {{license.license_number}}",
+            "body": "<h2>License Expiry Notice</h2><p><strong>Status:</strong> {{license.urgency | uppercase}}</p><p><strong>License:</strong> {{license.license_type}} ({{license.license_number}})</p><p><strong>Holder:</strong> {{license.holder_name}} - {{license.department}}</p><p><strong>Expiry Date:</strong> {{license.expiry_date}}</p><p><strong>Days Remaining:</strong> {{license.days_until_expiry}}</p><p><strong>Issuing Authority:</strong> {{license.issuing_authority}}</p><p><a href='{{license.renewal_url}}'>Start Renewal Process</a></p><p>{{license.notes}}</p>",
+            "from": "compliance@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "case-expired", "targetHandle": "input" },
+      { "id": "e5-6b", "source": "node-5", "target": "node-6", "sourceHandle": "case-critical", "targetHandle": "input" },
+      { "id": "e5-7", "source": "node-5", "target": "node-7", "sourceHandle": "case-warning", "targetHandle": "input" },
+      { "id": "e5-7b", "source": "node-5", "target": "node-7", "sourceHandle": "case-advisory", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-048-support-ticket-triage.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-048-support-ticket-triage.json
new file mode 100644
index 0000000..7982d5d
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-048-support-ticket-triage.json
@@ -0,0 +1,168 @@
+{
+  "id": "tpl-048",
+  "name": "AI Support Ticket Triage",
+  "description": "Receives new support tickets via webhook, queries a RAG knowledge base to find relevant documentation and past solutions, uses an LLM to classify the ticket priority, determine the appropriate team, and draft a response, parses the AI output into structured fields, then simultaneously updates the ticket in the support system via API and sends an acknowledgment email to the customer. Designed for SaaS and e-commerce companies that need fast, consistent first-response handling of customer support requests.",
+  "category": "Customer Service",
+  "industry": ["SaaS", "E-commerce"],
+  "tags": ["webhook", "support", "ai-triage", "rag", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "webhook_trigger",
+          "label": "New support ticket received via webhook",
+          "config": {
+            "path": "/webhooks/support-ticket",
+            "method": "POST",
+            "authentication": {
+              "type": "hmac",
+              "secret": "{{secrets.WEBHOOK_SIGNING_SECRET}}",
+              "header": "X-Signature-256"
+            },
+            "expectedFields": ["ticketId", "subject", "body", "customerEmail", "customerName", "source", "priority"]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Search knowledge base for relevant docs and past tickets",
+          "config": {
+            "collectionName": "support_knowledge_base",
+            "query": "{{webhook.subject}} {{webhook.body}}",
+            "topK": 8,
+            "scoreThreshold": 0.65,
+            "filters": {
+              "type": ["documentation", "faq", "resolved_ticket"]
+            },
+            "includeMetadata": true
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Classify, route, and draft response",
+          "config": {
+            "model": "gpt-4o",
+            "temperature": 0.3,
+            "maxTokens": 1500,
+            "prompt": "You are a senior customer support agent performing ticket triage.\n\nTicket Details:\n- ID: {{webhook.ticketId}}\n- Subject: {{webhook.subject}}\n- Body: {{webhook.body}}\n- Customer: {{webhook.customerName}} ({{webhook.customerEmail}})\n- Source: {{webhook.source}}\n- Reported Priority: {{webhook.priority}}\n\nRelevant Knowledge Base Results:\n{{#each ragResults}}[{{this.metadata.type}}] {{this.content}} (Score: {{this.score}})\n{{/each}}\n\nPerform the following:\n1. **Priority Classification**: Assign P1 (critical/outage), P2 (high/degraded), P3 (medium/workaround exists), or P4 (low/question). Justify based on business impact.\n2. **Category**: billing, technical, account, feature_request, bug_report, general_inquiry\n3. **Assigned Team**: engineering, billing_ops, account_management, product, general_support\n4. **Sentiment**: positive, neutral, frustrated, angry\n5. **Draft Response**: Write a professional, empathetic customer-facing response that acknowledges the issue, provides any immediately helpful information from the knowledge base, and sets expectations for resolution timeline.\n6. **Internal Notes**: Summary for the support agent, including relevant KB article IDs and suggested next steps.\n\nReturn as JSON with fields: priority, priorityJustification, category, assignedTeam, sentiment, draftResponse, internalNotes, suggestedKbArticles (array of IDs)."
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse triage results into structured fields",
+          "config": {
+            "format": "json",
+            "schema": {
+              "type": "object",
+              "properties": {
+                "priority": { "type": "string", "enum": ["P1", "P2", "P3", "P4"] },
+                "priorityJustification": { "type": "string" },
+                "category": { "type": "string" },
+                "assignedTeam": { "type": "string" },
+                "sentiment": { "type": "string" },
+                "draftResponse": { "type": "string" },
+                "internalNotes": { "type": "string" },
+                "suggestedKbArticles": { "type": "array", "items": { "type": "string" } }
+              },
+              "required": ["priority", "category", "assignedTeam", "draftResponse"]
+            },
+            "fallbackOnParseError": {
+              "priority": "P3",
+              "category": "general_inquiry",
+              "assignedTeam": "general_support"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Update ticket system and notify customer simultaneously",
+          "config": {
+            "branches": ["updateTicket", "emailCustomer"]
+          }
+        }
+      },
+      {
+        "id": "node-5a",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 150 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Update ticket in support system with triage data",
+          "config": {
+            "method": "PUT",
+            "url": "{{env.SUPPORT_API_URL}}/tickets/{{webhook.ticketId}}",
+            "headers": {
+              "Authorization": "Bearer {{secrets.SUPPORT_API_TOKEN}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "priority": "{{triageResult.priority}}",
+              "category": "{{triageResult.category}}",
+              "assignedTeam": "{{triageResult.assignedTeam}}",
+              "sentiment": "{{triageResult.sentiment}}",
+              "internalNotes": "{{triageResult.internalNotes}}",
+              "suggestedKbArticles": "{{triageResult.suggestedKbArticles}}",
+              "aiTriaged": true,
+              "triagedAt": "{{now()}}"
+            },
+            "timeout": 10000
+          }
+        }
+      },
+      {
+        "id": "node-5b",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 275 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send acknowledgment email to customer",
+          "config": {
+            "to": ["{{webhook.customerEmail}}"],
+            "subject": "Re: {{webhook.subject}} [Ticket #{{webhook.ticketId}}]",
+            "body": "{{triageResult.draftResponse}}",
+            "from": "support@company.com",
+            "replyTo": "support+{{webhook.ticketId}}@company.com",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}",
+            "headers": {
+              "X-Ticket-Id": "{{webhook.ticketId}}",
+              "X-Priority": "{{triageResult.priority}}"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-5a", "source": "node-5", "target": "node-5a", "sourceHandle": "branch-updateTicket", "targetHandle": "input" },
+      { "id": "e5-5b", "source": "node-5", "target": "node-5b", "sourceHandle": "branch-emailCustomer", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-049-churn-risk-detection.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-049-churn-risk-detection.json
new file mode 100644
index 0000000..7250260
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-049-churn-risk-detection.json
@@ -0,0 +1,136 @@
+{
+  "id": "tpl-049",
+  "name": "Churn Risk Detection & Outreach",
+  "description": "Runs weekly to query customer engagement metrics from the database, sends the behavioral data to an LLM for churn probability scoring and risk factor analysis, parses the predictions into structured output, filters for customers above the risk threshold, loops through each at-risk customer, and sends personalized retention notifications to the customer success team. Designed for SaaS companies that want proactive churn prevention powered by AI-driven behavioral analysis rather than waiting for cancellation signals.",
+  "category": "Customer Service",
+  "industry": ["SaaS"],
+  "tags": ["scheduled", "churn", "ai-prediction", "customer-success", "advanced"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every Monday at 9 AM",
+          "config": {
+            "schedule": "0 9 * * 1",
+            "timezone": "UTC"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Query customer engagement metrics (last 30 days)",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT u.id AS user_id, u.email, u.full_name, u.company_name, u.plan_name, u.plan_mrr, u.created_at AS signup_date, EXTRACT(DAY FROM NOW() - u.last_login_at) AS days_since_last_login, COALESCE(a.sessions_last_30d, 0) AS sessions_last_30d, COALESCE(a.sessions_prev_30d, 0) AS sessions_prev_30d, COALESCE(a.features_used_last_30d, 0) AS features_used_last_30d, COALESCE(a.api_calls_last_30d, 0) AS api_calls_last_30d, COALESCE(t.open_tickets, 0) AS open_support_tickets, COALESCE(t.avg_satisfaction_score, 0) AS avg_satisfaction_score, CASE WHEN u.billing_failures > 0 THEN true ELSE false END AS has_billing_issues, u.contract_end_date FROM users u LEFT JOIN ( SELECT user_id, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) AS sessions_last_30d, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days' THEN 1 END) AS sessions_prev_30d, COUNT(DISTINCT CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN feature_name END) AS features_used_last_30d, COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' AND event_type = 'api_call' THEN 1 END) AS api_calls_last_30d FROM activity_log GROUP BY user_id ) a ON u.id = a.user_id LEFT JOIN ( SELECT customer_id, COUNT(CASE WHEN status = 'open' THEN 1 END) AS open_tickets, AVG(satisfaction_score) AS avg_satisfaction_score FROM support_tickets WHERE created_at >= NOW() - INTERVAL '90 days' GROUP BY customer_id ) t ON u.id = t.customer_id WHERE u.is_active = true AND u.plan_name != 'free' ORDER BY u.plan_mrr DESC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Score churn risk and identify risk factors",
+          "config": {
+            "model": "gpt-4o",
+            "temperature": 0.2,
+            "maxTokens": 4000,
+            "prompt": "You are a customer success data scientist. Analyze the following customer engagement data and predict churn risk for each customer.\n\nCustomer Data:\n{{#each customers}}Customer {{this.user_id}} ({{this.company_name}}):\n- Plan: {{this.plan_name}} (${{this.plan_mrr}}/mo)\n- Days since last login: {{this.days_since_last_login}}\n- Sessions (last 30d): {{this.sessions_last_30d}} (prev 30d: {{this.sessions_prev_30d}})\n- Features used (30d): {{this.features_used_last_30d}}\n- API calls (30d): {{this.api_calls_last_30d}}\n- Open support tickets: {{this.open_support_tickets}}\n- Avg satisfaction: {{this.avg_satisfaction_score}}/5\n- Billing issues: {{this.has_billing_issues}}\n- Contract ends: {{this.contract_end_date}}\n{{/each}}\n\nFor each customer, provide:\n1. churnProbability: 0.0-1.0 score\n2. riskLevel: critical (>0.8), high (0.6-0.8), medium (0.4-0.6), low (<0.4)\n3. topRiskFactors: top 3 contributing factors (e.g., 'Login frequency dropped 70%', 'No feature adoption in 2 weeks')\n4. recommendedAction: specific retention action for the CS team\n5. urgency: immediate, this_week, next_review\n\nReturn as JSON array of objects with fields: userId, companyName, churnProbability, riskLevel, topRiskFactors (array of strings), recommendedAction (string), urgency (string)."
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse churn predictions into structured data",
+          "config": {
+            "format": "json",
+            "schema": {
+              "type": "array",
+              "items": {
+                "type": "object",
+                "properties": {
+                  "userId": { "type": "string" },
+                  "companyName": { "type": "string" },
+                  "churnProbability": { "type": "number", "minimum": 0, "maximum": 1 },
+                  "riskLevel": { "type": "string", "enum": ["critical", "high", "medium", "low"] },
+                  "topRiskFactors": { "type": "array", "items": { "type": "string" } },
+                  "recommendedAction": { "type": "string" },
+                  "urgency": { "type": "string", "enum": ["immediate", "this_week", "next_review"] }
+                },
+                "required": ["userId", "churnProbability", "riskLevel", "recommendedAction"]
+              }
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Filter customers above churn risk threshold",
+          "config": {
+            "condition": "prediction.churnProbability >= 0.4",
+            "passThrough": "matching",
+            "sortBy": "churnProbability",
+            "sortOrder": "desc"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each at-risk customer",
+          "config": {
+            "collection": "{{atRiskCustomers}}",
+            "itemVariable": "customer",
+            "indexVariable": "idx",
+            "maxIterations": 500
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert CS team with retention recommendation",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{env.SLACK_CS_WEBHOOK_URL}}",
+            "message": "CHURN RISK ALERT - {{customer.riskLevel | uppercase}}\n\nCustomer: {{customer.companyName}} (ID: {{customer.userId}})\nChurn Probability: {{multiply(customer.churnProbability, 100)}}%\nUrgency: {{customer.urgency}}\n\nTop Risk Factors:\n{{#each customer.topRiskFactors}}- {{this}}\n{{/each}}\n\nRecommended Action: {{customer.recommendedAction}}\n\nPlease take action within the recommended timeframe.",
+            "priority": "{{customer.urgency === 'immediate' ? 'high' : 'normal'}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-050-faq-auto-responder.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-050-faq-auto-responder.json
new file mode 100644
index 0000000..2940490
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-050-faq-auto-responder.json
@@ -0,0 +1,156 @@
+{
+  "id": "tpl-050",
+  "name": "FAQ Auto-Responder",
+  "description": "Receives customer questions via webhook, searches a RAG knowledge base for matching FAQ entries and documentation, uses an LLM to synthesize a natural-language answer from the retrieved context, parses the response with a confidence score, and uses a conditional to either auto-respond with the answer if confidence is high or route the question to a human agent if confidence is low. All interactions are logged to a database for analytics and knowledge base improvement. Designed for retail and SME businesses that want to deflect common support questions automatically while maintaining quality thresholds.",
+  "category": "Customer Service",
+  "industry": ["Retail", "SME"],
+  "tags": ["webhook", "faq", "ai-response", "rag", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "webhook_trigger",
+          "label": "Customer question received via chat widget",
+          "config": {
+            "path": "/webhooks/faq-question",
+            "method": "POST",
+            "authentication": {
+              "type": "api_key",
+              "headerName": "X-API-Key",
+              "keyHash": "{{secrets.FAQ_WEBHOOK_API_KEY}}"
+            },
+            "expectedFields": ["questionId", "question", "customerEmail", "customerName", "sessionId", "channel", "language"]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Search FAQ knowledge base for relevant answers",
+          "config": {
+            "collectionName": "faq_knowledge_base",
+            "query": "{{webhook.question}}",
+            "topK": 5,
+            "scoreThreshold": 0.60,
+            "filters": {
+              "language": "{{webhook.language}}",
+              "status": "published"
+            },
+            "includeMetadata": true
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate natural-language answer from FAQ context",
+          "config": {
+            "model": "gpt-4o-mini",
+            "temperature": 0.3,
+            "maxTokens": 800,
+            "prompt": "You are a helpful customer support assistant for a retail company.\n\nCustomer Question: {{webhook.question}}\nCustomer Name: {{webhook.customerName}}\nLanguage: {{webhook.language}}\n\nRelevant FAQ entries found:\n{{#each ragResults}}[FAQ #{{this.metadata.faqId}}] Q: {{this.metadata.question}}\nA: {{this.content}}\n(Relevance Score: {{this.score}})\n{{/each}}\n\nInstructions:\n- If the FAQ entries contain a clear, relevant answer, synthesize it into a friendly, concise response addressed to the customer by name.\n- Do NOT make up information not present in the FAQ entries.\n- If the FAQ entries are not relevant or insufficient, indicate that you cannot answer confidently.\n- Include the FAQ article ID(s) you referenced.\n\nReturn as JSON with fields:\n- answer (string): The customer-facing response\n- confidence (number): 0.0-1.0 how confident you are the answer is correct and complete\n- referencedFaqIds (array of strings): FAQ IDs used\n- needsHumanReview (boolean): true if the question requires human expertise\n- suggestedCategory (string): question category for analytics"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse answer with confidence score",
+          "config": {
+            "format": "json",
+            "schema": {
+              "type": "object",
+              "properties": {
+                "answer": { "type": "string" },
+                "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
+                "referencedFaqIds": { "type": "array", "items": { "type": "string" } },
+                "needsHumanReview": { "type": "boolean" },
+                "suggestedCategory": { "type": "string" }
+              },
+              "required": ["answer", "confidence", "needsHumanReview"]
+            },
+            "fallbackOnParseError": {
+              "answer": "",
+              "confidence": 0,
+              "needsHumanReview": true,
+              "suggestedCategory": "unknown"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Auto-respond if confidence is high, else route to human",
+          "config": {
+            "condition": "parsedResult.confidence >= 0.75 AND parsedResult.needsHumanReview === false",
+            "trueLabel": "High confidence - auto-respond",
+            "falseLabel": "Low confidence - route to agent"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "webhook_response",
+          "label": "Return auto-generated answer to chat widget",
+          "config": {
+            "statusCode": 200,
+            "headers": {
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "questionId": "{{webhook.questionId}}",
+              "answer": "{{parsedResult.answer}}",
+              "confidence": "{{parsedResult.confidence}}",
+              "referencedFaqIds": "{{parsedResult.referencedFaqIds}}",
+              "respondedBy": "ai",
+              "category": "{{parsedResult.suggestedCategory}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Log interaction for analytics and KB improvement",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO faq_interactions (question_id, session_id, customer_email, question_text, ai_answer, confidence_score, referenced_faq_ids, was_auto_responded, suggested_category, channel, created_at) VALUES ({{webhook.questionId}}, {{webhook.sessionId}}, {{webhook.customerEmail}}, {{webhook.question}}, {{parsedResult.answer}}, {{parsedResult.confidence}}, {{parsedResult.referencedFaqIds}}, {{parsedResult.confidence >= 0.75}}, {{parsedResult.suggestedCategory}}, {{webhook.channel}}, NOW()) RETURNING id"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "true", "targetHandle": "input" },
+      { "id": "e5-7", "source": "node-5", "target": "node-7", "sourceHandle": "false", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-051-daily-news-video.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-051-daily-news-video.json
new file mode 100644
index 0000000..c6dab1e
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-051-daily-news-video.json
@@ -0,0 +1,166 @@
+{
+  "id": "tpl-051",
+  "name": "Daily News Video Generator",
+  "description": "Runs on a daily schedule to fetch trending AI and automation news from an RSS aggregator API, uses an LLM to write a concise video script and thumbnail prompt, then generates a thumbnail image and a narrated video clip in parallel. The final assets are uploaded to cloud storage and a Slack notification is sent to the editorial team. Designed for media companies and content creators who publish daily AI recap videos.",
+  "category": "AI & Automation",
+  "industry": ["Media"],
+  "tags": ["scheduled", "ai-video", "news", "parallel", "advanced"],
+  "stepCount": 9,
+  "estimatedSetupMinutes": 40,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run daily at 6 AM UTC",
+          "config": {
+            "schedule": "0 6 * * *",
+            "timezone": "UTC"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch trending AI news from aggregator",
+          "config": {
+            "method": "GET",
+            "url": "https://api.newsaggregator.com/v2/top-headlines?category=technology&q=AI+automation&pageSize=10",
+            "headers": {
+              "X-Api-Key": "{{secrets.NEWS_API_KEY}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Write video script and thumbnail prompt",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a video scriptwriter for a daily AI news channel.\n\nBased on the following top stories, create:\n1. A 90-second narration script covering the 3 most impactful stories\n2. A thumbnail image prompt (vivid, attention-grabbing, no text in image)\n3. A compelling video title (under 60 chars)\n\nStories:\n{{articles}}\n\nOutput as JSON with keys: script, thumbnailPrompt, videoTitle"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Generate thumbnail and video in parallel",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-4a",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 50 },
+        "data": {
+          "nodeType": "generate_image",
+          "label": "Generate eye-catching thumbnail",
+          "config": {
+            "provider": "dall-e-3",
+            "prompt": "{{thumbnailPrompt}}",
+            "size": "1792x1024",
+            "quality": "hd",
+            "style": "vivid"
+          }
+        }
+      },
+      {
+        "id": "node-4b",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 350 },
+        "data": {
+          "nodeType": "skill",
+          "label": "Generate narrated news video clip",
+          "config": {
+            "skillId": "video-creator",
+            "params": {
+              "script": "{{script}}",
+              "voiceId": "en-US-news-anchor",
+              "duration": 90,
+              "resolution": "1080p",
+              "style": "news-broadcast"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "join",
+          "label": "Wait for thumbnail and video to complete",
+          "config": {
+            "mode": "all"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "storage_action",
+          "label": "Upload video and thumbnail to S3",
+          "config": {
+            "provider": "s3",
+            "bucket": "{{env.MEDIA_BUCKET}}",
+            "region": "{{env.AWS_REGION}}",
+            "accessKeyId": "{{secrets.AWS_ACCESS_KEY_ID}}",
+            "secretAccessKey": "{{secrets.AWS_SECRET_ACCESS_KEY}}",
+            "actions": [
+              {
+                "operation": "upload",
+                "key": "news-videos/{{date}}/video.mp4",
+                "content": "{{videoOutput}}"
+              },
+              {
+                "operation": "upload",
+                "key": "news-videos/{{date}}/thumbnail.png",
+                "content": "{{thumbnailOutput}}"
+              }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify editorial team on Slack",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{secrets.SLACK_EDITORIAL_WEBHOOK}}",
+            "message": "Daily AI News Video Ready\n\nTitle: {{videoTitle}}\nVideo: https://{{env.CDN_DOMAIN}}/news-videos/{{date}}/video.mp4\nThumbnail: https://{{env.CDN_DOMAIN}}/news-videos/{{date}}/thumbnail.png\n\nPlease review and publish."
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-4a", "source": "node-4", "target": "node-4a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-4b", "source": "node-4", "target": "node-4b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4a-5", "source": "node-4a", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4b-5", "source": "node-4b", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-052-pdf-to-knowledge-base.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-052-pdf-to-knowledge-base.json
new file mode 100644
index 0000000..e214df6
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-052-pdf-to-knowledge-base.json
@@ -0,0 +1,160 @@
+{
+  "id": "tpl-052",
+  "name": "PDF to Knowledge Base Indexer",
+  "description": "Accepts PDF file uploads, extracts text content, splits it into semantically meaningful chunks, then batch-indexes each chunk into a vector knowledge base via API calls. Sends a completion notification with indexing statistics. Ideal for enterprises and educational institutions building searchable document repositories from large PDF collections.",
+  "category": "AI & Automation",
+  "industry": ["Enterprise", "Education"],
+  "tags": ["file-upload", "knowledge-base", "indexing", "advanced"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "file_upload_trigger",
+          "label": "Accept PDF document upload",
+          "config": {
+            "allowedTypes": ["application/pdf"],
+            "maxSizeMb": 50,
+            "storagePath": "uploads/knowledge-base/pending/"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "read_file",
+          "label": "Extract text from uploaded PDF",
+          "config": {
+            "filePath": "{{uploadedFilePath}}",
+            "parser": "pdf",
+            "options": {
+              "extractImages": false,
+              "preserveFormatting": true,
+              "ocrEnabled": true
+            }
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "split",
+          "label": "Split text into semantic chunks",
+          "config": {
+            "strategy": "recursive",
+            "chunkSize": 1500,
+            "chunkOverlap": 200,
+            "separators": ["\n\n", "\n", ". ", " "]
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "batch",
+          "label": "Group chunks into batches of 20",
+          "config": {
+            "batchSize": 20,
+            "input": "{{chunks}}"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each batch sequentially",
+          "config": {
+            "iterateOver": "{{batches}}",
+            "maxIterations": 500,
+            "continueOnError": true
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Index batch into vector database",
+          "config": {
+            "method": "POST",
+            "url": "{{env.VECTOR_DB_URL}}/collections/{{env.KB_COLLECTION}}/upsert",
+            "headers": {
+              "Authorization": "Bearer {{secrets.VECTOR_DB_API_KEY}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "documents": "{{currentBatch}}",
+              "metadata": {
+                "source": "{{fileName}}",
+                "uploadedAt": "{{uploadTimestamp}}",
+                "documentId": "{{documentId}}"
+              }
+            },
+            "retries": 3,
+            "timeoutMs": 30000
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "storage_action",
+          "label": "Move PDF to processed folder",
+          "config": {
+            "provider": "s3",
+            "bucket": "{{env.DOCUMENTS_BUCKET}}",
+            "accessKeyId": "{{secrets.AWS_ACCESS_KEY_ID}}",
+            "secretAccessKey": "{{secrets.AWS_SECRET_ACCESS_KEY}}",
+            "actions": [
+              {
+                "operation": "move",
+                "source": "uploads/knowledge-base/pending/{{fileName}}",
+                "destination": "uploads/knowledge-base/processed/{{fileName}}"
+              }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Notify team of indexing completion",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{secrets.SLACK_KNOWLEDGE_WEBHOOK}}",
+            "message": "Knowledge Base Indexing Complete\n\nDocument: {{fileName}}\nChunks indexed: {{totalChunks}}\nBatches processed: {{batchCount}}\nErrors: {{errorCount}}\nDuration: {{elapsedTime}}s\n\nThe document is now searchable in the knowledge base."
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-053-personalized-learning-path.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-053-personalized-learning-path.json
new file mode 100644
index 0000000..35b8cda
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-053-personalized-learning-path.json
@@ -0,0 +1,153 @@
+{
+  "id": "tpl-053",
+  "name": "Personalized Learning Path Generator",
+  "description": "Collects a learner's goals, current skill level, and preferred learning style via a form, then queries the course knowledge base using RAG to find relevant materials. An LLM assembles a structured learning path with milestones, which is parsed and stored in the database. A recurring schedule sends weekly progress check-in reminders. Built for EdTech platforms and corporate training departments delivering adaptive learning experiences.",
+  "category": "AI & Automation",
+  "industry": ["EdTech", "Education"],
+  "tags": ["form", "ai-tutor", "personalization", "rag", "advanced"],
+  "stepCount": 8,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Learner submits goals and skill assessment",
+          "config": {
+            "fields": [
+              { "name": "learnerId", "type": "text", "required": true },
+              { "name": "learnerName", "type": "text", "required": true },
+              { "name": "learningGoal", "type": "textarea", "label": "What do you want to learn?", "required": true },
+              { "name": "currentLevel", "type": "select", "options": ["beginner", "intermediate", "advanced"], "required": true },
+              { "name": "learningStyle", "type": "select", "options": ["visual", "reading", "hands-on", "video"], "required": true },
+              { "name": "weeklyHours", "type": "number", "label": "Available hours per week", "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "rag_query",
+          "label": "Search course catalog for relevant materials",
+          "config": {
+            "collectionName": "{{env.COURSE_COLLECTION}}",
+            "query": "{{learningGoal}} for {{currentLevel}} level with {{learningStyle}} resources",
+            "topK": 15,
+            "scoreThreshold": 0.7,
+            "vectorDbUrl": "{{env.VECTOR_DB_URL}}",
+            "apiKey": "{{secrets.VECTOR_DB_API_KEY}}"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate structured learning path with milestones",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are an expert learning path designer.\n\nCreate a personalized learning path for this learner:\n- Goal: {{learningGoal}}\n- Current Level: {{currentLevel}}\n- Preferred Style: {{learningStyle}}\n- Available Time: {{weeklyHours}} hours/week\n\nAvailable course materials:\n{{ragResults}}\n\nCreate a structured learning path with:\n1. 4-8 sequential milestones, each with a title, description, and estimated weeks\n2. Specific course/resource recommendations for each milestone\n3. Practice exercises or projects per milestone\n4. Assessment criteria for milestone completion\n\nOutput as JSON with keys: pathTitle, totalWeeks, milestones (array of {title, description, weeks, resources, exercises, assessmentCriteria})"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse learning path JSON structure",
+          "config": {
+            "format": "json",
+            "schema": {
+              "pathTitle": "string",
+              "totalWeeks": "number",
+              "milestones": "array"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Save learning path to database",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO learning_paths (learner_id, title, total_weeks, milestones_json, learning_style, weekly_hours, status, created_at) VALUES ('{{learnerId}}', '{{pathTitle}}', {{totalWeeks}}, '{{milestonesJson}}', '{{learningStyle}}', {{weeklyHours}}, 'active', NOW()) RETURNING id"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Create milestone records for each milestone",
+          "config": {
+            "iterateOver": "{{milestones}}",
+            "maxIterations": 10,
+            "body": {
+              "action": "database_insert",
+              "query": "INSERT INTO milestones (learning_path_id, title, description, week_number, resources, exercises, status) VALUES ({{learningPathId}}, '{{milestone.title}}', '{{milestone.description}}', {{milestone.weeks}}, '{{milestone.resources}}', '{{milestone.exercises}}', 'pending')"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Set weekly progress check-in reminder",
+          "config": {
+            "schedule": "0 9 * * 1",
+            "timezone": "{{learnerTimezone}}",
+            "metadata": {
+              "learningPathId": "{{learningPathId}}",
+              "learnerId": "{{learnerId}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send learning path and weekly reminders",
+          "config": {
+            "channel": "email",
+            "to": "{{learnerEmail}}",
+            "subject": "Your Personalized Learning Path: {{pathTitle}}",
+            "message": "Hi {{learnerName}},\n\nYour personalized learning path is ready!\n\nPath: {{pathTitle}}\nEstimated Duration: {{totalWeeks}} weeks\nMilestones: {{milestoneCount}}\n\nYour first milestone: {{firstMilestoneTitle}}\n\nYou will receive weekly check-in reminders every Monday at 9 AM.\n\nHappy learning!",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-054-supply-chain-risk-monitoring.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-054-supply-chain-risk-monitoring.json
new file mode 100644
index 0000000..d0a5efd
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-054-supply-chain-risk-monitoring.json
@@ -0,0 +1,149 @@
+{
+  "id": "tpl-054",
+  "name": "Supply Chain Risk Monitor",
+  "description": "Runs on a configurable schedule to simultaneously fetch supplier status data from the procurement system API and global supply chain news from a risk intelligence feed. An LLM analyzes the combined data to identify disruption risks, severity levels, and recommended mitigation actions. Results are parsed and filtered to surface only high and critical risks, which trigger immediate alerts to the procurement team. Built for manufacturing and logistics operations that need proactive visibility into supply chain vulnerabilities.",
+  "category": "AI & Automation",
+  "industry": ["Manufacturing", "Logistics"],
+  "tags": ["scheduled", "supply-chain", "ai-risk", "parallel", "advanced"],
+  "stepCount": 9,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run every 4 hours during business days",
+          "config": {
+            "schedule": "0 */4 * * 1-5",
+            "timezone": "Asia/Bangkok"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Fetch supplier data and news simultaneously",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-2a",
+        "type": "workflow",
+        "position": { "x": 600, "y": 50 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch active supplier status from procurement API",
+          "config": {
+            "method": "GET",
+            "url": "{{env.PROCUREMENT_API_URL}}/suppliers?status=active&include=orders,leadTimes,qualityScores",
+            "headers": {
+              "Authorization": "Bearer {{secrets.PROCUREMENT_API_KEY}}"
+            },
+            "timeoutMs": 15000
+          }
+        }
+      },
+      {
+        "id": "node-2b",
+        "type": "workflow",
+        "position": { "x": 600, "y": 350 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Fetch supply chain disruption news",
+          "config": {
+            "method": "GET",
+            "url": "https://api.riskintelligence.com/v3/alerts?categories=supply-chain,logistics,trade&severity=medium,high,critical&limit=25",
+            "headers": {
+              "X-Api-Key": "{{secrets.RISK_INTEL_API_KEY}}"
+            },
+            "timeoutMs": 15000
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "join",
+          "label": "Combine supplier data and news feeds",
+          "config": {
+            "mode": "all"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Analyze combined data for supply chain risks",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a supply chain risk analyst.\n\nAnalyze the following supplier data and global news for potential supply chain disruptions.\n\nSupplier Data:\n{{supplierData}}\n\nGlobal News Alerts:\n{{newsAlerts}}\n\nFor each identified risk, provide:\n1. Risk title (concise)\n2. Severity: critical, high, medium, low\n3. Affected suppliers (by name and ID)\n4. Risk category: geopolitical, natural-disaster, logistics, quality, financial, regulatory\n5. Potential impact description\n6. Recommended mitigation action\n7. Urgency: immediate, within-24h, within-week\n\nOutput as JSON array of risk objects. Include only risks with severity medium or above."
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "output_parser",
+          "label": "Parse risk assessment results",
+          "config": {
+            "format": "json",
+            "schema": {
+              "risks": "array of {title, severity, affectedSuppliers, category, impact, mitigation, urgency}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Filter for high and critical severity risks",
+          "config": {
+            "condition": "severity === 'high' || severity === 'critical'",
+            "input": "{{risks}}"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Alert procurement team of critical risks",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{secrets.SLACK_PROCUREMENT_WEBHOOK}}",
+            "message": "Supply Chain Risk Alert\n\n{{#each filteredRisks}}Risk: {{this.title}}\nSeverity: {{this.severity}}\nAffected: {{this.affectedSuppliers}}\nCategory: {{this.category}}\nAction: {{this.mitigation}}\nUrgency: {{this.urgency}}\n---\n{{/each}}\n\nTotal risks detected: {{riskCount}} | Critical: {{criticalCount}} | High: {{highCount}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-2a", "source": "node-2", "target": "node-2a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-2b", "source": "node-2", "target": "node-2b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2a-3", "source": "node-2a", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2b-3", "source": "node-2b", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-055-customer-onboarding-sequence.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-055-customer-onboarding-sequence.json
new file mode 100644
index 0000000..e518db8
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-055-customer-onboarding-sequence.json
@@ -0,0 +1,189 @@
+{
+  "id": "tpl-055",
+  "name": "Customer Onboarding Email Sequence",
+  "description": "Triggered when a new customer signs up, this workflow delivers a timed drip email sequence over the first two weeks. It fetches the customer profile from the database, sends a welcome email, then waits configured intervals before sending feature highlight, tips-and-tricks, and check-in emails. After the sequence completes, it updates the customer record with onboarding status and conditionally sends a re-engagement email if the user has not activated key features. Designed for SaaS products seeking to improve trial-to-paid conversion through structured onboarding.",
+  "category": "AI & Automation",
+  "industry": ["SaaS"],
+  "tags": ["event", "onboarding", "email-sequence", "drip", "intermediate"],
+  "stepCount": 11,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "event_trigger",
+          "label": "New customer signup event received",
+          "config": {
+            "eventName": "customer.created",
+            "source": "auth-service",
+            "filters": {
+              "plan": ["trial", "free"]
+            }
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch new customer profile details",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT u.id, u.email, u.full_name, u.company_name, u.plan, u.created_at, up.industry, up.team_size FROM users u LEFT JOIN user_profiles up ON u.id = up.user_id WHERE u.id = '{{customerId}}'"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send welcome email with getting started guide",
+          "config": {
+            "to": ["{{customerEmail}}"],
+            "subject": "Welcome to {{env.APP_NAME}}, {{firstName}}!",
+            "body": "Hi {{firstName}},\n\nWelcome aboard! We are thrilled to have you and {{companyName}} join us.\n\nHere are 3 things to do in your first 10 minutes:\n1. Complete your profile setup\n2. Create your first project\n3. Invite a team member\n\nNeed help? Reply to this email or visit our help center.\n\nCheers,\nThe {{env.APP_NAME}} Team",
+            "from": "welcome@{{env.EMAIL_DOMAIN}}",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "wait",
+          "label": "Wait 2 days before next email",
+          "config": {
+            "duration": 2,
+            "unit": "days"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send feature highlights email",
+          "config": {
+            "to": ["{{customerEmail}}"],
+            "subject": "Discover what {{env.APP_NAME}} can do for you",
+            "body": "Hi {{firstName}},\n\nHere are the top 3 features our customers love:\n\n1. AI-Powered Workflows - Automate repetitive tasks with smart templates\n2. Team Collaboration - Real-time editing and comments\n3. Analytics Dashboard - Track your team productivity at a glance\n\nWatch a 2-minute demo: {{env.APP_URL}}/demo\n\nBest,\nThe {{env.APP_NAME}} Team",
+            "from": "hello@{{env.EMAIL_DOMAIN}}",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "wait",
+          "label": "Wait 3 days before tips email",
+          "config": {
+            "duration": 3,
+            "unit": "days"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send tips and best practices email",
+          "config": {
+            "to": ["{{customerEmail}}"],
+            "subject": "Pro tips to get the most out of {{env.APP_NAME}}",
+            "body": "Hi {{firstName}},\n\nHere are some pro tips from power users:\n\n- Use keyboard shortcuts (Ctrl+K) to navigate faster\n- Set up integrations with Slack and Google Calendar\n- Use templates to standardize your team workflows\n- Enable notifications for real-time updates\n\nExplore all tips: {{env.APP_URL}}/tips\n\nHappy building,\nThe {{env.APP_NAME}} Team",
+            "from": "hello@{{env.EMAIL_DOMAIN}}",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "wait",
+          "label": "Wait 7 days before check-in",
+          "config": {
+            "duration": 7,
+            "unit": "days"
+          }
+        }
+      },
+      {
+        "id": "node-9",
+        "type": "workflow",
+        "position": { "x": 2100, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Check customer activation status",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT u.id, COUNT(p.id) AS project_count, COUNT(DISTINCT tm.invited_user_id) AS invited_members, MAX(s.last_active_at) AS last_active FROM users u LEFT JOIN projects p ON u.id = p.owner_id LEFT JOIN team_members tm ON u.id = tm.inviter_id LEFT JOIN sessions s ON u.id = s.user_id WHERE u.id = '{{customerId}}' GROUP BY u.id"
+          }
+        }
+      },
+      {
+        "id": "node-10",
+        "type": "workflow",
+        "position": { "x": 2350, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Has the customer activated key features?",
+          "config": {
+            "condition": "projectCount >= 1 && invitedMembers >= 1",
+            "trueLabel": "Activated",
+            "falseLabel": "Needs re-engagement"
+          }
+        }
+      },
+      {
+        "id": "node-11",
+        "type": "workflow",
+        "position": { "x": 2600, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send re-engagement or success check-in email",
+          "config": {
+            "to": ["{{customerEmail}}"],
+            "subject": "{{#if activated}}You are doing great, {{firstName}}!{{else}}Need help getting started, {{firstName}}?{{/if}}",
+            "body": "{{#if activated}}Hi {{firstName}},\n\nGreat progress! You have created {{projectCount}} projects and invited {{invitedMembers}} team members.\n\nReady for the next level? Explore our advanced features: {{env.APP_URL}}/advanced\n{{else}}Hi {{firstName}},\n\nWe noticed you have not had a chance to set up your first project yet. No worries, we are here to help!\n\nBook a free 15-minute onboarding call: {{env.APP_URL}}/book-demo\n\nOr reply to this email and we will guide you step by step.\n{{/if}}\n\nBest,\nThe {{env.APP_NAME}} Team",
+            "from": "success@{{env.EMAIL_DOMAIN}}",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e8-9", "source": "node-8", "target": "node-9", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e9-10", "source": "node-9", "target": "node-10", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e10-11", "source": "node-10", "target": "node-11", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-056-sla-breach-monitor.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-056-sla-breach-monitor.json
new file mode 100644
index 0000000..e8a5953
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-056-sla-breach-monitor.json
@@ -0,0 +1,139 @@
+{
+  "id": "tpl-056",
+  "name": "SLA Breach Monitor and Alerter",
+  "description": "Runs every 15 minutes to query the ticket database for open support tickets approaching or exceeding their SLA deadlines. A code runner calculates time remaining and breach severity for each ticket. Results are filtered to only include at-risk tickets, then looped through a switch node that routes alerts by severity level: critical breaches trigger PagerDuty and Slack escalations, warnings go to the team channel, and informational alerts are logged. Built for IT service desks and SaaS support teams who must maintain SLA compliance.",
+  "category": "AI & Automation",
+  "industry": ["IT Services", "SaaS"],
+  "tags": ["scheduled", "sla", "monitoring", "alerts", "intermediate"],
+  "stepCount": 7,
+  "estimatedSetupMinutes": 25,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run SLA check every 15 minutes",
+          "config": {
+            "schedule": "*/15 * * * *",
+            "timezone": "UTC"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch open tickets with SLA deadlines",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT t.id AS ticket_id, t.subject, t.priority, t.assigned_to, t.created_at, t.sla_deadline, t.customer_id, c.company_name, c.plan AS customer_plan, EXTRACT(EPOCH FROM (t.sla_deadline - NOW())) / 60 AS minutes_remaining FROM tickets t JOIN customers c ON t.customer_id = c.id WHERE t.status IN ('open', 'in_progress') AND t.sla_deadline IS NOT NULL AND t.sla_deadline <= NOW() + INTERVAL '2 hours' ORDER BY t.sla_deadline ASC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "code_runner",
+          "label": "Calculate breach severity for each ticket",
+          "config": {
+            "language": "javascript",
+            "code": "return input.tickets.map(ticket => { const mins = ticket.minutes_remaining; let severity, status; if (mins <= 0) { severity = 'critical'; status = 'breached'; } else if (mins <= 15) { severity = 'critical'; status = 'imminent'; } else if (mins <= 30) { severity = 'warning'; status = 'at-risk'; } else { severity = 'info'; status = 'approaching'; } return { ...ticket, severity, breachStatus: status, minutesRemaining: Math.round(mins) }; });"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Keep only at-risk and breached tickets",
+          "config": {
+            "condition": "severity === 'critical' || severity === 'warning'",
+            "input": "{{tickets}}"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each at-risk ticket",
+          "config": {
+            "iterateOver": "{{filteredTickets}}",
+            "maxIterations": 100
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Route alert by breach severity level",
+          "config": {
+            "expression": "{{currentTicket.severity}}",
+            "cases": [
+              {
+                "value": "critical",
+                "label": "Critical: PagerDuty + Slack escalation",
+                "action": {
+                  "channels": ["pagerduty", "slack"],
+                  "escalate": true
+                }
+              },
+              {
+                "value": "warning",
+                "label": "Warning: Team Slack channel",
+                "action": {
+                  "channels": ["slack"],
+                  "escalate": false
+                }
+              }
+            ],
+            "default": {
+              "label": "Info: Log only",
+              "action": {
+                "channels": ["log"],
+                "escalate": false
+              }
+            }
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send SLA alert to appropriate channel",
+          "config": {
+            "channel": "{{alertChannel}}",
+            "webhookUrl": "{{secrets.SLACK_SUPPORT_WEBHOOK}}",
+            "pagerdutyKey": "{{secrets.PAGERDUTY_ROUTING_KEY}}",
+            "message": "SLA Alert: {{currentTicket.breachStatus}}\n\nTicket: #{{currentTicket.ticket_id}} - {{currentTicket.subject}}\nPriority: {{currentTicket.priority}}\nCustomer: {{currentTicket.company_name}} ({{currentTicket.customer_plan}})\nAssigned To: {{currentTicket.assigned_to}}\nTime Remaining: {{currentTicket.minutesRemaining}} minutes\nStatus: {{currentTicket.breachStatus}}\n\nAction required immediately."
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-057-multilanguage-content-publishing.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-057-multilanguage-content-publishing.json
new file mode 100644
index 0000000..0245675
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-057-multilanguage-content-publishing.json
@@ -0,0 +1,178 @@
+{
+  "id": "tpl-057",
+  "name": "Multi-Language Content Publisher",
+  "description": "Triggered when new content is published in the CMS, this workflow fetches the original article from the database and translates it into three target languages (Thai, Japanese, Chinese) in parallel using separate LLM calls optimized for each language. The translations converge at a join node, pass through an editorial approval gate, then are published to the CMS via API calls in a loop. Built for international media companies and enterprises that need to distribute content across multiple language markets simultaneously.",
+  "category": "AI & Automation",
+  "industry": ["Media", "Enterprise"],
+  "tags": ["event", "translation", "ai-content", "parallel", "advanced"],
+  "stepCount": 10,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 225 },
+        "data": {
+          "nodeType": "event_trigger",
+          "label": "New article published in CMS",
+          "config": {
+            "eventName": "content.published",
+            "source": "cms",
+            "filters": {
+              "contentType": "article",
+              "language": "en"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 225 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch original article content and metadata",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT a.id, a.title, a.body, a.summary, a.author_name, a.category, a.tags, a.slug, a.published_at FROM articles a WHERE a.id = '{{articleId}}' AND a.status = 'published'"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 225 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Translate to Thai, Japanese, and Chinese in parallel",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-3a",
+        "type": "workflow",
+        "position": { "x": 850, "y": 50 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Translate article to Thai",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a professional Thai translator specializing in {{category}} content.\n\nTranslate the following English article to Thai. Maintain the original tone, formatting, and technical terms where appropriate. Ensure natural Thai phrasing, not word-for-word translation.\n\nTitle: {{title}}\nSummary: {{summary}}\nBody:\n{{body}}\n\nOutput as JSON with keys: title_th, summary_th, body_th",
+            "temperature": 0.3
+          }
+        }
+      },
+      {
+        "id": "node-3b",
+        "type": "workflow",
+        "position": { "x": 850, "y": 225 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Translate article to Japanese",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a professional Japanese translator specializing in {{category}} content.\n\nTranslate the following English article to Japanese. Use appropriate keigo level for publication. Maintain the original structure and technical accuracy.\n\nTitle: {{title}}\nSummary: {{summary}}\nBody:\n{{body}}\n\nOutput as JSON with keys: title_ja, summary_ja, body_ja",
+            "temperature": 0.3
+          }
+        }
+      },
+      {
+        "id": "node-3c",
+        "type": "workflow",
+        "position": { "x": 850, "y": 400 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Translate article to Simplified Chinese",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a professional Simplified Chinese translator specializing in {{category}} content.\n\nTranslate the following English article to Simplified Chinese. Use mainland Chinese conventions and natural phrasing suitable for publication.\n\nTitle: {{title}}\nSummary: {{summary}}\nBody:\n{{body}}\n\nOutput as JSON with keys: title_zh, summary_zh, body_zh",
+            "temperature": 0.3
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 225 },
+        "data": {
+          "nodeType": "join",
+          "label": "Collect all three translations",
+          "config": {
+            "mode": "all"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 225 },
+        "data": {
+          "nodeType": "approval_gate",
+          "label": "Editorial team reviews translations",
+          "config": {
+            "assignTo": "editorial-team@company.com",
+            "timeoutHours": 24,
+            "message": "Translations ready for review:\n\nOriginal: {{title}}\nLanguages: Thai, Japanese, Simplified Chinese\n\nPlease review and approve for publication.",
+            "approvalOptions": ["approve-all", "approve-with-edits", "reject"]
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 225 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Publish each translation to CMS",
+          "config": {
+            "iterateOver": "{{translations}}",
+            "maxIterations": 3
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 225 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Create translated article in CMS via API",
+          "config": {
+            "method": "POST",
+            "url": "{{env.CMS_API_URL}}/articles",
+            "headers": {
+              "Authorization": "Bearer {{secrets.CMS_API_TOKEN}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "title": "{{currentTranslation.title}}",
+              "summary": "{{currentTranslation.summary}}",
+              "body": "{{currentTranslation.body}}",
+              "language": "{{currentTranslation.languageCode}}",
+              "originalArticleId": "{{articleId}}",
+              "slug": "{{slug}}-{{currentTranslation.languageCode}}",
+              "status": "published",
+              "author": "{{authorName}}",
+              "category": "{{category}}",
+              "tags": "{{tags}}"
+            }
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3a", "source": "node-3", "target": "node-3a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3b", "source": "node-3", "target": "node-3b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-3c", "source": "node-3", "target": "node-3c", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3a-4", "source": "node-3a", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3b-4", "source": "node-3b", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3c-4", "source": "node-3c", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-058-emergency-alert-system.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-058-emergency-alert-system.json
new file mode 100644
index 0000000..402765b
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-058-emergency-alert-system.json
@@ -0,0 +1,215 @@
+{
+  "id": "tpl-058",
+  "name": "Emergency Alert Broadcast System",
+  "description": "Manually triggered by authorized personnel to broadcast emergency alerts across all communication channels simultaneously. The operator fills out an emergency details form, then a switch node classifies the alert severity to determine the broadcast scope. A parallel node dispatches notifications via push notification, email, SMS gateway API, and logs the incident in the database simultaneously. After broadcasting, the workflow waits for a configurable period and sends a follow-up status notification. Designed for enterprises and government agencies that need reliable multi-channel emergency communication.",
+  "category": "AI & Automation",
+  "industry": ["Enterprise", "Government"],
+  "tags": ["manual", "emergency", "alerts", "parallel", "advanced"],
+  "stepCount": 11,
+  "estimatedSetupMinutes": 40,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 225 },
+        "data": {
+          "nodeType": "manual_trigger",
+          "label": "Emergency coordinator initiates alert",
+          "config": {
+            "requiredRole": "emergency_coordinator",
+            "confirmationMessage": "You are about to broadcast an emergency alert. This action cannot be undone. Proceed?"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 225 },
+        "data": {
+          "nodeType": "form_input",
+          "label": "Fill in emergency alert details",
+          "config": {
+            "fields": [
+              { "name": "alertTitle", "type": "text", "label": "Alert Title", "required": true },
+              { "name": "severity", "type": "select", "options": ["critical", "high", "medium", "advisory"], "required": true },
+              { "name": "description", "type": "textarea", "label": "Emergency Description", "required": true },
+              { "name": "affectedAreas", "type": "text", "label": "Affected Areas / Departments", "required": true },
+              { "name": "actionRequired", "type": "textarea", "label": "Required Actions", "required": true },
+              { "name": "coordinatorName", "type": "text", "required": true },
+              { "name": "followUpMinutes", "type": "number", "label": "Follow-up check interval (minutes)", "required": true }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 225 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Determine broadcast scope by severity",
+          "config": {
+            "expression": "{{severity}}",
+            "cases": [
+              {
+                "value": "critical",
+                "label": "Critical: All channels + executive escalation",
+                "broadcastScope": "all-hands"
+              },
+              {
+                "value": "high",
+                "label": "High: All channels, affected departments",
+                "broadcastScope": "department"
+              },
+              {
+                "value": "medium",
+                "label": "Medium: Email + Slack to affected areas",
+                "broadcastScope": "targeted"
+              },
+              {
+                "value": "advisory",
+                "label": "Advisory: Slack notification only",
+                "broadcastScope": "informational"
+              }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 225 },
+        "data": {
+          "nodeType": "parallel",
+          "label": "Broadcast alert across all channels simultaneously",
+          "config": {}
+        }
+      },
+      {
+        "id": "node-4a",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 50 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send push notification to all staff",
+          "config": {
+            "channel": "push",
+            "webhookUrl": "{{secrets.PUSH_SERVICE_WEBHOOK}}",
+            "message": "EMERGENCY ALERT: {{alertTitle}}\n\nSeverity: {{severity}}\n{{description}}\n\nAction Required: {{actionRequired}}\n\nCoordinator: {{coordinatorName}}",
+            "priority": "critical",
+            "sound": "emergency"
+          }
+        }
+      },
+      {
+        "id": "node-4b",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 175 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send emergency email to affected staff",
+          "config": {
+            "to": ["{{broadcastEmailList}}"],
+            "subject": "[EMERGENCY - {{severity}}] {{alertTitle}}",
+            "body": "EMERGENCY ALERT\n\nSeverity: {{severity}}\nAffected Areas: {{affectedAreas}}\n\n{{description}}\n\nACTION REQUIRED:\n{{actionRequired}}\n\nThis alert was issued by {{coordinatorName}} at {{timestamp}}.\nDo NOT reply to this email. Contact the emergency coordinator directly.",
+            "from": "emergency@{{env.EMAIL_DOMAIN}}",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}",
+            "priority": "high"
+          }
+        }
+      },
+      {
+        "id": "node-4c",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 300 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Send SMS via gateway API to emergency contacts",
+          "config": {
+            "method": "POST",
+            "url": "{{env.SMS_GATEWAY_URL}}/messages/broadcast",
+            "headers": {
+              "Authorization": "Bearer {{secrets.SMS_API_KEY}}",
+              "Content-Type": "application/json"
+            },
+            "body": {
+              "recipients": "{{emergencyContactNumbers}}",
+              "message": "[{{severity}}] {{alertTitle}}: {{actionRequired}} - Issued by {{coordinatorName}}",
+              "priority": "urgent",
+              "sender": "{{env.SMS_SENDER_ID}}"
+            }
+          }
+        }
+      },
+      {
+        "id": "node-4d",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 425 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Log emergency incident in database",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "INSERT INTO emergency_incidents (title, severity, description, affected_areas, action_required, coordinator_name, broadcast_scope, status, created_at) VALUES ('{{alertTitle}}', '{{severity}}', '{{description}}', '{{affectedAreas}}', '{{actionRequired}}', '{{coordinatorName}}', '{{broadcastScope}}', 'active', NOW()) RETURNING id"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 225 },
+        "data": {
+          "nodeType": "join",
+          "label": "Wait for all broadcast channels to complete",
+          "config": {
+            "mode": "all"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 225 },
+        "data": {
+          "nodeType": "wait",
+          "label": "Wait for follow-up check interval",
+          "config": {
+            "duration": "{{followUpMinutes}}",
+            "unit": "minutes"
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 225 },
+        "data": {
+          "nodeType": "send_notification",
+          "label": "Send follow-up status check notification",
+          "config": {
+            "channel": "slack",
+            "webhookUrl": "{{secrets.SLACK_EMERGENCY_WEBHOOK}}",
+            "message": "FOLLOW-UP CHECK: {{alertTitle}}\n\nIncident ID: {{incidentId}}\nSeverity: {{severity}}\nTime Since Alert: {{followUpMinutes}} minutes\n\nCoordinator {{coordinatorName}}: Please update the incident status.\n- Reply with 'resolved' to close the incident\n- Reply with 'ongoing' to schedule another follow-up\n- Reply with 'escalate' to notify executive leadership"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-4a", "source": "node-4", "target": "node-4a", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-4b", "source": "node-4", "target": "node-4b", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-4c", "source": "node-4", "target": "node-4c", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-4d", "source": "node-4", "target": "node-4d", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4a-5", "source": "node-4a", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4b-5", "source": "node-4b", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4c-5", "source": "node-4c", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4d-5", "source": "node-4d", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-059-survey-analysis-automation.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-059-survey-analysis-automation.json
new file mode 100644
index 0000000..a8e697c
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-059-survey-analysis-automation.json
@@ -0,0 +1,174 @@
+{
+  "id": "tpl-059",
+  "name": "Survey Analysis and Report Automation",
+  "description": "Accepts a CSV file upload of survey responses, parses the data, filters out incomplete responses, then processes them in batches through an AI loop that extracts sentiment, themes, and key insights from each batch. The batch results are merged into a unified dataset, and a final LLM call generates an executive summary report with statistical highlights and actionable recommendations. The report is rendered into an HTML template and emailed to stakeholders. Built for HR departments analyzing employee engagement surveys and marketing teams processing customer feedback at scale.",
+  "category": "AI & Automation",
+  "industry": ["HR", "Marketing"],
+  "tags": ["file-upload", "survey", "ai-analysis", "reporting", "advanced"],
+  "stepCount": 10,
+  "estimatedSetupMinutes": 35,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "file_upload_trigger",
+          "label": "Accept CSV survey response upload",
+          "config": {
+            "allowedTypes": ["text/csv", "application/vnd.ms-excel"],
+            "maxSizeMb": 25,
+            "storagePath": "uploads/surveys/pending/"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "csv_parser",
+          "label": "Parse CSV into structured response records",
+          "config": {
+            "delimiter": ",",
+            "hasHeader": true,
+            "encoding": "utf-8",
+            "trimWhitespace": true,
+            "expectedColumns": ["respondent_id", "department", "q1_rating", "q2_rating", "q3_rating", "open_feedback", "submitted_at"]
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "filter",
+          "label": "Filter out incomplete responses",
+          "config": {
+            "condition": "open_feedback !== '' && open_feedback !== null && q1_rating !== null",
+            "input": "{{parsedRows}}"
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "batch",
+          "label": "Group responses into batches of 25",
+          "config": {
+            "batchSize": 25,
+            "input": "{{filteredResponses}}"
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Analyze each batch with AI",
+          "config": {
+            "iterateOver": "{{batches}}",
+            "maxIterations": 200,
+            "continueOnError": true
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Extract sentiment and themes from batch",
+          "config": {
+            "model": "gpt-4o-mini",
+            "prompt": "You are a survey data analyst.\n\nAnalyze the following batch of survey responses and extract:\n1. Overall sentiment distribution (positive/neutral/negative counts)\n2. Top 3 recurring themes with example quotes\n3. Notable outliers or strong opinions\n4. Department-level patterns if visible\n\nResponses:\n{{currentBatch}}\n\nOutput as JSON with keys: sentimentCounts, themes (array of {theme, count, examples}), outliers, departmentPatterns",
+            "temperature": 0.2
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "merge_data",
+          "label": "Merge all batch analysis results",
+          "config": {
+            "strategy": "concatenate",
+            "input": "{{batchResults}}",
+            "deduplicateThemes": true,
+            "aggregateSentiment": true
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "llm_call",
+          "label": "Generate executive summary report",
+          "config": {
+            "model": "gpt-4o",
+            "prompt": "You are a senior organizational psychologist preparing an executive report.\n\nBased on the aggregated survey analysis below, write a comprehensive executive summary:\n\nTotal Responses: {{totalResponses}}\nSentiment: Positive {{positiveCount}}, Neutral {{neutralCount}}, Negative {{negativeCount}}\nThemes: {{mergedThemes}}\nDepartment Patterns: {{departmentPatterns}}\n\nInclude:\n1. Executive Summary (3-4 sentences)\n2. Key Findings (top 5, each with data backing)\n3. Areas of Concern (ranked by severity)\n4. Strengths to Celebrate\n5. Actionable Recommendations (5 specific, prioritized actions)\n6. Suggested Follow-Up Questions for next survey\n\nUse professional tone. Include percentages where possible.",
+            "temperature": 0.3
+          }
+        }
+      },
+      {
+        "id": "node-9",
+        "type": "workflow",
+        "position": { "x": 2100, "y": 200 },
+        "data": {
+          "nodeType": "template_engine",
+          "label": "Render HTML report from template",
+          "config": {
+            "template": "<html><head><style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px}h1{color:#2c3e50}h2{color:#34495e;border-bottom:2px solid #3498db;padding-bottom:8px}.metric{display:inline-block;margin:10px;padding:15px;background:#f8f9fa;border-radius:8px;text-align:center}.metric-value{font-size:2em;font-weight:bold;color:#2c3e50}.metric-label{font-size:0.9em;color:#7f8c8d}.positive{color:#27ae60}.negative{color:#e74c3c}.neutral{color:#f39c12}</style></head><body><h1>Survey Analysis Report</h1><p>Generated: {{date}}</p><div class='metrics'><div class='metric'><div class='metric-value'>{{totalResponses}}</div><div class='metric-label'>Total Responses</div></div><div class='metric'><div class='metric-value positive'>{{positivePercent}}%</div><div class='metric-label'>Positive</div></div><div class='metric'><div class='metric-value neutral'>{{neutralPercent}}%</div><div class='metric-label'>Neutral</div></div><div class='metric'><div class='metric-value negative'>{{negativePercent}}%</div><div class='metric-label'>Negative</div></div></div><div>{{executiveSummary}}</div></body></html>"
+          }
+        }
+      },
+      {
+        "id": "node-10",
+        "type": "workflow",
+        "position": { "x": 2350, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Email report to stakeholders",
+          "config": {
+            "to": ["{{stakeholderEmails}}"],
+            "subject": "Survey Analysis Report - {{surveyName}} ({{totalResponses}} responses)",
+            "body": "{{htmlReport}}",
+            "contentType": "text/html",
+            "from": "analytics@{{env.EMAIL_DOMAIN}}",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}",
+            "attachments": [
+              {
+                "filename": "survey-raw-data.csv",
+                "content": "{{originalFileUrl}}"
+              }
+            ]
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e8-9", "source": "node-8", "target": "node-9", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e9-10", "source": "node-9", "target": "node-10", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
diff --git a/specs/feature/017-VirtualWorkflowExam/templates/tpl-060-subscription-renewal-workflow.json b/specs/feature/017-VirtualWorkflowExam/templates/tpl-060-subscription-renewal-workflow.json
new file mode 100644
index 0000000..ffae7a3
--- /dev/null
+++ b/specs/feature/017-VirtualWorkflowExam/templates/tpl-060-subscription-renewal-workflow.json
@@ -0,0 +1,171 @@
+{
+  "id": "tpl-060",
+  "name": "Subscription Renewal Workflow",
+  "description": "Runs daily to query the database for subscriptions expiring within the next 30 days. Each subscription is processed in a loop: a switch node categorizes it by days-until-expiry (30, 14, 7, 3, 1, or expired). For active subscriptions, a conditional checks if auto-renewal is enabled and attempts to charge via the payment gateway API. A second conditional checks the charge result: successful renewals trigger a confirmation email and database update, while failed charges trigger a dunning email with a payment update link. Built for SaaS and subscription businesses to automate the entire renewal lifecycle and reduce involuntary churn.",
+  "category": "AI & Automation",
+  "industry": ["SaaS", "Subscription"],
+  "tags": ["scheduled", "subscription", "renewal", "billing", "intermediate"],
+  "stepCount": 9,
+  "estimatedSetupMinutes": 30,
+  "workflowJson": {
+    "nodes": [
+      {
+        "id": "node-1",
+        "type": "workflow",
+        "position": { "x": 100, "y": 200 },
+        "data": {
+          "nodeType": "schedule_trigger",
+          "label": "Run subscription check daily at 2 AM UTC",
+          "config": {
+            "schedule": "0 2 * * *",
+            "timezone": "UTC"
+          }
+        }
+      },
+      {
+        "id": "node-2",
+        "type": "workflow",
+        "position": { "x": 350, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Fetch subscriptions expiring within 30 days",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "SELECT s.id AS subscription_id, s.plan_name, s.amount, s.currency, s.billing_cycle, s.current_period_end, s.auto_renew, s.payment_method_id, s.retry_count, u.id AS user_id, u.email, u.full_name, u.company_name, EXTRACT(DAY FROM s.current_period_end - NOW()) AS days_until_expiry FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.status = 'active' AND s.current_period_end <= NOW() + INTERVAL '30 days' ORDER BY s.current_period_end ASC"
+          }
+        }
+      },
+      {
+        "id": "node-3",
+        "type": "workflow",
+        "position": { "x": 600, "y": 200 },
+        "data": {
+          "nodeType": "loop",
+          "label": "Process each expiring subscription",
+          "config": {
+            "iterateOver": "{{subscriptions}}",
+            "maxIterations": 5000,
+            "continueOnError": true
+          }
+        }
+      },
+      {
+        "id": "node-4",
+        "type": "workflow",
+        "position": { "x": 850, "y": 200 },
+        "data": {
+          "nodeType": "switch",
+          "label": "Categorize by days until expiry",
+          "config": {
+            "expression": "{{currentSubscription.days_until_expiry}}",
+            "cases": [
+              { "value": "<=0", "label": "Expired: Attempt charge or suspend" },
+              { "value": "1", "label": "Final day: Urgent renewal notice" },
+              { "value": "3", "label": "3 days: Last chance reminder" },
+              { "value": "7", "label": "7 days: Renewal reminder" },
+              { "value": "14", "label": "14 days: Early notice" },
+              { "value": "30", "label": "30 days: First notification" }
+            ]
+          }
+        }
+      },
+      {
+        "id": "node-5",
+        "type": "workflow",
+        "position": { "x": 1100, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Is auto-renewal enabled with valid payment?",
+          "config": {
+            "condition": "currentSubscription.auto_renew === true && currentSubscription.payment_method_id !== null && currentSubscription.days_until_expiry <= 1",
+            "trueLabel": "Attempt automatic charge",
+            "falseLabel": "Send renewal reminder email"
+          }
+        }
+      },
+      {
+        "id": "node-6",
+        "type": "workflow",
+        "position": { "x": 1350, "y": 200 },
+        "data": {
+          "nodeType": "http_request",
+          "label": "Charge payment method via billing gateway",
+          "config": {
+            "method": "POST",
+            "url": "{{env.PAYMENT_GATEWAY_URL}}/charges",
+            "headers": {
+              "Authorization": "Bearer {{secrets.PAYMENT_API_KEY}}",
+              "Content-Type": "application/json",
+              "Idempotency-Key": "renewal-{{currentSubscription.subscription_id}}-{{date}}"
+            },
+            "body": {
+              "payment_method_id": "{{currentSubscription.payment_method_id}}",
+              "amount": "{{currentSubscription.amount}}",
+              "currency": "{{currentSubscription.currency}}",
+              "description": "Subscription renewal: {{currentSubscription.plan_name}}",
+              "metadata": {
+                "subscription_id": "{{currentSubscription.subscription_id}}",
+                "user_id": "{{currentSubscription.user_id}}"
+              }
+            },
+            "timeoutMs": 30000
+          }
+        }
+      },
+      {
+        "id": "node-7",
+        "type": "workflow",
+        "position": { "x": 1600, "y": 200 },
+        "data": {
+          "nodeType": "conditional",
+          "label": "Was the payment charge successful?",
+          "config": {
+            "condition": "chargeResult.status === 'succeeded'",
+            "trueLabel": "Payment succeeded",
+            "falseLabel": "Payment failed"
+          }
+        }
+      },
+      {
+        "id": "node-8",
+        "type": "workflow",
+        "position": { "x": 1850, "y": 200 },
+        "data": {
+          "nodeType": "send_email",
+          "label": "Send renewal confirmation or dunning email",
+          "config": {
+            "to": ["{{currentSubscription.email}}"],
+            "subject": "{{#if paymentSucceeded}}Subscription Renewed: {{currentSubscription.plan_name}}{{else}}Action Required: Payment Failed for {{currentSubscription.plan_name}}{{/if}}",
+            "body": "{{#if paymentSucceeded}}Hi {{currentSubscription.full_name}},\n\nYour {{currentSubscription.plan_name}} subscription has been successfully renewed.\n\nAmount: {{currentSubscription.currency}} {{currentSubscription.amount}}\nNext billing date: {{nextBillingDate}}\n\nThank you for your continued subscription!\n{{else}}Hi {{currentSubscription.full_name}},\n\nWe were unable to process your payment for the {{currentSubscription.plan_name}} subscription.\n\nAmount: {{currentSubscription.currency}} {{currentSubscription.amount}}\n\nPlease update your payment method to avoid service interruption:\n{{env.APP_URL}}/billing/update-payment\n\nIf you have questions, contact support at support@{{env.EMAIL_DOMAIN}}.\n{{/if}}\n\nBest regards,\nThe Billing Team",
+            "from": "billing@{{env.EMAIL_DOMAIN}}",
+            "smtpHost": "{{env.SMTP_HOST}}",
+            "smtpPassword": "{{secrets.SMTP_PASSWORD}}"
+          }
+        }
+      },
+      {
+        "id": "node-9",
+        "type": "workflow",
+        "position": { "x": 2100, "y": 200 },
+        "data": {
+          "nodeType": "database_query",
+          "label": "Update subscription status and billing record",
+          "config": {
+            "connectionString": "{{env.DATABASE_URL}}",
+            "query": "{{#if paymentSucceeded}}UPDATE subscriptions SET current_period_end = current_period_end + INTERVAL '1 {{currentSubscription.billing_cycle}}', retry_count = 0, last_payment_at = NOW(), last_payment_status = 'succeeded' WHERE id = '{{currentSubscription.subscription_id}}'{{else}}UPDATE subscriptions SET retry_count = retry_count + 1, last_payment_status = 'failed', last_payment_error = '{{chargeResult.error}}' WHERE id = '{{currentSubscription.subscription_id}}'{{/if}}"
+          }
+        }
+      }
+    ],
+    "edges": [
+      { "id": "e1-2", "source": "node-1", "target": "node-2", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e2-3", "source": "node-2", "target": "node-3", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e3-4", "source": "node-3", "target": "node-4", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e4-5", "source": "node-4", "target": "node-5", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e5-6", "source": "node-5", "target": "node-6", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e6-7", "source": "node-6", "target": "node-7", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e7-8", "source": "node-7", "target": "node-8", "sourceHandle": "output", "targetHandle": "input" },
+      { "id": "e8-9", "source": "node-8", "target": "node-9", "sourceHandle": "output", "targetHandle": "input" }
+    ]
+  }
+}
\ No newline at end of file
