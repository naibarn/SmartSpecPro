import { runMcpUsageRetention } from "../services/mcpUsageRetentionService";

export async function runMcpUsageRetentionJob() {
  return runMcpUsageRetention(new Date());
}
