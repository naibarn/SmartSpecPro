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
import {
  AspectRatio,
  Button,
  Card,
  Grid,
  Heading,
  HStack,
  Link as PublicLink,
  Section,
  Text,
  Theme as AstryxTheme,
  VStack,
  publicHomeTheme,
} from "./publicPrimitives";

export type PublicHomeExperienceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  primaryNavigation: string;
  flowLabel: string;
  flowTitle: string;
  flowStepOne: string;
  flowValueOne: string;
  flowStepTwo: string;
  flowValueTwo: string;
  flowFootnote: string;
  seriesFlowLabel: string;
  seriesFlowTitle: string;
  seriesStepOne: string;
  seriesValueOne: string;
  seriesStepTwo: string;
  seriesValueTwo: string;
  seriesFlowFootnote: string;
  illustrationDisclosure: string;
  humanImageAlt: string;
  humanImageDisclosure: string;
  humanImageFallback: string;
  primaryCta: string;
  secondaryCta: string;
  trust: string;
  flagshipEyebrow: string;
  flagshipTitle: string;
  flagshipBody: string;
  flagshipCta: string;
  flagshipDetailsCta: string;
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

function ProductFlowPanel({
  copy,
  variant = "idea",
}: {
  copy: PublicHomeExperienceCopy;
  variant?: "idea" | "series";
}) {
  return (
    <Card>
      <VStack gap={5}>
        <HStack gap={3} align="center">
          <Sparkles aria-hidden="true" />
          <VStack gap={1}>
            <Text type="label" color="accent">
              {variant === "idea" ? copy.flowLabel : copy.seriesFlowLabel}
            </Text>
            <Heading level={3} weight="semibold">
              {variant === "idea" ? copy.flowTitle : copy.seriesFlowTitle}
            </Heading>
          </VStack>
        </HStack>
        <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
          <Section variant="muted" padding={4}>
            <VStack gap={2}>
              <Text type="label" color="secondary">
                {variant === "idea" ? copy.flowStepOne : copy.seriesStepOne}
              </Text>
              <Text weight="semibold">
                {variant === "idea" ? copy.flowValueOne : copy.seriesValueOne}
              </Text>
            </VStack>
          </Section>
          <Section variant="muted" padding={4}>
            <VStack gap={2}>
              <Text type="label" color="secondary">
                {variant === "idea" ? copy.flowStepTwo : copy.seriesStepTwo}
              </Text>
              <Text weight="semibold">
                {variant === "idea" ? copy.flowValueTwo : copy.seriesValueTwo}
              </Text>
            </VStack>
          </Section>
        </Grid>
        <HStack gap={2} align="center">
          <ArrowRight aria-hidden="true" />
          <Text type="supporting" color="secondary">
            {variant === "idea" ? copy.flowFootnote : copy.seriesFlowFootnote}
          </Text>
        </HStack>
        <Text type="supporting" color="secondary">
          {copy.illustrationDisclosure}
        </Text>
      </VStack>
    </Card>
  );
}

function HumanProductEvidencePanel({ copy }: { copy: PublicHomeExperienceCopy }) {
  const [imageAvailable, setImageAvailable] = useState(true);

  return (
    <VStack gap={3}>
      {imageAvailable ? (
        <AspectRatio ratio={3 / 2} fit="cover">
          <img
            src="/images/public-home-human-editorial.webp"
            alt={copy.humanImageAlt}
            fetchPriority="high"
            decoding="async"
            onError={() => setImageAvailable(false)}
          />
        </AspectRatio>
      ) : (
        <Section variant="muted" padding={4}>
          <Text type="supporting" color="secondary">
            {copy.humanImageFallback}
          </Text>
        </Section>
      )}
      <Text type="supporting" color="secondary">
        {copy.humanImageDisclosure}
      </Text>
      <ProductFlowPanel copy={copy} />
    </VStack>
  );
}

/** SmartAIHub-owned public page pattern; Astryx remains an internal implementation detail. */
export function PublicHomeExperience({
  copy,
  afterHero,
}: {
  copy: PublicHomeExperienceCopy;
  afterHero?: ReactNode;
}) {
  return (
    <AstryxTheme theme={publicHomeTheme} mode="light">
      <>
        <Section
          variant="transparent"
          maxWidth="var(--public-layout-wide)"
          padding={8}
          style={{ marginInline: "auto" }}
        >
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
                <PublicLink
                  href="#home-flagship-title"
                  isStandalone
                  weight="semibold"
                >
                  <HStack gap={2}>
                    <Text>{copy.flagshipTitle}</Text>
                    <ArrowRight aria-hidden="true" />
                  </HStack>
                </PublicLink>
              </HStack>
              <Text type="supporting" color="secondary">
                {copy.trust}
              </Text>
            </VStack>

            <HumanProductEvidencePanel copy={copy} />
          </Grid>
        </Section>

        <Section
          variant="section"
          maxWidth="var(--public-layout-wide)"
          padding={8}
          style={{ marginInline: "auto" }}
        >
          <Grid columns={{ minWidth: 320, max: 2 }} gap={8} align="center">
            <ProductFlowPanel copy={copy} variant="series" />
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

        <Section
          variant="transparent"
          maxWidth="var(--public-layout-wide)"
          padding={8}
          style={{ marginInline: "auto" }}
        >
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
            <Heading
              level={2}
              type="display-2"
              weight="bold"
              textWrap="balance"
            >
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
    </AstryxTheme>
  );
}
