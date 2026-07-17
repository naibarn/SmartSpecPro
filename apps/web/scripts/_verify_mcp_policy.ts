import { assertMcpSharePolicyAllowed } from "../server/services/mcpConnectionSharingService";

async function main() {
  const cases = [
    { label: "user24 no groupId (storyboard bug)", actorUserId: 24, groupId: undefined },
    { label: "user24 stale groupId=1 (disabled share)", actorUserId: 24, groupId: 1 },
    { label: "user109 no groupId", actorUserId: 109, groupId: undefined },
    { label: "user109 stale groupId=1", actorUserId: 109, groupId: 1 },
    { label: "user999 non-member (must DENY)", actorUserId: 999, groupId: undefined },
  ];
  for (const c of cases) {
    try {
      const res = await assertMcpSharePolicyAllowed({
        tenantId: "tenant-ZCSKEM9s",
        actorUserId: c.actorUserId,
        connectionId: "b4f89074-4579-4d73-8c84-07abbd9af579",
        assetType: "image",
        groupId: c.groupId as number | undefined,
      });
      console.log(
        `OK   | ${c.label} -> scope=${res.scope} resolvedGroup=${res.share?.groupId ?? "none"}`
      );
    } catch (e: any) {
      console.log(`DENY | ${c.label} -> ${e?.message}`);
    }
  }
  process.exit(0);
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
