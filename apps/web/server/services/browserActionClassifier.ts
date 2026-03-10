import type { BrowserActionClass } from "../../shared/browserPolicy";

export interface BrowserActionClassificationInput {
  actionType: string;
  targetOrigin?: string | null;
  currentOrigin?: string | null;
  writesData?: boolean;
  touchesClipboard?: boolean;
  transfersExternally?: boolean;
}

export interface BrowserActionClassificationResult {
  actionClass: BrowserActionClass;
  confidence: number;
  reasonCodes: string[];
}

const READ_ACTIONS = new Set([
  "goto",
  "navigate",
  "open_page",
  "read_text",
  "extract_data",
  "screenshot",
  "hover",
  "scroll",
]);

const DRAFT_ACTIONS = new Set([
  "fill",
  "type",
  "select",
  "draft_message",
  "set_input",
]);

const COMMIT_ACTIONS = new Set([
  "click_submit",
  "submit_form",
  "confirm",
  "purchase",
  "send_message",
  "click_primary_cta",
]);

const RESTRICTED_ACTIONS = new Set([
  "download",
  "upload",
  "clipboard_read",
  "clipboard_write",
  "external_send",
  "permission_prompt",
  "file_picker",
  "certificate_warning",
]);

export function classifyBrowserAction(
  input: BrowserActionClassificationInput,
): BrowserActionClassificationResult {
  const normalizedType = input.actionType.trim().toLowerCase();
  const reasonCodes: string[] = [];

  if (RESTRICTED_ACTIONS.has(normalizedType) || input.touchesClipboard || input.transfersExternally) {
    reasonCodes.push("restricted_action");
    return { actionClass: "restricted", confidence: 0.98, reasonCodes };
  }

  if (COMMIT_ACTIONS.has(normalizedType) || input.writesData) {
    reasonCodes.push("commit_action");
    return { actionClass: "commit", confidence: 0.95, reasonCodes };
  }

  if (DRAFT_ACTIONS.has(normalizedType)) {
    reasonCodes.push("draft_action");
    return { actionClass: "draft", confidence: 0.92, reasonCodes };
  }

  if (READ_ACTIONS.has(normalizedType)) {
    reasonCodes.push("read_action");
    return { actionClass: "read", confidence: 0.99, reasonCodes };
  }

  reasonCodes.push("unknown_action_type");
  return { actionClass: "read", confidence: 0.35, reasonCodes };
}
