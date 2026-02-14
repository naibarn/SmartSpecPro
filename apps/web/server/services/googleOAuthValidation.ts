/**
 * Google OAuth credential validation utilities.
 * Shared between the systemSettings router and tests.
 */

export function validateGoogleOAuthFormat(
  clientId: string,
  clientSecret: string
): { valid: boolean; message: string } {
  if (!clientId) {
    return { valid: false, message: "Google Client ID is not configured" };
  }
  if (!clientSecret) {
    return { valid: false, message: "Google Client Secret is not configured" };
  }
  if (!clientId.endsWith(".apps.googleusercontent.com")) {
    return {
      valid: false,
      message:
        "Google Client ID format is invalid — expected *.apps.googleusercontent.com",
    };
  }
  return { valid: true, message: "Credentials format is valid" };
}
