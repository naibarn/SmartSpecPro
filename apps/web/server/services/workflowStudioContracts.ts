import { createHash, randomUUID } from "node:crypto";

import {
  compileWorkflowDefinition,
  type WorkflowDefinitionV2,
} from "./workflowCompilerRuntimeContracts";

export type WorkflowDefinition = WorkflowDefinitionV2;

export type WorkflowVersion = {
  definitionId: string;
  version: number;
  contentHash: string;
  status: "draft" | "published";
  accessMode: "private" | "tenant" | "public";
  publishedAt?: string;
};

export class WorkflowStudioError extends Error {
  readonly code:
    | "DEFINITION_INVALID"
    | "PUBLISHED_VERSION_IMMUTABLE"
    | "SECRET_IN_DEFINITION"
    | "DRAFT_REVISION_CONFLICT";

  constructor(code: WorkflowStudioError["code"], message = code) {
    super(message);
    this.name = "WorkflowStudioError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function assertWorkflowDraftRevision(
  expectedRevision: number,
  currentRevision: number
): true {
  if (
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0 ||
    !Number.isInteger(currentRevision) ||
    currentRevision < 0 ||
    expectedRevision !== currentRevision
  ) {
    throw new WorkflowStudioError(
      "DRAFT_REVISION_CONFLICT",
      "DRAFT_REVISION_CONFLICT"
    );
  }
  return true;
}

function assertCanonicalDefinition(input: unknown): WorkflowDefinitionV2 {
  if (
    !input ||
    typeof input !== "object" ||
    (input as { schemaVersion?: unknown }).schemaVersion !== "2"
  ) {
    throw new WorkflowStudioError(
      "DEFINITION_INVALID",
      "LEGACY_DEFINITION_UNSUPPORTED"
    );
  }
  try {
    const definition = input as WorkflowDefinitionV2;
    compileWorkflowDefinition(definition);
    return definition;
  } catch (error) {
    const code = error instanceof Error ? error.message : "DEFINITION_INVALID";
    throw new WorkflowStudioError("DEFINITION_INVALID", code);
  }
}

export function validateWorkflowDefinition(
  input: unknown
): { valid: true; nodeCount: number } | { valid: false; reasonCode: string } {
  try {
    const definition = assertCanonicalDefinition(input);
    return { valid: true, nodeCount: definition.nodes.length };
  } catch (error) {
    return {
      valid: false,
      reasonCode:
        error instanceof WorkflowStudioError ? error.message : "DEFINITION_INVALID",
    };
  }
}

export function createWorkflowDraft(input: {
  id?: string;
  tenantId: string;
  ownerUserId: number;
  name: string;
  definition: WorkflowDefinition;
}): {
  id: string;
  tenantId: string;
  ownerUserId: number;
  name: string;
  semanticDefinitionJson: WorkflowDefinition;
  status: "draft";
  createdAt: string;
} {
  const semanticDefinitionJson = structuredClone(
    assertCanonicalDefinition(input.definition)
  );
  return {
    id: input.id ?? randomUUID(),
    tenantId: input.tenantId,
    ownerUserId: input.ownerUserId,
    name: input.name.trim(),
    semanticDefinitionJson,
    status: "draft",
    createdAt: new Date().toISOString(),
  };
}

const publishedHashes = new Map<string, string>();

export function publishWorkflowVersion(
  input: WorkflowVersion
): WorkflowVersion {
  if (input.status === "published") {
    const key = `${input.definitionId}:${input.version}`;
    const knownHash = publishedHashes.get(key);
    if ((knownHash && knownHash !== input.contentHash) || !input.contentHash)
      throw new WorkflowStudioError("PUBLISHED_VERSION_IMMUTABLE");
    return input;
  }
  const published = {
    ...input,
    status: "published" as const,
    publishedAt: new Date().toISOString(),
  };
  publishedHashes.set(
    `${input.definitionId}:${input.version}`,
    input.contentHash
  );
  return published;
}

export function workflowContentHash(definition: WorkflowDefinition): string {
  const canonical = assertCanonicalDefinition(definition);
  return createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}
