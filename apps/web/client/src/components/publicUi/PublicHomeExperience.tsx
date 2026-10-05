import { useState, type ReactNode } from "react";
import { Link as RouterLink } from "wouter";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Compass,
  LifeBuoy,
  Sparkles,
} from "lucide-react";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link as PublicLink } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";

export type PublicHomeExperienceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  primaryNavigation: string;
  primaryCta: string;
  secondaryCta: string;
  trust: string;
  heroImageAlt: string;
  illustrationCaption: string;
  imageUnavailable: string;
  flagshipEyebrow: string;
  flagshipTitle: string;
  flagshipBody: string;
  flagshipCta: string;
  flagshipDetailsCta: string;
  flagshipImageAlt: string;
  productTitle: string;
  productBody: string;
  resourcesTitle: string;
  featuresLink: string;
  featuresDescription: string;
  docsLink: string;
  docsDescription: string;
  contactLink: string;
  galleryLink: string;
  galleryDescription: string;
  trustTitle: string;
  trustBody: string;
  closingTitle: string;
  closingBody: string;
  closingCta: string;
};

function PublicIllustration({
  src,
  alt,
  caption,
  unavailable,
  eager = false,
}: {
  src: string;
  alt: string;
  caption: string;
  unavailable: string;
  eager?: boolean;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <figure style={{ margin: 0 }}>
      {hasError ? (
        <Section variant="muted" padding={6}>
          <VStack gap={3} hAlign="center">
            <Sparkles aria-hidden="true" />
            <Text role="status" color="secondary" justify="center">
              {unavailable}
            </Text>
          </VStack>
        </Section>
      ) : (
        <AspectRatio
          ratio={16 / 9}
          fit="cover"
          style={{ borderRadius: "var(--radius-xl)" }}
        >
          <img
            src={src}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            onError={() => setHasError(true)}
          />
        </AspectRatio>
      )}
      <figcaption>
        <Text type="supporting" color="secondary">
          {caption}
        </Text>
      </figcaption>
    </figure>
  );
}

/** SmartAIHub-owned public page pattern; Astryx remains an internal implementation detail. */
export function PublicHomeExperience({
  copy,
  assets,
  afterHero,
}: {
  copy: PublicHomeExperienceCopy;
  assets: { hero: string; verticalSeries: string };
  afterHero?: ReactNode;
}) {
  return (
    <>
      <Section variant="transparent" maxWidth="1280px" padding={8}>
        <Grid columns={{ minWidth: 320, max: 2 }} gap={8} align="center">
          <VStack gap={4} as="header">
            <Text type="label" color="accent">
              {copy.eyebrow}
            </Text>
            <Heading
              level={1}
              type="display-1"
              weight="bold"
              textWrap="balance"
            >
              {copy.title}
            </Heading>
            <Text type="large" color="secondary">
              {copy.description}
            </Text>
            <HStack
              gap={3}
              wrap="wrap"
              as="nav"
              aria-label={copy.primaryNavigation}
            >
              <Button
                label={copy.primaryCta}
                variant="primary"
                size="lg"
                icon={<Sparkles aria-hidden="true" />}
                href="/signup"
                as={RouterLink}
              />
              <Button
                label={copy.secondaryCta}
                variant="secondary"
                size="lg"
                href="/features"
                as={RouterLink}
              />
            </HStack>
            <Text type="supporting" color="secondary">
              {copy.trust}
            </Text>
          </VStack>

          <PublicIllustration
            src={assets.hero}
            alt={copy.heroImageAlt}
            caption={copy.illustrationCaption}
            unavailable={copy.imageUnavailable}
            eager
          />
        </Grid>
      </Section>

      <Section variant="section" maxWidth="1280px" padding={8}>
        <Grid columns={{ minWidth: 320, max: 2 }} gap={8} align="center">
          <PublicIllustration
            src={assets.verticalSeries}
            alt={copy.flagshipImageAlt}
            caption={copy.illustrationCaption}
            unavailable={copy.imageUnavailable}
          />
          <VStack gap={4} as="section" aria-labelledby="home-flagship-title">
            <Text type="label" color="accent">
              {copy.flagshipEyebrow}
            </Text>
            <Heading
              level={2}
              id="home-flagship-title"
              type="display-2"
              weight="bold"
              textWrap="balance"
            >
              {copy.flagshipTitle}
            </Heading>
            <Text type="large" color="secondary">
              {copy.flagshipBody}
            </Text>
            <HStack
              gap={3}
              wrap="wrap"
              as="nav"
              aria-label={copy.flagshipTitle}
            >
              <Button
                label={copy.flagshipCta}
                variant="primary"
                size="lg"
                icon={<Clapperboard aria-hidden="true" />}
                href="/login?returnUrl=%2Fdrama-series"
                as={RouterLink}
              />
              <Button
                label={copy.flagshipDetailsCta}
                variant="secondary"
                size="lg"
                href="/features#vertical-series"
                as={RouterLink}
              />
            </HStack>
          </VStack>
        </Grid>
      </Section>

      {afterHero}

      <Section variant="muted" padding={8}>
        <VStack gap={6}>
          <VStack gap={3} hAlign="center">
            <Heading
              level={2}
              type="display-3"
              weight="bold"
              textWrap="balance"
            >
              {copy.productTitle}
            </Heading>
            <Text type="large" color="secondary" justify="center">
              {copy.productBody}
            </Text>
          </VStack>
          <nav aria-label={copy.trustTitle}>
            <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
              <Card>
                <VStack gap={3}>
                  <Sparkles aria-hidden="true" />
                  <Heading level={3} weight="semibold">
                    {copy.featuresLink}
                  </Heading>
                  <Text type="supporting" color="secondary">
                    {copy.featuresDescription}
                  </Text>
                  <PublicLink href="/features" isStandalone weight="semibold">
                    <HStack gap={2}>
                      {copy.featuresLink}
                      <ArrowRight aria-hidden="true" />
                    </HStack>
                  </PublicLink>
                </VStack>
              </Card>
              <Card>
                <VStack gap={3}>
                  <Compass aria-hidden="true" />
                  <Heading level={3} weight="semibold">
                    {copy.galleryLink}
                  </Heading>
                  <Text type="supporting" color="secondary">
                    {copy.galleryDescription}
                  </Text>
                  <PublicLink href="/gallery" isStandalone weight="semibold">
                    <HStack gap={2}>
                      {copy.galleryLink}
                      <ArrowRight aria-hidden="true" />
                    </HStack>
                  </PublicLink>
                </VStack>
              </Card>
              <Card>
                <VStack gap={3}>
                  <BookOpen aria-hidden="true" />
                  <Heading level={3} weight="semibold">
                    {copy.docsLink}
                  </Heading>
                  <Text type="supporting" color="secondary">
                    {copy.docsDescription}
                  </Text>
                  <PublicLink href="/docs" isStandalone weight="semibold">
                    <HStack gap={2}>
                      {copy.docsLink}
                      <ArrowRight aria-hidden="true" />
                    </HStack>
                  </PublicLink>
                </VStack>
              </Card>
            </Grid>
          </nav>
        </VStack>
      </Section>

      <Section variant="transparent" maxWidth="1280px" padding={8}>
        <Grid columns={{ minWidth: 320, max: 2 }} gap={8} align="center">
          <VStack gap={4} as="section" aria-labelledby="home-trust-title">
            <Text type="label" color="accent">
              {copy.trust}
            </Text>
            <Heading
              level={2}
              id="home-trust-title"
              type="display-3"
              weight="bold"
            >
              {copy.trustTitle}
            </Heading>
            <Text type="large" color="secondary">
              {copy.trustBody}
            </Text>
          </VStack>
          <nav aria-label={copy.resourcesTitle}>
            <VStack gap={4}>
              <PublicLink href="/docs" isStandalone weight="semibold">
                <HStack gap={3}>
                  <BookOpen aria-hidden="true" />
                  {copy.docsLink}
                  <ArrowRight aria-hidden="true" />
                </HStack>
              </PublicLink>
              <PublicLink href="/contact" isStandalone weight="semibold">
                <HStack gap={3}>
                  <LifeBuoy aria-hidden="true" />
                  {copy.contactLink}
                  <ArrowRight aria-hidden="true" />
                </HStack>
              </PublicLink>
            </VStack>
          </nav>
        </Grid>
      </Section>

      <Section variant="muted" padding={8}>
        <VStack gap={4} hAlign="center">
          <Heading level={2} type="display-2" weight="bold" textWrap="balance">
            {copy.closingTitle}
          </Heading>
          <Text type="large" color="secondary" justify="center">
            {copy.closingBody}
          </Text>
          <Button
            label={copy.closingCta}
            variant="primary"
            size="lg"
            icon={<ArrowRight aria-hidden="true" />}
            href="/signup"
            as={RouterLink}
          />
        </VStack>
      </Section>
    </>
  );
}
