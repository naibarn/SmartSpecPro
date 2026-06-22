import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  createAgentEventId,
  type AgentArtifactFormat,
  type AgentExperienceParseResult,
  type SmartSpecAgentEvent,
} from "../events";
import { validateSmartSpecAgentEvent } from "../schemas";

export interface ArtifactRecordLike {
  artifactId?: string;
  id?: string;
  tenantId?: string;
  runId?: string;
  title?: string;
  format?: string;
  version?: string | number;
  preview?: string;
  content?: unknown;
  url?: string;
}

const FORMATS = new Set<AgentArtifactFormat>(["markdown", "json", "html", "image", "video", "table", "code", "unknown"]);

export function artifactRecordToAgentEvents(record: ArtifactRecordLike): AgentExperienceParseResult {
  const artifactId = record.artifactId ?? record.id;
  if (!artifactId || !record.tenantId) {
    return {
      events: [],
      dropped: [{ reason: "missing_identity", source: "artifact", message: "Artifact id and tenant id are required" }],
    };
  }
  if (record.content != null || record.url != null) {
    return {
      events: [],
      dropped: [{ reason: "unsafe_payload", source: "artifact", sourceEventId: artifactId, message: "Artifact events must carry pointers only" }],
    };
  }

  const format = FORMATS.has(record.format as AgentArtifactFormat) ? record.format as AgentArtifactFormat : "unknown";
  const event: SmartSpecAgentEvent = {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id: createAgentEventId("artifact", artifactId),
    type: "artifact.created",
    source: "artifact",
    surface: "artifact_panel",
    visibility: "tenant",
    redaction: "summary",
    timestamp: new Date(0).toISOString(),
    sourceEventId: artifactId,
    tenantId: record.tenantId,
    runId: record.runId,
    payload: {
      kind: "artifact",
      artifact: {
        artifactId,
        title: record.title,
        format,
        version: record.version,
        preview: record.preview,
      },
    },
  };

  return validateSmartSpecAgentEvent(event);
}
