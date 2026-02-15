/**
 * Cloud Tasks enqueue module for Node.js.
 *
 * Provides a typed interface for dispatching tasks to Google Cloud Tasks
 * queues from the Node.js API server.
 */

import { CloudTasksClient } from "@google-cloud/tasks";

const VALID_QUEUES = [
  "media-jobs",
  "video-jobs-short",
  "video-jobs-long",
  "workflow-tasks",
  "polling-tasks",
  "periodic-tasks",
] as const;

type QueueName = (typeof VALID_QUEUES)[number];

export interface EnqueueTaskOptions {
  /** Which Cloud Tasks queue to use (e.g., 'media-jobs') */
  queueName: QueueName;
  /** Endpoint path on the Python service (e.g., '/tasks/process-media') */
  handlerPath: string;
  /** JSON body for the task */
  payload: Record<string, unknown>;
  /** Optional delay in seconds before first dispatch */
  delaySeconds?: number;
  /** Optional deterministic task ID for deduplication (24h window) */
  taskId?: string;
}

let _client: InstanceType<typeof CloudTasksClient> | null = null;

function getClient(): InstanceType<typeof CloudTasksClient> {
  if (!_client) {
    _client = new CloudTasksClient();
  }
  return _client;
}

/**
 * Enqueue a task to Google Cloud Tasks.
 *
 * The task is dispatched as an HTTP POST to the Python Cloud Run service
 * with OIDC authentication.
 *
 * @returns The full resource name of the created task.
 */
export async function enqueueTask(
  options: EnqueueTaskOptions
): Promise<string> {
  const { queueName, handlerPath, payload, delaySeconds, taskId } = options;

  const projectId = process.env.GCP_PROJECT_ID!;
  const region = process.env.GCP_REGION!;
  const pythonUrl = process.env.CLOUD_RUN_PYTHON_URL!;
  const saEmail = process.env.CLOUD_RUN_SA_EMAIL!;

  const client = getClient();
  const parent = client.queuePath(projectId, region, queueName);

  const task: Record<string, any> = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: `${pythonUrl}${handlerPath}`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: {
        serviceAccountEmail: saEmail,
        audience: pythonUrl,
      },
    },
  };

  if (taskId) {
    task.name = client.taskPath(projectId, region, queueName, taskId);
  }

  if (delaySeconds && delaySeconds > 0) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds,
    };
  }

  const [response] = await client.createTask({ parent, task });

  return response.name!;
}
