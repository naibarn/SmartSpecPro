const invoke = window.__TAURI__.core.invoke;

const element = id => document.getElementById(id);
const elements = {
  runnerDot: element("runner-dot"),
  runnerStatus: element("runner-status"),
  projectionStatus: element("projection-status"),
  refreshButton: element("refresh-button"),
  collapseButton: element("collapse-button"),
  expandedPanel: element("expanded-panel"),
  taskHeading: element("task-heading"),
  taskDetail: element("task-detail"),
  contractValue: element("contract-value"),
  authValue: element("auth-value"),
  transportValue: element("transport-value"),
  dockButton: element("dock-button"),
  topmostButton: element("topmost-button"),
  themeButton: element("theme-button"),
  settingsButton: element("settings-button"),
  hideButton: element("hide-button"),
  notice: element("notice"),
};

let preferences = { theme: "system", alwaysOnTop: false, edgeDock: true };
let previousConnection = null;
let projectionNotified = false;

function setNotice(message) {
  elements.notice.textContent = message || "";
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
}

function projectionState(value) {
  if (!value || value.schemaVersion !== "runner-companion.v1") {
    return { schemaVersion: "runner-companion.v1", availability: "unavailable", authentication: "unknown", transport: "unknown", reasonCode: "RUNNER_COMPANION_PROJECTION_INVALID" };
  }
  return value;
}

function renderProjection(value) {
  const projection = projectionState(value);
  elements.contractValue.textContent = projection.schemaVersion;
  elements.authValue.textContent = projection.authentication || "Not available";
  elements.transportValue.textContent = projection.transport || "Not configured";
  if (projection.availability === "available" && Array.isArray(projection.tasks)) {
    elements.projectionStatus.textContent = `${projection.tasks.length} canonical task${projection.tasks.length === 1 ? "" : "s"}`;
    elements.taskHeading.textContent = "Canonical Task Control state";
    elements.taskDetail.textContent = "Live task rendering is supplied by the authenticated runner-companion.v1 projection.";
    return;
  }
  elements.projectionStatus.textContent = "Task Control projection unavailable";
  elements.taskHeading.textContent = "Waiting for an authenticated projection";
  elements.taskDetail.textContent = projection.detail || "No task status, progress, approval or evidence is displayed until the desktop has an authorized user-scoped transport.";
  if (!projectionNotified) {
    projectionNotified = true;
    void invoke("notify_companion", { kind: "projection_unavailable" }).catch(() => undefined);
  }
}

function renderRunnerStatus(status) {
  const connected = Boolean(status?.connected);
  const running = Boolean(status?.running);
  elements.runnerDot.className = `status-dot ${connected ? "online" : "offline"}`;
  elements.runnerStatus.textContent = connected
    ? running ? "Runner is online · receiving authorized work" : "Runner is paired · ready"
    : status?.credentialState === "reauth_required" ? "Reconnect required" : "Runner is offline";
  const connection = connected ? "online" : "offline";
  if (previousConnection && previousConnection !== connection) {
    void invoke("notify_companion", { kind: connection === "online" ? "reconnected" : "offline" }).catch(() => undefined);
  }
  previousConnection = connection;
}

async function refresh() {
  try {
    const [status, projection] = await Promise.all([
      invoke("runner_status"),
      invoke("companion_projection_status"),
    ]);
    renderRunnerStatus(status);
    renderProjection(projection);
  } catch (error) {
    elements.runnerDot.className = "status-dot offline";
    elements.runnerStatus.textContent = "Runner status unavailable";
    elements.projectionStatus.textContent = "Reconnect to refresh state";
    setNotice(String(error));
  }
}

async function loadPreferences() {
  preferences = await invoke("companion_preferences");
  setTheme(preferences.theme);
  elements.topmostButton.setAttribute("aria-pressed", String(preferences.alwaysOnTop));
  elements.topmostButton.textContent = preferences.alwaysOnTop ? "On top ✓" : "Stay on top";
}

async function savePreferences(next) {
  preferences = await invoke("set_companion_preferences", {
    theme: next.theme,
    alwaysOnTop: next.alwaysOnTop,
    edgeDock: next.edgeDock,
  });
  setTheme(preferences.theme);
  elements.topmostButton.setAttribute("aria-pressed", String(preferences.alwaysOnTop));
  elements.topmostButton.textContent = preferences.alwaysOnTop ? "On top ✓" : "Stay on top";
}

elements.collapseButton.addEventListener("click", async () => {
  const expanded = elements.expandedPanel.hidden;
  elements.expandedPanel.hidden = !expanded;
  elements.collapseButton.setAttribute("aria-expanded", String(expanded));
  elements.collapseButton.setAttribute("aria-label", expanded ? "Collapse companion details" : "Expand companion details");
  elements.collapseButton.textContent = expanded ? "⌃" : "⌄";
  try {
    await invoke("set_companion_expanded", { expanded });
  } catch (error) {
    elements.expandedPanel.hidden = expanded;
    elements.collapseButton.setAttribute("aria-expanded", String(!expanded));
    elements.collapseButton.setAttribute("aria-label", expanded ? "Expand companion details" : "Collapse companion details");
    elements.collapseButton.textContent = expanded ? "⌄" : "⌃";
    setNotice(`Unable to resize companion: ${String(error)}`);
  }
});

elements.refreshButton.addEventListener("click", async () => {
  elements.refreshButton.disabled = true;
  setNotice("Refreshing local Runner status…");
  await refresh();
  setNotice("");
  elements.refreshButton.disabled = false;
});

elements.dockButton.addEventListener("click", async () => {
  try {
    await invoke("snap_companion_to_edge");
    setNotice("Companion docked to the nearest screen edge.");
  } catch (error) {
    setNotice(String(error));
  }
});

elements.topmostButton.addEventListener("click", async () => {
  try {
    await savePreferences({ ...preferences, alwaysOnTop: !preferences.alwaysOnTop });
  } catch (error) {
    setNotice(String(error));
  }
});

elements.themeButton.addEventListener("click", async () => {
  const nextTheme = preferences.theme === "system" ? "dark" : preferences.theme === "dark" ? "light" : "system";
  try {
    await savePreferences({ ...preferences, theme: nextTheme });
    setNotice(`Theme: ${nextTheme}`);
  } catch (error) {
    setNotice(String(error));
  }
});

elements.settingsButton.addEventListener("click", () => invoke("open_runner_settings"));
elements.hideButton.addEventListener("click", () => invoke("hide_companion"));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") void invoke("hide_companion");
});

void loadPreferences().then(refresh).catch(error => setNotice(String(error)));
window.setInterval(() => {
  if (!document.hidden) void refresh();
}, 15000);
