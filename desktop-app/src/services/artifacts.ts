import { cp } from "./controlPlane";

export type UploadedArtifact = {
  sessionId: string;
  iteration: number;
  key: string;
  putUrl: string;
  getUrl: string;
  contentType: string;
  name: string;
  size: number;
};

const MAX_BYTES_DEFAULT = 200 * 1024 * 1024; // 200MB safety cap (UI-level)

function slug(s: string) {
  return (s || "workspace")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

function workspaceKey(workspace: string) {
  return `smartspec.cp.session.${slug(workspace)}`;
}

export async function ensureControlPlaneSession(workspace: string): Promise<{ projectId: string; sessionId: string; iteration: number }> {
  const k = workspaceKey(workspace);
  const existing = localStorage.getItem(k);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as { projectId: string; sessionId: string; iteration?: number };
      if (parsed.sessionId && parsed.projectId) {
        return { projectId: parsed.projectId, sessionId: parsed.sessionId, iteration: parsed.iteration ?? 0 };
      }
    } catch {
      // ignore
    }
  }

  // Create a new project + session for this workspace
  const projName = `Desktop: ${workspace.split(/[\\/]/).filter(Boolean).slice(-1)[0] || "workspace"}`;
  const project = (await cp.createProject(projName, `Local workspace: ${workspace}`)).project ?? (await cp.createProject(projName)).project;
  const session = (await cp.createSession(project.id, `Terminal Session (${new Date().toISOString()})`)).session ?? (await cp.createSession(project.id, `Terminal Session`)).session;

  // Ensure iteration 0 exists
  try {
    await cp.createIteration(session.id, 0);
  } catch {
    // iteration may already exist in some deployments; ignore
  }

  const payload = { projectId: project.id, sessionId: session.id, iteration: 0 };
  localStorage.setItem(k, JSON.stringify(payload));
  return payload;
}

export async function uploadToArtifactStorage(opts: {
  workspace: string;
  file: File;
  iteration?: number;
  maxBytes?: number;
}): Promise<UploadedArtifact> {
  const { workspace, file } = opts;
  const maxBytes = opts.maxBytes ?? MAX_BYTES_DEFAULT;
  const iteration = opts.iteration ?? 0;

  if (file.size > maxBytes) {
    throw new Error(`File too large: ${file.size} bytes (max ${maxBytes})`);
  }

  const { sessionId } = await ensureControlPlaneSession(workspace);

  const put = await cp.presignPut(sessionId, iteration, file.name, file.type || "application/octet-stream");
  const putUrl = put.artifact.url;
  const key = put.artifact.key;
  const headers = put.artifact.headers || { "Content-Type": file.type || "application/octet-stream" };

  // Upload directly to R2/S3 presigned URL
  const upRes = await fetch(putUrl, {
    method: "PUT",
    headers,
    body: file,
  });

  if (!upRes.ok) {
    const text = await upRes.text().catch(() => "");
    throw new Error(`Upload failed (${upRes.status}): ${text}`);
  }

  // Get a presigned GET URL for LLM + UI
  const get = await cp.presignGet(sessionId, key);
  const getUrl = get.artifact.url;

  return {
    sessionId,
    iteration,
    key,
    putUrl,
    getUrl,
    contentType: file.type || "application/octet-stream",
    name: file.name,
    size: file.size,
  };
}
