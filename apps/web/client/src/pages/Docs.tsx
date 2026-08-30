import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clapperboard,
  FileText,
  MessageSquareText,
  MonitorCog,
  PlugZap,
  Search,
  Sparkles,
  Store,
  Video,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

const guides = [
  { key: "quickstart", icon: Sparkles, href: "/docs/quickstart" },
  { key: "chat", icon: MessageSquareText, href: "/chat" },
  { key: "skills", icon: BookOpen, href: "/marketplace" },
  { key: "vertical", icon: Clapperboard, href: "/drama-series" },
  { key: "product", icon: FileText, href: "/docs/marketplace-capture" },
  { key: "media", icon: Video, href: "/media-studio" },
  { key: "storyboard", icon: FileText, href: "/storyboard-review" },
  { key: "video", icon: Video, href: "/video-studio" },
  { key: "organize", icon: BookOpen, href: "/gallery" },
  { key: "capture", icon: Store, href: "/docs#marketplace-capture" },
  { key: "worker", icon: MonitorCog, href: "/docs#worker-render" },
  { key: "mcp", icon: PlugZap, href: "/docs#mcp-integrations" },
] as const;

function SafeImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 ${className ?? ""}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={event => {
          event.currentTarget.style.display = "none";
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-white/10"
      />
    </div>
  );
}

export default function Docs() {
  const { t } = useScopedTranslation("publicSite");
  const [articleCopied, setArticleCopied] = useState(false);
  const [articleCopyFailed, setArticleCopyFailed] = useState(false);
  const articleContent = `${t("docs.article.harnessDefinition")}\n\n${t("docs.article.contentExpanded")}`;

  const copyArticle = async () => {
    const content = articleContent;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        const helper = document.createElement("textarea");
        helper.value = content;
        helper.setAttribute("readonly", "true");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        const copied = document.execCommand("copy");
        helper.remove();
        if (!copied) throw new Error("copy-command-failed");
      }
      setArticleCopyFailed(false);
      setArticleCopied(true);
      window.setTimeout(() => setArticleCopied(false), 2200);
    } catch {
      setArticleCopied(false);
      setArticleCopyFailed(true);
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-slate-50 text-slate-950">
      <Seo
        title={t("docs.meta.title")}
        description={t("docs.meta.description")}
        keywords={t("docs.meta.keywords").split(", ")}
        canonicalPath="/docs"
      />
      <Navbar />
      <section className="relative overflow-hidden border-b border-slate-200 bg-[#07152d] pt-28 text-white sm:pt-36">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(34,211,238,.22),transparent_35%),radial-gradient(circle_at_15%_10%,rgba(99,102,241,.2),transparent_38%)]" />
        <div className="container relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_.9fr] lg:items-center lg:px-8 lg:pb-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-4 py-2 text-sm font-medium text-cyan-100">
              <BookOpen className="h-4 w-4" /> {t("docs.hero.eyebrow")}
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              {t("docs.hero.title")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              {t("docs.hero.body")}
            </p>
            <div className="relative mt-8 max-w-xl">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                aria-label={t("docs.search.label")}
                placeholder={t("docs.search.placeholder")}
                className="h-14 border-white/15 bg-white/10 pl-12 text-white placeholder:text-slate-400"
              />
            </div>
          </motion.div>
          <SafeImage
            src="/images/smartaihub-docs-blueprint.webp"
            alt={t("docs.a11y.heroImage")}
            className="min-h-[20rem] rounded-[2rem] border border-white/15 shadow-2xl sm:min-h-[28rem]"
          />
        </div>
      </section>
      <section className="container mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <div className="mb-12 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-700">
            {t("docs.guides.eyebrow")}
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            {t("docs.guides.title")}
          </h2>
          <p className="mt-4 leading-7 text-slate-600">
            {t("docs.guides.body")}
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {guides.map((guide, index) => {
            const GuideIcon = guide.icon;
            return (
              <motion.div
                key={guide.key}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.04 }}
              >
                <Link
                  href={guide.href}
                  className="group block h-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                      <GuideIcon className="h-5 w-5" />
                    </span>
                    <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-cyan-600" />
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">
                    {t(`docs.guide.${guide.key}.title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {t(`docs.guide.${guide.key}.body`)}
                  </p>
                  <span className="mt-5 inline-flex text-sm font-semibold text-cyan-700">
                    {t("docs.guide.learnMore")}
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>
      <section className="border-y border-slate-200 bg-white py-20 sm:py-28">
        <div className="container mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-8">
          <SafeImage
            src="/images/smartaihub-docs-story-path.webp"
            alt={t("docs.a11y.storyImage")}
            className="min-h-[20rem] rounded-[2rem] shadow-xl sm:min-h-[27rem]"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-700">
              {t("docs.path.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              {t("docs.path.title")}
            </h2>
            <p className="mt-5 leading-8 text-slate-600">
              {t("docs.path.body")}
            </p>
            <ol className="mt-8 space-y-5">
              {[1, 2, 3].map(step => (
                <li key={step} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-cyan-200">
                    {step}
                  </span>
                  <div>
                    <h3 className="font-semibold">
                      {t(`docs.path.step.${step}.title`)}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {t(`docs.path.step.${step}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <Button
              asChild
              className="mt-8 bg-slate-950 text-white hover:bg-slate-800"
            >
              <Link href="/docs/quickstart">
                {t("docs.path.cta")} <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section
        id="idea-to-output"
        className="border-y border-slate-200 bg-white py-20 sm:py-28"
      >
        <div className="container mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[.95fr_1.05fr] lg:items-center lg:px-8">
          <SafeImage
            src="/images/smartaihub-docs-idea-to-output.webp"
            alt={t("docs.a11y.flowImage")}
            className="min-h-[20rem] rounded-[2rem] shadow-xl sm:min-h-[27rem]"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-700">
              {t("docs.flow.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              {t("docs.flow.title")}
            </h2>
            <p className="mt-5 leading-8 text-slate-600">
              {t("docs.flow.body")}
            </p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map(step => (
                <li
                  key={step}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <span className="text-sm font-bold text-cyan-700">
                    0{step}
                  </span>
                  <h3 className="mt-3 font-semibold text-slate-950">
                    {t(`docs.flow.step.${step}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t(`docs.flow.step.${step}.body`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
      <section
        id="domain-specific-harness"
        className="border-y border-slate-200 bg-slate-950 py-20 text-white sm:py-28"
      >
        <div className="container mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8">
          <SafeImage
            src="/images/smartaihub-domain-specific-harness.webp"
            alt={t("harness.imageAlt")}
            className="min-h-[20rem] rounded-[2rem] border border-white/15 shadow-2xl shadow-cyan-950/40 sm:min-h-[27rem]"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-300">
              {t("harness.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              {t("harness.title")}
            </h2>
            <p className="mt-5 leading-8 text-slate-300">
              {t("harness.body")}
            </p>
            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map(point => (
                <li
                  key={point}
                  className="flex gap-3 text-sm leading-7 text-slate-200"
                >
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
                  {t(`harness.point.${point}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <section className="container mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:py-28">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-700">
            {t("docs.reference.eyebrow")}
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            {t("docs.reference.title")}
          </h2>
          <p className="mt-5 leading-8 text-slate-600">
            {t("docs.reference.body")}
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {["chat", "vertical", "product", "organize"].map(key => (
              <div
                key={key}
                className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
                <span className="text-sm font-medium">
                  {t(`docs.reference.item.${key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <SafeImage
          src="/images/smartaihub-docs-asset-organization.webp"
          alt={t("docs.a11y.assetsImage")}
          className="min-h-[20rem] rounded-[2rem] shadow-xl sm:min-h-[27rem]"
        />
      </section>
      <section className="border-y border-slate-200 bg-slate-950 py-20 text-white sm:py-28">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-300">
              {t("docs.connected.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
              {t("docs.connected.title")}
            </h2>
            <p className="mt-5 leading-8 text-slate-300">
              {t("docs.connected.body")}
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <article
              id="marketplace-capture"
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[.06]"
            >
              <SafeImage
                src="/images/smartaihub-docs-capture-flow.webp"
                alt={t("docs.a11y.captureImage")}
                className="min-h-[16rem] border-b border-white/10 sm:min-h-[22rem]"
              />
              <div className="p-7 sm:p-8">
                <Store className="h-7 w-7 text-cyan-300" />
                <h3 className="mt-5 text-2xl font-semibold">
                  {t("docs.connected.capture.title")}
                </h3>
                <p className="mt-4 leading-7 text-slate-300">
                  {t("docs.connected.capture.body")}
                </p>
              </div>
            </article>
            <article
              id="worker-render"
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[.06]"
            >
              <SafeImage
                src="/images/smartaihub-docs-connected-runtime.webp"
                alt={t("docs.a11y.runtimeImage")}
                className="min-h-[16rem] border-b border-white/10 sm:min-h-[22rem]"
              />
              <div className="p-7 sm:p-8">
                <MonitorCog className="h-7 w-7 text-cyan-300" />
                <h3 className="mt-5 text-2xl font-semibold">
                  {t("docs.connected.runtime.title")}
                </h3>
                <p className="mt-4 leading-7 text-slate-300">
                  {t("docs.connected.runtime.body")}
                </p>
                <h4
                  id="mcp-integrations"
                  className="mt-7 text-lg font-semibold text-cyan-200"
                >
                  {t("docs.connected.mcp.title")}
                </h4>
                <p className="mt-3 leading-7 text-slate-300">
                  {t("docs.connected.mcp.body")}
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section
        id="smartaihub-story"
        className="container mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28"
      >
        <div className="rounded-[2rem] border border-cyan-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[.25em] text-cyan-700">
            {t("docs.article.eyebrow")}
          </p>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                {t("docs.article.title")}
              </h2>
              <p className="mt-4 max-w-3xl leading-8 text-slate-600">
                {t("docs.article.body")}
              </p>
            </div>
            <Button
              type="button"
              onClick={copyArticle}
              className="shrink-0 bg-slate-950 text-white hover:bg-slate-800"
            >
              <FileText className="mr-2 h-4 w-4" />
              {articleCopied
                ? t("docs.article.copied")
                : t("docs.article.copy")}
            </Button>
          </div>
          <textarea
            readOnly
            value={articleContent}
            aria-label={t("docs.article.title")}
            className="mt-8 min-h-[34rem] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-5 font-sans text-sm leading-7 text-slate-700 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
          />
          <p aria-live="polite" className="mt-3 min-h-6 text-sm text-cyan-700">
            {articleCopied
              ? t("docs.article.copiedHint")
              : articleCopyFailed
                ? t("docs.article.copyFailed")
                : t("docs.article.selectHint")}
          </p>
        </div>
      </section>
      <section className="bg-[#07152d] py-20 text-white sm:py-28">
        <div className="container mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <FileText className="mx-auto h-12 w-12 text-cyan-200" />
          <h2 className="mt-5 text-3xl font-semibold sm:text-5xl">
            {t("docs.cta.title")}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl leading-8 text-slate-300">
            {t("docs.cta.body")}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              <Link href="/signup">{t("docs.cta.primary")}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <Link href="/contact">{t("docs.cta.secondary")}</Link>
            </Button>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
