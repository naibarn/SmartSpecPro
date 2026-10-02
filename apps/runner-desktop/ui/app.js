const invoke = window.__TAURI__.core.invoke;

const elements = Object.fromEntries(
  [
    "connection-state", "connection-detail", "connection-notice", "connect-button",
    "refresh-button", "runtime-state", "runtime-notice", "start-button", "stop-button",
    "rescan-button", "workspace-list", "default-workspace", "tool-list", "tool-count",
    "add-workspace-button", "auto-start", "global-notice", "quit-button",
  ].map(id => [id, document.getElementById(id)])
);

const readableReason = {
  version_probe_ok: "ตรวจคำสั่งเวอร์ชันแล้ว",
  auth_probe_required: "ยังต้องเข้าสู่ระบบในเครื่องมือก่อนใช้งาน",
  probe_timeout: "เครื่องมือไม่ตอบกลับภายในเวลาที่กำหนด ตรวจว่าติดตั้งถูกต้องแล้วลองใหม่",
  probe_launch_failed: "เปิดตรวจสอบเครื่องมือไม่ได้ ตรวจสิทธิ์และการติดตั้งแล้วลองใหม่",
  probe_status_failed: "อ่านผลการตรวจสอบไม่ได้ ลองตรวจสอบอีกครั้ง",
  probe_nonzero_exit: "คำสั่งตรวจสอบของเครื่องมือทำงานไม่สำเร็จ ตรวจการติดตั้งแล้วลองใหม่",
  probe_failed: "ตรวจสอบเครื่องมือไม่สำเร็จ ลองอีกครั้ง",
  runner_session_authorized: "อนุมัติอุปกรณ์แล้ว",
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
    elements["connect-button"].textContent = status.connected ? "เชื่อมต่อใหม่ผ่านเบราว์เซอร์" : "เชื่อมต่อผ่านเบราว์เซอร์";
    elements["auto-start"].checked = status.autoStartEnabled;
    elements["default-workspace"].value = status.defaultWorkspaceId ?? "";
  } catch (error) {
    setNotice(elements["global-notice"], safeError(error));
  }
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
    const list = elements["tool-list"];
    list.replaceChildren();
    elements["tool-count"].textContent = String(tools.length);
    for (const tool of tools) {
      const item = document.createElement("li");
      item.className = "tool-row";
      const title = document.createElement("p");
      title.className = "tool-title";
      title.textContent = tool.display_name;
      const reasons = tool.reason_codes?.map(code => readableReason[code]).filter(Boolean) ?? [];
      const detail = document.createElement("p");
      detail.className = "tool-detail";
      detail.textContent = reasons.join(" · ") || "ตรวจพบแล้ว แต่ยังไม่มีรายละเอียดการตรวจสอบ";
      const state = document.createElement("output");
      const ready = tool.trust_state === "ready";
      const failed = tool.trust_state === "degraded";
      state.className = `tool-status ${ready ? "good" : failed ? "bad" : "warn"}`;
      state.textContent = ready ? "พร้อม" : failed ? "ตรวจไม่ผ่าน" : tool.trust_state === "unsupported" ? "ไม่พบ" : "ต้องตรวจเพิ่ม";
      item.append(title, detail, state);
      list.append(item);
    }
    setNotice(elements["runtime-notice"], `ตรวจเครื่องมือแล้ว ${tools.length} รายการ — การตรวจเวอร์ชันไม่ยืนยันการเข้าสู่ระบบ`);
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  } finally {
    elements["rescan-button"].disabled = false;
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
