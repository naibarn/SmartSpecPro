import {
  AuthenticatedMediaImage,
  fetchAuthenticatedMedia,
  getAuthenticatedMediaUrl,
  openAuthenticatedMedia,
} from "@/components/media/AuthenticatedMediaImage";
import type { ComponentProps } from "react";

export { AuthenticatedMediaImage };

export function getAuthenticatedAttachmentUrl(
  url: string | null | undefined
): string | null {
  return getAuthenticatedMediaUrl(url);
}

/**
 * Fetches protected attachments through the app's fetch interceptor.
 * This is required because a plain <img src="..."> cannot carry the desktop
 * Bearer token, while window.fetch can attach it (and browser cookies).
 */
export async function fetchAuthenticatedAttachment(url: string): Promise<Blob> {
  return fetchAuthenticatedMedia(url);
}

export async function openAuthenticatedAttachment(
  url: string | null | undefined
): Promise<void> {
  return openAuthenticatedMedia(url);
}

export function AuthenticatedAttachmentImage(
  props: ComponentProps<typeof AuthenticatedMediaImage>,
) {
  return (
    <AuthenticatedMediaImage
      {...props}
      loadingLabel="กำลังโหลดภาพแนบ..."
      errorLabel="ไม่สามารถโหลดภาพแนบได้"
    />
  );
}
