import { describe, expect, it } from "vitest";

import { DESKTOP_HOST_PROTOCOL_VERSION } from "../../../shared/desktopHost";
import {
  buildDesktopAgencyPackEnvelope,
  buildDesktopMaterializationDescriptor,
  buildPiToAgencyHandoff,
} from "../desktopPackageRegistryService";
import { buildRevocationFeedSnapshot } from "../revocationFeedService";

describe("desktopAgencyMaterializer", () => {
  it("builds agency packs for the Agency Swarm runtime", () => {
    const envelope = buildDesktopAgencyPackEnvelope({
      agencyId: "proposal-orchestrator",
      version: "1.0.0",
      trustClass: "org_verified",
      topology: {
        nodes: [{ id: "researcher", role: "research" }, { id: "writer", role: "writer" }],
      },
      instructions: {
        prompt: "Coordinate proposal research and writing.",
      },
      capabilityManifest: {
        capabilities: ["connector.read", "local_file_search"],
      },
      policyDescriptor: {
        runtime: "docker_managed",
      },
      signer: {
        signerId: "org-signer-1",
        keyVersion: "2026-04",
        signerSecret: "signing-key.test",
      },
    });

    expect(envelope.manifest.packageType).toBe("agency_pack");
    expect(envelope.manifest.runtimeDestination).toBe("agency_swarm");
  });

  it("materializes approved agency packs and blocks revoked ones", () => {
    const envelope = buildDesktopAgencyPackEnvelope({
      agencyId: "proposal-orchestrator",
      version: "1.0.0",
      trustClass: "org_verified",
      topology: { nodes: [{ id: "writer", role: "writer" }] },
      instructions: { prompt: "Write" },
      capabilityManifest: { capabilities: ["connector.send_message"] },
      policyDescriptor: { runtime: "docker_managed" },
      signer: {
        signerId: "org-signer-1",
        keyVersion: "2026-04",
        signerSecret: "signing-key.test",
      },
    });

    const descriptor = buildDesktopMaterializationDescriptor({
      envelope,
      localBundlePath: "/tmp/proposal-orchestrator",
      currentProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
      revocationFeed: buildRevocationFeedSnapshot({
        generatedAt: "2026-04-09T10:00:00.000Z",
      }),
      resolveSignerSecret: () => "signing-key.test",
    });

    expect(descriptor.runtimeDestination).toBe("agency_swarm");

    expect(() =>
      buildDesktopMaterializationDescriptor({
        envelope,
        localBundlePath: "/tmp/proposal-orchestrator",
        currentProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        revocationFeed: buildRevocationFeedSnapshot({
          generatedAt: "2026-04-09T10:00:00.000Z",
          revokedSignerIds: ["org-signer-1"],
        }),
        resolveSignerSecret: () => "signing-key.test",
      }),
    ).toThrow(/revoked/i);
  });

  it("builds explicit Pi-to-Agency handoff descriptors", () => {
    const handoff = buildPiToAgencyHandoff({
      packageId: "proposal-orchestrator",
      reason: "multi_agent_complexity",
      stagedWorkspacePath: "/workspace/proposal",
    });

    expect(handoff.sourceRuntime).toBe("pi");
    expect(handoff.destinationRuntime).toBe("agency_swarm");
    expect(handoff.handoffId).toMatch(/^[a-f0-9]{64}$/);
  });
});
