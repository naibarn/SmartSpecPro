const { companionInvoke, normalizeCompanionState, statusLabel, progressLabel, taskStatusClass, escapeText, taskDetail } = window.SmartAIHubCompanion;
const surface = document.body.dataset.surface || "workspace";
const state = { projection: null, auth: null, preferences: null, selectedTaskId: null, conversationId: null, pro: false };
let refreshSequence = 0;

const el = id => document.getElementById(id);
const setText = (id, value) => { const node = el(id); if (node) node.textContent = escapeText(value); };

function setTheme() {
  document.documentElement.dataset.theme = state.preferences?.theme === "light"
    ? "light"
    : state.preferences?.theme === "dark"
      ? "dark"
      : localStorage.getItem("smartaihub-theme") || "dark";
}

async function loadPreferences() {
  try {
    state.preferences = await companionInvoke("companion_preferences");
  } catch {
    state.preferences = null;
  }
  setTheme();
}

function renderAuth() {
  const auth = state.auth;
  const label = auth?.availability === "authenticated" ? "Authenticated desktop session" : auth?.availability === "stale" ? "Session stale · refresh required" : "Projection unavailable";
  setText("auth-status", label);
  setText("auth-detail", auth?.detail || "No authenticated user-scoped transport is available.");
  const refresh = el("refresh-button");
  if (refresh) refresh.disabled = false;
  const toolbar = document.querySelector(".topbar .toolbar");
  if (toolbar && !el("logout-button")) {
    const logout = document.createElement("button");
    logout.className = "secondary";
    logout.id = "logout-button";
    logout.type = "button";
    logout.textContent = "Sign out";
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      try {
        const result = await companionInvoke("logout_companion");
        state.auth = null;
        state.projection = null;
        renderProjection();
        if (result?.serverRevocation === "confirmed") {
          setText("notice", "Local sign-out complete; server revocation confirmed.");
        } else if (result?.pendingRevocation) {
          setText("notice", "Local sign-out complete; server revocation is unconfirmed and queued for retry.");
        } else {
          setText("notice", "Local sign-out complete; server revocation is unconfirmed.");
        }
      } catch (error) {
        setText("notice", `Sign out unavailable: ${String(error)}`);
      } finally {
        logout.disabled = false;
      }
    });
    toolbar.append(logout);
  }
  const logout = el("logout-button");
  if (logout) logout.hidden = auth?.availability !== "authenticated" && auth?.availability !== "stale";
}

function renderDevices() {
  const target = el("device-list");
  if (!target) return;
  target.replaceChildren();
  if (!state.projection?.devices?.length) {
    target.innerHTML = '<p class="muted">No authorized Runner devices are visible in this tenant projection.</p>';
    return;
  }
  for (const device of state.projection.devices) {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `<strong>${escapeText(device.displayName)}</strong><br><span class="state state-${escapeText(device.connectivity)}">${escapeText(device.connectivity)} · ${escapeText(device.capabilities?.state || "capabilities unavailable")}</span>`;
    target.append(item);
  }
}

function renderTasks() {
  const target = el("task-list");
  if (!target) return;
  target.replaceChildren();
  const tasks = state.projection?.tasks || [];
  if (!tasks.length) {
    target.innerHTML = '<section class="empty"><p class="muted">No canonical tasks are available. The companion never fabricates progress or execution state.</p></section>';
    return;
  }
  for (const task of tasks) {
    const percent = Number.isFinite(task.progress?.percent) ? Math.max(0, Math.min(100, task.progress.percent)) : 0;
    const row = document.createElement("article");
    row.className = "task-row";
    row.innerHTML = `<div class="task-head"><strong>${escapeText(task.jobType || task.jobId)}</strong><span class="state ${taskStatusClass(task.status)}">${statusLabel(task.status)}</span></div><div class="muted">${escapeText(taskDetail(task))}</div><div class="progress-track" aria-label="${escapeText(progressLabel(task))}"><div class="progress-value" style="width:${percent}%"></div></div><div class="statusbar"><small class="muted">${escapeText(progressLabel(task))}</small><small class="muted">Next: ${escapeText(task.nextAction || "none")}</small></div>`;
    target.append(row);
  }
}

function renderProjectionDetails() {
  const taskList = el("task-list");
  if (!taskList) return;
  el("projection-details")?.remove();
  const projection = state.projection;
  if (!projection) return;
  const section = document.createElement("section");
  section.id = "projection-details";
  section.className = "auxiliary-grid";
  const reconciliation = document.createElement("article");
  reconciliation.className = "auxiliary-card";
  const reconciliationTitle = document.createElement("strong");
  reconciliationTitle.textContent = "Reconciliation";
  const reconciliationText = document.createElement("p");
  reconciliationText.className = "muted";
  reconciliationText.textContent = `${projection.reconciliation?.consistency || "Canonical projection"} · as of ${projection.reconciliation?.asOf || "unknown"} · refresh by ${projection.reconciliation?.expiresAt || "unknown"}`;
  reconciliation.append(reconciliationTitle, reconciliationText);
  section.append(reconciliation);

  const approvals = document.createElement("article");
  approvals.className = "auxiliary-card";
  const approvalTitle = document.createElement("strong");
  approvalTitle.textContent = `Approvals (${projection.approvals?.length || 0})`;
  approvals.append(approvalTitle);
  const approvalText = document.createElement("p");
  approvalText.className = "muted";
  approvalText.textContent = projection.approvals?.length
    ? "Approval state is observed from canonical Task Control. Decisions must be completed in the authorized SmartAIHub web/mobile flow."
    : "No canonical approval records are currently reported.";
  approvals.append(approvalText);
  section.append(approvals);

  const evidence = document.createElement("article");
  evidence.className = "auxiliary-card";
  const evidenceTitle = document.createElement("strong");
  evidenceTitle.textContent = `Evidence (${projection.evidence?.length || 0})`;
  evidence.append(evidenceTitle);
  const evidenceText = document.createElement("p");
  evidenceText.className = "muted";
  evidenceText.textContent = projection.evidence?.length
    ? projection.evidence.map(item => `${item.kind}: ${item.evidenceId}`).join(" · ")
    : "No verifiable output references are currently reported.";
  evidence.append(evidenceText);
  section.append(evidence);
  taskList.append(section);
}

function renderProjection() {
  renderAuth();
  renderDevices();
  renderTasks();
  renderProjectionDetails();
  setText("task-count", `${state.projection?.tasks?.length || 0} tasks`);
}

async function refresh() {
  const sequence = ++refreshSequence;
  setText("notice", "Refreshing canonical projection…");
  try {
    const auth = await companionInvoke("companion_auth_status");
    if (sequence !== refreshSequence) return;
    state.auth = auth;
    if (auth.availability === "authenticated" || auth.availability === "stale") {
      state.projection = normalizeCompanionState(await companionInvoke("companion_state"));
    } else {
      state.projection = null;
    }
    if (sequence !== refreshSequence) return;
    renderProjection();
    setText("notice", state.projection ? "Projection refreshed from Task Control." : "Projection unavailable; no status was inferred.");
  } catch (error) {
    if (sequence !== refreshSequence) return;
    state.projection = null;
    renderProjection();
    setText("notice", `Unavailable: ${String(error)}`);
  }
}

async function submitChat() {
  const input = el("chat-input");
  const goal = input?.value.trim();
  if (!goal) return;
  const button = el("send-button");
  if (button) button.disabled = true;
  setText("notice", "Sending through canonical SmartAIHub Chat ingress…");
  try {
    const result = await companionInvoke("companion_chat", { content: goal, conversationId: state.conversationId });
    state.conversationId = result.conversationId;
    const messages = el("chat-messages");
    if (messages) {
      const user = document.createElement("article"); user.className = "task-row"; user.innerHTML = `<strong>You</strong><p>${escapeText(goal)}</p>`; messages.append(user);
      const assistant = document.createElement("article"); assistant.className = "task-row"; assistant.innerHTML = `<strong>SmartAIHub</strong><p>${escapeText(result.content || "Canonical Chat returned no assistant content.")}</p>`; messages.append(assistant); messages.scrollTop = messages.scrollHeight;
    }
    input.value = "";
    setText("notice", "Canonical Chat response received.");
    await refresh();
  } catch (error) { setText("notice", `Chat unavailable: ${String(error)}`); }
  if (button) button.disabled = false;
}

el("refresh-button")?.addEventListener("click", refresh);
el("send-button")?.addEventListener("click", submitChat);
el("chat-input")?.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") void submitChat(); });
el("simple-mode")?.addEventListener("click", () => { state.pro = false; el("simple-mode").setAttribute("aria-pressed", "true"); el("pro-mode")?.setAttribute("aria-pressed", "false"); el("pro-details")?.setAttribute("hidden", ""); });
el("pro-mode")?.addEventListener("click", () => { state.pro = true; el("pro-mode").setAttribute("aria-pressed", "true"); el("simple-mode")?.setAttribute("aria-pressed", "false"); el("pro-details")?.removeAttribute("hidden"); });
el("open-settings")?.addEventListener("click", () => companionInvoke("open_runner_settings"));
el("open-chat")?.addEventListener("click", () => companionInvoke("open_chat_panel"));
el("open-workspace")?.addEventListener("click", () => companionInvoke("open_full_workspace"));
void loadPreferences();
void refresh();
window.addEventListener("online", () => void refresh());
window.addEventListener("offline", () => setText("notice", "Offline: waiting for the authenticated transport to reconnect."));
document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
