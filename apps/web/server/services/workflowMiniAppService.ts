export class MiniAppError extends Error {
  readonly code: "PUBLISHED_APP_IMMUTABLE";
  constructor(code: "PUBLISHED_APP_IMMUTABLE", message = code) {
    super(message);
    this.name = "MiniAppError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type MiniAppField = {
  name: string;
  type: "string" | "number" | "boolean";
  required: boolean;
};
export function validateMiniAppInput(input: {
  schema: MiniAppField[];
  input: Record<string, unknown>;
}):
  | { valid: true }
  | {
      valid: false;
      reasonCode: "REQUIRED_INPUT_MISSING" | "INPUT_TYPE_INVALID";
    } {
  for (const field of input.schema) {
    const value = input.input[field.name];
    if (
      field.required &&
      (value === undefined || value === null || value === "")
    )
      return { valid: false, reasonCode: "REQUIRED_INPUT_MISSING" };
    if (value !== undefined && value !== null && typeof value !== field.type)
      return { valid: false, reasonCode: "INPUT_TYPE_INVALID" };
  }
  return { valid: true };
}

export function authorizeMiniAppArtifact(input: {
  tenantId: string;
  artifact: { tenantId: string; objectKey: string };
}):
  | { allowed: true }
  | { allowed: false; reasonCode: "ARTIFACT_TENANT_MISMATCH" } {
  return input.tenantId === input.artifact.tenantId
    ? { allowed: true }
    : { allowed: false, reasonCode: "ARTIFACT_TENANT_MISMATCH" };
}

type MiniAppPublication = {
  appId: string;
  versionId: string;
  slug: string;
  accessMode: "private" | "tenant" | "public";
  status: "draft" | "published";
  publishedAt?: string;
};
const publishedApps = new Map<string, MiniAppPublication>();
export function publishMiniApp(
  input: Omit<MiniAppPublication, "status" | "publishedAt"> &
    Partial<Pick<MiniAppPublication, "status" | "publishedAt">>
): MiniAppPublication {
  const previous = publishedApps.get(input.appId);
  if (
    previous &&
    previous.status === "published" &&
    previous.versionId !== input.versionId
  )
    throw new MiniAppError("PUBLISHED_APP_IMMUTABLE");
  const published = {
    ...input,
    status: "published" as const,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
  };
  publishedApps.set(input.appId, published);
  return published;
}

export function filterWorkflowMarketplace<
  T extends { status: string; accessMode: string; tags: string[] },
>(apps: T[], input: { tag?: string }): T[] {
  return apps.filter(
    app =>
      app.status === "published" &&
      app.accessMode === "public" &&
      (!input.tag || app.tags.includes(input.tag))
  );
}
