export type EditorArtifactManifest = {
  jobId: string;
  attemptId: string;
  leaseToken: string;
  role: string;
  artifactId: string;
  checksum: string;
  sizeBytes: number;
  mimeType: string;
  verified?: boolean;
};

const SAFE_ARTIFACT_TOKEN = /^[A-Za-z0-9._:-]{1,160}$/;

export function verifyEditorArtifactManifest(manifest: EditorArtifactManifest, actual: { checksum: string; sizeBytes: number; tenantId: string }, expectedTenantId: string): EditorArtifactManifest {
  if (!SAFE_ARTIFACT_TOKEN.test(manifest.jobId) || !SAFE_ARTIFACT_TOKEN.test(manifest.attemptId) || !SAFE_ARTIFACT_TOKEN.test(manifest.leaseToken) || !SAFE_ARTIFACT_TOKEN.test(manifest.role) || !SAFE_ARTIFACT_TOKEN.test(manifest.artifactId) || !manifest.mimeType || !/^[-A-Za-z0-9.+/]{1,160}$/.test(manifest.mimeType)) throw new Error("ARTIFACT_MANIFEST_INVALID");
  if (manifest.checksum !== actual.checksum || manifest.sizeBytes !== actual.sizeBytes) throw new Error("ARTIFACT_INTEGRITY_MISMATCH");
  if (actual.tenantId !== expectedTenantId) throw new Error("ARTIFACT_TENANT_MISMATCH");
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes < 0) throw new Error("ARTIFACT_SIZE_INVALID");
  return { ...manifest, verified: true };
}

export function publicationKey(manifest: Pick<EditorArtifactManifest, "jobId" | "role" | "checksum">): string {
  if (!SAFE_ARTIFACT_TOKEN.test(manifest.jobId) || !SAFE_ARTIFACT_TOKEN.test(manifest.role) || typeof manifest.checksum !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(manifest.checksum)) throw new Error("ARTIFACT_MANIFEST_INVALID");
  return `${manifest.jobId}:${manifest.role}:${manifest.checksum}`;
}

export function verifyEditorArtifactSet(manifests: readonly EditorArtifactManifest[], declaredRoles: readonly string[]): void {
  if (declaredRoles.length === 0 || new Set(declaredRoles).size !== declaredRoles.length || declaredRoles.some((role) => !SAFE_ARTIFACT_TOKEN.test(role))) throw new Error("ARTIFACT_ROLE_DECLARATION_INVALID");
  const declared = new Set(declaredRoles);
  const seen = new Set<string>();
  let context: Pick<EditorArtifactManifest, "jobId" | "attemptId" | "leaseToken"> | undefined;
  for (const manifest of manifests) {
    if (!declared.has(manifest.role)) throw new Error("ARTIFACT_ROLE_UNDECLARED");
    if (seen.has(manifest.role)) throw new Error("ARTIFACT_ROLE_DUPLICATE");
    if (!context) context = manifest;
    if (context.jobId !== manifest.jobId || context.attemptId !== manifest.attemptId || context.leaseToken !== manifest.leaseToken) throw new Error("ARTIFACT_CONTEXT_MISMATCH");
    seen.add(manifest.role);
  }
  for (const role of declared) if (!seen.has(role)) throw new Error("ARTIFACT_ROLE_MISSING");
}
