import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { getSpec260ApiPath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type Source = { id: string; sourceRef: string; displayName: string; status: string };
type Claim = { id: string; claimRef: string; claimText: string; status: string; revision: number; independenceGroupCount: number;
  evidence?: Array<{ excerpt: string; sourceItemRef: string; sourceName: string; independenceGroup: string; contentHash: string }> };

export default function EmergencyIntelWorkbench() {
  const { t } = useScopedTranslation("emergency");
  const [sources, setSources] = useState<Source[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [sourceRef, setSourceRef] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [independenceGroup, setIndependenceGroup] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sourceItemRef, setSourceItemRef] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [claimText, setClaimText] = useState("");
  const [publicSummary, setPublicSummary] = useState("");
  const [correctionOfClaimId, setCorrectionOfClaimId] = useState("");
  const [selectedCaptureIds, setSelectedCaptureIds] = useState<string[]>([]);
  const [captures, setCaptures] = useState<Array<{ id: string; sourceId: string }>>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [sourceResponse, claimResponse, captureResponse] = await Promise.all([
      fetch(getSpec260ApiPath("operations.intel.sources"), { credentials: "include", cache: "no-store" }),
      fetch(getSpec260ApiPath("operations.intel.claims"), { credentials: "include", cache: "no-store" }),
      fetch(getSpec260ApiPath("operations.intel.captures"), { credentials: "include", cache: "no-store" }),
    ]);
    if (!sourceResponse.ok || !claimResponse.ok || !captureResponse.ok) throw new Error("INTELLIGENCE_WORKSPACE_UNAVAILABLE");
    const [sourcePayload, claimPayload, capturePayload] = await Promise.all([sourceResponse.json(), claimResponse.json(), captureResponse.json()]) as [
      { items?: Source[] }, { items?: Claim[] }, { items?: Array<{ id: string; sourceId: string }> },
    ];
    setSources(sourcePayload.items ?? []);
    setClaims(claimPayload.items ?? []);
    setCaptures(capturePayload.items ?? []);
  }, []);

  useEffect(() => { void refresh().catch(() => setError(t("intelligence.unavailable"))); }, [refresh, t]);

  const post = async (routeId: string, method: string, body: Record<string, unknown>, routeParams?: Record<string, string>) => {
    const response = await fetch(getSpec260ApiPath(routeId, routeParams), { method, credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("INTELLIGENCE_WRITE_FAILED");
  };

  const createSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    try {
      await post("operations.intel.source.create", "POST", { sourceRef, displayName: sourceName,
        sourceType: "manual", independenceGroup, jurisdictionRef: jurisdiction });
      setSourceRef(""); setSourceName(""); await refresh();
    } catch { setError(t("intelligence.unavailable")); }
  };

  const activateSource = async (source: Source) => {
    setError("");
    try {
      await post("operations.intel.source.review", "PATCH", { status: "active", reason: "Operator verified the registered manual source" }, { sourceId: source.id });
      await refresh();
    } catch { setError(t("intelligence.unavailable")); }
  };

  const recordCapture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    try {
      const response = await fetch(getSpec260ApiPath("operations.intel.capture.create"), { method: "POST", credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ sourceId, sourceItemRef, excerpt }) });
      if (!response.ok) throw new Error("CAPTURE_FAILED");
      const payload = await response.json() as { captureId: string };
      setCaptures(current => [{ id: payload.captureId, sourceId }, ...current]);
      setSourceItemRef(""); setExcerpt("");
    } catch { setError(t("intelligence.unavailable")); }
  };

  const createClaim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    try {
      await post("operations.intel.claim.create", "POST", { claimText, captureIds: selectedCaptureIds,
        ...(correctionOfClaimId ? { correctionOfClaimId } : {}) });
      setClaimText(""); setSelectedCaptureIds([]); setCorrectionOfClaimId(""); await refresh();
    } catch { setError(t("intelligence.unavailable")); }
  };

  const reviewClaim = async (claim: Claim, status: "under_review" | "verified" | "disputed" | "retracted") => {
    setError("");
    try {
      await post("operations.intel.claim.review", "PATCH", { expectedRevision: claim.revision, status,
        reason: `Operator reviewed source-backed claim as ${status}`,
        ...(status === "verified" ? { publicSummary: publicSummary.trim() || claim.claimText.slice(0, 500) } : {}) }, { claimId: claim.id });
      await refresh();
    } catch { setError(t("intelligence.unavailable")); }
  };

  return <VStack gap={4}>
    <Text>{t("intelligence.manualOnlyNotice")}</Text>
    {error && <Text role="alert">{error}</Text>}
    <Card><form onSubmit={createSource}><VStack gap={2}>
      <Heading level={2}>{t("intelligence.registerSource")}</Heading>
      <label>{t("intelligence.sourceRef")}<input required maxLength={160} value={sourceRef} onChange={event => setSourceRef(event.target.value)} /></label>
      <label>{t("intelligence.sourceName")}<input required maxLength={200} value={sourceName} onChange={event => setSourceName(event.target.value)} /></label>
      <label>{t("intelligence.jurisdiction")}<input required maxLength={160} value={jurisdiction} onChange={event => setJurisdiction(event.target.value)} /></label>
      <label>{t("intelligence.independenceGroup")}<input required maxLength={160} value={independenceGroup} onChange={event => setIndependenceGroup(event.target.value)} /></label>
      <Button type="submit" label={t("intelligence.register")} />
      {sources.map(source => <Text key={source.id}>{source.displayName} · {source.status}{source.status === "pending_review" && <Button type="button" variant="secondary" label={t("intelligence.activateSource")} clickAction={() => void activateSource(source)} />}</Text>)}
    </VStack></form></Card>
    <Card><form onSubmit={recordCapture}><VStack gap={2}>
      <Heading level={2}>{t("intelligence.recordCapture")}</Heading>
      <label>{t("intelligence.source")}<select required value={sourceId} onChange={event => setSourceId(event.target.value)}>
        <option value="">—</option>{sources.filter(source => source.status === "active").map(source => <option key={source.id} value={source.id}>{source.displayName}</option>)}
      </select></label>
      <label>{t("intelligence.sourceItemRef")}<input required maxLength={512} value={sourceItemRef} onChange={event => setSourceItemRef(event.target.value)} /></label>
      <TextArea label={t("intelligence.excerpt")} isRequired maxLength={10000} value={excerpt} onChange={setExcerpt} />
      <Button type="submit" isDisabled={!sourceId} label={t("intelligence.saveCapture")} />
      {captures.map(capture => <label key={capture.id}><input type="checkbox" checked={selectedCaptureIds.includes(capture.id)} onChange={event => setSelectedCaptureIds(current => event.target.checked ? [...current, capture.id] : current.filter(id => id !== capture.id))} />{capture.id}</label>)}
    </VStack></form></Card>
    <Card><form onSubmit={createClaim}><VStack gap={2}>
      <Heading level={2}>{t("intelligence.createClaim")}</Heading>
      <TextArea label={t("intelligence.claimText")} isRequired maxLength={1200} value={claimText} onChange={setClaimText} />
      <label>{t("intelligence.correctionOf")}<select value={correctionOfClaimId} onChange={event => setCorrectionOfClaimId(event.target.value)}>
        <option value="">{t("intelligence.newClaim")}</option>{claims.filter(claim => ["verified", "disputed"].includes(claim.status)).map(claim => <option key={claim.id} value={claim.id}>{claim.claimRef} · {claim.status}</option>)}
      </select></label>
      <Button type="submit" isDisabled={selectedCaptureIds.length === 0} label={t("intelligence.submitClaim")} />
    </VStack></form></Card>
    <Card><VStack gap={2}>
      <Heading level={2}>{t("intelligence.reviewQueue")}</Heading>
      <TextArea label={t("intelligence.publicSummary")} maxLength={500} value={publicSummary} onChange={setPublicSummary} />
      {claims.map(claim => <Card key={claim.id}><VStack gap={1}>
        <Text>{claim.claimRef} · {claim.status} · {claim.independenceGroupCount} {t("intelligence.independentGroups")}</Text><Text>{claim.claimText}</Text>
        {claim.evidence?.map((item, index) => <Card key={`${item.contentHash}-${index}`}><VStack gap={1}>
          <Text>{item.sourceName} · {item.independenceGroup} · {item.sourceItemRef}</Text><Text>{item.excerpt}</Text>
        </VStack></Card>)}
        {claim.status === "unreviewed" && <Button type="button" label={t("intelligence.startReview")} clickAction={() => void reviewClaim(claim, "under_review")} />}
        {(claim.status === "under_review" || claim.status === "disputed") && <Button type="button" label={t("intelligence.verify")} isDisabled={claim.independenceGroupCount < 2} clickAction={() => void reviewClaim(claim, "verified")} />}
        {["unreviewed", "under_review", "verified"].includes(claim.status) && <Button type="button" variant="secondary" label={t("intelligence.dispute")} clickAction={() => void reviewClaim(claim, "disputed")} />}
        {["under_review", "verified", "disputed"].includes(claim.status) && <Button type="button" variant="secondary" label={t("intelligence.retract")} clickAction={() => void reviewClaim(claim, "retracted")} />}
      </VStack></Card>)}
    </VStack></Card>
  </VStack>;
}
