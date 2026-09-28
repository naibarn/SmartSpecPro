import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { userOwnershipProfiles, users } from "../../drizzle/schema";
import { normalizeAuthEmail } from "./emailNormalization";

const E164_PHONE = /^\+[1-9][0-9]{7,14}$/;
const ISO_COUNTRY_CODE = /^[A-Z]{2}$/;

const emptyStringToNull = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? null : value;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalEmail = z.preprocess(
  emptyStringToNull,
  z.string().trim().email().max(320).nullable().optional(),
);
const optionalPhone = z.preprocess(
  emptyStringToNull,
  z.string().trim().regex(E164_PHONE, "Use an E.164 phone number, for example +14155552671").nullable().optional(),
);
const optionalCountryCode = z.preprocess(
  emptyStringToNull,
  z.string().trim().toUpperCase().regex(ISO_COUNTRY_CODE, "Use an ISO 3166-1 alpha-2 country code").nullable().optional(),
);

export const userProfileUpdateSchema = z.object({
  firstName: optionalText(120),
  lastName: optionalText(120),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  contactAddressLine1: optionalText(255),
  contactAddressLine2: optionalText(255),
  contactCity: optionalText(120),
  contactStateOrProvince: optionalText(120),
  contactPostalCode: optionalText(32),
  contactCountryCode: optionalCountryCode,
});

const ownershipUrl = z
  .preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((value) => /^https?:\/\//i.test(value), "Use an http or https URL")
      .nullable()
      .optional(),
  );

export const ownershipProfileUpdateSchema = z.object({
  ownerType: z.enum(["individual", "company", "organization", "brand", "other"]).nullable().optional(),
  legalName: optionalText(255),
  displayName: optionalText(255),
  countryCode: optionalCountryCode,
  addressLine1: optionalText(255),
  addressLine2: optionalText(255),
  city: optionalText(120),
  stateOrProvince: optionalText(120),
  postalCode: optionalText(32),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  primaryChannelName: optionalText(255),
  primaryChannelUrl: ownershipUrl,
  websiteUrl: ownershipUrl,
  licenseDisplayName: optionalText(255),
  copyrightNotice: optionalText(500),
  watermarkText: optionalText(255),
  attributionText: optionalText(500),
});

export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;
export type OwnershipProfileUpdate = z.infer<typeof ownershipProfileUpdateSchema>;

function emptyToNull(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function normalizeProfileInput(input: UserProfileUpdate): UserProfileUpdate {
  return {
    ...input,
    firstName: emptyToNull(input.firstName),
    lastName: emptyToNull(input.lastName),
    contactEmail: input.contactEmail ? normalizeAuthEmail(input.contactEmail) : null,
    contactPhone: emptyToNull(input.contactPhone),
    contactAddressLine1: emptyToNull(input.contactAddressLine1),
    contactAddressLine2: emptyToNull(input.contactAddressLine2),
    contactCity: emptyToNull(input.contactCity),
    contactStateOrProvince: emptyToNull(input.contactStateOrProvince),
    contactPostalCode: emptyToNull(input.contactPostalCode),
    contactCountryCode: input.contactCountryCode ? input.contactCountryCode.toUpperCase() : null,
  };
}

export function normalizeOwnershipProfileInput(input: OwnershipProfileUpdate): OwnershipProfileUpdate {
  return {
    ...input,
    ownerType: input.ownerType ?? null,
    legalName: emptyToNull(input.legalName),
    displayName: emptyToNull(input.displayName),
    countryCode: input.countryCode ? input.countryCode.toUpperCase() : null,
    addressLine1: emptyToNull(input.addressLine1),
    addressLine2: emptyToNull(input.addressLine2),
    city: emptyToNull(input.city),
    stateOrProvince: emptyToNull(input.stateOrProvince),
    postalCode: emptyToNull(input.postalCode),
    contactEmail: input.contactEmail ? normalizeAuthEmail(input.contactEmail) : null,
    contactPhone: emptyToNull(input.contactPhone),
    primaryChannelName: emptyToNull(input.primaryChannelName),
    primaryChannelUrl: emptyToNull(input.primaryChannelUrl),
    websiteUrl: emptyToNull(input.websiteUrl),
    licenseDisplayName: emptyToNull(input.licenseDisplayName),
    copyrightNotice: emptyToNull(input.copyrightNotice),
    watermarkText: emptyToNull(input.watermarkText),
    attributionText: emptyToNull(input.attributionText),
  };
}

export async function getUserProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [profile] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      contactEmail: users.contactEmail,
      contactPhone: users.contactPhone,
      contactAddressLine1: users.contactAddressLine1,
      contactAddressLine2: users.contactAddressLine2,
      contactCity: users.contactCity,
      contactStateOrProvince: users.contactStateOrProvince,
      contactPostalCode: users.contactPostalCode,
      contactCountryCode: users.contactCountryCode,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!profile) throw new Error("User not found");
  return profile;
}

export async function updateUserProfile(userId: number, rawInput: UserProfileUpdate) {
  const input = normalizeProfileInput(userProfileUpdateSchema.parse(rawInput));
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!current) throw new Error("User not found");

    const nextName = [input.firstName, input.lastName].filter(Boolean).join(" ") || current.name || null;
    await tx
      .update(users)
      .set({
        ...input,
        name: nextName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });

  return getUserProfile(userId);
}

export async function getOwnershipProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [profile] = await db
    .select()
    .from(userOwnershipProfiles)
    .where(eq(userOwnershipProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}

/**
 * Read-only metadata boundary for future license and watermark consumers.
 * User-entered values are attribution metadata, not a legal verification.
 */
export async function getDigitalOwnershipMetadata(userId: number) {
  const profile = await getOwnershipProfile(userId);
  if (!profile) return null;
  return {
    ownerType: profile.ownerType,
    legalName: profile.legalName,
    displayName: profile.displayName,
    countryCode: profile.countryCode,
    primaryChannelName: profile.primaryChannelName,
    primaryChannelUrl: profile.primaryChannelUrl,
    websiteUrl: profile.websiteUrl,
    licenseDisplayName: profile.licenseDisplayName,
    copyrightNotice: profile.copyrightNotice,
    watermarkText: profile.watermarkText,
    attributionText: profile.attributionText,
  };
}

export async function updateOwnershipProfile(userId: number, rawInput: OwnershipProfileUpdate) {
  const input = normalizeOwnershipProfileInput(ownershipProfileUpdateSchema.parse(rawInput));
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(userOwnershipProfiles)
    .values({ userId, ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userOwnershipProfiles.userId,
      set: { ...input, updatedAt: sql`CURRENT_TIMESTAMP` },
    });

  return getOwnershipProfile(userId);
}
