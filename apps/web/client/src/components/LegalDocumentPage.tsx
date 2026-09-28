import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Clock,
  Database,
  Eye,
  FileText,
  Globe,
  Lock,
  Scale,
  Shield,
  UserCheck,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  getLegalDocument,
  type LegalBlock,
  type LegalDocument,
  type LegalIcon,
} from "@/lib/legalContent";

const iconMap: Record<LegalIcon, typeof Shield> = {
  shield: Shield,
  database: Database,
  eye: Eye,
  globe: Globe,
  lock: Lock,
  user: UserCheck,
  bell: Bell,
  file: FileText,
  alert: AlertTriangle,
  scale: Scale,
  clock: Clock,
};

function renderBlock(block: LegalBlock, index: number) {
  if (block.type === "paragraph") {
    return (
      <p
        key={`paragraph-${index}`}
        className="mb-4 break-words leading-7 text-gray-600 last:mb-0"
      >
        {block.text}
      </p>
    );
  }

  if (block.type === "subheading") {
    return (
      <h3
        key={`subheading-${index}`}
        className="mb-2 mt-5 text-base font-semibold text-gray-800 first:mt-0"
      >
        {block.text}
      </h3>
    );
  }

  return (
    <ul
      key={`list-${index}`}
      className="mb-4 list-disc space-y-2 pl-5 text-gray-600 last:mb-0"
    >
      {block.items.map(item => (
        <li key={item} className="break-words leading-7">
          {item}
        </li>
      ))}
    </ul>
  );
}

function DocumentSection({
  section,
  index,
}: {
  section: LegalDocument["sections"][number];
  index: number;
}) {
  const Icon = iconMap[section.icon];

  return (
    <motion.section
      id={section.id}
      aria-labelledby={`${section.id}-heading`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.03 }}
      className="scroll-mt-24 rounded-2xl border border-gray-100 bg-white/80 p-6 backdrop-blur-sm md:p-8"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
          <Icon className="h-5 w-5 text-blue-600" aria-hidden="true" />
        </div>
        <h2
          id={`${section.id}-heading`}
          className="text-xl font-semibold text-gray-900"
        >
          {section.title}
        </h2>
      </div>
      <div>{section.blocks.map(renderBlock)}</div>
    </motion.section>
  );
}

export function LegalDocumentPage({ kind }: { kind: "privacy" | "terms" }) {
  const { locale } = useScopedTranslation("publicSite");
  const document = getLegalDocument(locale, kind);
  const HeaderIcon = kind === "privacy" ? Shield : FileText;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      <Seo
        title={document.metaTitle}
        description={document.metaDescription}
        keywords={
          kind === "privacy"
            ? ["privacy policy", "PDPA", "SmartAIHub"]
            : ["terms of service", "SmartAIHub"]
        }
        canonicalPath={`/${kind}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: document.title,
          headline: document.title,
          description: document.metaDescription,
          url: `/${kind}`,
          inLanguage: locale,
        }}
      />
      <Navbar />

      <main className="pt-24 pb-20" id="main-content">
        <div className="container mx-auto max-w-4xl px-4">
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <Link
              href="/"
              className="mb-6 inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {document.backToHome}
            </Link>

            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400">
                <HeaderIcon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
                  {document.title}
                </h1>
                <p className="text-gray-500">{document.lastUpdated}</p>
              </div>
            </div>

            <p className="text-lg leading-8 text-gray-600">
              {document.summary}
            </p>
          </motion.header>

          {document.highlights && (
            <motion.section
              aria-label={kind === "privacy" ? document.title : undefined}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-8 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-6"
            >
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Eye className="h-5 w-5 text-teal-600" aria-hidden="true" />
                {locale === "th" ? "สรุปสั้น ๆ" : "Privacy at a Glance"}
              </h2>
              <div className="grid gap-4 text-sm md:grid-cols-2">
                {document.highlights.map(highlight => {
                  const Icon = iconMap[highlight.icon];
                  return (
                    <div
                      key={highlight.text}
                      className="flex items-start gap-2"
                    >
                      <Icon
                        className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"
                        aria-hidden="true"
                      />
                      <span className="text-gray-600">{highlight.text}</span>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          )}

          <motion.nav
            aria-label={document.tableOfContents}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-8 rounded-2xl border border-gray-100 bg-white/80 p-6 backdrop-blur-sm"
          >
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {document.tableOfContents}
            </h2>
            <div className="grid gap-2 md:grid-cols-2">
              {document.sections.map(section => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="rounded py-1 text-sm text-gray-600 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  {section.title}
                </a>
              ))}
            </div>
          </motion.nav>

          <div className="space-y-8">
            {document.sections.map((section, index) => (
              <DocumentSection
                key={section.id}
                section={section}
                index={index}
              />
            ))}
          </div>

          <motion.footer
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mt-12 text-center"
          >
            <p className="text-sm text-gray-500">{document.acknowledgement}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {kind === "privacy" ? (
                <Link
                  className="font-medium text-blue-600 hover:text-blue-700"
                  href="/terms"
                >
                  {document.relatedTerms}
                </Link>
              ) : (
                <Link
                  className="font-medium text-blue-600 hover:text-blue-700"
                  href="/privacy"
                >
                  {document.relatedPrivacy}
                </Link>
              )}
              <span className="text-gray-300" aria-hidden="true">
                |
              </span>
              <Link
                className="font-medium text-blue-600 hover:text-blue-700"
                href="/contact"
              >
                {document.contactLink}
              </Link>
            </div>
          </motion.footer>
        </div>
      </main>

      <Footer />
    </div>
  );
}
