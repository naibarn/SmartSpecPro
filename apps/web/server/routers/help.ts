/**
 * Help tRPC Router
 *
 * Public procedures for serving help documentation content.
 * captureScreenshot is admin-only for capturing UI screenshots.
 */

import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import {
  getHelpManifest,
  getHelpTopic,
  getHelpSearchIndex,
  getContextualHelpTopics,
} from "../services/helpContentService";
import { SUPPORTED_LANGUAGES } from "../../shared/i18n";

export const helpRouter = router({
  getManifest: publicProcedure
    .input(z.object({ locale: z.enum(SUPPORTED_LANGUAGES).default("en") }))
    .query(async ({ input }) => getHelpManifest(input.locale)),

  getTopic: publicProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Invalid slug format"),
        locale: z.enum(SUPPORTED_LANGUAGES).default("en"),
      }),
    )
    .query(async ({ input }) => getHelpTopic(input.slug, input.locale)),

  getSearchIndex: publicProcedure
    .input(z.object({ locale: z.enum(SUPPORTED_LANGUAGES).default("en") }))
    .query(async ({ input }) => getHelpSearchIndex(input.locale)),

  getContextualTopics: publicProcedure
    .input(
      z.object({
        page: z.string().min(1).max(64).regex(/^[a-z0-9/-]+$/, "Invalid page identifier"),
        locale: z.enum(SUPPORTED_LANGUAGES).default("en"),
      }),
    )
    .query(async ({ input }) => getContextualHelpTopics(input.page, input.locale)),

  captureScreenshot: adminProcedure
    .input(
      z.object({
        url: z.string().url(),
        featureName: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-z0-9-]+$/),
        step: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-z0-9-]+$/),
        width: z.number().min(320).max(1920).default(1280),
        height: z.number().min(240).max(1080).default(720),
      }),
    )
    .mutation(async ({ input }) => {
      const proxyToken =
        process.env.SMARTSPEC_PROXY_TOKEN ||
        process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ||
        "";

      const response = await fetch(
        "http://localhost:8000/api/help/screenshot",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-token": proxyToken,
          },
          body: JSON.stringify({
            url: input.url,
            feature_name: input.featureName,
            step: input.step,
            width: input.width,
            height: input.height,
          }),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Screenshot capture failed: ${err}`);
      }

      const data = (await response.json()) as {
        base64?: string;
        url?: string;
        markdown?: string;
      };

      // If Python returned base64, store via Node storage
      if (data.base64) {
        const relKey = `help-assets/${input.featureName}/${input.step}.png`;
        const buffer = Buffer.from(data.base64, "base64");
        const { url } = await storagePut(relKey, buffer, "image/png");
        const markdown = `![${input.step}](${url})`;
        return { url, filename: `${input.step}.png`, markdown };
      }

      // Python already stored and returned URL
      return {
        url: data.url ?? "",
        filename: `${input.step}.png`,
        markdown: data.markdown ?? "",
      };
    }),
});
