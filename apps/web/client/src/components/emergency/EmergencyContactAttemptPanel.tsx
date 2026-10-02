import { useState, type FormEvent } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import { getSpec260ApiPath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

export default function EmergencyContactAttemptPanel({ caseId }: { caseId: string }) {
  const { t } = useScopedTranslation("emergency");
  const [channel, setChannel] = useState("voice");
  const [outcome, setOutcome] = useState("no_answer");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reason.trim().length < 8) return;
    setState("saving");
    try {
      const response = await fetch(getSpec260ApiPath("operations.command.contact-attempt", { caseId }), {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ channel, outcome, reason: reason.trim() }),
      });
      if (!response.ok) throw new Error("CONTACT_ATTEMPT_FAILED");
      setReason(""); setState("saved");
    } catch { setState("failed"); }
  };

  return <Card><form onSubmit={submit}><VStack gap={2}>
    <Heading level={2}>{t("contactAttempt.title")}</Heading>
    <label>{t("contactAttempt.channel")}<select value={channel} onChange={event => setChannel(event.target.value)}>
      {["voice", "sms", "in_app", "email", "in_person"].map(value => <option key={value} value={value}>{t(`contactAttempt.channels.${value}`)}</option>)}
    </select></label>
    <label>{t("contactAttempt.outcome")}<select value={outcome} onChange={event => setOutcome(event.target.value)}>
      {["no_answer", "reached", "unsafe", "invalid_contact"].map(value => <option key={value} value={value}>{t(`contactAttempt.outcomes.${value}`)}</option>)}
    </select></label>
    <TextArea label={t("contactAttempt.reason")} minLength={8} maxLength={500} isRequired value={reason} onChange={setReason} />
    <Button type="submit" isDisabled={state === "saving" || reason.trim().length < 8} label={t(state === "saving" ? "contactAttempt.saving" : "contactAttempt.submit")} />
    {state === "saved" && <Text>{t("contactAttempt.saved")}</Text>}
    {state === "failed" && <Text role="alert">{t("contactAttempt.failed")}</Text>}
  </VStack></form></Card>;
}
