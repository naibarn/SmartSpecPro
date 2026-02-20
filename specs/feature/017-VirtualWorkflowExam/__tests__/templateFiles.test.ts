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
