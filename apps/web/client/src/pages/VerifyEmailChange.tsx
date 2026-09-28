import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2, MailWarning, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type State = "loading" | "success" | "error";

export default function VerifyEmailChange() {
  const { t } = useScopedTranslation("settings");
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState(
    t("settings.profile.emailChangeVerifying")
  );
  const confirmEmailChange = trpc.auth.confirmEmailChange.useMutation();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("error");
      setMessage(t("settings.profile.emailChangeMissing"));
      return;
    }

    // Remove the one-time credential from the visible URL/history after
    // extracting it. The server still validates the hashed token.
    window.history.replaceState({}, "", "/verify-email-change");

    void confirmEmailChange
      .mutateAsync({ token })
      .then(result => {
        setState("success");
        setMessage(
          t("settings.profile.emailChangeSuccess", { email: result.email })
        );
      })
      .catch(error => {
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : t("settings.profile.emailChangeInvalid")
        );
      });
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20 flex items-center justify-center px-4">
      <section className="w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 text-center shadow-xl backdrop-blur-xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 text-white">
          {state === "loading" && <Loader2 className="h-8 w-8 animate-spin" />}
          {state === "success" && <CheckCircle2 className="h-8 w-8" />}
          {state === "error" && <XCircle className="h-8 w-8" />}
        </div>
        <h1 className="mb-3 text-2xl font-bold text-gray-900">
          {state === "success"
            ? t("settings.profile.emailChangeVerified")
            : state === "error"
              ? t("settings.profile.emailChangeFailed")
              : t("settings.profile.emailChangeVerifyTitle")}
        </h1>
        <p className="mb-7 text-sm leading-6 text-gray-600">{message}</p>
        {state === "error" && (
          <MailWarning className="mx-auto mb-6 h-6 w-6 text-amber-500" />
        )}
        <Link href="/settings?section=profile">
          <Button className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white">
            {t("settings.profile.backToSettings")}
          </Button>
        </Link>
      </section>
    </main>
  );
}
