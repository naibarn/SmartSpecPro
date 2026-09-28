import { describe, expect, it } from "vitest";
import {
  normalizeOwnershipProfileInput,
  normalizeProfileInput,
  ownershipProfileUpdateSchema,
  userProfileUpdateSchema,
} from "./profileOwnershipService";

describe("profile ownership validation", () => {
  it("normalizes contact email, country codes, and blank profile fields", () => {
    const input = userProfileUpdateSchema.parse({
      firstName: " Ada ",
      lastName: " Lovelace ",
      contactEmail: "  ADA@EXAMPLE.COM ",
      contactCountryCode: "gb",
      contactPhone: "+441234567890",
      contactAddressLine1: " ",
    });

    expect(normalizeProfileInput(input)).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      contactEmail: "ada@example.com",
      contactCountryCode: "GB",
      contactAddressLine1: null,
    });
  });

  it("requires E.164 phones and ISO alpha-2 country codes", () => {
    expect(userProfileUpdateSchema.safeParse({ contactPhone: "0812345678" }).success).toBe(false);
    expect(userProfileUpdateSchema.safeParse({ contactCountryCode: "USA" }).success).toBe(false);
    expect(ownershipProfileUpdateSchema.safeParse({ countryCode: "US", contactPhone: "+14155552671" }).success).toBe(true);
    expect(userProfileUpdateSchema.safeParse({ contactEmail: "", contactPhone: "", contactCountryCode: "" }).success).toBe(true);
  });

  it("accepts only http and https channel URLs", () => {
    expect(ownershipProfileUpdateSchema.safeParse({ primaryChannelUrl: "https://example.com/channel" }).success).toBe(true);
    expect(ownershipProfileUpdateSchema.safeParse({ primaryChannelUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("normalizes ownership blanks without changing the ownership category", () => {
    const input = ownershipProfileUpdateSchema.parse({ ownerType: "brand", displayName: "  Official Brand  " });
    expect(normalizeOwnershipProfileInput(input)).toMatchObject({ ownerType: "brand", displayName: "Official Brand" });
  });
});
