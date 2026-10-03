import { Link } from "wouter";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import EmergencyPublicEntry from "@/components/emergency/EmergencyPublicEntry";
import { Seo } from "@/components/Seo";
import { SafeHtml } from "@/components/ui/SafeHtml";
import type { TenantPageData } from "@/hooks/useTenantPage";

type PublicSectionItem = {
  title?: string;
  description?: string;
  value?: string | number;
  question?: string;
  answer?: string;
  image?: string;
  points?: string[];
};

type PublicSection = NonNullable<TenantPageData["sections"]>[number];

function textValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function scalarValue(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("/")) {
    try {
      return new URL(value, "https://tenant.invalid").origin ===
        "https://tenant.invalid"
        ? value
        : null;
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function sectionItems(section: PublicSection): PublicSectionItem[] {
  return Array.isArray(section.items)
    ? section.items.filter(
        (item): item is PublicSectionItem => !!item && typeof item === "object"
      )
    : [];
}

function SafeLink({
  href,
  children,
  className,
}: {
  href: string;
  children: string;
  className: string;
}) {
  if (typeof href !== "string" || !href.trim()) return null;
  if (href.startsWith("/")) {
    try {
      if (new URL(href, "https://tenant.invalid").origin === "https://tenant.invalid") {
        return (
          <Link href={href} className={className}>
            {children}
          </Link>
        );
      }
    } catch {
      return null;
    }
  }
  if (href.startsWith("#"))
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );

  try {
    const url = new URL(href);
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) {
      return (
        <a
          href={href}
          className={className}
          target={url.protocol.startsWith("http") ? "_blank" : undefined}
          rel={
            url.protocol.startsWith("http") ? "noopener noreferrer" : undefined
          }
        >
          {children}
        </a>
      );
    }
  } catch {
    return null;
  }
  return null;
}

function SectionItems({ section }: { section: PublicSection }) {
  const items = sectionItems(section);
  if (!items.length) return null;

  if (section.type === "stats") {
    return (
      <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-3">
        {items.map((item, index) => (
          <li
            key={`${item.title || item.value || "stat"}-${index}`}
            className="rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold"
          >
            {item.value ?? item.title ?? item.description}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <li
          key={`${item.title || item.question || "item"}-${index}`}
          className="rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          {safeMediaUrl(item.image) ? (
            <img
              src={safeMediaUrl(item.image)!}
              alt={String(textValue(item.title) || "")}
              loading="lazy"
              className="mb-4 aspect-video w-full rounded-xl object-cover"
            />
          ) : null}
          {scalarValue(item.value) != null ? (
            <p className="text-2xl font-bold text-primary">
              {scalarValue(item.value)}
            </p>
          ) : null}
          {textValue(item.title || item.question) ? (
            <h3 className="text-lg font-semibold">
              {textValue(item.title || item.question)}
            </h3>
          ) : null}
          {textValue(item.description || item.answer) ? (
            <p className="mt-2 leading-7 text-muted-foreground">
              {textValue(item.description || item.answer)}
            </p>
          ) : null}
          {Array.isArray(item.points) &&
          item.points.some(point => typeof point === "string") ? (
            <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {item.points
                .filter((point): point is string => typeof point === "string")
                .map((point, pointIndex) => (
                  <li key={`${point}-${pointIndex}`}>{point}</li>
                ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TenantSection({
  section,
  index,
}: {
  section: PublicSection;
  index: number;
}) {
  const items = sectionItems(section);
  const isHero = section.type === "hero";
  const isCta = section.type === "cta";
  const badge = textValue(section.settings?.badge);
  const backgroundVideo = safeMediaUrl(section.settings?.backgroundVideo);
  const sectionTitle = textValue(section.title);
  const subtitle = textValue(section.subtitle);
  const content = typeof section.content === "string" ? section.content : "";
  const image = safeMediaUrl(section.image);
  const heading = sectionTitle || (isHero && index === 0 ? "" : undefined);
  const buttons = (section.buttons || []).filter(
    button =>
      typeof button?.text === "string" && typeof button?.link === "string"
  );

  return (
    <section
      aria-labelledby={heading ? `tenant-section-${index}` : undefined}
      className={`relative isolate overflow-hidden px-4 py-14 sm:px-6 sm:py-20 lg:px-8 ${isHero ? "bg-gradient-to-br from-primary/10 via-background to-accent/10" : isCta ? "bg-primary/5" : ""}`}
    >
      {backgroundVideo ? (
        <video
          src={backgroundVideo}
          aria-hidden="true"
          muted
          loop
          autoPlay
          playsInline
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-20"
        />
      ) : null}
      <header className="mx-auto mb-8 max-w-4xl text-center">
        {badge ? (
          <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-primary">
            {badge}
          </p>
        ) : null}
        {heading ? (
          index === 0 ? (
            <h1
              id={`tenant-section-${index}`}
              className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
            >
              {heading}
            </h1>
          ) : (
            <h2
              id={`tenant-section-${index}`}
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              {heading}
            </h2>
          )
        ) : null}
        {subtitle ? (
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
        {image && isHero ? (
          <img
            src={image}
            alt={String(heading || "")}
            fetchPriority="high"
            className="mx-auto mt-8 max-h-[28rem] w-full max-w-5xl rounded-3xl object-cover shadow-xl"
          />
        ) : null}
      </header>
      {content ? (
        <SafeHtml
          html={content}
          className="prose prose-lg mx-auto mb-8 max-w-4xl dark:prose-invert"
        />
      ) : null}
      <SectionItems section={section} />
      {buttons.length ? (
        <nav
          aria-label={String(heading || "Page actions")}
          className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-3"
        >
          {buttons.map((button, buttonIndex) => (
            <SafeLink
              key={`${button.text}-${buttonIndex}`}
              href={button.link}
              className={`inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-3 font-semibold transition-colors ${button.style === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border bg-background text-foreground hover:bg-accent"}`}
            >
              {button.text}
            </SafeLink>
          ))}
        </nav>
      ) : null}
      {!content && !items.length && section.type === "content" && subtitle ? (
        <p className="mx-auto max-w-4xl whitespace-pre-wrap text-center leading-8 text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </section>
  );
}

export default function TenantHomePage({ page }: { page: TenantPageData }) {
  const sections = page.sections?.length
    ? page.sections
    : page.content
      ? [
          {
            id: "page-content",
            type: "content",
            title: page.title,
            content: page.content,
          },
        ]
      : [];
  const title = textValue(page.metadata?.customMeta?.seoTitle) || page.title;
  const description =
    textValue(page.metadata?.description) ||
    textValue(page.metadata?.customMeta?.seoDescription) ||
    "";
  const keywords = Array.isArray(page.metadata?.keywords)
    ? page.metadata.keywords.filter(
        (keyword): keyword is string => typeof keyword === "string"
      )
    : [];

  return (
    <>
      <Seo
        title={title}
        description={description}
        keywords={keywords}
        image={page.metadata?.ogImage}
        canonicalPath="/"
      />
      <Navbar />
      <main className="min-h-screen bg-background text-foreground">
        <EmergencyPublicEntry variant="home" />
        {sections.length ? (
          sections.map((section, index) => (
            <TenantSection
              key={section.id || `${section.type}-${index}`}
              section={section}
              index={index}
            />
          ))
        ) : (
          <section className="px-4 py-20 text-center">
            <h1 className="text-4xl font-bold">{page.title}</h1>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
