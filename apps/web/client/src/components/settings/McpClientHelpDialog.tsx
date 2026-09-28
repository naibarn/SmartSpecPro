import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { buildMcpClientOnboardingDescriptor } from "@/lib/mcpClientOnboarding";
import { toast } from "sonner";

type McpClientHelpDialogProps = {
  endpoint: string;
  guideUrl: string;
};

function CommandBlock({
  commands,
  copyLabel,
  copiedLabel,
}: {
  commands: readonly string[];
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCommands() {
    try {
      await navigator.clipboard.writeText(commands.join("\n"));
      setCopied(true);
      toast.success(copiedLabel);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the commands");
    }
  }

  return (
    <div className="relative mt-3 rounded-lg bg-slate-950 p-3 text-slate-100">
      <pre className="overflow-x-auto whitespace-pre-wrap break-words pr-24 text-xs leading-5">
        {commands.join("\n")}
      </pre>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="absolute right-2 top-2 h-7 text-xs"
        onClick={copyCommands}
      >
        {copied ? (
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Copy className="mr-1.5 h-3.5 w-3.5" />
        )}
        {copied ? copiedLabel : copyLabel}
      </Button>
    </div>
  );
}

function PermissionFlow({ t }: { t: (key: string) => string }) {
  return (
    <section className="rounded-lg border border-sky-100 bg-sky-50/70 p-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
        <div>
          <h3 className="text-sm font-semibold text-sky-950">
            {t("connectedDevices.helpPermissionsTitle")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-sky-900">
            {t("connectedDevices.helpPermissionsDescription")}
          </p>
        </div>
      </div>
      <ol className="mt-2 space-y-1 text-xs leading-5 text-sky-900">
        {[1, 2, 3, 4].map(step => (
          <li key={step}>
            <span className="mr-1 font-semibold">{step}.</span>
            {t(`connectedDevices.helpPermissionStep${step}`)}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs leading-5 text-sky-900">
        {t("connectedDevices.helpPermissionScopeExamples")}
      </p>
    </section>
  );
}

export function McpClientHelpDialog({
  endpoint,
  guideUrl,
}: McpClientHelpDialogProps) {
  const { t } = useScopedTranslation("settings");
  const descriptors = useMemo(
    () => ({
      hermesCli: buildMcpClientOnboardingDescriptor("hermes-cli", endpoint),
      openclaw: buildMcpClientOnboardingDescriptor("openclaw", endpoint),
      claude: buildMcpClientOnboardingDescriptor("claude", endpoint),
      codex: buildMcpClientOnboardingDescriptor("codex", endpoint),
    }),
    [endpoint]
  );

  const browserlessClaudeCommand = `claude mcp add --transport http smartaihub ${endpoint} --header "Authorization: Bearer $SMARTAIHUB_MCP_KEY"`;
  const browserlessCodexCommand = `codex mcp add smartaihub --url ${endpoint} --bearer-token-env-var SMARTAIHUB_MCP_KEY`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-sky-200 text-sky-700 hover:bg-sky-50"
          aria-label={t("connectedDevices.helpButton")}
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          {t("connectedDevices.helpButton")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("connectedDevices.helpTitle")}</DialogTitle>
          <DialogDescription>
            {t("connectedDevices.helpDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-800">
            {t("connectedDevices.helpEndpoint")}
          </div>
          <code className="mt-1 block break-all text-xs text-slate-700">
            {endpoint}
          </code>
          <a
            className="mt-2 inline-flex items-center text-xs font-medium text-sky-700 hover:underline"
            href={guideUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("connectedDevices.helpOpenGuide")}
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </div>

        <PermissionFlow t={t} />

        <Tabs defaultValue="hermes-cli" className="mt-1">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-5">
            <TabsTrigger value="hermes-cli">Hermes Agent / CLI</TabsTrigger>
            <TabsTrigger value="openclaw">OpenClaw</TabsTrigger>
            <TabsTrigger value="hermes-one">Hermes One</TabsTrigger>
            <TabsTrigger value="claude">Claude Code</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
          </TabsList>

          <TabsContent value="hermes-cli" className="mt-4 space-y-3">
            <div>
              <h3 className="font-semibold text-slate-950">
                {t("connectedDevices.helpHermesCliTitle")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("connectedDevices.helpHermesCliDescription")}
              </p>
              <CommandBlock
                commands={[
                  ...descriptors.hermesCli.instructions,
                  "hermes mcp list",
                ]}
                copyLabel={t("connectedDevices.helpCopyCommands")}
                copiedLabel={t("connectedDevices.helpCopied")}
              />
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-700">
              <div className="font-semibold text-slate-900">
                {t("connectedDevices.helpVerifyTitle")}
              </div>
              <p className="mt-1">{t("connectedDevices.helpHermesVerify")}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {t("connectedDevices.helpNoBrowserTitle")}
              </h4>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {t("connectedDevices.helpNoBrowserDescription")}
              </p>
              <CommandBlock
                commands={[
                  `hermes mcp add smartaihub --url ${endpoint} --auth header`,
                ]}
                copyLabel={t("connectedDevices.helpCopyCommands")}
                copiedLabel={t("connectedDevices.helpCopied")}
              />
            </div>
          </TabsContent>

          <TabsContent value="openclaw" className="mt-4 space-y-3">
            <div>
              <h3 className="font-semibold text-slate-950">
                {t("connectedDevices.helpOpenClawTitle")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("connectedDevices.helpOpenClawDescription")}
              </p>
              <CommandBlock
                commands={[
                  ...descriptors.openclaw.instructions,
                  "openclaw mcp list",
                ]}
                copyLabel={t("connectedDevices.helpCopyCommands")}
                copiedLabel={t("connectedDevices.helpCopied")}
              />
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-700">
              <div className="font-semibold text-slate-900">
                {t("connectedDevices.helpVerifyTitle")}
              </div>
              <p className="mt-1">{t("connectedDevices.helpOpenClawVerify")}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {t("connectedDevices.helpOpenClawDeviceTitle")}
              </h4>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {t("connectedDevices.helpOpenClawDeviceDescription")}
              </p>
              <CommandBlock
                commands={[
                  `openclaw mcp login smartaihub --device-code`,
                ]}
                copyLabel={t("connectedDevices.helpCopyCommands")}
                copiedLabel={t("connectedDevices.helpCopied")}
              />
            </div>
          </TabsContent>

          <TabsContent value="hermes-one" className="mt-4 space-y-3">
            <div>
              <h3 className="font-semibold text-slate-950">
                {t("connectedDevices.helpHermesOneTitle")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("connectedDevices.helpHermesOneDescription")}
              </p>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                {[1, 2, 3, 4].map(step => (
                  <li key={step}>
                    <span className="mr-2 font-semibold text-violet-700">
                      {step}.
                    </span>
                    {t(`connectedDevices.helpHermesOneStep${step}`)}
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {t("connectedDevices.helpExecutorNote")}
            </div>
          </TabsContent>

          <TabsContent value="claude" className="mt-4 space-y-3">
            <div>
              <h3 className="font-semibold text-slate-950">
                {t("connectedDevices.helpClaudeTitle")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("connectedDevices.helpClaudeDescription")}
              </p>
              <CommandBlock
                commands={[...descriptors.claude.instructions, "> /mcp"]}
                copyLabel={t("connectedDevices.helpCopyCommands")}
                copiedLabel={t("connectedDevices.helpCopied")}
              />
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {t("connectedDevices.helpClaudeDesktopNote")}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {t("connectedDevices.helpNoBrowserTitle")}
              </h4>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {t("connectedDevices.helpNoBrowserDescription")}
              </p>
              <CommandBlock
                commands={[browserlessClaudeCommand]}
                copyLabel={t("connectedDevices.helpCopyCommands")}
                copiedLabel={t("connectedDevices.helpCopied")}
              />
            </div>
          </TabsContent>

          <TabsContent value="codex" className="mt-4 space-y-3">
            <div>
              <h3 className="font-semibold text-slate-950">
                {t("connectedDevices.helpCodexTitle")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("connectedDevices.helpCodexDescription")}
              </p>
              <CommandBlock
                commands={descriptors.codex.instructions}
                copyLabel={t("connectedDevices.helpCopyCommands")}
                copiedLabel={t("connectedDevices.helpCopied")}
              />
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-700">
              <div className="font-semibold text-slate-900">
                {t("connectedDevices.helpVerifyTitle")}
              </div>
              <p className="mt-1">{t("connectedDevices.helpCodexVerify")}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">
                {t("connectedDevices.helpNoBrowserTitle")}
              </h4>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {t("connectedDevices.helpNoBrowserDescription")}
              </p>
              <CommandBlock
                commands={[browserlessCodexCommand]}
                copyLabel={t("connectedDevices.helpCopyCommands")}
                copiedLabel={t("connectedDevices.helpCopied")}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p>{t("connectedDevices.helpAfterConnect")}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
