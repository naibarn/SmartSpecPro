import type { ReactNode } from "react";
import { Link as RouterLink } from "wouter";
import { BookOpen, Clapperboard, LifeBuoy, Sparkles } from "lucide-react";
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
  flagshipEyebrow: string;
  flagshipTitle: string;
  flagshipBody: string;
  flagshipCta: string;
  productTitle: string;
  productBody: string;
  resourcesTitle: string;
  featuresLink: string;
  docsLink: string;
  contactLink: string;
};

/** SmartAIHub-owned public page pattern; Astryx remains an internal implementation detail. */
export function PublicHomeExperience({
  copy,
  afterHero,
}: {
  copy: PublicHomeExperienceCopy;
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

          <Section variant="muted" padding={6}>
            <VStack gap={3} as="section" aria-labelledby="home-flagship-title">
              <Clapperboard aria-hidden="true" />
              <Text type="label" color="accent">
                {copy.flagshipEyebrow}
              </Text>
              <Heading
                level={2}
                id="home-flagship-title"
                type="display-3"
                weight="bold"
              >
                {copy.flagshipTitle}
              </Heading>
              <Text color="secondary">{copy.flagshipBody}</Text>
              <Button
                label={copy.flagshipCta}
                variant="primary"
                size="lg"
                href="/login?returnUrl=%2Fdrama-series"
                as={RouterLink}
              />
            </VStack>
          </Section>
        </Grid>
      </Section>

      {afterHero}

      <Section variant="section" padding={8} dividers={["top", "bottom"]}>
        <VStack gap={5}>
          <VStack gap={2} hAlign="center">
            <Heading level={2} type="display-3" weight="bold">
              {copy.productTitle}
            </Heading>
            <Text type="large" color="secondary" justify="center">
              {copy.productBody}
            </Text>
          </VStack>
          <nav aria-label={copy.resourcesTitle}>
            <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
              <Card>
                <VStack gap={3}>
                  <Sparkles aria-hidden="true" />
                  <PublicLink href="/features" isStandalone weight="semibold">
                    {copy.featuresLink}
                  </PublicLink>
                </VStack>
              </Card>
              <Card>
                <VStack gap={3}>
                  <BookOpen aria-hidden="true" />
                  <PublicLink href="/docs" isStandalone weight="semibold">
                    {copy.docsLink}
                  </PublicLink>
                </VStack>
              </Card>
              <Card>
                <VStack gap={3}>
                  <LifeBuoy aria-hidden="true" />
                  <PublicLink href="/contact" isStandalone weight="semibold">
                    {copy.contactLink}
                  </PublicLink>
                </VStack>
              </Card>
            </Grid>
          </nav>
        </VStack>
      </Section>
    </>
  );
}
