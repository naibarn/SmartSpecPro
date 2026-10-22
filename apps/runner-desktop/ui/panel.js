const { companionInvoke, normalizeCompanionState, statusLabel, progressLabel, taskStatusClass, escapeText, taskDetail } = window.SmartAIHubCompanion;
const surface = document.body.dataset.surface || "workspace";
const state = { projection: null, auth: null, preferences: null, selectedTaskId: null, conversationId: null, pro: false };

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

function renderProjection() { renderAuth(); renderDevices(); renderTasks(); setText("task-count", `${state.projection?.tasks?.length || 0} tasks`); }

async function refresh() {
  setText("notice", "Refreshing canonical projection…");
  try {
    state.auth = await companionInvoke("companion_auth_status");
    if (state.auth.availability === "authenticated" || state.auth.availability === "stale") {
      state.projection = normalizeCompanionState(await companionInvoke("companion_state"));
    } else {
      state.projection = null;
    }
    renderProjection();
    setText("notice", state.projection ? "Projection refreshed from Task Control." : "Projection unavailable; no status was inferred.");
  } catch (error) {
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
window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
