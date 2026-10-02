import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { getSpec260ApiPath, getSpec260PagePath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type ReviewItem = { id: string; caseId: string; kind: string; hazardCategory: string; severity: string; basis: string[]; createdAt: string };

export default function EmergencyCaseReviewQueue({ canVerify, caseId }: { canVerify: boolean; caseId?: string }) {
  const { t } = useScopedTranslation("emergency");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  const refresh = useCallback(async () => {
    const response = await fetch(getSpec260ApiPath(caseId ? "operations.command.case.review-items" : "operations.command.review-items", caseId ? { caseId } : {}), { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("REVIEW_QUEUE_UNAVAILABLE");
    const payload = await response.json() as { items?: ReviewItem[] };
    setItems(payload.items ?? []);
  }, [caseId]);

  useEffect(() => { void refresh().then(() => setState("ready")).catch(() => setState("unavailable")); }, [refresh]);

  const resolve = async (item: ReviewItem) => {
    const reason = reasons[item.id]?.trim() ?? "";
    if (reason.length < 8 || (item.kind === "verification" && !canVerify)) return;
    const response = await fetch(getSpec260ApiPath("operations.command.review-item.resolve", { caseId: item.caseId, reviewItemId: item.id }), {
      method: "PATCH", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ reason, expectedState: "open" }),
    });
    if (!response.ok) { setState("unavailable"); return; }
    setReasons(current => { const next = { ...current }; delete next[item.id]; return next; });
    await refresh();
  };

  return <Card><VStack gap={3}>
    <Heading level={2}>{t("reviewQueue.title")}</Heading>
    {state === "unavailable" && <Text role="alert">{t("reviewQueue.unavailable")}</Text>}
    {state === "ready" && items.length === 0 && <Text>{t("reviewQueue.empty")}</Text>}
    {items.map(item => <VStack key={item.id} gap={2}>
      <Text>{t(`reviewQueue.kind.${item.kind}`)} · {item.hazardCategory} · {item.severity}</Text>
      <Link href={getSpec260PagePath("dashboard.case", { caseId: item.caseId })}>{t("reviewQueue.openCase")}</Link>
      {item.basis.map(reason => <Text key={reason}>{reason}</Text>)}
      <TextArea label={t("reviewQueue.reason")} minLength={8} maxLength={500} value={reasons[item.id] ?? ""} onChange={value => setReasons(current => ({ ...current, [item.id]: value }))} />
      <Button type="button" isDisabled={(item.kind === "verification" && !canVerify) || (reasons[item.id]?.trim().length ?? 0) < 8}
        label={t("reviewQueue.complete")} clickAction={() => void resolve(item)} />
    </VStack>)}
  </VStack></Card>;
}
