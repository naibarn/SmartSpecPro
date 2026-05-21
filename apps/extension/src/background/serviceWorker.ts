declare const chrome: any;

const DEVICE_ID_KEY = "deviceId";

function randomHex(bytes: number) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getOrCreateDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get([DEVICE_ID_KEY]);
  const existing = String(result[DEVICE_ID_KEY] || "");
  if (/^mdev_[a-f0-9]{64}$/.test(existing)) return existing;
  const next = `mdev_${randomHex(32)}`;
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: next });
  return next;
}

function isAllowedExternalSender(url: string | undefined) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (
      parsed.hostname === "smartaihub.app"
      || parsed.hostname.endsWith(".smartaihub.app")
      || parsed.hostname.endsWith(".smartspec.pro")
    );
  } catch {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: (response: any) => void) => {
  if (message?.type !== "CAPTURE_VISIBLE_TAB") return false;
  chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl: string) => {
    if (chrome.runtime.lastError) {
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ ok: true, dataUrl });
  });
  return true;
});

chrome.runtime.onMessageExternal.addListener((message: any, sender: any, sendResponse: (response: any) => void) => {
  if (message?.type !== "SMARTAIHUB_MARKETPLACE_EXTENSION_TOKEN") return false;
  if (!isAllowedExternalSender(sender?.url)) {
    sendResponse({ ok: false, error: "external_sender_not_allowed" });
    return true;
  }
  void (async () => {
    const token = String(message.accessToken || "").trim();
    const tokenExpiresAt = String(message.expiresAt || "").trim();
    const baseUrl = String(message.baseUrl || "https://smartaihub.app").replace(/\/$/, "");
    const messageDeviceId = String(message.deviceId || "").trim();
    const localDeviceId = await getOrCreateDeviceId();
    if (!token || !tokenExpiresAt) {
      sendResponse({ ok: false, error: "missing_token" });
      return;
    }
    if (messageDeviceId !== localDeviceId) {
      sendResponse({ ok: false, error: "device_binding_mismatch" });
      return;
    }
    chrome.storage.local.set({ baseUrl, token, tokenExpiresAt }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true });
    });
  })().catch((error) => sendResponse({ ok: false, error: error?.message || "token_store_failed" }));
  return true;
});
