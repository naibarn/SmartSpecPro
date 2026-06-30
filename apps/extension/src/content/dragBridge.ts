declare const chrome: any;

export {};

(() => {
  const globalScope = globalThis as typeof globalThis & {
    __smartAIHubDragBridgeInstalled?: boolean;
    __smartAIHubDragBridgeRefresh?: () => void;
  };
  if (globalScope.__smartAIHubDragBridgeInstalled) {
    globalScope.__smartAIHubDragBridgeRefresh?.();
    return;
  }
  globalScope.__smartAIHubDragBridgeInstalled = true;

  const SMARTAIHUB_DRAG_MEDIA_MIME = "application/x-smartaihub-drag-media-id";
  const SMARTAIHUB_DIAGNOSTIC_LOG_KEY = "smartaihubDiagnosticLogs";
  const SMARTAIHUB_DIAGNOSTIC_LOG_LIMIT = 200;

  let activeDragMediaId: string | null = null;
  const bridgedDragEvents = new WeakSet<DragEvent>();
  const dragMediaFileCache = new Map<string, Promise<File | null>>();
  let lastDragPreviewKey = "";
  let lastDragPreviewAt = 0;

  function compactLogValue(value: unknown): unknown {
    if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
    if (Array.isArray(value)) return value.slice(0, 20).map(compactLogValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [key, compactLogValue(item)]));
    }
    return value;
  }

  async function recordDiagnosticLog(event: string, details: Record<string, unknown> = {}) {
    try {
      const result = await chrome.storage.local.get([SMARTAIHUB_DIAGNOSTIC_LOG_KEY]);
      const existing = Array.isArray(result[SMARTAIHUB_DIAGNOSTIC_LOG_KEY]) ? result[SMARTAIHUB_DIAGNOSTIC_LOG_KEY] : [];
      const entry = {
        at: new Date().toISOString(),
        source: "drag_bridge",
        host: location.hostname,
        path: location.pathname,
        frameUrl: location.href,
        topFrame: window.top === window,
        event,
        details: compactLogValue(details),
      };
      await chrome.storage.local.set({ [SMARTAIHUB_DIAGNOSTIC_LOG_KEY]: [...existing, entry].slice(-SMARTAIHUB_DIAGNOSTIC_LOG_LIMIT) });
    } catch {
      // Diagnostics must never interrupt drag workflows.
    }
  }

  function dataUrlToFile(dataUrl: string, name: string, type: string) {
    const [header, base64] = dataUrl.split(",");
    const mime = type || header.match(/data:(.*?);base64/)?.[1] || "application/octet-stream";
    const bytes = atob(base64 || "");
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
    return new File([array], name || "smartaihub-media", { type: mime });
  }

  async function chunkedDragMediaFileFromBackground(id: string, name: string, type: string) {
    let chunks: string[] = [];
    let count = 0;
    do {
      const response = await chrome.runtime.sendMessage({ type: "SMARTAIHUB_GET_DRAG_MEDIA_CHUNK", id, index: chunks.length }).catch(() => null);
      if (!response?.ok) return null;
      if (typeof response.chunk === "string") chunks.push(response.chunk);
      count = Number(response.count) || chunks.length;
      name = response.name || name;
      type = response.type || type;
    } while (chunks.length < count);
    return dataUrlToFile(`data:${type || "application/octet-stream"};base64,${chunks.join("")}`, name, type);
  }

  function isLikelyUploadElement(element: Element | null): element is HTMLElement {
    if (!(element instanceof HTMLElement)) return false;
    const text = [
      element.getAttribute("aria-label"),
      element.getAttribute("data-testid"),
      element.getAttribute("role"),
      typeof element.className === "string" ? element.className : "",
      element.textContent,
    ].join(" ").toLowerCase();
    return /upload|drop|file|image|media|reference|start|end|frame|drag|วาง|อัปโหลด|อัพโหลด|ลาก/.test(text);
  }

  function findUploadTarget(start: EventTarget | null): HTMLElement {
    const element = start instanceof Element ? start : document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const explicit = element?.closest?.("input[type='file'], [data-testid*='upload' i], [aria-label*='upload' i], [role='button'], button, label");
    if (explicit instanceof HTMLElement) return explicit;
    let current: Element | null | undefined = element;
    while (current && current !== document.body) {
      if (isLikelyUploadElement(current)) return current;
      current = current.parentElement;
    }
    return element instanceof HTMLElement ? element : document.body || document.documentElement;
  }

  function freshFileList(files: FileList) {
    const transfer = new DataTransfer();
    for (const file of Array.from(files)) transfer.items.add(file);
    return transfer.files;
  }

  function setFileInputFiles(input: HTMLInputElement, files: FileList) {
    try {
      const nextFiles = freshFileList(files);
      input.value = "";
      input.files = nextFiles;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return (input.files?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  function describeFileInput(input: HTMLInputElement | null) {
    if (!input) return null;
    return {
      accept: input.accept || "",
      disabled: input.disabled,
      hidden: input.hidden,
      multiple: input.multiple,
      filesLength: input.files?.length ?? 0,
      id: input.id || "",
      name: input.name || "",
      ariaLabel: input.getAttribute("aria-label") || "",
      className: typeof input.className === "string" ? input.className : "",
    };
  }

  function fileInputAcceptsFile(input: HTMLInputElement, file: File | undefined) {
    const accept = input.accept.toLowerCase().split(",").map((item) => item.trim()).filter(Boolean);
    if (!accept.length || !file) return true;
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    return accept.some((item) => {
      if (item === type) return true;
      if (item.endsWith("/*")) return type.startsWith(item.slice(0, -1));
      if (item.startsWith(".")) return name.endsWith(item);
      return false;
    });
  }

  function findNearestFileInput(target: HTMLElement, files: FileList) {
    const candidates = Array.from(new Set<HTMLInputElement>([
      ...(target instanceof HTMLInputElement && target.type === "file" ? [target] : []),
      ...Array.from(target.querySelectorAll?.("input[type='file']") ?? []) as HTMLInputElement[],
      ...Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']")),
    ]));
    return candidates.find((input) => fileInputAcceptsFile(input, files[0])) || candidates[0] || null;
  }

  function setNearestFileInput(target: HTMLElement, files: FileList) {
    const nearby = findNearestFileInput(target, files);
    if (!nearby) return false;
    return setFileInputFiles(nearby, files);
  }

  function setNearestFileInputDetailed(target: HTMLElement, files: FileList) {
    const input = findNearestFileInput(target, files);
    if (!input) return { inputSet: false, input: null };
    const inputSet = setFileInputFiles(input, files);
    return { inputSet, input: describeFileInput(input) };
  }

  function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isGoogleFlowShellHost(hostname: string) {
    return hostname === "labs.google"
      || hostname.endsWith(".labs.google")
      || hostname === "flow.google"
      || hostname.endsWith(".flow.google");
  }

  function isGoogleFlowContext() {
    const hostname = location.hostname.toLowerCase();
    if (isGoogleFlowShellHost(hostname)) return true;
    if (!hostname.endsWith(".google.com")) return false;
    try {
      return isGoogleFlowShellHost(new URL(document.referrer).hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  function isMagnificHost(hostname: string) {
    return hostname === "magnific.ai"
      || hostname.endsWith(".magnific.ai")
      || hostname === "magnific.com"
      || hostname.endsWith(".magnific.com");
  }

  function isHiggsfieldHost(hostname: string) {
    return hostname === "higgsfield.ai"
      || hostname.endsWith(".higgsfield.ai");
  }

  function isFacebookHost(hostname: string) {
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  }

  function isFacebookContext() {
    return isFacebookHost(location.hostname.toLowerCase());
  }

  function isTikTokStudioContext() {
    return location.hostname.toLowerCase() === "www.tiktok.com" && location.pathname.startsWith("/tiktokstudio");
  }

  function isSocialUploadContext() {
    return isFacebookContext() || isTikTokStudioContext();
  }

  function canUseFileInputFallback(target: HTMLElement, files: FileList) {
    const hostname = location.hostname.toLowerCase();
    if (isGoogleFlowContext()) return Boolean(findNearestFileInput(target, files));
    if (target instanceof HTMLInputElement && target.type === "file") return true;
    if (isFacebookHost(hostname) || isTikTokStudioContext()) return Boolean(findNearestFileInput(target, files));
    return isMagnificHost(hostname) && Boolean(findNearestFileInput(target, files));
  }

  function dataTransferTypes(event: DragEvent) {
    try {
      return Array.from(event.dataTransfer?.types ?? []).map((type) => String(type).toLowerCase());
    } catch {
      return [];
    }
  }

  function fileFromDragEvent(event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    const directFile = files.find((file) => file.type.startsWith("image/") || file.type.startsWith("video/")) || files[0];
    if (directFile) return directFile;
    try {
      const items = Array.from(event.dataTransfer?.items ?? []);
      for (const item of items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) return file;
      }
    } catch {
      // Some pages expose a partial DataTransfer facade during cross-window drags.
    }
    return null;
  }

  function hasBridgePayload(event: DragEvent) {
    return dataTransferTypes(event).includes(SMARTAIHUB_DRAG_MEDIA_MIME) || Boolean(activeDragMediaId);
  }

  function isBridgeTargetHost() {
    const hostname = location.hostname.toLowerCase();
    return isGoogleFlowContext() || isMagnificHost(hostname) || isHiggsfieldHost(hostname) || isFacebookHost(hostname) || isTikTokStudioContext();
  }

  function isPotentialFileDrag(event: DragEvent) {
    const types = dataTransferTypes(event);
    return types.includes("files") || types.includes(SMARTAIHUB_DRAG_MEDIA_MIME) || types.length === 0;
  }

  function dispatchFileDragEvents(target: HTMLElement, file: File, originalEvent: DragEvent, types: Array<"dragenter" | "dragover" | "dragleave" | "dragend" | "drop">) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const eventTargets = Array.from(new Set<EventTarget>([target, document, window]));
    let dropWasHandled = false;
    for (const type of types) {
      const targetsForType = type === "drop" ? [target] : eventTargets;
      for (const eventTarget of targetsForType) {
        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: originalEvent.clientX,
          clientY: originalEvent.clientY,
          dataTransfer: transfer,
        });
        bridgedDragEvents.add(event);
        const wasNotCanceled = eventTarget.dispatchEvent(event);
        if (type === "drop" && !wasNotCanceled) dropWasHandled = true;
      }
    }
    if (types.includes("drop") && !dropWasHandled && canUseFileInputFallback(target, transfer.files)) {
      setNearestFileInput(target, transfer.files);
    }
  }

  async function dispatchGoogleFlowDragCleanup(target: HTMLElement, file: File, originalEvent: DragEvent) {
    await delay(40);
    dispatchFileDragEvents(target, file, originalEvent, ["dragleave", "dragend"]);
  }

  function deliverMagnificFileDrop(target: HTMLElement, file: File, originalEvent: DragEvent) {
    dispatchFileDragEvents(target, file, originalEvent, ["dragenter", "dragover"]);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const inputSet = setNearestFileInput(target, transfer.files);
    if (!inputSet) {
      dispatchFileDragEvents(target, file, originalEvent, ["drop"]);
    }
    void recordDiagnosticLog("magnific_drag_delivery", {
      strategy: inputSet ? "file_input_first" : "synthetic_drop_fallback",
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      targetTag: target.tagName,
      targetClass: typeof target.className === "string" ? target.className : "",
    });
    return inputSet;
  }

  async function deliverGoogleFlowFileDrop(target: HTMLElement, file: File, originalEvent: DragEvent) {
    dispatchFileDragEvents(target, file, originalEvent, ["dragenter", "dragover"]);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const initial = setNearestFileInputDetailed(target, transfer.files);
    let inputSet = initial.inputSet;
    let inputDetails = initial.input;
    let retryUsed = false;
    if (!inputSet) {
      await delay(80);
      const retry = setNearestFileInputDetailed(target, transfer.files);
      inputSet = retry.inputSet;
      inputDetails = retry.input || inputDetails;
      retryUsed = true;
    }
    if (!inputSet) {
      dispatchFileDragEvents(target, file, originalEvent, ["drop"]);
    } else {
      await dispatchGoogleFlowDragCleanup(target, file, originalEvent);
    }
    void recordDiagnosticLog("google_flow_drag_delivery", {
      strategy: inputSet ? "file_input_after_preview" : "synthetic_drop_fallback",
      fallbackStep: retryUsed ? "file_input_retry" : "file_input_initial",
      cleanupStep: inputSet ? "dragleave_dragend" : "drop",
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      targetTag: target.tagName,
      targetClass: typeof target.className === "string" ? target.className : "",
      fileInputCount: document.querySelectorAll("input[type='file']").length,
      fileInput: inputDetails,
    });
    return inputSet;
  }

  async function deliverHiggsfieldFileDrop(target: HTMLElement, file: File, originalEvent: DragEvent) {
    dispatchFileDragEvents(target, file, originalEvent, ["dragenter", "dragover"]);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const initial = setNearestFileInputDetailed(target, transfer.files);
    let inputSet = initial.inputSet;
    let inputDetails = initial.input;
    let retryUsed = false;
    if (!inputSet) {
      await delay(120);
      const retry = setNearestFileInputDetailed(target, transfer.files);
      inputSet = retry.inputSet;
      inputDetails = retry.input || inputDetails;
      retryUsed = true;
    }
    if (!inputSet) {
      dispatchFileDragEvents(target, file, originalEvent, ["drop"]);
    } else {
      await dispatchGoogleFlowDragCleanup(target, file, originalEvent);
    }
    void recordDiagnosticLog("higgsfield_drag_delivery", {
      strategy: inputSet ? "file_input_after_preview" : "synthetic_drop_fallback",
      fallbackStep: retryUsed ? "file_input_retry" : "file_input_initial",
      cleanupStep: inputSet ? "dragleave_dragend" : "drop",
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      targetTag: target.tagName,
      targetClass: typeof target.className === "string" ? target.className : "",
      fileInputCount: document.querySelectorAll("input[type='file']").length,
      fileInput: inputDetails,
    });
    return inputSet;
  }

  function findFacebookPhotoVideoButton(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("[role='button'], button, label, [aria-label], [data-testid]"));
    return candidates.find((element) => {
      const text = [
        element.getAttribute("aria-label"),
        element.getAttribute("data-testid"),
        element.textContent,
      ].join(" ").toLowerCase();
      return /photo\/video|photo|video|media|รูปภาพ|วิดีโอ|วีดีโอ/.test(text);
    }) ?? null;
  }

  async function waitForNearestFileInput(target: HTMLElement, files: FileList, attempts = 10, intervalMs = 180) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const input = findNearestFileInput(target, files);
      if (input) return input;
      await delay(intervalMs);
    }
    return null;
  }

  async function setFacebookComposerFileInput(target: HTMLElement, files: FileList) {
    const existing = findNearestFileInput(target, files);
    if (existing) {
      return { inputSet: setFileInputFiles(existing, files), input: describeFileInput(existing), activated: false };
    }
    const button = findFacebookPhotoVideoButton();
    if (button) {
      button.click();
      await delay(250);
    }
    const input = await waitForNearestFileInput(target, files, 12, 220);
    if (!input) return { inputSet: false, input: null, activated: Boolean(button) };
    return { inputSet: setFileInputFiles(input, files), input: describeFileInput(input), activated: Boolean(button) };
  }

  async function deliverSocialFileDrop(target: HTMLElement, file: File, originalEvent: DragEvent) {
    dispatchFileDragEvents(target, file, originalEvent, ["dragenter", "dragover"]);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const initial = isFacebookContext()
      ? await setFacebookComposerFileInput(target, transfer.files)
      : setNearestFileInputDetailed(target, transfer.files);
    let inputSet = initial.inputSet;
    let inputDetails = initial.input;
    const activatedUploadControl = "activated" in initial ? initial.activated : false;
    let retryUsed = false;
    if (!inputSet) {
      await delay(120);
      const retry = isFacebookContext()
        ? await setFacebookComposerFileInput(target, transfer.files)
        : setNearestFileInputDetailed(target, transfer.files);
      inputSet = retry.inputSet;
      inputDetails = retry.input || inputDetails;
      retryUsed = true;
    }
    if (!inputSet) {
      dispatchFileDragEvents(target, file, originalEvent, ["drop"]);
    } else {
      await dispatchGoogleFlowDragCleanup(target, file, originalEvent);
    }
    void recordDiagnosticLog("social_video_drag_delivery", {
      host: location.hostname,
      path: location.pathname,
      strategy: inputSet ? "file_input_after_preview" : "synthetic_drop_fallback",
      fallbackStep: retryUsed ? "file_input_retry" : "file_input_initial",
      activatedUploadControl,
      cleanupStep: inputSet ? "dragleave_dragend" : "drop",
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      targetTag: target.tagName,
      targetClass: typeof target.className === "string" ? target.className : "",
      fileInputCount: document.querySelectorAll("input[type='file']").length,
      fileInput: inputDetails,
    });
    return inputSet;
  }

  function eventDragMediaId(event: DragEvent): string {
    try {
      return event.dataTransfer?.getData(SMARTAIHUB_DRAG_MEDIA_MIME) || activeDragMediaId || "";
    } catch {
      return activeDragMediaId || "";
    }
  }

  async function activeDragMediaIdFromBackground(): Promise<string> {
    if (activeDragMediaId) return activeDragMediaId;
    const response = await chrome.runtime.sendMessage({ type: "SMARTAIHUB_GET_ACTIVE_DRAG_MEDIA" }).catch(() => null);
    return response?.ok && response.id ? String(response.id) : "";
  }

  function refreshActiveDragMedia() {
    void chrome.runtime.sendMessage({ type: "SMARTAIHUB_GET_ACTIVE_DRAG_MEDIA" })
      .then((response: any) => {
        activeDragMediaId = response?.ok && response.id ? String(response.id) : null;
        lastDragPreviewKey = "";
        if (!activeDragMediaId) dragMediaFileCache.clear();
      })
      .catch(() => undefined);
  }

  function dragMediaFileFromBackground(id: string): Promise<File | null> {
    const existing = dragMediaFileCache.get(id);
    if (existing) return existing;
    const pending = chrome.runtime.sendMessage({ type: "SMARTAIHUB_GET_DRAG_MEDIA", id })
      .then((response: any) => {
        if (response?.ok && response.dataUrl) return dataUrlToFile(response.dataUrl, response.name, response.type);
        if (response?.ok && response.chunked) return chunkedDragMediaFileFromBackground(id, response.name || "smartaihub-media", response.type || "application/octet-stream");
        return null;
      })
      .catch(() => null);
    dragMediaFileCache.set(id, pending);
    return pending;
  }

  function finishSmartAIHubDrag(id: string) {
    activeDragMediaId = null;
    lastDragPreviewKey = "";
    dragMediaFileCache.delete(id);
    void chrome.runtime.sendMessage({ type: "SMARTAIHUB_COMPLETE_DRAG_MEDIA", id }).catch(() => undefined);
  }

  async function replaySmartAIHubDragPreview(event: DragEvent, id: string) {
    const target = findUploadTarget(event.target);
    const now = performance.now();
    const key = `${id}:${event.type}:${Math.round(event.clientX / 12)}:${Math.round(event.clientY / 12)}`;
    if (event.type === "dragover" && key === lastDragPreviewKey && now - lastDragPreviewAt < 120) return;
    lastDragPreviewKey = key;
    lastDragPreviewAt = now;
    const file = await dragMediaFileFromBackground(id) || fileFromDragEvent(event);
    if (!file) return;
    if (!activeDragMediaId && !dataTransferTypes(event).includes(SMARTAIHUB_DRAG_MEDIA_MIME)) return;
    dispatchFileDragEvents(target, file, event, event.type === "dragenter" ? ["dragenter", "dragover"] : ["dragover"]);
  }

  function primeSmartAIHubDrop(event: DragEvent) {
    if (bridgedDragEvents.has(event)) return;
    const bridgePayload = hasBridgePayload(event);
    const id = eventDragMediaId(event);
    if (!id) {
      const reservePotentialBridgeDrop = isBridgeTargetHost() && isPotentialFileDrag(event);
      const passiveSocialFileDrop = isSocialUploadContext() && reservePotentialBridgeDrop && !bridgePayload;
      if ((bridgePayload || reservePotentialBridgeDrop) && !passiveSocialFileDrop) {
        event.preventDefault();
        if (bridgePayload) event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }
      void activeDragMediaIdFromBackground().then((activeId) => {
        if (!activeId) return;
        activeDragMediaId = activeId;
        void replaySmartAIHubDragPreview(event, activeId);
      });
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    void replaySmartAIHubDragPreview(event, id);
  }

  async function handleSmartAIHubMediaDrop(event: DragEvent) {
    if (bridgedDragEvents.has(event)) return;
    const bridgePayload = hasBridgePayload(event);
    const reservePotentialBridgeDrop = isBridgeTargetHost() && isPotentialFileDrag(event);
    const passiveSocialFileDrop = isSocialUploadContext() && reservePotentialBridgeDrop && !bridgePayload;
    let id = eventDragMediaId(event);
    if ((bridgePayload || reservePotentialBridgeDrop) && !passiveSocialFileDrop) {
      event.preventDefault();
      if (bridgePayload) event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }
    if (!id) id = await activeDragMediaIdFromBackground();
    if (!id) return;
    if (bridgePayload || !passiveSocialFileDrop || isSocialUploadContext()) {
      event.preventDefault();
      event.stopPropagation();
    }
    const file = await dragMediaFileFromBackground(id) || fileFromDragEvent(event);
    if (!file) return;
    const target = findUploadTarget(event.target);
    if (isMagnificHost(location.hostname.toLowerCase())) {
      deliverMagnificFileDrop(target, file, event);
    } else if (isGoogleFlowContext()) {
      await deliverGoogleFlowFileDrop(target, file, event);
    } else if (isHiggsfieldHost(location.hostname.toLowerCase())) {
      await deliverHiggsfieldFileDrop(target, file, event);
    } else if (isFacebookHost(location.hostname.toLowerCase()) || isTikTokStudioContext()) {
      await deliverSocialFileDrop(target, file, event);
    } else {
      dispatchFileDragEvents(target, file, event, ["dragenter", "dragover", "drop"]);
    }
    finishSmartAIHubDrag(id);
  }

  window.addEventListener("dragenter", (event) => {
    primeSmartAIHubDrop(event);
  }, true);

  window.addEventListener("dragover", (event) => {
    primeSmartAIHubDrop(event);
  }, true);

  window.addEventListener("drop", (event) => {
    void handleSmartAIHubMediaDrop(event);
  }, true);

  chrome.runtime.onMessage.addListener((message: any) => {
    if (message?.type === "SMARTAIHUB_ACTIVE_DRAG_MEDIA") {
      activeDragMediaId = typeof message.id === "string" && message.id ? message.id : null;
      lastDragPreviewKey = "";
      if (!activeDragMediaId) dragMediaFileCache.clear();
    }
    return false;
  });

  globalScope.__smartAIHubDragBridgeRefresh = refreshActiveDragMedia;
  refreshActiveDragMedia();
})();
