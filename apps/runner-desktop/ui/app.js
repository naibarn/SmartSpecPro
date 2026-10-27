const invoke = window.__TAURI__.core.invoke;

const elements = Object.fromEntries(
  [
    "connection-state", "connection-detail", "connection-notice", "connect-button",
    "refresh-button", "runtime-state", "runtime-notice", "readiness-detail", "start-button", "stop-button",
    "rescan-button", "workspace-list", "default-workspace", "tool-list", "tool-count",
    "add-workspace-button", "auto-start", "global-notice", "quit-button",
    "app-version", "app-build-date", "first-launch-date", "access-token-expiry", "reauth-deadline",
    "credential-detail", "export-debug-button", "open-debug-folder-button", "debug-file-path",
    "workspace-simple-mode", "workspace-developer-mode",
  ].map(id => [id, document.getElementById(id)])
);

const verifiedTools = new Map();
const verifyingTools = new Set();
let capabilitySyncing = false;
let connectPending = false;
let refreshPending = false;
let scanPending = false;
let startPending = false;
let stopPending = false;
let quitPending = false;
let activeStatusRequest = null;
let queuedStatusRefresh = false;
let queuedCredentialRetry = false;
let uiStateRevision = 0;
let latestRunnerStatus = null;
let latestToolInventory = [];
let lastToolRenderKey = "";
let workspaceViewMode = localStorage.getItem("runner-workspace-view") === "developer" ? "developer" : "simple";
const taskVerifiableAdapters = new Set([
  "codex.v1", "claude.v1", "deepseek.v1", "antigravity.v1", "openclaw.v1", "hermes.v1",
]);

const readableReason = {
  version_probe_ok: "ตรวจคำสั่งเวอร์ชันแล้ว",
  auth_status_ok: "ตรวจพบสถานะเข้าสู่ระบบแล้ว",
  auth_probe_required: "ยังต้องเข้าสู่ระบบในเครื่องมือก่อนใช้งาน",
  auth_probe_deferred: "เลื่อนตรวจสอบสถานะเข้าสู่ระบบของ workload identity",
  auth_probe_failed: "ตรวจสอบสถานะเข้าสู่ระบบไม่สำเร็จ",
  probe_timeout: "เครื่องมือไม่ตอบกลับภายในเวลาที่กำหนด ตรวจว่าติดตั้งถูกต้องแล้วลองใหม่",
  probe_launch_failed: "เปิดตรวจสอบเครื่องมือไม่ได้ ตรวจสิทธิ์และการติดตั้งแล้วลองใหม่",
  probe_executable_not_found: "ไม่พบไฟล์เริ่มต้นเครื่องมือ ตรวจการติดตั้งแล้วสแกนเครื่องมือใหม่",
  probe_permission_denied: "Windows ปฏิเสธการเปิดเครื่องมือ ตรวจสิทธิ์ไฟล์หรือการบล็อกจากระบบความปลอดภัย",
  probe_invalid_executable: "ไฟล์เครื่องมือเปิดใช้งานไม่ได้ ติดตั้ง CLI ใหม่แล้วสแกนเครื่องมืออีกครั้ง",
  probe_system_path_unavailable: "ไม่พบโฟลเดอร์ระบบ Windows ที่ใช้เปิด CLI รีสตาร์ต Runner แล้วลองใหม่",
  probe_unsafe_cli_shim: "ไฟล์ shim ของ CLI มีอักขระที่ไม่อนุญาต ตรวจตำแหน่งติดตั้งแล้วติดตั้ง CLI ใหม่",
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

function refreshFailureMessage(code) {
  const messages = {
    RUNNER_CONNECT_REQUEST_FAILED: "ติดต่อ SmartAIHub ไม่สำเร็จ ตรวจอินเทอร์เน็ต, DNS หรือ TLS แล้วลองใหม่",
    RUNNER_CONNECT_RESPONSE_READ_FAILED: "เชื่อมต่อ SmartAIHub ได้ แต่รับคำตอบไม่ครบ ลองรีเฟรชสถานะอีกครั้ง",
    RUNNER_CONNECT_RESPONSE_INVALID: "คำตอบจาก SmartAIHub ไม่อยู่ในรูปแบบที่ Runner รองรับ",
    RUNNER_DEVICE_PROOF_KEY_PAIR_MISMATCH: "ข้อมูลยืนยันอุปกรณ์ในเครื่องไม่ตรงกัน กรุณาเชื่อมต่อผ่านเบราว์เซอร์ใหม่",
    RUNNER_CREDENTIAL_REFRESH_FAILED: "ต่ออายุ token ไม่สำเร็จโดยไม่ทราบสาเหตุ กรุณาลองเชื่อมต่อผ่านเบราว์เซอร์ใหม่",
  };
  if (messages[code]) return `${messages[code]} (${code})`;
  if (/^RUNNER_CONNECT_REQUEST_REJECTED_[0-9]{3}$/.test(code ?? "")) {
    return `SmartAIHub ปฏิเสธการต่ออายุ (${code}) ระบบจะลองใหม่ หรือเชื่อมต่อผ่านเบราว์เซอร์ได้`;
  }
  return `ต่ออายุ token ไม่สำเร็จ (${code || "RUNNER_CREDENTIAL_REFRESH_FAILED"}) ระบบจะลองใหม่ หรือเชื่อมต่อผ่านเบราว์เซอร์ได้`;
}

function setNotice(target, message = "") {
  target.textContent = message;
}

function invalidatePendingStatus() {
  uiStateRevision += 1;
}

function updateButton(button, { disabled, pending, label, title }) {
  button.disabled = disabled;
  button.classList.toggle("pending", Boolean(pending));
  if (pending) button.setAttribute("aria-busy", "true");
  else button.removeAttribute("aria-busy");
  if (label) button.textContent = label;
  button.title = title ?? "";
}

function safeError(error) {
  const code = String(error ?? "").split(/[\s:;]/, 1)[0];
  const messages = {
    RUNNER_CONNECT_APPROVAL_TIMEOUT: "หมดเวลารอการอนุมัติ กรุณาเชื่อมต่อใหม่",
    RUNNER_CONNECT_APPROVAL_FAILED: "การอนุมัติไม่สำเร็จ กรุณาลองอีกครั้ง",
    RUNNER_CONNECT_CONTROL_TOKEN_MISSING: "SmartAIHub ยังไม่ส่งข้อมูลเชื่อมต่อกลับมา กรุณาลองใหม่",
    RUNNER_CONNECT_BROWSER_OPEN_FAILED: "เปิดเบราว์เซอร์เพื่อขออนุมัติไม่ได้ กรุณาเปิดเบราว์เซอร์เริ่มต้นแล้วลองใหม่",
    RUNNER_CONNECT_START_REJECTED_401: "SmartAIHub ปฏิเสธคำขอเริ่มเชื่อมต่อก่อนถึงหน้าอนุมัติ ยังระบุไม่ได้ว่าเป็นปัญหาบัญชีใด ตรวจไฟล์ Debug และลองเชื่อมต่อใหม่",
    RUNNER_CONNECT_START_REJECTED_403: "คำขอเริ่มเชื่อมต่อถูกปฏิเสธก่อนถึงหน้าอนุมัติ (403) ข้อความนี้ยังไม่ยืนยันว่าบัญชีใดไม่มีสิทธิ์ ตรวจไฟล์ Debug หรือเครือข่ายที่ใช้งาน",
    RUNNER_CONNECT_TOKEN_REJECTED_403: "ข้อมูลยืนยันคำขอจับคู่ Runner ไม่ตรงหรือหมดอายุ กรุณาปิดหน้าคำขอเดิมแล้วเริ่มเชื่อมต่อใหม่",
    RUNNER_PERMISSION_DENIED: "Runner นี้ผูกกับบัญชี SmartAIHub อื่นอยู่ เพื่อป้องกันการยึดอุปกรณ์ ระบบไม่ย้ายเจ้าของให้อัตโนมัติ ให้เจ้าของเดิมถอนการเชื่อมต่อก่อน หรือใช้บัญชีเดิม",
    RUNNER_REVOKED: "Runner นี้ถูกเพิกถอนแล้ว ให้ผู้ดูแลตรวจสถานะอุปกรณ์ก่อนลงทะเบียนใหม่",
    RUNNER_DEVICE_REQUIRED: "ข้อมูลอุปกรณ์ไม่ตรงกับ Runner ที่ลงทะเบียนไว้ ตรวจการติดตั้งแล้วเชื่อมต่อใหม่",
    RUNNER_SESSION_MISMATCH: "SmartAIHub ส่ง session ของ Runner กลับมาไม่ตรงกับคำขอนี้ กรุณาลองเชื่อมต่อใหม่",
    RUNNER_CONNECT_FAILED: "เชื่อมต่อไม่สำเร็จ ระบบบันทึกรหัสสาเหตุที่ปลอดภัยไว้ในไฟล์ Debug; ส่งไฟล์นี้ให้ผู้ดูแลตรวจสอบ",
    RUNNER_DEFAULT_WORKSPACE_REQUIRES_STOP: "หยุด Runner ก่อนเปลี่ยน workspace หลัก",
    RUNNER_WORKSPACE_BINDING_REQUIRES_STOP: "หยุด Runner ก่อนเปลี่ยน Project / Repository แล้วเริ่ม Runner อีกครั้งเพื่อส่งข้อมูลใหม่",
    RUNNER_WORKSPACE_IDENTITY_INVALID: "ใช้ ID จากงานที่ได้รับมอบหมาย ไม่ใช้ URL, token หรือข้อมูลเข้าสู่ระบบ",
    RUNNER_WORKSPACE_NOT_REGISTERED: "ไม่พบ workspace นี้ กรุณาโหลดรายการใหม่",
    RUNNER_WORKSPACE_REQUIRES_STOP: "หยุด Runner ก่อนนำ workspace ออก",
    RUNNER_CONNECTION_REQUIRED: "ไม่พบการเชื่อมต่อ Runner กรุณาเชื่อมต่อบัญชีก่อนเริ่มทำงาน",
    RUNNER_CONNECTION_INTERRUPTED: "การเชื่อมต่อขาดหาย Runner จะลองใหม่อัตโนมัติ ตรวจอินเทอร์เน็ตของเครื่องนี้",
    RUNNER_UPDATE_FAILED: "ตรวจสอบหรืออัปเดต Runner ไม่สำเร็จ",
    RUNNER_OPERATION_FAILED: "Runner พบปัญหาระหว่างทำงาน กรุณาตรวจการเชื่อมต่อแล้วลองใหม่",
    RUNNER_AUTOSTART_FAILED: "เริ่ม Runner อัตโนมัติไม่สำเร็จ เปิดหน้าต่างเพื่อตรวจการตั้งค่า",
    RUNNER_WORKSPACE_NEEDS_RESELECT: "โฟลเดอร์หลักถูกย้ายหรือลบ กรุณาเลือก workspace ใหม่",
    RUNNER_WORKSPACE_PATH_NOT_FOUND: "ไม่พบโฟลเดอร์ที่เลือก",
    RUNNER_WORKSPACE_MUST_BE_DIRECTORY: "รายการที่เลือกไม่ใช่โฟลเดอร์",
    RUNNER_WORKSPACE_SELECTION_INVALID: "อ่านตำแหน่งโฟลเดอร์ที่เลือกไม่ได้ กรุณาเลือกโฟลเดอร์ใหม่",
    RUNNER_WORKSPACE_NAME_INVALID: "ใช้ชื่อโฟลเดอร์นี้เป็นชื่อ workspace ไม่ได้ กรุณาเลือกโฟลเดอร์อื่น",
    RUNNER_WORKSPACE_ID_COLLISION: "พบ workspace ID ซ้ำ กรุณาเลือกโฟลเดอร์อื่นและส่งไฟล์ Debug ให้ทีมตรวจสอบ",
    RUNNER_WORKSPACE_REGISTRY_READ_FAILED: "อ่านรายการ workspace ในเครื่องไม่ได้",
    RUNNER_WORKSPACE_REGISTRY_INVALID: "ข้อมูล workspace ในเครื่องเสียหาย กรุณาส่งไฟล์ Debug ให้ทีมตรวจสอบ",
    RUNNER_WORKSPACE_REGISTRY_LIMIT_EXCEEDED: "เพิ่ม workspace เกินจำนวนที่ Runner รองรับแล้ว",
    RUNNER_WORKSPACE_REGISTRY_PATH_INVALID: "ตำแหน่งจัดเก็บรายการ workspace ไม่ถูกต้อง",
    RUNNER_WORKSPACE_REGISTRY_WRITE_FAILED: "บันทึกรายการ workspace ในเครื่องไม่ได้ ตรวจสอบสิทธิ์โฟลเดอร์ของ Runner",
    RUNNER_WORKSPACE_REGISTRY_SERIALIZE_FAILED: "จัดทำข้อมูล workspace เพื่อบันทึกไม่ได้",
    RUNNER_WORKSPACE_REGISTRY_COMMIT_FAILED: "ยืนยันการบันทึก workspace ไม่สำเร็จ",
    RUNNER_WORKSPACE_REGISTRY_PERMISSIONS_FAILED: "ตั้งค่าสิทธิ์ไฟล์ workspace ในเครื่องไม่สำเร็จ",
    RUNNER_TRUSTED_WORKSPACE_CHANGED: "โฟลเดอร์นี้ถูกย้ายหรือลบ กรุณาเลือกใหม่",
    RUNNER_AUTO_START_ENABLE_FAILED: "เปิดเริ่มอัตโนมัติไม่สำเร็จ",
    RUNNER_AUTO_START_DISABLE_FAILED: "ปิดเริ่มอัตโนมัติไม่สำเร็จ",
    RUNNER_AUTO_START_REQUIRES_CONNECTION: "เชื่อมต่อ SmartAIHub ก่อนเปิดเริ่มอัตโนมัติ",
    RUNNER_THREAD_START_FAILED: "เริ่ม Runner ไม่สำเร็จ กรุณาปิดแล้วเปิดแอปใหม่",
    RUNNER_STOP_TIMEOUT: "Runner ยังหยุดไม่เสร็จ งานย่อยอาจยังปิดไม่ครบ ระบบคงสถานะว่ากำลังทำงานไว้ กรุณารอสักครู่แล้วลองหยุดอีกครั้ง",
    RUNNER_THREAD_JOIN_FAILED: "Runner หยุดพร้อมข้อผิดพลาด กรุณาตรวจไฟล์ Debug ก่อนเริ่มใหม่",
    RUNNER_CONTROL_LOOP_PANICKED: "Runner พบข้อผิดพลาดภายในและกำลังปิดงานย่อยอย่างปลอดภัย",
    RUNNER_SHUTDOWN_IN_PROGRESS: "Runner กำลังหยุดอยู่ กรุณารอให้เสร็จก่อนสั่งงานใหม่",
    RUNNER_CAPABILITY_SYNC_PENDING: "ทดสอบในเครื่องแล้ว แต่ Backend ยังไม่ยืนยันรับข้อมูลความพร้อม ตรวจการเชื่อมต่อและลองใหม่",
    RUNNER_CAPABILITY_SYNC_TASK_FAILED: "ส่งข้อมูลความพร้อมไม่สำเร็จ ผลทดสอบในเครื่องยังคงอยู่",
    RUNNER_CAPABILITY_SYNC_RESPONSE_INVALID: "Backend ยังไม่ยืนยันข้อมูลความพร้อม ผลทดสอบในเครื่องยังคงอยู่",
  };
  if (messages[code]) return messages[code];
  if (code.includes("BROWSER") || code.includes("OPEN_BROWSER")) return "เปิดหน้าขออนุมัติไม่ได้ กรุณาตรวจสอบเบราว์เซอร์เริ่มต้น";
  const rejection = /^RUNNER_CONNECT_REQUEST_REJECTED_(\d{3})$/.exec(code);
  if (rejection) {
    const status = Number(rejection[1]);
    if (status === 401 || status === 403) return `คำขอเชื่อมต่อถูกปฏิเสธ (HTTP ${status}) ก่อนยืนยันได้ว่าเป็นปัญหาบัญชีใด กรุณาตรวจไฟล์ Debug`;
    if (status === 409) return "SmartAIHub พบการลงทะเบียนหรือ pairing ที่ขัดแย้งกัน Runner เดิมยังไม่ถูกลบ; รีเฟรชสถานะ แล้วตรวจบัญชีเจ้าของและคำขออนุมัติที่เปิดค้างอยู่";
    if (status === 429) return "ส่งคำขอเชื่อมต่อถี่เกินไป รอสักครู่แล้วลองใหม่";
    if (status >= 500) return `SmartAIHub ขัดข้องชั่วคราว (${code}) รอสักครู่แล้วลองใหม่`;
    return `SmartAIHub ปฏิเสธคำขอเชื่อมต่อ (${code})`;
  }
  return "ดำเนินการไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง";
}

async function refreshStatus({ retryCredentials = false } = {}) {
  if (activeStatusRequest) {
    queuedStatusRefresh = true;
    queuedCredentialRetry ||= retryCredentials;
    return activeStatusRequest;
  }
  const request = (async () => {
    let retry = retryCredentials;
    do {
      queuedStatusRefresh = false;
      retry ||= queuedCredentialRetry;
      queuedCredentialRetry = false;
      const revision = uiStateRevision;
      try {
        const status = await invoke(retry ? "retry_runner_credentials" : "runner_status");
        if (revision === uiStateRevision) applyRunnerStatus(status);
        else queuedStatusRefresh = true;
      } catch (error) {
        if (revision === uiStateRevision) setNotice(elements["global-notice"], safeError(error));
      }
      retry = false;
    } while (queuedStatusRefresh || queuedCredentialRetry);
  })();
  activeStatusRequest = request;
  try {
    await request;
  } finally {
    activeStatusRequest = null;
  }
}

function capabilityAcknowledged(status) {
  const readiness = status?.readiness;
  const timestamp = Date.parse(readiness?.capabilityPublicationAcknowledgedAt ?? "");
  return readiness?.capabilityPublicationState === "acknowledged"
    && Number.isFinite(timestamp)
    && timestamp <= Date.now() + 30_000
    && Date.now() - timestamp <= 5 * 60_000;
}

function applyRunnerStatus(status) {
  latestRunnerStatus = status;
  elements["app-version"].textContent = status.appVersion ?? "—";
  elements["app-build-date"].textContent = formatDate(status.buildDate);
  elements["first-launch-date"].textContent = formatDate(status.firstLaunchAtMs);
  elements["access-token-expiry"].textContent = formatDate(status.accessTokenExpiresAtMs);
  elements["reauth-deadline"].textContent = formatDate(status.reauthRequiredByMs);
  elements["credential-detail"].textContent = status.credentialState === "reauth_required"
    ? `การต่ออายุอัตโนมัติไม่สำเร็จ ต้องเชื่อมต่อผ่านเบราว์เซอร์อีกครั้ง${status.credentialErrorCode ? ` (${status.credentialErrorCode})` : ""}`
    : status.credentialState === "retrying"
      ? `การต่ออายุอัตโนมัติล้มเหลว ระบบจะลองใหม่ในภายหลัง (${status.credentialErrorCode ?? "RUNNER_CREDENTIAL_REFRESH_FAILED"})`
      : "Access token ต่ออายุอัตโนมัติเมื่อใกล้หมดอายุ ไม่ต้องเชื่อมต่อผ่านเบราว์เซอร์ทุกครั้งที่เปิดแอป";

  const credentialState = status.credentialState;
  const credentialsReady = status.credentialsReady;
  const controlPlaneConnected = status.controlPlaneConnected;
  const connectionLabel = connectPending
    ? "รออนุมัติในเบราว์เซอร์"
    : credentialState === "renewing"
    ? "กำลังต่ออายุ token"
    : credentialState === "reauth_required"
      ? "ต้องเชื่อมต่อใหม่"
      : credentialState === "retrying"
        ? "ต่ออายุไม่สำเร็จ — จะลองใหม่"
        : status.running && status.lastError ? "กำลังเชื่อมต่อใหม่"
          : controlPlaneConnected ? "เชื่อมต่อแล้ว"
          : credentialsReady && status.running ? "รอ heartbeat จาก SmartAIHub"
            : credentialsReady ? "บัญชีพร้อม · Runner หยุดอยู่" : "ยังไม่เชื่อมต่อ";
  elements["connection-state"].textContent = connectionLabel;
  elements["connection-state"].className = `state-pill${controlPlaneConnected && !status.lastError && credentialState !== "reauth_required" && credentialState !== "retrying" ? " good" : " warn"}`;
  elements["connection-detail"].textContent = status.running && status.lastError
    ? `Runner กำลังเชื่อมต่อ Control Plane ใหม่ · heartbeat ล่าสุด ${formatDate(status.lastControlPlaneHeartbeatAcknowledgedAtMs)}`
    : controlPlaneConnected
    ? `SmartAIHub ยืนยัน heartbeat ของ Runner ${status.runnerId} เวลา ${formatDate(status.lastControlPlaneHeartbeatAcknowledgedAtMs)}`
    : credentialsReady && status.running
      ? `Runner ทำงานอยู่ แต่ยังไม่มี heartbeat ที่ SmartAIHub ยืนยันใน 5 นาที · ล่าสุด ${formatDate(status.lastControlPlaneHeartbeatAcknowledgedAtMs)}`
      : credentialsReady
        ? "บัญชี Runner พร้อมใช้งาน แต่ Runner หยุดอยู่"
        : credentialState === "renewing"
          ? "กำลังต่ออายุ access token ด้วย refresh token ที่จัดเก็บไว้"
          : credentialState === "retrying"
            ? "การต่ออายุ token ล้มเหลวชั่วคราว ระบบจะลองใหม่โดยใช้ข้อมูลเชื่อมต่อเดิม"
            : credentialState === "reauth_required"
              ? "ต้องยืนยันบัญชีผ่านเบราว์เซอร์ เนื่องจาก refresh token ใช้ต่อไม่ได้แล้ว"
              : "กดเชื่อมต่อเพื่อเปิด SmartAIHub ในเบราว์เซอร์ แล้วกดยอมรับการติดต่ออุปกรณ์";

  if (credentialState === "reauth_required") {
    const notice = status.credentialErrorCode === "RUNNER_CONNECT_REQUEST_REJECTED_409"
      ? "SmartAIHub ปฏิเสธคำขอต่ออายุด้วย HTTP 409 กรุณาเชื่อมต่อผ่านเบราว์เซอร์เพื่อยืนยัน session ใหม่"
      : "Refresh token หมดอายุหรือถูกเพิกถอน กรุณาเชื่อมต่อผ่านเบราว์เซอร์อีกครั้ง";
    setNotice(elements["connection-notice"], notice);
  } else if (credentialState === "retrying") {
    setNotice(elements["connection-notice"], refreshFailureMessage(status.credentialErrorCode));
  } else if (credentialState === "renewing") {
    setNotice(elements["connection-notice"], "กำลังต่ออายุ token ที่จัดเก็บไว้ ระบบจะเชื่อมต่อใหม่อัตโนมัติเมื่อสำเร็จ");
  } else if (credentialState === "renewed") {
    setNotice(elements["connection-notice"], "ต่ออายุ token ให้อัตโนมัติแล้ว");
  }

  const runtimeLabel = stopPending || status.stopping
    ? "กำลังหยุด…"
    : status.lastError ? "พบข้อผิดพลาด"
      : status.running && !controlPlaneConnected ? "รอ heartbeat"
        : status.running ? "กำลังทำงาน" : "หยุดอยู่";
  elements["runtime-state"].textContent = runtimeLabel;
  elements["runtime-state"].className = `state-pill${status.running && controlPlaneConnected && !status.stopping && !status.lastError ? " good" : status.stopping || status.lastError || status.running && !controlPlaneConnected ? " warn" : ""}`;
  if (status.lastError) setNotice(elements["runtime-notice"], safeError(status.lastError));

  const canChangeAccount = !status.running && !status.stopping && !capabilitySyncing;
  updateButton(elements["connect-button"], {
    disabled: !canChangeAccount || connectPending || credentialState === "renewing",
    pending: connectPending || credentialState === "renewing",
    label: connectPending
      ? "กำลังเชื่อมต่อ…"
      : credentialState === "renewing"
        ? "กำลังต่ออายุ token…"
        : credentialState === "reauth_required" || !credentialsReady
          ? "เชื่อมต่อผ่านเบราว์เซอร์"
          : "เปลี่ยนบัญชี / เชื่อมต่อใหม่",
    title: status.running ? "หยุด Runner ก่อนเปลี่ยนบัญชี" : "",
  });
  updateButton(elements["refresh-button"], {
    disabled: refreshPending,
    pending: refreshPending,
    label: refreshPending ? "กำลังรีเฟรช…" : "รีเฟรชสถานะ",
  });
  updateButton(elements["start-button"], {
    disabled: !credentialsReady || status.running || status.stopping || startPending || capabilitySyncing,
    pending: startPending,
    label: startPending ? "กำลังเริ่ม…" : status.running ? "Runner กำลังทำงาน" : "เริ่ม Runner",
    title: status.running ? "Runner กำลังทำงานอยู่" : "",
  });
  updateButton(elements["stop-button"], {
    disabled: stopPending || (!status.running && !status.stopping),
    pending: stopPending || status.stopping,
    label: stopPending || status.stopping ? "กำลังหยุด…" : "หยุด Runner",
  });
  updateButton(elements["rescan-button"], {
    disabled: scanPending,
    pending: scanPending,
    label: scanPending ? "กำลังสแกน…" : "ตรวจเครื่องมืออีกครั้ง",
  });
  updateButton(elements["quit-button"], {
    disabled: quitPending,
    pending: quitPending,
    label: quitPending ? "กำลังปิด…" : "ออกจากโปรแกรม",
  });

  elements["auto-start"].checked = status.autoStartEnabled;
  if (document.activeElement !== elements["default-workspace"]) {
    elements["default-workspace"].value = status.defaultWorkspaceId ?? "";
  }
  const readiness = status.readiness ?? {};
  const publicationState = readiness.capabilityPublicationState ?? "unknown";
  const publicationText = capabilitySyncing
    ? "กำลังส่ง capability ไปยัง SmartAIHub"
    : publicationState === "acknowledged" && capabilityAcknowledged(status)
    ? `CAPABILITY_ACKNOWLEDGED (${readiness.capabilitySnapshotRevision ?? "revision ไม่ระบุ"}) · ${formatDate(readiness.capabilityPublicationAcknowledgedAt)}`
    : publicationState === "pending" || publicationState === "acknowledged"
      ? `รอ CAPABILITY_ACKNOWLEDGED${readiness.capabilityPublicationCorrelationId ? ` · correlation ${readiness.capabilityPublicationCorrelationId}` : ""}`
      : publicationState === "failed"
        ? `CAPABILITY_ACKNOWLEDGEMENT_FAILED · ${readiness.capabilityPublicationErrorCode ?? "RUNNER_CONTROL_EVENT_REJECTED"}${readiness.capabilityPublicationHttpStatus ? ` · HTTP ${readiness.capabilityPublicationHttpStatus}` : ""}${readiness.capabilityPublicationCorrelationId ? ` · correlation ${readiness.capabilityPublicationCorrelationId}` : ""}`
        : "ยังไม่มีหลักฐานยืนยัน capability จาก SmartAIHub";
  const runtimeText = stopPending || status.stopping
    ? "Runner กำลังยกเลิกงานและรอปิด child processes"
    : status.lastError ? "Runner พบข้อผิดพลาด ตรวจข้อความแจ้งปัญหาด้านบน"
      : status.running && !controlPlaneConnected ? "Runner ทำงานอยู่ แต่ยังไม่ได้รับ heartbeat ยืนยันจาก SmartAIHub ภายใน 5 นาที"
        : status.running ? "Runner ทำงานอยู่และ Control Plane ยืนยัน heartbeat ล่าสุดแล้ว" : "Runner หยุดอยู่";
  elements["readiness-detail"].textContent = `${runtimeText} · ${publicationText} · งานแต่ละรายการยังต้องผ่านการอนุญาตจาก Control Plane`;
  const readinessPending = publicationState === "pending" || stopPending || status.stopping || capabilitySyncing;
  elements["readiness-detail"].dataset.pending = String(readinessPending);
  if (readinessPending) elements["readiness-detail"].setAttribute("aria-busy", "true");
  else elements["readiness-detail"].removeAttribute("aria-busy");

  if (Array.isArray(readiness.toolInventory) && readiness.toolInventory.length > 0) {
    latestToolInventory = readiness.toolInventory;
  }
  renderTools(latestToolInventory, status);
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
    const workspaces = await invoke("list_workspaces", { mode: workspaceViewMode });
    const select = elements["default-workspace"];
    const selectedWorkspaceId = select.value;
    select.replaceChildren(new Option("ไม่กำหนด workspace หลัก", ""));
    for (const workspace of workspaces) {
      select.add(new Option(workspace.displayName, workspace.workspaceId));
    }
    select.value = latestRunnerStatus?.defaultWorkspaceId
      ?? selectedWorkspaceId;
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
      description.append(name);
      if (workspaceViewMode === "developer") {
        const path = document.createElement("output");
        path.className = "path";
        path.textContent = workspace.localPath;
        const facts = workspace.facts;
        const git = document.createElement("p");
        git.className = "body-copy";
        git.textContent = facts.gitHead
          ? `Git ${facts.gitBranch ?? "detached HEAD"} · ${facts.gitHead} · ${facts.dirty ? "มีไฟล์เปลี่ยนแปลง" : "ไม่มีไฟล์เปลี่ยนแปลง"}`
          : "ยังยืนยัน Git HEAD ไม่ได้ — เลือกโฟลเดอร์ Git ที่ตรงกับงานก่อนรับงานพัฒนา";
        const identity = document.createElement("form");
        identity.className = "workspace-binding";
        const inputs = {};
        for (const [key, title] of [["projectId", "Project ID"], ["repositoryId", "Repository ID"]]) {
          const label = document.createElement("label");
          label.className = "field-label";
          label.textContent = title;
          const input = document.createElement("input");
          input.className = "select-control";
          input.type = "text";
          input.maxLength = 200;
          input.autocomplete = "off";
          input.value = facts[key] ?? "";
          label.append(input);
          identity.append(label);
          inputs[key] = input;
        }
        const hint = document.createElement("p");
        hint.className = "body-copy";
        hint.textContent = "ใช้ ID จริงจากงานที่ได้รับมอบหมาย เว้นว่างเพื่อล้าง binding; การบันทึกนี้ไม่อนุมัติสิทธิ์รันงาน ต้องหยุด Runner ก่อนแก้ไข";
        const save = document.createElement("button");
        save.type = "submit";
        save.className = "button quiet";
        save.textContent = "บันทึก Project / Repository";
        identity.append(hint, save);
        identity.addEventListener("submit", async event => {
          event.preventDefault();
          invalidatePendingStatus();
          save.disabled = true;
          try {
            await invoke("bind_workspace_identity", {
              workspaceId: workspace.workspaceId,
              projectId: inputs.projectId.value.trim() || null,
              repositoryId: inputs.repositoryId.value.trim() || null,
            });
            await refreshWorkspaces();
            setNotice(elements["runtime-notice"], "บันทึก binding แล้ว เริ่ม Runner เพื่อส่งข้อมูลใหม่; สิทธิ์และ Lease ยังต้องผ่านการตรวจจากระบบ");
          } catch (error) {
            setNotice(elements["runtime-notice"], safeError(error));
          } finally {
            save.disabled = false;
          }
        });
        description.append(path, git, identity);
      }
      const remove = document.createElement("button");
      remove.className = "button quiet";
      remove.type = "button";
      remove.textContent = "นำออก";
      remove.addEventListener("click", async () => {
        invalidatePendingStatus();
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

async function scanTools({ publish = false } = {}) {
  if (scanPending) return;
  invalidatePendingStatus();
  scanPending = true;
  updateButton(elements["rescan-button"], {
    disabled: true,
    pending: true,
    label: "กำลังสแกน…",
  });
  setNotice(elements["runtime-notice"], "กำลังตรวจสอบเครื่องมือในเครื่อง…");
  try {
    const tools = await invoke("rescan_runner");
    const fingerprints = new Map(tools.map(tool => [tool.tool_id, tool.fingerprint]));
    for (const [toolId, report] of verifiedTools) {
      if (report.tool?.fingerprint !== fingerprints.get(toolId)) verifiedTools.delete(toolId);
    }
    latestToolInventory = tools;
    const foundCount = tools.filter(tool => tool.trust_state !== "unsupported").length;
    elements["tool-count"].textContent = `${foundCount}/${tools.length}`;
    renderTools(tools, latestRunnerStatus);
    setNotice(elements["runtime-notice"], `พบเครื่องมือ ${foundCount} จาก ${tools.length} รายการ — Codex มีปุ่มทดสอบสั่งงานจริง; เครื่องมืออื่นทดสอบตาม adapter ที่รองรับ`);
    await refreshStatus();
    if (publish && latestRunnerStatus?.credentialsReady) await syncCapabilities();
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  } finally {
    scanPending = false;
    if (latestRunnerStatus) applyRunnerStatus(latestRunnerStatus);
    else updateButton(elements["rescan-button"], { disabled: false, pending: false, label: "ตรวจเครื่องมืออีกครั้ง" });
  }
}

async function syncCapabilities() {
  if (capabilitySyncing) return;
  capabilitySyncing = true;
  invalidatePendingStatus();
  elements["readiness-detail"].dataset.pending = "true";
  elements["readiness-detail"].setAttribute("aria-busy", "true");
  elements["readiness-detail"].textContent = "กำลังส่งข้อมูลความพร้อมของเครื่องมือไปยัง SmartAIHub";
  if (latestRunnerStatus) applyRunnerStatus(latestRunnerStatus);
  try {
    setNotice(elements["runtime-notice"], "กำลังส่งข้อมูลความพร้อมไปยัง SmartAIHub…");
    const state = await invoke("sync_runner_capabilities");
    setNotice(elements["runtime-notice"], state === "synced"
      ? "SmartAIHub รับข้อมูลความพร้อมแล้ว — งานแต่ละรายการยังต้องผ่าน Control Plane authorization"
      : state === "runtime_running"
        ? "Runner รับคำขอส่ง capability ล่าสุดแล้ว — งานยังต้องผ่าน Control Plane authorization"
        : "ทดสอบในเครื่องแล้ว — เชื่อมต่อ SmartAIHub เพื่อส่งข้อมูลความพร้อม");
  } catch (error) {
    // Pairing and a completed local task remain valid when publishing fails.
    setNotice(elements["runtime-notice"], safeError(error));
  } finally {
    capabilitySyncing = false;
    await refreshStatus();
  }
}

function renderTools(tools, status = latestRunnerStatus) {
  const capabilityFresh = capabilityAcknowledged(status);
  const renderKey = JSON.stringify({
    tools: tools.map(tool => [
      tool.tool_id,
      tool.fingerprint,
      tool.trust_state,
      tool.version_probe_state,
      tool.task_probe_state,
      tool.task_probe_expires_at_ms,
      tool.auth_state,
      tool.reason_codes,
    ]),
    credentialsReady: status?.credentialsReady,
    controlPlaneConnected: status?.controlPlaneConnected,
    running: status?.running,
    stopping: status?.stopping,
    capabilityFresh,
    publicationState: status?.readiness?.capabilityPublicationState,
    verifying: [...verifyingTools],
    verified: [...verifiedTools.entries()].map(([toolId, report]) => [
      toolId,
      report.tool?.fingerprint,
      report.taskCheck?.state,
      report.taskCheck?.response,
    ]),
  });
  if (renderKey === lastToolRenderKey) return;
  lastToolRenderKey = renderKey;
  const list = elements["tool-list"];
  list.replaceChildren();
  elements["tool-count"].textContent = `${tools.filter(tool => tool.trust_state !== "unsupported").length}/${tools.length}`;
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
    const runsTaskProbe = taskVerifiableAdapters.has(discovered.adapter_id);
    const taskState = taskCheck?.state ?? tool.task_probe_state ?? "not_run";
    const taskExpiry = tool.task_probe_expires_at_ms;
    const taskPassed = taskState === "passed" && typeof taskExpiry === "number" && taskExpiry > Date.now();
    const taskFailed = taskState === "failed";
    const versionPassed = tool.version_probe_state === "passed";
    const authenticated = tool.auth_state === "ready";
    const executionReady = Boolean(
      isFound && status?.controlPlaneConnected && status?.running && !status?.stopping && capabilityFresh
      && tool.trust_state === "ready" && versionPassed && authenticated && taskPassed,
    );
    const publicationText = capabilityFresh
      ? "CAPABILITY_ACKNOWLEDGED · execution ยังต้องผ่าน policy, device consent และ grant ของ run"
      : status?.readiness?.capabilityPublicationState === "pending"
        ? `รอ CAPABILITY_ACKNOWLEDGED${status?.readiness?.capabilityPublicationCorrelationId ? ` · ${status.readiness.capabilityPublicationCorrelationId}` : ""}`
        : status?.readiness?.capabilityPublicationState === "failed"
          ? `CAPABILITY_ACKNOWLEDGEMENT_FAILED · ${status?.readiness?.capabilityPublicationErrorCode ?? "unknown"}${status?.readiness?.capabilityPublicationHttpStatus ? ` · HTTP ${status.readiness.capabilityPublicationHttpStatus}` : ""}`
          : "ยังไม่มี CAPABILITY_ACKNOWLEDGED";
    const taskText = taskPassed
      ? "ทดสอบส่งงานจริงผ่าน"
      : taskFailed
        ? "ทดสอบส่งงานจริงไม่ผ่าน"
        : taskState === "unsupported" || !runsTaskProbe
          ? "ยังไม่มีวิธีทดสอบงานจริงสำหรับเครื่องมือนี้"
          : taskState === "passed"
            ? "ผลทดสอบหมดอายุ ต้องทดสอบใหม่"
            : "ยังไม่ได้ทดสอบงานจริง";
    const reason = taskCheck?.reasonCode ? readableReason[taskCheck.reasonCode] : "";
    detail.textContent = !isFound
      ? tool.reason_codes?.map(code => readableReason[code]).filter(Boolean).join(" · ") || "ไม่พบโปรแกรมในเครื่องนี้"
      : [
        "พบโปรแกรมแล้ว",
        versionPassed ? `ตรวจเวอร์ชันผ่าน${tool.version ? ` (${tool.version})` : ""}` : tool.version_probe_state === "failed" ? "ตรวจเวอร์ชันไม่ผ่าน" : "ยังไม่ได้ตรวจเวอร์ชัน",
        authenticated ? "ยืนยันบัญชีแล้ว" : tool.auth_state === "required" ? "ต้องเข้าสู่ระบบใน CLI" : "ยังไม่ยืนยันบัญชี",
        taskText,
        publicationText,
      ].filter(Boolean).join(" · ");
    if (reason && taskFailed) detail.textContent += ` · ${reason}`;

    const state = document.createElement("output");
    state.className = `tool-status ${executionReady ? "good" : taskFailed || tool.trust_state === "degraded" ? "bad" : "warn"}`;
    state.textContent = executionReady
      ? "พร้อมรับงานที่ระบบอนุญาต"
      : !isFound
        ? "ไม่พบ"
        : taskFailed || tool.trust_state === "degraded"
          ? "พบข้อผิดพลาด"
          : taskPassed && capabilityFresh && status?.controlPlaneConnected && status?.running
            ? "ทดสอบผ่าน · รอระบบอนุญาตงาน"
            : "ยังไม่พร้อมรับงานที่อนุญาต";

    const actions = document.createElement("section");
    actions.className = "tool-actions";
    if (isFound) {
      const verify = document.createElement("button");
      const verifying = verifyingTools.has(discovered.tool_id);
      verify.className = `button quiet verify-tool${verifying ? " pending" : ""}`;
      verify.type = "button";
      verify.textContent = verifying ? "กำลังทดสอบ…" : runsTaskProbe ? "ทดสอบสั่งงานจริง" : "ยังทดสอบงานจริงไม่ได้";
      verify.disabled = verifying || !runsTaskProbe;
      if (verifying) verify.setAttribute("aria-busy", "true");
      verify.addEventListener("click", async () => {
        if (!window.confirm("จะส่งข้อความทดสอบผ่าน CLI จริงและแสดงคำตอบ โดยใช้บัญชีและการตั้งค่าปัจจุบันของเครื่องมือ อาจใช้โควตาหรือค่าใช้บริการของบัญชี ต้องการดำเนินการต่อไหม?")) return;
        invalidatePendingStatus();
        verifyingTools.add(discovered.tool_id);
        lastToolRenderKey = "";
        renderTools(latestToolInventory, latestRunnerStatus);
        try {
          const result = await invoke("verify_runner_tool", { toolId: discovered.tool_id });
          verifiedTools.set(discovered.tool_id, result);
          latestToolInventory = latestToolInventory.map(candidate => candidate.tool_id === discovered.tool_id ? result.tool : candidate);
          await syncCapabilities();
        } catch (error) {
          setNotice(elements["runtime-notice"], safeError(error));
          await refreshStatus();
        } finally {
          verifyingTools.delete(discovered.tool_id);
          lastToolRenderKey = "";
          renderTools(latestToolInventory, latestRunnerStatus);
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
  if (connectPending) return;
  invalidatePendingStatus();
  connectPending = true;
  updateButton(elements["connect-button"], {
    disabled: true,
    pending: true,
    label: "กำลังเชื่อมต่อ…",
  });
  elements["connection-state"].textContent = "รออนุมัติในเบราว์เซอร์";
  setNotice(elements["connection-notice"], "เปิด SmartAIHub ในเบราว์เซอร์ แล้วกดยอมรับการติดต่ออุปกรณ์นี้");
  try {
    await invoke("connect_runner");
    setNotice(elements["connection-notice"], "อนุมัติแล้ว Runner เชื่อมต่อสำเร็จ");
    await refreshStatus();
    await scanTools();
    await syncCapabilities();
  } catch (error) {
    setNotice(elements["connection-notice"], safeError(error));
    elements["connection-state"].textContent = "เชื่อมต่อไม่สำเร็จ";
  } finally {
    connectPending = false;
    if (latestRunnerStatus) applyRunnerStatus(latestRunnerStatus);
    else updateButton(elements["connect-button"], { disabled: false, pending: false, label: "เชื่อมต่อผ่านเบราว์เซอร์" });
  }
});

elements["refresh-button"].addEventListener("click", async () => {
  if (refreshPending) return;
  invalidatePendingStatus();
  refreshPending = true;
  updateButton(elements["refresh-button"], { disabled: true, pending: true, label: "กำลังรีเฟรช…" });
  setNotice(elements["connection-notice"], "กำลังตรวจสถานะและต่ออายุ token ที่บันทึกไว้หากจำเป็น");
  try {
    await refreshStatus({ retryCredentials: true });
    await refreshWorkspaces();
  } finally {
    refreshPending = false;
    if (latestRunnerStatus) applyRunnerStatus(latestRunnerStatus);
    else updateButton(elements["refresh-button"], { disabled: false, pending: false, label: "รีเฟรชสถานะ" });
  }
});
elements["rescan-button"].addEventListener("click", () => scanTools({ publish: true }));
elements["export-debug-button"].addEventListener("click", async () => {
  const button = elements["export-debug-button"];
  button.disabled = true;
  elements["debug-file-path"].textContent = "กำลังรวบรวม diagnostics ในเครื่อง…";
  try {
    const verificationResults = [...verifiedTools.entries()].map(([toolId, report]) => ({
      toolId,
      state: report.taskCheck?.state
        ?? (report.tool?.trust_state === "degraded" ? "failed" : report.tool?.trust_state === "unsupported" ? "unsupported" : null),
      reasonCode: report.taskCheck?.reasonCode ?? report.tool?.reason_codes?.[0] ?? null,
    }));
    const result = await invoke("export_runner_debug_report", { verificationResults });
    elements["debug-file-path"].dataset.path = `บันทึกไฟล์แล้ว: ${result.path}`;
    elements["debug-file-path"].textContent = workspaceViewMode === "developer"
      ? elements["debug-file-path"].dataset.path
      : "บันทึกไฟล์ Debug ไว้ในเครื่องแล้ว";
    elements["open-debug-folder-button"].hidden = false;
    setNotice(elements["runtime-notice"], "สร้างไฟล์ Debug แล้ว ตรวจสอบ PATH/ตำแหน่ง CLI และ error code ได้ โดยไม่มี token หรือคำตอบจากเครื่องมือ");
  } catch (error) {
    elements["debug-file-path"].textContent = "";
    setNotice(elements["runtime-notice"], safeError(error));
  } finally {
    button.disabled = false;
  }
});
elements["open-debug-folder-button"].addEventListener("click", async () => {
  try {
    await invoke("open_runner_debug_folder");
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  }
});
elements["start-button"].addEventListener("click", async () => {
  if (startPending) return;
  invalidatePendingStatus();
  startPending = true;
  updateButton(elements["start-button"], { disabled: true, pending: true, label: "กำลังเริ่ม…" });
  try {
    await invoke("start_runner");
    setNotice(elements["runtime-notice"], "เริ่ม Runner แล้ว กำลังเชื่อมต่อกับ SmartAIHub");
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  } finally {
    startPending = false;
    await refreshStatus();
  }
});
elements["stop-button"].addEventListener("click", async () => {
  if (stopPending) return;
  invalidatePendingStatus();
  stopPending = true;
  updateButton(elements["stop-button"], { disabled: true, pending: true, label: "กำลังหยุด…" });
  setNotice(elements["runtime-notice"], "กำลังหยุด Runner และปิดงานย่อยที่ทำงานอยู่…");
  try {
    await invoke("stop_runner");
    setNotice(elements["runtime-notice"], "หยุด Runner แล้ว");
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  } finally {
    stopPending = false;
    await refreshStatus();
  }
});
elements["add-workspace-button"].addEventListener("click", async () => {
  const button = elements["add-workspace-button"];
  invalidatePendingStatus();
  button.disabled = true;
  setNotice(elements["runtime-notice"], "กำลังเปิดหน้าต่างเลือกโฟลเดอร์…");
  try {
    const workspace = await invoke("add_workspace");
    if (workspace) {
      await refreshWorkspaces();
      setNotice(elements["runtime-notice"], `เพิ่ม ${workspace.displayName} แล้ว`);
    } else {
      setNotice(elements["runtime-notice"], "ยกเลิกการเลือกโฟลเดอร์แล้ว");
    }
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  } finally {
    button.disabled = false;
  }
});
function setWorkspaceViewMode(mode) {
  workspaceViewMode = mode === "developer" ? "developer" : "simple";
  localStorage.setItem("runner-workspace-view", workspaceViewMode);
  elements["workspace-simple-mode"].className = `button ${workspaceViewMode === "simple" ? "primary" : "quiet"}`;
  elements["workspace-simple-mode"].setAttribute("aria-pressed", String(workspaceViewMode === "simple"));
  elements["workspace-developer-mode"].className = `button ${workspaceViewMode === "developer" ? "primary" : "quiet"}`;
  elements["workspace-developer-mode"].setAttribute("aria-pressed", String(workspaceViewMode === "developer"));
  if (elements["debug-file-path"].dataset.path) {
    elements["debug-file-path"].textContent = workspaceViewMode === "developer"
      ? elements["debug-file-path"].dataset.path
      : "บันทึกไฟล์ Debug ไว้ในเครื่องแล้ว";
  }
  void refreshWorkspaces();
}
elements["workspace-simple-mode"].addEventListener("click", () => setWorkspaceViewMode("simple"));
elements["workspace-developer-mode"].addEventListener("click", () => setWorkspaceViewMode("developer"));
elements["default-workspace"].addEventListener("change", async event => {
  invalidatePendingStatus();
  try {
    await invoke("set_default_workspace", { workspaceId: event.target.value || null });
    setNotice(elements["runtime-notice"], "บันทึก workspace หลักไว้ในเครื่องแล้ว");
  } catch (error) {
    setNotice(elements["runtime-notice"], safeError(error));
  }
});
elements["auto-start"].addEventListener("change", async event => {
  invalidatePendingStatus();
  try {
    await invoke("set_auto_start", { enabled: event.target.checked });
    setNotice(elements["global-notice"], event.target.checked ? "เปิดเริ่มอัตโนมัติเมื่อเข้าสู่ระบบแล้ว" : "ปิดเริ่มอัตโนมัติแล้ว");
  } catch (error) {
    event.target.checked = !event.target.checked;
    setNotice(elements["global-notice"], safeError(error));
  }
});
elements["quit-button"].addEventListener("click", async () => {
  if (quitPending) return;
  invalidatePendingStatus();
  quitPending = true;
  updateButton(elements["quit-button"], { disabled: true, pending: true, label: "กำลังหยุดและปิด…" });
  try {
    await invoke("quit_runner");
  } catch (error) {
    quitPending = false;
    setNotice(elements["runtime-notice"], safeError(error));
    await refreshStatus();
  }
});

async function showWindowIfReady() {
  setWorkspaceViewMode(workspaceViewMode);
  await refreshStatus();
  await refreshWorkspaces();
  await scanTools();
}

showWindowIfReady();
window.setInterval(() => { void refreshStatus(); }, 5000);
