/**
 * Export utilities for workflows and executions
 */

import type { Workflow } from "../types/database";

export interface ExecutionExport {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  output: string;
  error: string | null;
}

/**
 * Export workflows to JSON
 */
export function exportWorkflowsToJSON(workflows: Workflow[]): string {
  return JSON.stringify(workflows, null, 2);
}

/**
 * Export workflows to CSV
 */
export function exportWorkflowsToCSV(workflows: Workflow[]): string {
  const headers = ["ID", "Name", "Description", "Version", "Created At", "Updated At", "Config"];
  const rows = workflows.map((w) => [
    w.id,
    w.name,
    w.description || "",
    w.version,
    new Date(w.created_at * 1000).toISOString(),
    new Date(w.updated_at * 1000).toISOString(),
    JSON.stringify(w.config || {}),
  ]);

  return [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
}

/**
 * Export executions to JSON
 */
export function exportExecutionsToJSON(executions: ExecutionExport[]): string {
  return JSON.stringify(executions, null, 2);
}

/**
 * Export executions to CSV
 */
export function exportExecutionsToCSV(executions: ExecutionExport[]): string {
  const headers = [
    "ID",
    "Workflow ID",
    "Workflow Name",
    "Status",
    "Started At",
    "Finished At",
    "Duration (ms)",
    "Output",
    "Error",
  ];
  const rows = executions.map((e) => [
    e.id,
    e.workflow_id,
    e.workflow_name,
    e.status,
    new Date(e.started_at * 1000).toISOString(),
    e.finished_at ? new Date(e.finished_at * 1000).toISOString() : "",
    e.duration_ms?.toString() || "",
    e.output,
    e.error || "",
  ]);

  return [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
}

/**
 * Download file to user's computer
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import workflows from JSON
 */
export function importWorkflowsFromJSON(jsonString: string): Workflow[] {
  try {
    const data = JSON.parse(jsonString);
    if (!Array.isArray(data)) {
      throw new Error("Invalid format: expected array of workflows");
    }
    return data;
  } catch (err) {
    throw new Error(`Failed to parse JSON: ${(err as Error).message}`);
  }
}

/**
 * Import workflows from CSV
 */
export function importWorkflowsFromCSV(csvString: string): Workflow[] {
  const lines = csvString.split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("Invalid CSV: no data rows");
  }

  // Skip header
  const dataLines = lines.slice(1);
  
  const workflows: Workflow[] = [];
  for (const line of dataLines) {
    const values = parseCSVLine(line);
    if (values.length < 7) continue;

    workflows.push({
      id: values[0],
      name: values[1],
      description: values[2] || undefined,
      version: values[3],
      created_at: Math.floor(new Date(values[4]).getTime() / 1000),
      updated_at: Math.floor(new Date(values[5]).getTime() / 1000),
      config: values[6] ? JSON.parse(values[6]) : undefined,
    });
  }

  return workflows;
}

/**
 * Parse CSV line with proper quote handling
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // End of value
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  // Add last value
  values.push(current);

  return values;
}
