/**
 * Widget React Entry Point
 *
 * Reads the signed init token from URL query parameter ?token=...
 * Establishes WebSocket connection to wss://smartaihub.app/widget/v1/ws
 * Renders WidgetChat component with connection state.
 *
 * Token is stored in sessionStorage only (not accessible to parent page via postMessage).
 */

import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WidgetChat } from "./WidgetChat";

function getParams(): { token: string | null; widgetId: string | null } {
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get("token"),
    widgetId: params.get("widget"),
  };
}

function App() {
  const { token, widgetId } = getParams();

  if (!token || !widgetId) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, sans-serif",
          color: "#666",
          fontSize: "14px",
        }}
      >
        Widget configuration error. Missing token.
      </div>
    );
  }

  // Store token in sessionStorage for reconnection
  try {
    sessionStorage.setItem("ssp_widget_token", token);
    sessionStorage.setItem("ssp_widget_id", widgetId);
  } catch {
    // sessionStorage may be unavailable in some iframe sandbox configurations
  }

  const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/widget/v1/ws`;

  return <WidgetChat token={token} widgetId={widgetId} wsUrl={wsUrl} />;
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
