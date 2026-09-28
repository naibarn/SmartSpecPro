export type GasCityProviderManifest = {
  providerId: string;
  gasCityVersion: string;
  beadsVersion: string;
  store: { kind: "file" | "dolt"; version: string };
  license: { approved: boolean; evidenceRef: string | null };
  executable: { path: string; sha256: string };
};

export class GasCityProviderError extends Error {
  readonly code: "LICENSE_UNVERIFIED" | "MANIFEST_INVALID";

  constructor(code: GasCityProviderError["code"], message = code) {
    super(message);
    this.name = "GasCityProviderError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GasCityProviderRegistry {
  private readonly manifests = new Map<string, GasCityProviderManifest>();

  register(manifest: GasCityProviderManifest): void {
    if (
      !manifest.providerId ||
      !/^\d+\.\d+\.\d+$/.test(manifest.gasCityVersion) ||
      !/^\d+\.\d+\.\d+$/.test(manifest.beadsVersion) ||
      !manifest.store.version ||
      !/^[a-f0-9]{64}$/i.test(manifest.executable.sha256)
    )
      throw new GasCityProviderError("MANIFEST_INVALID");
    if (!manifest.license.approved || !manifest.license.evidenceRef)
      throw new GasCityProviderError("LICENSE_UNVERIFIED");
    this.manifests.set(manifest.providerId, structuredClone(manifest));
  }

  readiness(providerId: string): {
    status: "ready" | "missing" | "blocked";
    reasonCode: string;
  } {
    if (!this.manifests.has(providerId))
      return { status: "missing", reasonCode: "PROVIDER_MANIFEST_MISSING" };
    return { status: "ready", reasonCode: "GASCITY_PROVIDER_READY" };
  }

  buildSessionConfig(input: {
    providerId: string;
    tenantId: string;
    workspaceId: string;
  }): {
    providerId: string;
    workspaceId: string;
    storeEndpoint: string;
    executableSha256: string;
  } {
    const manifest = this.manifests.get(input.providerId);
    if (!manifest)
      throw new GasCityProviderError(
        "MANIFEST_INVALID",
        "Provider manifest is not registered"
      );
    const scope = `${encodeURIComponent(input.tenantId)}/${encodeURIComponent(input.workspaceId)}`;
    return {
      providerId: input.providerId,
      workspaceId: input.workspaceId,
      storeEndpoint: `${manifest.store.kind}://managed/${scope}`,
      executableSha256: manifest.executable.sha256,
    };
  }

  backupRestore(input: {
    providerId: string;
    backupRef: string;
    restore: () => Promise<void>;
  }): { status: "blocked" | "scheduled"; reasonCode: string } {
    if (!this.manifests.has(input.providerId))
      return { status: "blocked", reasonCode: "PROVIDER_MANIFEST_MISSING" };
    return { status: "scheduled", reasonCode: "BACKUP_RESTORE_DELEGATED" };
  }
}
