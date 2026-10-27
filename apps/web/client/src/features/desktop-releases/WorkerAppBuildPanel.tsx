import { useCallback, useEffect, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type WorkerBuild = {
  id: string;
  version: string;
  status: "queued" | "building" | "syncing" | "published" | "failed";
  runUrl: string | null;
  error: string | null;
};

export function WorkerAppBuildPanel() {
  const { t } = useScopedTranslation(["dashboard"]);
  const [build, setBuild] = useState<WorkerBuild | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/desktop-releases/worker-app/builds", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("history_unavailable");
    const payload = await response.json();
    setBuild(
      Array.isArray(payload.builds) ? (payload.builds[0] ?? null) : null
    );
  }, []);
  useEffect(() => {
    let mounted = true;
    const update = () =>
      void refresh().catch(() => {
        if (mounted) setError(true);
      });
    update();
    const timer = window.setInterval(update, 8000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [refresh]);
  const start = async () => {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/desktop-releases/worker-app/builds", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("build_failed");
      setBuild((await response.json()).build);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const retry = async () => {
    if (!build) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/desktop-releases/worker-app/builds/${encodeURIComponent(build.id)}/sync`,
        { method: "POST", credentials: "include" }
      );
      if (!response.ok) throw new Error("sync_failed");
      setBuild((await response.json()).build);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const active =
    build && ["queued", "building", "syncing"].includes(build.status);
  return (
    <Section>
      <VStack gap={3}>
        <Heading level={2}>{t("dashboard:workerBuild.title")}</Heading>
        <Text type="supporting">{t("dashboard:workerBuild.description")}</Text>
        <Button
          label={t("dashboard:workerBuild.start")}
          variant="primary"
          isLoading={busy}
          isDisabled={Boolean(active)}
          onClick={() => void start()}
        />
        {build && (
          <Text type="body">
            {t("dashboard:workerBuild.version", { version: build.version })} ·{" "}
            {t(`dashboard:workerBuild.status.${build.status}`)}
          </Text>
        )}
        {build?.runUrl && (
          <Link href={build.runUrl} isExternalLink>
            {t("dashboard:workerBuild.details")}
          </Link>
        )}
        {build?.status === "failed" && (
          <Text type="supporting">
            {t("dashboard:workerBuild.failedHint")} {build.error}
          </Text>
        )}
        {build?.status === "failed" && (
          <Button
            label={t("dashboard:workerBuild.retry")}
            isDisabled={busy}
            onClick={() => void retry()}
          />
        )}
        {error && (
          <Text type="supporting">
            {t("dashboard:workerBuild.requestFailed")}
          </Text>
        )}
      </VStack>
    </Section>
  );
}
