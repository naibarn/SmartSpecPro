import { z } from "zod";

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);

const requestSchema = z.object({
  artifactId: identifier,
  artifactVersion: z.number().int().positive(),
  artifactDigest: sha256,
  evidenceRef: identifier,
  evidenceDigest: sha256,
  capabilityId: identifier,
}).strict();

export type DesignHandoffRequest = z.infer<typeof requestSchema>;
export type DesignHandoffActor = { userId: string; tenantId: string; projectId: string };
export type CanonicalArtifact = {
  artifactId: string;
  version: number;
  digest: string;
  tenantId: string;
  projectId: string;
  status: "draft" | "selected" | "implemented" | "reviewed" | "approved" | "superseded" | "withdrawn";
  rightsCleared: boolean;
  provenance: { source: "native" | "external-provider" | "import"; requestId: string; providerId?: string };
  componentResolutionSnapshotId: string;
};
export type CanonicalEvidence = {
  reference: string;
  digest: string;
  tenantId: string;
  projectId: string;
  artifactId: string;
  artifactVersion: number;
  artifactDigest: string;
  status: "active" | "revoked";
  validUntil: string;
};
export type DesignHandoffPayload = {
  artifact: CanonicalArtifact;
  evidence: CanonicalEvidence;
  capability: { capabilityId: string; evidenceRef: string };
  submittedBy: string;
};

export class DesignHandoffError extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "AUTHORIZATION_DENIED" | "EVIDENCE_STALE" | "ARTIFACT_NOT_ACCEPTED" | "CAPABILITY_DENIED" | "AUTHORITY_UNAVAILABLE" | "DECISION_CONFLICT") {
    super(code);
    this.name = "DesignHandoffError";
  }
}

type CapabilityResult = { status: "satisfied"; evidenceRef: string } | { status: "denied" | "missing" };
type HandoffResult = { status: "accepted"; receipt: string };

/** Contract adapter only. Production authority ports must be explicitly owner-approved. */
export function createDesignHandoffService(input: {
  readCanonicalArtifact?: (artifactId: string, version: number, actor: DesignHandoffActor) => Promise<CanonicalArtifact | null>;
  readCanonicalEvidence?: (evidenceRef: string, actor: DesignHandoffActor) => Promise<CanonicalEvidence | null>;
  resolveCapability?: (capabilityId: string, actor: DesignHandoffActor) => Promise<CapabilityResult>;
  authorizeHandoff?: (actor: DesignHandoffActor, artifact: CanonicalArtifact) => Promise<boolean>;
  handoff?: (payload: DesignHandoffPayload) => Promise<HandoffResult>;
  now?: () => Date;
}) {
  return {
    async submit(rawRequest: unknown, actor: DesignHandoffActor): Promise<HandoffResult> {
      const parsed = requestSchema.safeParse(rawRequest);
      if (!parsed.success) throw new DesignHandoffError("INVALID_REQUEST");
      if (!input.readCanonicalArtifact || !input.readCanonicalEvidence || !input.resolveCapability || !input.authorizeHandoff || !input.handoff) {
        throw new DesignHandoffError("AUTHORITY_UNAVAILABLE");
      }
      const request = parsed.data;
      let artifact: CanonicalArtifact | null;
      let evidence: CanonicalEvidence | null;
      try {
        artifact = await input.readCanonicalArtifact(request.artifactId, request.artifactVersion, actor);
        evidence = await input.readCanonicalEvidence(request.evidenceRef, actor);
      } catch {
        throw new DesignHandoffError("AUTHORITY_UNAVAILABLE");
      }
      if (!artifact || artifact.artifactId !== request.artifactId || artifact.version !== request.artifactVersion || artifact.digest !== request.artifactDigest) {
        throw new DesignHandoffError("DECISION_CONFLICT");
      }
      if (artifact.tenantId !== actor.tenantId || artifact.projectId !== actor.projectId) {
        throw new DesignHandoffError("AUTHORIZATION_DENIED");
      }
      if (artifact.status !== "approved" || !artifact.rightsCleared) {
        throw new DesignHandoffError("ARTIFACT_NOT_ACCEPTED");
      }
      if (!evidence || evidence.reference !== request.evidenceRef || evidence.digest !== request.evidenceDigest ||
        evidence.tenantId !== actor.tenantId || evidence.projectId !== actor.projectId ||
        evidence.tenantId !== artifact.tenantId || evidence.projectId !== artifact.projectId ||
        evidence.artifactId !== artifact.artifactId || evidence.artifactVersion !== artifact.version ||
        evidence.artifactDigest !== artifact.digest || evidence.status !== "active") {
        throw new DesignHandoffError("DECISION_CONFLICT");
      }
      const expiresAt = Date.parse(evidence.validUntil);
      if (!Number.isFinite(expiresAt) || expiresAt <= (input.now?.() ?? new Date()).getTime()) {
        throw new DesignHandoffError("EVIDENCE_STALE");
      }
      let authorized: boolean;
      let capability: CapabilityResult;
      try {
        authorized = await input.authorizeHandoff(actor, artifact);
        if (!authorized) throw new DesignHandoffError("AUTHORIZATION_DENIED");
        capability = await input.resolveCapability(request.capabilityId, actor);
      } catch (error) {
        if (error instanceof DesignHandoffError) throw error;
        throw new DesignHandoffError("AUTHORITY_UNAVAILABLE");
      }
      if (capability.status !== "satisfied") throw new DesignHandoffError("CAPABILITY_DENIED");
      if (!identifier.safeParse(capability.evidenceRef).success) throw new DesignHandoffError("AUTHORITY_UNAVAILABLE");
      try {
        return await input.handoff({
          artifact,
          evidence,
          capability: { capabilityId: request.capabilityId, evidenceRef: capability.evidenceRef },
          submittedBy: actor.userId,
        });
      } catch {
        throw new DesignHandoffError("AUTHORITY_UNAVAILABLE");
      }
    },
  };
}
