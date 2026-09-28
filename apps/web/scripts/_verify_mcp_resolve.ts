import { resolveMediaTransport } from "../server/services/mediaTransportResolver";

async function main() {
  const base = {
    tenantId: "tenant-ZCSKEM9s",
    originSurface: "media_studio" as const,
    assetType: "image" as const,
    requestedTransport: "mcp" as const,
    providerKey: "higgsfield",
    model: "higgsfield/gpt_image_2",
  };
  const cases = [
    { label: "user24 NO connectionId + NO groupId (the bug)", actorUserId: 24 },
    { label: "user109 NO connectionId + NO groupId", actorUserId: 109 },
    { label: "owner user1 NO connectionId", actorUserId: 1 },
    { label: "user999 non-member NO connectionId (must DENY)", actorUserId: 999 },
  ];
  for (const c of cases) {
    try {
      const r = await resolveMediaTransport({ ...base, actorUserId: c.actorUserId });
      console.log(
        `OK   | ${c.label} -> conn=${r.connectionId?.slice(0, 8)} group=${r.sharedGroupId ?? "none"} scope=${r.connectionScope} owner=${r.ownerUserId}`
      );
    } catch (e: any) {
      console.log(`DENY | ${c.label} -> ${e?.message}`);
    }
  }
  process.exit(0);
}
main().catch(e => {
  console.error(e?.message ?? e);
  process.exit(1);
});
