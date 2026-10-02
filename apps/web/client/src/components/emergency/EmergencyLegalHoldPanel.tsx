import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getSpec260ApiPath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type Hold = { id: string; caseId: string; evidenceId: string | null; reason: string; status: string; createdAt: string; releasedAt: string | null };

export default function EmergencyLegalHoldPanel({ canVerify }: { canVerify: boolean }) {
  const { t } = useScopedTranslation("emergency");
  const [items, setItems] = useState<Hold[]>([]);
  const [caseId, setCaseId] = useState("");
  const [evidenceId, setEvidenceId] = useState("");
  const [reason, setReason] = useState("");
  const [releaseReasons, setReleaseReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch(getSpec260ApiPath("operations.privacy.holds"), { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("LEGAL_HOLD_LIST_UNAVAILABLE");
    const payload = await response.json() as { items?: Hold[] };
    setItems(payload.items ?? []);
  }, []);
  useEffect(() => { void refresh().catch(() => setError(t("privacy.unavailable"))); }, [refresh, t]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    try {
      const response = await fetch(getSpec260ApiPath("operations.privacy.hold.create"), { method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ caseId, ...(evidenceId.trim() ? { evidenceId: evidenceId.trim() } : {}), reason }) });
      if (!response.ok) throw new Error("LEGAL_HOLD_CREATE_FAILED");
      setCaseId(""); setEvidenceId(""); setReason(""); await refresh();
    } catch { setError(t("privacy.unavailable")); }
  };

  const release = async (hold: Hold) => {
    setError("");
    try {
      const response = await fetch(getSpec260ApiPath("operations.privacy.hold.release", { holdId: hold.id }), { method: "PATCH", credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ reason: releaseReasons[hold.id]?.trim() }) });
      if (!response.ok) throw new Error("LEGAL_HOLD_RELEASE_FAILED");
      await refresh();
    } catch { setError(t("privacy.unavailable")); }
  };

  return <VStack gap={4}>
    <Text>{t("privacy.notice")}</Text>
    {error && <Text role="alert">{error}</Text>}
    {canVerify && <Card><form onSubmit={submit}><VStack gap={2}>
      <Heading level={2}>{t("privacy.createTitle")}</Heading>
      <label>{t("privacy.caseId")}<input required value={caseId} onChange={event => setCaseId(event.target.value)} /></label>
      <label>{t("privacy.evidenceId")}<input value={evidenceId} onChange={event => setEvidenceId(event.target.value)} /></label>
      <label>{t("privacy.reason")}<textarea required minLength={8} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <Button type="submit" label={t("privacy.create")} />
    </VStack></form></Card>}
    {!canVerify && <Text>{t("privacy.verificationRequired")}</Text>}
    <Heading level={2}>{t("privacy.holds")}</Heading>
    {items.map(hold => <Card key={hold.id}><VStack gap={1}>
      <Text>{hold.status} · {hold.caseId}{hold.evidenceId ? ` · ${hold.evidenceId}` : ""}</Text>
      <Text>{hold.reason} · {hold.createdAt}</Text>
      {canVerify && hold.status === "active" && <>
        <label>{t("privacy.releaseReason")}<textarea minLength={8} maxLength={1000} value={releaseReasons[hold.id] ?? ""}
          onChange={event => setReleaseReasons(current => ({ ...current, [hold.id]: event.target.value }))} /></label>
        <Button type="button" variant="secondary" isDisabled={(releaseReasons[hold.id] ?? "").trim().length < 8}
          label={t("privacy.release")} clickAction={() => void release(hold)} />
      </>}
    </VStack></Card>)}
  </VStack>;
}
