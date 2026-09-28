import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { useScopedTranslation } from "../../i18n/useScopedTranslation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export function AdminInferenceRolloutPanel() {
  const { t } = useScopedTranslation("admin");
  const [activationNotice, setActivationNotice] = useState<{
    bundleHash: string;
    reason: string;
    ok: boolean;
  } | null>(null);
  const utils = trpc.useUtils();
  const statusQuery =
    trpc.llmProviders.getInferenceRolloutBundleStatus.useQuery();
  const capabilityQuery =
    trpc.llmProviders.getInferenceCapabilityRecheckStatus.useQuery();
  const status = statusQuery.data;
  const capability = capabilityQuery.data;
  const activateMutation =
    trpc.llmProviders.activateInferenceRolloutBundle.useMutation({
      onSuccess: async (result, input) => {
        if (result.ok) {
          setActivationNotice({
            bundleHash: input.bundleHash,
            reason: "activated",
            ok: true,
          });
          await utils.llmProviders.getInferenceRolloutBundleStatus.invalidate();
          return;
        }
        setActivationNotice({
          bundleHash: input.bundleHash,
          reason: result.reason,
          ok: false,
        });
      },
      onError: (_error, input) => {
        setActivationNotice({
          bundleHash: input.bundleHash,
          reason: "failed",
          ok: false,
        });
      },
    });

  return (
    <section aria-labelledby="inference-rollout-title" className="mb-6">
      <Card>
        <CardHeader>
          <CardTitle id="inference-rollout-title">
            {t("admin.llmProviders.rollout.title")}
          </CardTitle>
          <CardDescription>
            {t("admin.llmProviders.rollout.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section
            className="rounded-lg border p-4"
            aria-label={t("admin.llmProviders.rollout.capability.title")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">
                {t("admin.llmProviders.rollout.capability.title")}
              </h3>
              {capabilityQuery.isLoading ? (
                <Badge variant="secondary">
                  {t("admin.llmProviders.rollout.capability.loading")}
                </Badge>
              ) : capabilityQuery.isError || !capability ? (
                <Badge variant="destructive">
                  {t("admin.llmProviders.rollout.capability.unavailable")}
                </Badge>
              ) : (
                <Badge variant={capability.ready ? "default" : "destructive"}>
                  {t(
                    `admin.llmProviders.rollout.capability.${capability.ready ? "ready" : "blocked"}`
                  )}
                </Badge>
              )}
            </div>
            {capability && !capabilityQuery.isError ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("admin.llmProviders.rollout.capability.profiles", {
                    count: capability.eligibleProfileCount,
                  })}
                  {capability.registryRevision
                    ? ` · ${capability.registryRevision}`
                    : ""}
                </p>
                {capability.reference ? (
                  <p
                    className="mt-1 break-all font-mono text-xs text-muted-foreground"
                    aria-label={t(
                      "admin.llmProviders.rollout.capability.reference"
                    )}
                  >
                    {capability.reference}
                  </p>
                ) : null}
                {!capability.ready && capability.reason ? (
                  <p className="mt-1 text-sm text-destructive">
                    {t(
                      `admin.llmProviders.rollout.capability.reason.${capability.reason}`
                    )}
                  </p>
                ) : null}
              </>
            ) : null}
          </section>

          {statusQuery.isLoading ? (
            <p role="status">{t("admin.llmProviders.rollout.loading")}</p>
          ) : statusQuery.isError ? (
            <p role="alert" className="text-destructive">
              {t("admin.llmProviders.rollout.loadFailed")}
            </p>
          ) : status ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {t("admin.llmProviders.rollout.signingKeyring")}
                </span>
                <Badge
                  variant={
                    status.keyringStatus === "ready" ? "default" : "destructive"
                  }
                >
                  {t(
                    `admin.llmProviders.rollout.keyring.${status.keyringStatus}`
                  )}
                </Badge>
              </div>

              {status.activeBundle ? (
                <article
                  className="rounded-lg border p-4"
                  aria-label={t("admin.llmProviders.rollout.activeBundle")}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">
                      {status.activeBundle.bundleId}
                    </h3>
                    <Badge>{t("admin.llmProviders.rollout.active")}</Badge>
                    <Badge
                      variant={
                        status.activeBundle.signatureStatus === "valid"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {t(
                        `admin.llmProviders.rollout.signature.${status.activeBundle.signatureStatus}`
                      )}
                    </Badge>
                  </div>
                  <p className="mt-2 break-all text-sm text-muted-foreground">
                    {status.activeBundle.bundleHash}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("admin.llmProviders.rollout.sequence", {
                      sequence: status.activeBundle.sequence,
                    })}
                    {" · "}
                    {formatTime(status.activeBundle.createdAt)}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">
                        {t("admin.llmProviders.rollout.policyRevision")}
                      </dt>
                      <dd className="break-all">
                        {status.activeBundle.payload?.routerPolicyRevision ??
                          "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        {t("admin.llmProviders.rollout.registryRevision")}
                      </dt>
                      <dd className="break-all">
                        {status.activeBundle.payload
                          ?.logicalModelRegistryRevision ?? "—"}
                      </dd>
                    </div>
                  </dl>
                </article>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {t("admin.llmProviders.rollout.noActiveBundle")}
                </p>
              )}

              <div>
                <h3 className="mb-2 font-medium">
                  {t("admin.llmProviders.rollout.recent")}
                </h3>
                {status.recentBundles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.llmProviders.rollout.noBundles")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {status.recentBundles.map(bundle => (
                      <li
                        key={bundle.bundleHash}
                        className="flex flex-col gap-1 rounded-md bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {bundle.bundleId}
                          </span>
                          <span className="block break-all text-xs text-muted-foreground">
                            {bundle.bundleHash}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
                          {bundle.active ? (
                            <Badge>
                              {t("admin.llmProviders.rollout.active")}
                            </Badge>
                          ) : null}
                          <Badge
                            variant={
                              bundle.signatureStatus === "valid"
                                ? "secondary"
                                : "destructive"
                            }
                          >
                            {t(
                              `admin.llmProviders.rollout.signature.${bundle.signatureStatus}`
                            )}
                          </Badge>
                          <span className="text-muted-foreground">
                            {formatTime(bundle.createdAt)}
                          </span>
                          {!bundle.active &&
                          bundle.signatureStatus === "valid" &&
                          status.keyringStatus === "ready" &&
                          capability?.ready ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={activateMutation.isPending}
                              onClick={() => {
                                setActivationNotice(null);
                                activateMutation.mutate({
                                  bundleHash: bundle.bundleHash,
                                });
                              }}
                            >
                              {t(
                                `admin.llmProviders.rollout.activate.${activateMutation.isPending ? "pending" : "action"}`
                              )}
                            </Button>
                          ) : null}
                        </span>
                        {activationNotice?.bundleHash === bundle.bundleHash ? (
                          <p
                            role={activationNotice.ok ? "status" : "alert"}
                            className={
                              activationNotice.ok
                                ? "text-sm text-emerald-700 dark:text-emerald-300"
                                : "text-sm text-destructive"
                            }
                          >
                            {t(
                              `admin.llmProviders.rollout.activate.${activationNotice.ok ? "activated" : `reason.${activationNotice.reason}`}`
                            )}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {t("admin.llmProviders.rollout.activationGate")}
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
