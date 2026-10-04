import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
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
}: {
  href: string;
  children: string;
}) {
  if (typeof href !== "string" || !href.trim()) return null;
  if (href.startsWith("/")) {
    try {
      if (new URL(href, "https://tenant.invalid").origin === "https://tenant.invalid") {
        return (
          <Link href={href} isStandalone>
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
      <Link href={href} isStandalone>
        {children}
      </Link>
    );

  try {
    const url = new URL(href);
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) {
      return (
        <Link
          href={href}
          isStandalone
          isExternalLink={url.protocol.startsWith("http")}
        >
          {children}
        </Link>
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
      <VStack gap={3} wrap="wrap" as="ul" hAlign="center">
        {items.map((item, index) => (
          <li key={`${item.title || item.value || "stat"}-${index}`}>
            <Text type="label">
              {item.value ?? item.title ?? item.description}
            </Text>
          </li>
        ))}
      </VStack>
    );
  }

  return (
    <Grid columns={{ minWidth: 280, max: 3 }} gap={5}>
      {items.map((item, index) => (
        <Card key={`${item.title || item.question || "item"}-${index}`}>
          <VStack gap={2}>
            {safeMediaUrl(item.image) ? (
              <img
                src={safeMediaUrl(item.image)!}
                alt={String(textValue(item.title) || "")}
                loading="lazy"
              />
            ) : null}
            {scalarValue(item.value) != null ? (
              <Text type="large" color="accent" weight="bold">
                {scalarValue(item.value)}
              </Text>
            ) : null}
            {textValue(item.title || item.question) ? (
              <Heading level={3}>
                {textValue(item.title || item.question)}
              </Heading>
            ) : null}
            {textValue(item.description || item.answer) ? (
              <Text>{textValue(item.description || item.answer)}</Text>
            ) : null}
            {Array.isArray(item.points) &&
            item.points.some(point => typeof point === "string") ? (
              <VStack gap={1} as="ul">
                {item.points
                  .filter((point): point is string => typeof point === "string")
                  .map((point, pointIndex) => (
                    <li key={`${point}-${pointIndex}`}>
                      <Text>{point}</Text>
                    </li>
                  ))}
              </VStack>
            ) : null}
          </VStack>
        </Card>
      ))}
    </Grid>
  );
}

function TenantSection({
  section,
  index,
  pageTitle,
}: {
  section: PublicSection;
  index: number;
  pageTitle: string;
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
  const heading = sectionTitle || (index === 0 ? pageTitle : undefined);
  const buttons = (section.buttons || []).filter(
    button =>
      typeof button?.text === "string" && typeof button?.link === "string"
  );

  return (
    <Section
      aria-labelledby={heading ? `tenant-section-${index}` : undefined}
      padding={8}
      variant={isHero || isCta ? "muted" : "section"}
    >
      {backgroundVideo ? (
        <video
          src={backgroundVideo}
          aria-label={heading || ""}
          muted
          loop
          autoPlay
          playsInline
        />
      ) : null}
      <VStack gap={4} hAlign="center">
        {badge ? (
          <Text type="label" color="accent">
            {badge}
          </Text>
        ) : null}
        {heading ? (
          index === 0 ? (
            <Heading
              level={1}
              id={`tenant-section-${index}`}
            >
              {heading}
            </Heading>
          ) : (
            <Heading
              level={2}
              id={`tenant-section-${index}`}
            >
              {heading}
            </Heading>
          )
        ) : null}
        {subtitle ? (
          <Text type="large" color="secondary" justify="center">
            {subtitle}
          </Text>
        ) : null}
        {image && isHero ? (
          <img
            src={image}
            alt={String(heading || "")}
            fetchPriority="high"
          />
        ) : null}
      </VStack>
      {content ? (
        <SafeHtml html={content} />
      ) : null}
      <SectionItems section={section} />
      {buttons.length ? (
        <VStack
          gap={3}
          wrap="wrap"
          as="nav"
          aria-label={String(heading || "Page actions")}
          hAlign="center"
        >
          {buttons.map((button, buttonIndex) => (
            <SafeLink
              key={`${button.text}-${buttonIndex}`}
              href={button.link}
            >
              {button.text}
            </SafeLink>
          ))}
        </VStack>
      ) : null}
      {!content && !items.length && section.type === "content" && subtitle ? (
        <Text color="secondary" justify="center">
          {subtitle}
        </Text>
      ) : null}
    </Section>
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
        fetchTenantSeo={false}
        useTenantDefaults={false}
      />
      <Navbar />
      <main>
        <EmergencyPublicEntry variant="home" />
        {sections.length ? (
          sections.map((section, index) => (
            <TenantSection
              key={section.id || `${section.type}-${index}`}
              section={section}
              index={index}
              pageTitle={page.title}
            />
          ))
        ) : (
          <Section padding={8}>
            <Heading level={1}>{page.title}</Heading>
          </Section>
        )}
      </main>
      <Footer />
    </>
  );
}
