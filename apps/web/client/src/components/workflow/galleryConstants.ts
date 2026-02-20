/** Category name → Tailwind background / text classes for gallery badges */
export const CATEGORY_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  "Sales & Marketing":        { bg: "bg-blue-100",   text: "text-blue-800" },
  "HR & People":              { bg: "bg-purple-100", text: "text-purple-800" },
  "Finance & Accounting":     { bg: "bg-green-100",  text: "text-green-800" },
  "IT & DevOps":              { bg: "bg-orange-100", text: "text-orange-800" },
  "Healthcare":               { bg: "bg-red-100",    text: "text-red-800" },
  "Education":                { bg: "bg-yellow-100", text: "text-yellow-800" },
  "Government & Public":      { bg: "bg-gray-100",   text: "text-gray-800" },
  "Personal Productivity":    { bg: "bg-teal-100",   text: "text-teal-800" },
  "Real Estate":              { bg: "bg-amber-100",  text: "text-amber-800" },
  "Logistics & Supply Chain": { bg: "bg-cyan-100",   text: "text-cyan-800" },
  "Content & Media":          { bg: "bg-pink-100",   text: "text-pink-800" },
  "Food & Restaurant":        { bg: "bg-lime-100",   text: "text-lime-800" },
  "Legal & Compliance":       { bg: "bg-indigo-100", text: "text-indigo-800" },
  "Customer Service":         { bg: "bg-sky-100",    text: "text-sky-800" },
  "AI & Automation":          { bg: "bg-violet-100", text: "text-violet-800" },
};

export const DEFAULT_CATEGORY_COLOR = { bg: "bg-gray-100", text: "text-gray-700" };

/** Maps nodeType → hex color for detail drawer badges */
export const NODE_TYPE_CATEGORY_COLORS: Record<string, string> = {
  manual_trigger: "#10B981", schedule_trigger: "#10B981",
  webhook_trigger: "#10B981", event_trigger: "#10B981",
  form_input: "#10B981",
  llm_call: "#3B82F6", rag_query: "#3B82F6", embedding_generator: "#3B82F6",
  multi_model_router: "#3B82F6", prompt_template: "#3B82F6", output_parser: "#3B82F6",
  conditional: "#8B5CF6", loop: "#8B5CF6", parallel: "#8B5CF6",
  join: "#8B5CF6", subworkflow: "#8B5CF6", retry: "#8B5CF6",
  switch: "#8B5CF6", circuit_breaker: "#8B5CF6", try_catch: "#8B5CF6",
  delay: "#8B5CF6", wait: "#8B5CF6",
  database_query: "#F97316", transformer: "#F97316", filter: "#F97316",
  aggregator: "#F97316", csv_parser: "#F97316", template_engine: "#F97316",
  read_file: "#F97316", write_file: "#F97316", merge_data: "#F97316",
  split: "#F97316", batch: "#F97316", validator: "#F97316",
  code_runner: "#F97316",
  http_request: "#06B6D4", graphql_request: "#06B6D4", websocket_client: "#06B6D4",
  storage_action: "#06B6D4",
  send_email: "#EF4444", send_notification: "#EF4444",
  metrics_collector: "#6B7280", logger_node: "#6B7280", secrets_vault: "#6B7280",
  generate_image: "#F59E0B", skill: "#F59E0B", approval_gate: "#F59E0B",
};

export const DEFAULT_NODE_COLOR = "#6B7280";
