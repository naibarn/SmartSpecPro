/**
 * Cloud Tasks enqueue module for Node.js.
 *
 * Provides a typed interface for dispatching tasks to Google Cloud Tasks
 * queues from the Node.js API server.
 */

const VALID_QUEUES = [
  "media-jobs",
  "video-jobs-short",
  "video-jobs-long",
  "workflow-tasks",
  "polling-tasks",
  "periodic-tasks",
] as const;

type QueueName = (typeof VALID_QUEUES)[number];

type CloudTasksResponse = { name?: string };
type CloudTasksClientLike = {
  queuePath: (projectId: string, region: string, queueName: string) => string;
  taskPath: (projectId: string, region: string, queueName: string, taskId: string) => string;
  createTask: (
    request: { parent: string; task: Record<string, any> },
  ) => Promise<[CloudTasksResponse, ...unknown[]]>;
  deleteTask: (request: { name: string }) => Promise<unknown>;
};

export interface EnqueueTaskOptions {
  /** Which Cloud Tasks queue to use (e.g., 'media-jobs') */
  queueName: QueueName;
  /** Endpoint path on the handler service (e.g., '/_internal/tasks/process-media') */
  handlerPath: string;
  /** JSON body for the task */
  payload: Record<string, unknown>;
  /** Optional delay in seconds before first dispatch */
  delaySeconds?: number;
  /** Optional deterministic task ID for deduplication (24h window) */
  taskId?: string;
  /**
   * Target service: 'python' (default) or 'node'.
   * 'python' uses CLOUD_RUN_PYTHON_URL, 'node' uses CLOUD_RUN_NODE_URL.
   */
  targetService?: "python" | "node";
}

export interface CloudTasksConfigStatus {
  configured: boolean;
  missingKeys: string[];
  projectId: string;
  region: string;
  serviceUrl: string;
  serviceAccountEmail: string;
}

let _client: CloudTasksClientLike | null = null;
let _clientInitError: Error | null = null;

function readEnvValue(key: string): string {
  return (process.env[key] || "").trim();
}

export function getCloudTasksConfigStatus(
  targetService: "python" | "node" = "python",
): CloudTasksConfigStatus {
  const serviceUrlKey = targetService === "node" ? "CLOUD_RUN_NODE_URL" : "CLOUD_RUN_PYTHON_URL";
  const values = {
    GCP_PROJECT_ID: readEnvValue("GCP_PROJECT_ID"),
    GCP_REGION: readEnvValue("GCP_REGION"),
    CLOUD_RUN_SA_EMAIL: readEnvValue("CLOUD_RUN_SA_EMAIL"),
    [serviceUrlKey]: readEnvValue(serviceUrlKey),
  };
  const missingKeys = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    configured: missingKeys.length === 0,
    missingKeys,
    projectId: values.GCP_PROJECT_ID,
    region: values.GCP_REGION,
    serviceUrl: values[serviceUrlKey],
    serviceAccountEmail: values.CLOUD_RUN_SA_EMAIL,
  };
}

async function getClient(): Promise<CloudTasksClientLike> {
  if (!_client) {
    if (_clientInitError) {
      throw _clientInitError;
    }
    try {
      const mod = await import("@google-cloud/tasks");
      const CloudTasksClientCtor = (
        mod as unknown as { CloudTasksClient?: new (...args: unknown[]) => CloudTasksClientLike }
      ).CloudTasksClient;
      if (!CloudTasksClientCtor) {
        throw new Error("CloudTasksClient export was not found");
      }
      _client = new CloudTasksClientCtor();
    } catch (err: any) {
      const details = err?.message ? ` (${err.message})` : "";
      _clientInitError = new Error(
        `Google Cloud Tasks SDK is unavailable. Install '@google-cloud/tasks' to enable Cloud Tasks features.${details}`
      );
      throw _clientInitError;
    }
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
  const { queueName, handlerPath, payload, delaySeconds, taskId, targetService = "python" } = options;

  const config = getCloudTasksConfigStatus(targetService);
  if (!config.configured) {
    throw new Error(
      `Cloud Tasks configuration is incomplete for ${targetService} target. Missing: ${config.missingKeys.join(", ")}`,
    );
  }

  const client = await getClient();
  const parent = client.queuePath(config.projectId, config.region, queueName);

  const task: Record<string, any> = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: `${config.serviceUrl}${handlerPath}`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: {
        serviceAccountEmail: config.serviceAccountEmail,
        audience: config.serviceUrl,
      },
    },
  };

  if (taskId) {
    task.name = client.taskPath(config.projectId, config.region, queueName, taskId);
  }

  if (delaySeconds && delaySeconds > 0) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds,
    };
  }

  const [response] = await client.createTask({ parent, task });

  return response.name!;
}

/**
 * Delete a Cloud Tasks task by its full resource name.
 *
 * Used to cancel scheduled tasks (e.g., scheduled message delivery).
 * Silently succeeds if the task is already deleted or completed.
 */
export async function deleteTask(taskName: string): Promise<void> {
  const client = await getClient();
  try {
    await client.deleteTask({ name: taskName });
  } catch (err: any) {
    // 404 = task already completed or deleted — not an error
    if (err?.code !== 5) {
      throw err;
    }
  }
}
