const invoke = window.__TAURI__.core.invoke;

const elements = Object.fromEntries(
  [
    "connection-state", "connection-detail", "connection-notice", "connect-button",
    "refresh-button", "runtime-state", "runtime-notice", "start-button", "stop-button",
    "rescan-button", "workspace-list", "default-workspace", "tool-list", "tool-count",
    "add-workspace-button", "auto-start", "global-notice", "quit-button",
    "app-version", "app-build-date", "first-launch-date", "access-token-expiry", "reauth-deadline",
    "credential-detail",
  ].map(id => [id, document.getElementById(id)])
);

const verifiedTools = new Map();
const verifyingTools = new Set();
const taskVerifiableAdapters = new Set([
  "codex.v1", "claude.v1", "deepseek.v1", "antigravity.v1", "openclaw.v1", "hermes.v1",
]);

const readableReason = {
  version_probe_ok: "ตรวจคำสั่งเวอร์ชันแล้ว",
  auth_probe_required: "ยังต้องเข้าสู่ระบบในเครื่องมือก่อนใช้งาน",
  probe_timeout: "เครื่องมือไม่ตอบกลับภายในเวลาที่กำหนด ตรวจว่าติดตั้งถูกต้องแล้วลองใหม่",
  probe_launch_failed: "เปิดตรวจสอบเครื่องมือไม่ได้ ตรวจสิทธิ์และการติดตั้งแล้วลองใหม่",
  probe_status_failed: "อ่านผลการตรวจสอบไม่ได้ ลองตรวจสอบอีกครั้ง",
  probe_nonzero_exit: "คำสั่งตรวจสอบของเครื่องมือทำงานไม่สำเร็จ ตรวจการติดตั้งแล้วลองใหม่",
  probe_failed: "ตรวจสอบเครื่องมือไม่สำเร็จ ลองอีกครั้ง",
  runner_session_authorized: "อนุมัติอุปกรณ์แล้ว",
  probe_required: "พบโปรแกรมแล้ว ยังไม่ได้ทดสอบคำสั่ง",
  verify_unsupported: "พบโปรแกรม แต่ยังไม่มี Verify adapter สำหรับเครื่องมือนี้",
  task_probe_timeout: "เครื่องมือไม่ตอบกลับภายใน 60 วินาที ตรวจอินเทอร์เน็ตและสถานะเครื่องมือแล้วลองใหม่",
  task_probe_failed: "เครื่องมือส่งงานทดสอบไม่สำเร็จ ตรวจการเข้าสู่ระบบและโควตาแล้วลองใหม่",
  task_probe_no_response: "เครื่องมือจบการทำงานแต่ไม่มีคำตอบข้อความกลับมา",
  task_probe_launch_failed: "เปิดเครื่องมือเพื่อทดสอบสั่งงานไม่ได้",
  task_probe_temp_unavailable: "สร้างพื้นที่ชั่วคราวสำหรับทดสอบเครื่องมือไม่สำเร็จ",
  task_probe_unsupported: "พบโปรแกรมแล้ว แต่ยังไม่มีวิธีส่งงานและอ่านคำตอบจริงที่รองรับ",
};

function setNotice(target, message = "") {
  target.textContent = message;
}

function safeError(error) {
  const code = String(error ?? "").split(/[\s:;]/, 1)[0];
  const messages = {
    RUNNER_CONNECT_APPROVAL_TIMEOUT: "หมดเวลารอการอนุมัติ กรุณาเชื่อมต่อใหม่",
    RUNNER_CONNECT_APPROVAL_FAILED: "การอนุมัติไม่สำเร็จ กรุณาลองอีกครั้ง",
    RUNNER_CONNECT_CONTROL_TOKEN_MISSING: "SmartAIHub ยังไม่ส่งข้อมูลเชื่อมต่อกลับมา กรุณาลองใหม่",
    RUNNER_CONNECT_BROWSER_OPEN_FAILED: "เปิดเบราว์เซอร์เพื่อขออนุมัติไม่ได้ กรุณาเปิดเบราว์เซอร์เริ่มต้นแล้วลองใหม่",
    RUNNER_DEFAULT_WORKSPACE_REQUIRES_STOP: "หยุด Runner ก่อนเปลี่ยน workspace หลัก",
    RUNNER_WORKSPACE_REQUIRES_STOP: "หยุด Runner ก่อนนำ workspace ออก",
    RUNNER_CONNECTION_REQUIRED: "ไม่พบการเชื่อมต่อ Runner กรุณาเชื่อมต่อบัญชีก่อนเริ่มทำงาน",
    RUNNER_CONNECTION_INTERRUPTED: "การเชื่อมต่อขาดหาย Runner จะลองใหม่อัตโนมัติ ตรวจอินเทอร์เน็ตของเครื่องนี้",
    RUNNER_UPDATE_FAILED: "ตรวจสอบหรืออัปเดต Runner ไม่สำเร็จ",
    RUNNER_OPERATION_FAILED: "Runner พบปัญหาระหว่างทำงาน กรุณาตรวจการเชื่อมต่อแล้วลองใหม่",
    RUNNER_AUTOSTART_FAILED: "เริ่ม Runner อัตโนมัติไม่สำเร็จ เปิดหน้าต่างเพื่อตรวจการตั้งค่า",
    RUNNER_WORKSPACE_NEEDS_RESELECT: "โฟลเดอร์หลักถูกย้ายหรือลบ กรุณาเลือก workspace ใหม่",
    RUNNER_WORKSPACE_PATH_NOT_FOUND: "ไม่พบโฟลเดอร์ที่เลือก",
    RUNNER_WORKSPACE_MUST_BE_DIRECTORY: "รายการที่เลือกไม่ใช่โฟลเดอร์",
    RUNNER_TRUSTED_WORKSPACE_CHANGED: "โฟลเดอร์นี้ถูกย้ายหรือลบ กรุณาเลือกใหม่",
    RUNNER_AUTO_START_ENABLE_FAILED: "เปิดเริ่มอัตโนมัติไม่สำเร็จ",
    RUNNER_AUTO_START_DISABLE_FAILED: "ปิดเริ่มอัตโนมัติไม่สำเร็จ",
    RUNNER_AUTO_START_REQUIRES_CONNECTION: "เชื่อมต่อ SmartAIHub ก่อนเปิดเริ่มอัตโนมัติ",
    RUNNER_THREAD_START_FAILED: "เริ่ม Runner ไม่สำเร็จ กรุณาปิดแล้วเปิดแอปใหม่",
  };
  if (messages[code]) return messages[code];
  if (code.includes("BROWSER") || code.includes("OPEN_BROWSER")) return "เปิดหน้าขออนุมัติไม่ได้ กรุณาตรวจสอบเบราว์เซอร์เริ่มต้น";
  return "ดำเนินการไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง";
}

async function refreshStatus() {
  try {
    const status = await invoke("runner_status");
    elements["app-version"].textContent = status.appVersion ?? "—";
    elements["app-build-date"].textContent = formatDate(status.buildDate);
    elements["first-launch-date"].textContent = formatDate(status.firstLaunchAtMs);
    elements["access-token-expiry"].textContent = formatDate(status.accessTokenExpiresAtMs);
    elements["reauth-deadline"].textContent = formatDate(status.reauthRequiredByMs);
    elements["credential-detail"].textContent = status.credentialState === "reauth_required"
      ? "การต่ออายุอัตโนมัติไม่สำเร็จ ต้องเชื่อมต่อผ่านเบราว์เซอร์อีกครั้ง"
      : "Access token ต่ออายุอัตโนมัติเมื่อใกล้หมดอายุ ไม่ต้องเชื่อมต่อผ่านเบราว์เซอร์ทุกครั้งที่เปิดแอป";
    elements["connection-state"].textContent = status.connected ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ";
    elements["connection-state"].className = `state-pill${status.connected ? " good" : " warn"}`;
    elements["connection-detail"].textContent = status.connected
      ? `เชื่อมต่อ Runner ${status.runnerId} กับ SmartAIHub แล้ว`
      : "กดเชื่อมต่อเพื่อเปิด SmartAIHub ในเบราว์เซอร์ แล้วกดยอมรับการติดต่ออุปกรณ์";
    elements["runtime-state"].textContent = status.running ? "กำลังทำงาน" : "หยุดอยู่";
    elements["runtime-state"].className = `state-pill${status.running ? " good" : ""}`;
    if (status.lastError) setNotice(elements["runtime-notice"], safeError(status.lastError));
    elements["start-button"].disabled = !status.connected || status.running;
    elements["stop-button"].disabled = !status.running;
    elements["connect-button"].disabled = status.running;
    if (status.credentialState === "reauth_required") {
      elements["connection-state"].textContent = "ต้องเชื่อมต่อใหม่";
      elements["connection-state"].className = "state-pill warn";
      setNotice(elements["connection-notice"], "Refresh token หมดอายุหรือถูกเพิกถอน กรุณาเชื่อมต่อผ่านเบราว์เซอร์อีกครั้ง");
      elements["connect-button"].textContent = "เชื่อมต่อผ่านเบราว์เซอร์";
    } else if (status.credentialState === "renewed") {
      setNotice(elements["connection-notice"], "ต่ออายุ token ให้อัตโนมัติแล้ว");
      elements["connect-button"].textContent = "เปลี่ยนบัญชี / เชื่อมต่อใหม่";
    } else if (status.credentialState === "retrying") {
      setNotice(elements["connection-notice"], "กำลังลองต่ออายุ token อัตโนมัติ ตรวจสอบอินเทอร์เน็ตของเครื่องนี้");
      elements["connection-state"].textContent = "กำลังต่ออายุอัตโนมัติ";
      elements["connection-state"].className = "state-pill warn";
      elements["connect-button"].textContent = "กำลังต่ออายุ token…";
      elements["connect-button"].disabled = true;
    } else {
      elements["connect-button"].textContent = status.connected ? "เปลี่ยนบัญชี / เชื่อมต่อใหม่" : "เชื่อมต่อผ่านเบราว์เซอร์";
    }
    elements["auto-start"].checked = status.autoStartEnabled;
    elements["default-workspace"].value = status.defaultWorkspaceId ?? "";
  } catch (error) {
    setNotice(elements["global-notice"], safeError(error));
  }
}

function formatDate(timestamp) {
  const date = typeof timestamp === "number"
    ? new Date(timestamp)
    : typeof timestamp === "string" && timestamp
      ? /^\d+$/.test(timestamp) ? new Date(Number(timestamp)) : new Date(timestamp)
      : null;
  if (!date || !Number.isFinite(date.getTime())) return "ยังไม่มีข้อมูล";
  return date.toLocaleString();
}

async function refreshWorkspaces() {
  try {
    const [workspaces, status] = await Promise.all([
      invoke("list_workspaces"),
      invoke("runner_status"),
    ]);
    const select = elements["default-workspace"];
    select.replaceChildren(new Option("ไม่กำหนด workspace หลัก", ""));
    for (const workspace of workspaces) {
      select.add(new Option(workspace.displayName, workspace.workspaceId));
    }
    select.value = status.defaultWorkspaceId ?? "";
    const list = elements["workspace-list"];
    list.replaceChildren();
    if (workspaces.length === 0) {
      const item = document.createElement("li");
      item.className = "empty";
      item.textContent = "ยังไม่ได้เพิ่มโฟลเดอร์ เลือกโฟลเดอร์ที่ต้องการให้ Runner เข้าถึง";
      list.append(item);
      return;
    }
    for (const workspace of workspaces) {
      const item = document.createElement("li");
      item.className = "workspace-row";
      const description = document.createElement("section");
      description.className = "workspace-name";
      const name = document.createElement("p");
      name.textContent = workspace.displayName;
      const path = document.createElement("output");
      path.className = "path";
      path.textContent = workspace.localPath;
      description.append(name, path);
      const remove = document.createElement("button");
      remove.className = "button quiet";
      remove.type = "button";
      remove.textContent = "นำออก";
      remove.addEventListener("click", async () => {
        try {
          await invoke("remove_workspace", { workspaceId: workspace.workspaceId });
          await refreshWorkspaces();
          setNotice(elements["runtime-notice"], "นำโฟลเดอร์ออกแล้ว");
        } catch (error) {
          setNotice(elements["runtime-notice"], safeError(error));
        }
      });
      item.append(description, remove);
      list.append(item);
    }
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  }
}

async function scanTools() {
  elements["rescan-button"].disabled = true;
  setNotice(elements["runtime-notice"], "กำลังตรวจสอบเครื่องมือในเครื่อง…");
  try {
    const tools = await invoke("rescan_runner");
    verifiedTools.clear();
    const foundCount = tools.filter(tool => tool.trust_state !== "unsupported").length;
    elements["tool-count"].textContent = `${foundCount}/${tools.length}`;
    renderTools(tools);
    setNotice(elements["runtime-notice"], `พบเครื่องมือ ${foundCount} จาก ${tools.length} รายการ — Codex มีปุ่มทดสอบสั่งงานจริง; เครื่องมืออื่นทดสอบตาม adapter ที่รองรับ`);
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  } finally {
    elements["rescan-button"].disabled = false;
  }
}

function renderTools(tools) {
  const list = elements["tool-list"];
  list.replaceChildren();
  for (const discovered of tools) {
      const report = verifiedTools.get(discovered.tool_id);
      const tool = report?.tool ?? discovered;
      const taskCheck = report?.taskCheck;
      const item = document.createElement("li");
      item.className = "tool-row";
      const title = document.createElement("p");
      title.className = "tool-title";
      title.textContent = tool.display_name;
      const detail = document.createElement("p");
      detail.className = "tool-detail";
      const response = document.createElement("p");
      response.className = "tool-task-response";
      response.textContent = taskCheck?.response ?? "";
      const isFound = discovered.trust_state !== "unsupported";
      const isVerified = verifiedTools.has(discovered.tool_id);
      const runsTaskProbe = taskVerifiableAdapters.has(discovered.adapter_id);
      const reasons = tool.reason_codes?.map(code => readableReason[code]).filter(Boolean) ?? [];
      const version = isVerified && tool.version ? `เวอร์ชัน ${tool.version}` : "";
      const taskFailure = taskCheck?.reasonCode ? readableReason[taskCheck.reasonCode] : "";
      detail.textContent = !isFound
        ? reasons.join(" · ") || "ไม่พบโปรแกรมในเครื่องนี้"
        : !runsTaskProbe
          ? "พบโปรแกรมแล้ว แต่ยังไม่มีวิธีส่งงานและตรวจคำตอบจริงที่รองรับ"
        : !isVerified
          ? "พบโปรแกรมในเครื่องแล้ว — ยังไม่ได้ทดสอบคำสั่ง"
          : [version, ...reasons, taskFailure].filter(Boolean).join(" · ") || "ตรวจคำสั่งแล้ว";
      const state = document.createElement("output");
      const verifyUnsupported = !runsTaskProbe || taskCheck?.state === "unsupported"
        || (isVerified && tool.reason_codes?.includes("verify_unsupported"));
      const verifiedOk = isVerified && tool.health_state === "ready" && tool.availability_state === "ready";
      const failed = isVerified && tool.trust_state === "degraded";
      const taskPassed = taskCheck?.state === "passed";
      const taskFailed = taskCheck?.state === "failed";
      state.className = `tool-status ${!isFound ? "warn" : taskPassed || verifiedOk ? "good" : taskFailed || failed ? "bad" : "warn"}`;
      state.textContent = !isFound ? "ไม่พบ" : verifyUnsupported ? "ยังทดสอบงานจริงไม่ได้" : !isVerified ? "พบแล้ว" : taskPassed ? "ส่งงานและได้คำตอบ" : taskFailed ? "ทดสอบสั่งงานไม่ผ่าน" : failed ? "ตรวจคำสั่งไม่ผ่าน" : tool.trust_state === "auth_required" ? "คำสั่งตอบกลับ · ยังไม่ยืนยันบัญชี" : verifiedOk ? "คำสั่งตอบกลับแล้ว" : "ยังไม่ยืนยันผล";
      const actions = document.createElement("section");
      actions.className = "tool-actions";
      if (isFound) {
        const verify = document.createElement("button");
        verify.className = "button quiet verify-tool";
        verify.type = "button";
        verify.textContent = verifyingTools.has(discovered.tool_id)
          ? "กำลังทดสอบ…"
          : runsTaskProbe ? "ทดสอบสั่งงานจริง" : "ยังทดสอบงานจริงไม่ได้";
        verify.disabled = verifyingTools.has(discovered.tool_id) || !runsTaskProbe;
        verify.addEventListener("click", async () => {
          if (!window.confirm("จะส่งข้อความทดสอบผ่าน CLI จริงและแสดงคำตอบ โดยใช้บัญชีและการตั้งค่าปัจจุบันของเครื่องมือ อาจใช้โควตาหรือค่าใช้บริการของบัญชี ต้องการดำเนินการต่อไหม?")) return;
          verifyingTools.add(discovered.tool_id);
          renderTools(tools);
          try {
            verifiedTools.set(discovered.tool_id, await invoke("verify_runner_tool", { toolId: discovered.tool_id }));
          } catch (error) {
            setNotice(elements["runtime-notice"], safeError(error));
          } finally {
            verifyingTools.delete(discovered.tool_id);
            renderTools(tools);
          }
        });
        actions.append(verify);
      }
      item.append(title, detail, actions, state);
      if (response.textContent) {
        response.textContent = `Prompt: ${taskCheck.prompt}\nคำตอบจาก ${tool.display_name}:\n${response.textContent}`;
        item.append(response);
      }
      list.append(item);
  }
}

elements["connect-button"].addEventListener("click", async () => {
  elements["connect-button"].disabled = true;
  elements["connection-state"].textContent = "รออนุมัติในเบราว์เซอร์";
  setNotice(elements["connection-notice"], "เปิด SmartAIHub ในเบราว์เซอร์ แล้วกดยอมรับการติดต่ออุปกรณ์นี้");
  try {
    await invoke("connect_runner");
    setNotice(elements["connection-notice"], "อนุมัติแล้ว Runner เชื่อมต่อสำเร็จ");
    await refreshStatus();
    await scanTools();
  } catch (error) {
    setNotice(elements["connection-notice"], safeError(error));
    elements["connection-state"].textContent = "เชื่อมต่อไม่สำเร็จ";
  } finally {
    elements["connect-button"].disabled = false;
  }
});

elements["refresh-button"].addEventListener("click", async () => {
  await refreshStatus();
  await refreshWorkspaces();
  await scanTools();
});
elements["rescan-button"].addEventListener("click", scanTools);
elements["start-button"].addEventListener("click", async () => {
  try {
    await invoke("start_runner");
    setNotice(elements["runtime-notice"], "เริ่ม Runner แล้ว กำลังเชื่อมต่อกับ SmartAIHub");
    await refreshStatus();
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  }
});
elements["stop-button"].addEventListener("click", async () => {
  elements["stop-button"].disabled = true;
  setNotice(elements["runtime-notice"], "กำลังหยุด Runner และปิดงานย่อยที่ทำงานอยู่…");
  try {
    await invoke("stop_runner");
    setNotice(elements["runtime-notice"], "หยุด Runner แล้ว");
    await refreshStatus();
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  }
});
elements["add-workspace-button"].addEventListener("click", async () => {
  try {
    const workspace = await invoke("add_workspace");
    if (workspace) {
      await refreshWorkspaces();
      setNotice(elements["runtime-notice"], `เพิ่ม ${workspace.displayName} แล้ว`);
    }
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  }
});
elements["default-workspace"].addEventListener("change", async event => {
  try {
    await invoke("set_default_workspace", { workspaceId: event.target.value || null });
    setNotice(elements["runtime-notice"], "บันทึก workspace หลักไว้ในเครื่องแล้ว");
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  }
});
elements["auto-start"].addEventListener("change", async event => {
  try {
    await invoke("set_auto_start", { enabled: event.target.checked });
    setNotice(elements["global-notice"], event.target.checked ? "เปิดเริ่มอัตโนมัติเมื่อเข้าสู่ระบบแล้ว" : "ปิดเริ่มอัตโนมัติแล้ว");
  } catch (error) {
    event.target.checked = !event.target.checked;
    setNotice(elements["global-notice"], safeError(error));
  }
});
elements["quit-button"].addEventListener("click", () => invoke("quit_runner"));

async function showWindowIfReady() {
  await refreshStatus();
  await refreshWorkspaces();
  await scanTools();
}

showWindowIfReady();
window.setInterval(refreshStatus, 5000);
