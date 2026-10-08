import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link as RouterLink } from "wouter";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Compass,
  LifeBuoy,
  MessageSquareText,
  Sparkles,
  Video,
} from "lucide-react";
import "./PublicHomeExperience.css";

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
  heroImageAlt: string;
  heroImageFallback: string;
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
  whyEyebrow: string;
  whyTitle: string;
  whyBody: string;
  valueStartTitle: string;
  valueStartBody: string;
  valueCreateTitle: string;
  valueCreateBody: string;
  valueContinueTitle: string;
  valueContinueBody: string;
  showcaseEyebrow: string;
  showcaseTitle: string;
  showcases: Array<{
    key: string;
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
    href: string;
    image: string;
    imageAlt: string;
  }>;
};

function CenteredSection({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "section" | "transparent" | "muted";
}) {
  return (
    <HStack width="100%" justify="center">
      <Section
        variant={variant}
        width="100%"
        maxWidth="var(--public-layout-wide)"
        padding={8}
      >
        {children}
      </Section>
    </HStack>
  );
}

function ValueCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Sparkles;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <VStack gap={3}>
        <Icon aria-hidden="true" />
        <Heading level={3} weight="semibold">
          {title}
        </Heading>
        <Text type="supporting" color="secondary">
          {body}
        </Text>
      </VStack>
    </Card>
  );
}

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

function HeroProductEvidencePanel({
  copy,
}: {
  copy: PublicHomeExperienceCopy;
}) {
  const [imageAvailable, setImageAvailable] = useState(true);
  const reduceMotion = useReducedMotion();

  return (
    <VStack gap={3}>
      {imageAvailable ? (
        <AspectRatio ratio={3 / 2} fit="cover">
          <motion.img
            className="public-home-showcase-image"
            src="/images/smartaihub-home-hero.webp"
            alt={copy.heroImageAlt}
            fetchPriority="high"
            decoding="async"
            initial={reduceMotion ? false : { opacity: 0 }}
            whileInView={reduceMotion ? undefined : { opacity: 1 }}
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            viewport={{ once: true, amount: 0.2 }}
            onError={() => setImageAvailable(false)}
          />
        </AspectRatio>
      ) : (
        <Section variant="muted" padding={4}>
          <Text type="supporting" color="secondary">
            {copy.heroImageFallback}
          </Text>
        </Section>
      )}
      <Text type="supporting" color="secondary">
        {copy.illustrationDisclosure}
      </Text>
      <ProductFlowPanel copy={copy} />
    </VStack>
  );
}

function ProductSpotlight({
  item,
  index,
}: {
  item: PublicHomeExperienceCopy["showcases"][number];
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  const image = (
    <AspectRatio ratio={16 / 10} fit="cover">
      <motion.img
        className="public-home-showcase-image"
        src={item.image}
        alt={item.imageAlt}
        loading="lazy"
        decoding="async"
        initial={reduceMotion ? false : { opacity: 0 }}
        whileInView={reduceMotion ? undefined : { opacity: 1 }}
        whileHover={reduceMotion ? undefined : { scale: 1.02 }}
        viewport={{ once: true, amount: 0.2 }}
      />
    </AspectRatio>
  );

  const copy = (
    <VStack gap={4} as="section" aria-labelledby={`home-showcase-${item.key}`}>
      <Text type="label" color="accent">
        {item.eyebrow}
      </Text>
      <Heading
        level={2}
        id={`home-showcase-${item.key}`}
        type="display-2"
        weight="bold"
        textWrap="balance"
      >
        {item.title}
      </Heading>
      <Text type="large" color="secondary">
        {item.body}
      </Text>
      <PublicLink href={item.href} isStandalone weight="semibold">
        <HStack gap={2}>
          {item.cta}
          <ArrowRight aria-hidden="true" />
        </HStack>
      </PublicLink>
    </VStack>
  );

  return (
    <CenteredSection variant={index % 2 === 0 ? "muted" : "transparent"}>
      <Grid columns={{ minWidth: 320, max: 2 }} gap={8} align="center">
        {index % 2 === 0 ? image : copy}
        {index % 2 === 0 ? copy : image}
      </Grid>
    </CenteredSection>
  );
}

/** SmartAIHub-owned public page pattern; Astryx remains an internal implementation detail. */
export function PublicHomeExperience({
  copy,
  supportingFeature,
}: {
  copy: PublicHomeExperienceCopy;
  supportingFeature?: ReactNode;
}) {
  return (
    <AstryxTheme theme={publicHomeTheme} mode="light">
      <>
        <CenteredSection variant="transparent">
          <Grid columns={{ minWidth: 320, max: 2 }} gap={8} align="start">
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

            <HeroProductEvidencePanel copy={copy} />
          </Grid>
        </CenteredSection>

        <Section variant="muted" padding={8}>
          <VStack gap={3}>
            <Text type="label" color="accent">
              {copy.showcaseEyebrow}
            </Text>
            <Heading
              level={2}
              type="display-2"
              weight="bold"
              textWrap="balance"
            >
              {copy.showcaseTitle}
            </Heading>
          </VStack>
        </Section>

        {copy.showcases.map((item, index) => (
          <ProductSpotlight key={item.key} item={item} index={index} />
        ))}

        <CenteredSection variant="section">
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
        </CenteredSection>

        <CenteredSection variant="muted">
          <VStack gap={6} as="section" aria-labelledby="home-why-title">
            <VStack gap={3}>
              <Text type="label" color="accent">
                {copy.whyEyebrow}
              </Text>
              <Heading
                level={2}
                id="home-why-title"
                type="display-2"
                weight="bold"
                textWrap="balance"
              >
                {copy.whyTitle}
              </Heading>
              <Text type="large" color="secondary">
                {copy.whyBody}
              </Text>
            </VStack>
            <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
              <ValueCard
                icon={MessageSquareText}
                title={copy.valueStartTitle}
                body={copy.valueStartBody}
              />
              <ValueCard
                icon={Video}
                title={copy.valueCreateTitle}
                body={copy.valueCreateBody}
              />
              <ValueCard
                icon={Compass}
                title={copy.valueContinueTitle}
                body={copy.valueContinueBody}
              />
            </Grid>
          </VStack>
        </CenteredSection>

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

        {supportingFeature}

        <CenteredSection variant="transparent">
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
        </CenteredSection>

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
