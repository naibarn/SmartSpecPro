import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getSpec260ApiPath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type Partner = { id: string; partnerRef: string; displayName: string; status: string; trustLevel: string; jurisdictionRefs: string[] };
type Share = { id: string; partnerId: string; partnerName: string; resourceType: string; resourceRef: string; state: string; expiresAt: string; revokedAt: string | null };
type CaseOption = { id: string; status: string; hazardCategory: string; jurisdictionRef: string };

export default function EmergencyFederationPanel({ canVerify }: { canVerify: boolean }) {
  const { t } = useScopedTranslation("emergency");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [partnerRef, setPartnerRef] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [jurisdictionRefs, setJurisdictionRefs] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [resourceRef, setResourceRef] = useState("");
  const [jurisdictionRef, setJurisdictionRef] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [partnerResponse, shareResponse, caseResponse] = await Promise.all([
      fetch(getSpec260ApiPath("operations.federation.partners"), { credentials: "include", cache: "no-store" }),
      fetch(getSpec260ApiPath("operations.federation.shares"), { credentials: "include", cache: "no-store" }),
      fetch(getSpec260ApiPath("operations.federation.case-options"), { credentials: "include", cache: "no-store" }),
    ]);
    if (!partnerResponse.ok || !shareResponse.ok || !caseResponse.ok) throw new Error("FEDERATION_UNAVAILABLE");
    const [partnerPayload, sharePayload, casePayload] = await Promise.all([partnerResponse.json(), shareResponse.json(), caseResponse.json()]) as [
      { items?: Partner[] }, { items?: Share[] }, { items?: CaseOption[] },
    ];
    setPartners(partnerPayload.items ?? []); setShares(sharePayload.items ?? []); setCases(casePayload.items ?? []);
  }, []);
  useEffect(() => { void refresh().catch(() => setError(t("federation.unavailable"))); }, [refresh, t]);

  const send = async (routeId: string, method: string, body: Record<string, unknown>, params?: Record<string, string>) => {
    const response = await fetch(getSpec260ApiPath(routeId, params), { method, credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? `HTTP_${response.status}`);
    }
  };
  const showError = (error: unknown) => setError(`${t("federation.unavailable")} (${error instanceof Error ? error.message : "UNKNOWN"})`);
  const createPartner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    try {
      await send("operations.federation.partner.create", "POST", { partnerRef, displayName, contractVersion: "spec260-federation-v1",
        jurisdictionRefs: jurisdictionRefs.split(",").map(value => value.trim()).filter(Boolean), capabilityRefs: [] });
      setPartnerRef(""); setDisplayName(""); await refresh();
    } catch (error) { showError(error); }
  };
  const reviewPartner = async (partner: Partner, status: "active" | "paused" | "revoked") => {
    setError("");
    try {
      await send("operations.federation.partner.update", "PATCH", { expectedStatus: partner.status, status,
        ...(status === "active" ? { trustLevel: "verified" } : {}), reason: `Operator reviewed partner and set ${status}` }, { partnerId: partner.id });
      await refresh();
    } catch (error) { showError(error); }
  };
  const createShare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    try {
      await send("operations.federation.share.create", "POST", { partnerId, resourceType: "case", resourceRef, jurisdictionRef,
        expiresAt: new Date(expiresAt).toISOString(), reason: "Operator approved a bounded, minimum-disclosure partner share" });
      setResourceRef(""); await refresh();
    } catch (error) { showError(error); }
  };
  const revokeShare = async (share: Share) => {
    setError("");
    try { await send("operations.federation.share.revoke", "DELETE", { reason: "Operator revoked the partner share" }, { shareId: share.id }); await refresh(); }
    catch (error) { showError(error); }
  };

  return <VStack gap={4}>
    <Text>{t("federation.boundary")}</Text>
    {error && <Text role="alert">{error}</Text>}
    <Card><form onSubmit={createPartner}><VStack gap={2}>
      <Heading level={2}>{t("federation.registerPartner")}</Heading>
      <label>{t("federation.partnerRef")}<input required maxLength={160} value={partnerRef} onChange={event => setPartnerRef(event.target.value)} /></label>
      <label>{t("federation.displayName")}<input required maxLength={200} value={displayName} onChange={event => setDisplayName(event.target.value)} /></label>
      <label>{t("federation.jurisdictions")}<input required value={jurisdictionRefs} onChange={event => setJurisdictionRefs(event.target.value)} /></label>
      <Button type="submit" label={t("federation.register")} />
      {partners.map(partner => <Text key={partner.id}>{partner.displayName} · {partner.status} · {partner.trustLevel} · {partner.jurisdictionRefs.join(", ")}
        {partner.status !== "active" && partner.status !== "revoked" && canVerify && <Button type="button" label={t("federation.activate")} clickAction={() => void reviewPartner(partner, "active")} />}
        {partner.status !== "active" && partner.status !== "revoked" && !canVerify && <Text>{t("federation.verificationRequired")}</Text>}
        {partner.status === "active" && <Button type="button" variant="secondary" label={t("federation.pause")} clickAction={() => void reviewPartner(partner, "paused")} />}
        {partner.status !== "revoked" && <Button type="button" variant="secondary" label={t("federation.revoke")} clickAction={() => void reviewPartner(partner, "revoked")} />}</Text>)}
    </VStack></form></Card>
    <Card><form onSubmit={createShare}><VStack gap={2}>
      <Heading level={2}>{t("federation.createShare")}</Heading>
      <label>{t("federation.partner")}<select required value={partnerId} onChange={event => setPartnerId(event.target.value)}><option value="">—</option>
        {partners.filter(partner => partner.status === "active" && partner.trustLevel !== "unverified").map(partner => <option key={partner.id} value={partner.id}>{partner.displayName}</option>)}</select></label>
      <label>{t("federation.resourceRef")}<select required value={resourceRef} onChange={event => {
        const selected = cases.find(row => row.id === event.target.value);
        setResourceRef(event.target.value); setJurisdictionRef(selected?.jurisdictionRef ?? "");
      }}><option value="">—</option>{cases.map(row => <option key={row.id} value={row.id}>{row.hazardCategory} · {row.status} · {row.id.slice(0, 8)}</option>)}</select></label>
      <label>{t("federation.jurisdiction")}<input required readOnly value={jurisdictionRef} /></label>
      <label>{t("federation.expiresAt")}<input required type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} /></label>
      <Button type="submit" isDisabled={!partnerId} label={t("federation.queueShare")} />
    </VStack></form></Card>
    <Card><VStack gap={2}><Heading level={2}>{t("federation.shares")}</Heading>
      {shares.map(share => <Card key={share.id}><VStack gap={1}><Text>{share.partnerName} · {share.resourceType} · {share.state} · {new Date(share.expiresAt).toLocaleString()}</Text>
        {share.state === "queued_not_delivered" && <Button type="button" variant="secondary" label={t("federation.revoke")} clickAction={() => void revokeShare(share)} />}</VStack></Card>)}
    </VStack></Card>
  </VStack>;
}
