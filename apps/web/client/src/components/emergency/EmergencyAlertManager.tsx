import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { getSpec260ApiPath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type Alert = { id: string; publicRef: string; status: string; severity: string; title: string; message: string; expiresAt: string | null };

export default function EmergencyAlertManager({ canVerify }: { canVerify: boolean }) {
  const { t } = useScopedTranslation("emergency");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [geometry, setGeometry] = useState("");
  const [severity, setSeverity] = useState("unknown");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "unavailable">("loading");
  const createIdempotencyKey = useRef(crypto.randomUUID());
  const cancelIdempotencyKeys = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    const response = await fetch(getSpec260ApiPath("operations.command.alerts"), { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("ALERTS_UNAVAILABLE");
    const payload = await response.json() as { items?: Alert[] };
    setAlerts(payload.items ?? []);
    setState("ready");
  }, []);
  useEffect(() => { void refresh().catch(() => setState("unavailable")); }, [refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setState("saving");
    try {
      let publicGeometry: unknown;
      if (geometry.trim()) publicGeometry = JSON.parse(geometry);
      const response = await fetch(getSpec260ApiPath("operations.command.alert.create"), {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": createIdempotencyKey.current },
        body: JSON.stringify({ title, message, severity, status, ...(publicGeometry === undefined ? {} : { publicGeometry }) }),
      });
      if (!response.ok) throw new Error("ALERT_CREATE_FAILED");
      setTitle(""); setMessage(""); setGeometry(""); setStatus("draft");
      createIdempotencyKey.current = crypto.randomUUID();
      await refresh();
    } catch { setState("unavailable"); }
  };

  const cancel = async (alert: Alert) => {
    setState("saving");
    const idempotencyKey = cancelIdempotencyKeys.current.get(alert.id) ?? crypto.randomUUID();
    cancelIdempotencyKeys.current.set(alert.id, idempotencyKey);
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.alert.update", { alertId: alert.id }), {
        method: "PATCH", credentials: "include", cache: "no-store",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ expectedStatus: alert.status, status: "cancelled", reason: "Operator cancelled an emergency public alert" }),
      });
      if (!response.ok) throw new Error("ALERT_CANCEL_FAILED");
      cancelIdempotencyKeys.current.delete(alert.id);
      await refresh();
    } catch { setState("unavailable"); }
  };

  return <VStack gap={4}>
    <Card><form onSubmit={submit}><VStack gap={3}>
      <Heading level={2}>{t("alertManagement.title")}</Heading>
      {state === "loading" && <Text>{t("state.loading")}</Text>}
      {state === "unavailable" && <Text role="alert">{t("alertManagement.unavailable")}</Text>}
      <label>{t("alertManagement.headline")}<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <TextArea label={t("alertManagement.message")} isRequired maxLength={4000} value={message} onChange={setMessage} />
      <label>{t("alertManagement.severity")}<select value={severity} onChange={event => setSeverity(event.target.value)}>
        {["unknown", "low", "moderate", "high", "critical"].map(value => <option key={value} value={value}>{t(`command.severityValues.${value}`)}</option>)}
      </select></label>
      <label>{t("alertManagement.publication")}<select value={status} onChange={event => setStatus(event.target.value as "draft" | "published")}>
        <option value="draft">{t("alertManagement.draft")}</option>
        <option value="published" disabled={!canVerify}>{t("alertManagement.publish")}</option>
      </select></label>
      <Text>{t("alertManagement.geometryNotice")}</Text>
      <TextArea label={t("alertManagement.geometry")} value={geometry} onChange={setGeometry} maxLength={16000} />
      <Button type="submit" isDisabled={state === "saving" || (status === "published" && !canVerify)}
        label={state === "saving" ? t("alertManagement.saving") : t("alertManagement.create")} />
    </VStack></form></Card>
    <Card><VStack gap={2}><Heading level={2}>{t("alertManagement.existing")}</Heading>
      {alerts.map(alert => <Card key={alert.id}><VStack gap={1}>
        <Text>{alert.title} · {alert.severity} · {alert.status} · {alert.publicRef}</Text>
        {(alert.status === "published" || alert.status === "updated") && <Button type="button" variant="secondary" isDisabled={state === "saving"}
          label={t("alertManagement.cancel")} onClick={() => void cancel(alert)} />}
      </VStack></Card>)}
      {alerts.length === 0 && state === "ready" && <Text>{t("alertManagement.empty")}</Text>}
    </VStack></Card>
  </VStack>;
}
