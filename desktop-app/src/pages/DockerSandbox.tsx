/**
 * Docker Sandbox Page
 * 
 * Provides Docker container and image management for local sandbox environments.
 * Allows users to create, manage, and monitor Docker containers for testing.
 */

import { useState, useEffect, useCallback } from "react";
import {
  dockerService,
  ContainerInfo,
  ContainerStats,
  ImageInfo,
  DockerInfo,
  formatBytes,
  getStatusBadge,
  SandboxConfig,
} from "../services/dockerService";

// Tab type
type TabType = "containers" | "images" | "create";

// Styles
const styles = {
  container: {
    padding: 24,
    maxWidth: 1400,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#111827",
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  statusBanner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    marginBottom: 20,
  },
  statusAvailable: {
    background: "#d1fae5",
    border: "1px solid #10b981",
  },
  statusUnavailable: {
    background: "#fee2e2",
    border: "1px solid #ef4444",
  },
  tabs: {
    display: "flex",
    gap: 4,
    borderBottom: "1px solid #e5e7eb",
    marginBottom: 20,
  },
  tab: {
    padding: "10px 16px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    color: "#6b7280",
    borderBottom: "2px solid transparent",
    marginBottom: -1,
  },
  tabActive: {
    color: "#111827",
    borderBottomColor: "#111827",
  },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: "#111827",
    margin: 0,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "2px 8px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 500,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginTop: 12,
  },
  statItem: {
    textAlign: "center" as const,
    padding: 8,
    background: "#f9fafb",
    borderRadius: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 600,
    color: "#111827",
  },
  statLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  buttonGroup: {
    display: "flex",
    gap: 8,
  },
  button: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  buttonPrimary: {
    background: "#111827",
    color: "#fff",
    border: "1px solid #111827",
  },
  buttonDanger: {
    background: "#fee2e2",
    color: "#dc2626",
    border: "1px solid #fecaca",
  },
  buttonSuccess: {
    background: "#d1fae5",
    color: "#059669",
    border: "1px solid #a7f3d0",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
  },
  th: {
    textAlign: "left" as const,
    padding: "12px 16px",
    borderBottom: "1px solid #e5e7eb",
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
  },
  td: {
    padding: "12px 16px",
    borderBottom: "1px solid #f3f4f6",
    fontSize: 14,
    color: "#374151",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    fontSize: 14,
    outline: "none",
  },
  label: {
    display: "block",
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
    marginBottom: 6,
  },
  formGroup: {
    marginBottom: 16,
  },
  logsContainer: {
    background: "#1f2937",
    borderRadius: 8,
    padding: 16,
    maxHeight: 400,
    overflow: "auto",
    fontFamily: "monospace",
    fontSize: 12,
    color: "#d1d5db",
    whiteSpace: "pre-wrap" as const,
  },
  emptyState: {
    textAlign: "center" as const,
    padding: 40,
    color: "#6b7280",
  },
  refreshButton: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  },
};

export default function DockerSandbox() {
  // State
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("containers");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  const [containerStats, setContainerStats] = useState<Record<string, ContainerStats>>({});
  const [containerLogs, setContainerLogs] = useState<string>("");
  const [showLogs, setShowLogs] = useState(false);

  // Create sandbox form state
  const [sandboxForm, setSandboxForm] = useState<SandboxConfig>({
    name: "",
    image: "ubuntu:22.04",
    ports: [],
    volumes: [],
    env_vars: {},
    memory_limit: "512m",
    cpu_limit: 1,
  });
  const [portsInput, setPortsInput] = useState("");
  const [volumesInput, setVolumesInput] = useState("");
  const [creating, setCreating] = useState(false);

  // Load Docker info
  const loadDockerInfo = useCallback(async () => {
    try {
      const info = await dockerService.checkDocker();
      setDockerInfo(info);
      return info.available;
    } catch (err) {
      setError(String(err));
      return false;
    }
  }, []);

  // Load containers
  const loadContainers = useCallback(async () => {
    try {
      const list = await dockerService.listContainers(true);
      setContainers(list);

      // Load stats for running containers
      const stats: Record<string, ContainerStats> = {};
      for (const container of list) {
        if (container.status === "running") {
          try {
            stats[container.id] = await dockerService.getContainerStats(container.id);
          } catch {
            // Ignore stats errors
          }
        }
      }
      setContainerStats(stats);
    } catch (err) {
      console.error("Failed to load containers:", err);
    }
  }, []);

  // Load images
  const loadImages = useCallback(async () => {
    try {
      const list = await dockerService.listImages();
      setImages(list);
    } catch (err) {
      console.error("Failed to load images:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const available = await loadDockerInfo();
      if (available) {
        await Promise.all([loadContainers(), loadImages()]);
      }
      setLoading(false);
    };
    init();
  }, [loadDockerInfo, loadContainers, loadImages]);

  // Auto-refresh stats
  useEffect(() => {
    if (!dockerInfo?.available) return;

    const interval = setInterval(() => {
      loadContainers();
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [dockerInfo?.available, loadContainers]);

  // Container actions
  const handleStartContainer = async (id: string) => {
    try {
      await dockerService.startContainer(id);
      await loadContainers();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleStopContainer = async (id: string) => {
    try {
      await dockerService.stopContainer(id);
      await loadContainers();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleRestartContainer = async (id: string) => {
    try {
      await dockerService.restartContainer(id);
      await loadContainers();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleRemoveContainer = async (id: string) => {
    if (!confirm("Are you sure you want to remove this container?")) return;
    try {
      await dockerService.removeContainer(id, true);
      await loadContainers();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleViewLogs = async (id: string) => {
    try {
      const logs = await dockerService.getContainerLogs(id, 200);
      setContainerLogs(logs.logs);
      setSelectedContainer(id);
      setShowLogs(true);
    } catch (err) {
      setError(String(err));
    }
  };

  // Image actions
  const handleRemoveImage = async (id: string) => {
    if (!confirm("Are you sure you want to remove this image?")) return;
    try {
      await dockerService.removeImage(id, false);
      await loadImages();
    } catch (err) {
      setError(String(err));
    }
  };

  const handlePruneImages = async () => {
    if (!confirm("Remove all unused images?")) return;
    try {
      await dockerService.pruneImages();
      await loadImages();
    } catch (err) {
      setError(String(err));
    }
  };

  // Create sandbox
  const handleCreateSandbox = async () => {
    if (!sandboxForm.name || !sandboxForm.image) {
      setError("Name and image are required");
      return;
    }

    setCreating(true);
    try {
      const config: SandboxConfig = {
        ...sandboxForm,
        ports: portsInput.split(",").map(p => p.trim()).filter(Boolean),
        volumes: volumesInput.split(",").map(v => v.trim()).filter(Boolean),
      };
      await dockerService.createSandbox(config);
      await loadContainers();
      setActiveTab("containers");
      // Reset form
      setSandboxForm({
        name: "",
        image: "ubuntu:22.04",
        ports: [],
        volumes: [],
        env_vars: {},
        memory_limit: "512m",
        cpu_limit: 1,
      });
      setPortsInput("");
      setVolumesInput("");
    } catch (err) {
      setError(String(err));
    } finally {
      setCreating(false);
    }
  };

  // Render Docker status banner
  const renderStatusBanner = () => {
    if (!dockerInfo) return null;

    if (!dockerInfo.available) {
      return (
        <div style={{ ...styles.statusBanner, ...styles.statusUnavailable }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, color: "#dc2626" }}>Docker Not Available</div>
            <div style={{ fontSize: 13, color: "#991b1b" }}>
              {dockerInfo.error || "Please install and start Docker Desktop"}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ ...styles.statusBanner, ...styles.statusAvailable }}>
        <span style={{ fontSize: 20 }}>🐳</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: "#059669" }}>
            Docker {dockerInfo.version} ({dockerInfo.os_type}/{dockerInfo.architecture})
          </div>
          <div style={{ fontSize: 13, color: "#047857" }}>
            {dockerInfo.containers_running} running / {dockerInfo.containers_total} total containers • {dockerInfo.images} images
          </div>
        </div>
        <button
          style={styles.refreshButton}
          onClick={() => {
            loadDockerInfo();
            loadContainers();
            loadImages();
          }}
        >
          🔄 Refresh
        </button>
      </div>
    );
  };

  // Render containers tab
  const renderContainersTab = () => {
    if (containers.length === 0) {
      return (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>No containers found</div>
          <div style={{ marginTop: 8 }}>Create a sandbox to get started</div>
          <button
            style={{ ...styles.button, ...styles.buttonPrimary, marginTop: 16 }}
            onClick={() => setActiveTab("create")}
          >
            + Create Sandbox
          </button>
        </div>
      );
    }

    return (
      <div>
        {containers.map((container) => {
          const statusBadge = getStatusBadge(container.status);
          const stats = containerStats[container.id];

          return (
            <div key={container.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h3 style={styles.cardTitle}>{container.name}</h3>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                    {container.image} • {container.id}
                  </div>
                </div>
                <span
                  style={{
                    ...styles.badge,
                    background: statusBadge.bg,
                    color: statusBadge.color,
                  }}
                >
                  {statusBadge.text}
                </span>
              </div>

              {stats && (
                <div style={styles.statsGrid}>
                  <div style={styles.statItem}>
                    <div style={styles.statValue}>{stats.cpu_percent.toFixed(1)}%</div>
                    <div style={styles.statLabel}>CPU</div>
                  </div>
                  <div style={styles.statItem}>
                    <div style={styles.statValue}>{stats.memory_percent.toFixed(1)}%</div>
                    <div style={styles.statLabel}>Memory</div>
                  </div>
                  <div style={styles.statItem}>
                    <div style={styles.statValue}>{formatBytes(stats.memory_usage)}</div>
                    <div style={styles.statLabel}>Mem Used</div>
                  </div>
                  <div style={styles.statItem}>
                    <div style={styles.statValue}>{formatBytes(stats.network_rx)}</div>
                    <div style={styles.statLabel}>Net RX</div>
                  </div>
                </div>
              )}

              <div style={{ ...styles.buttonGroup, marginTop: 16 }}>
                {container.status === "running" ? (
                  <>
                    <button
                      style={{ ...styles.button, ...styles.buttonDanger }}
                      onClick={() => handleStopContainer(container.id)}
                    >
                      ⏹ Stop
                    </button>
                    <button style={styles.button} onClick={() => handleRestartContainer(container.id)}>
                      🔄 Restart
                    </button>
                  </>
                ) : (
                  <button
                    style={{ ...styles.button, ...styles.buttonSuccess }}
                    onClick={() => handleStartContainer(container.id)}
                  >
                    ▶ Start
                  </button>
                )}
                <button style={styles.button} onClick={() => handleViewLogs(container.id)}>
                  📋 Logs
                </button>
                <button
                  style={{ ...styles.button, ...styles.buttonDanger }}
                  onClick={() => handleRemoveContainer(container.id)}
                >
                  🗑 Remove
                </button>
              </div>
            </div>
          );
        })}

        {/* Logs Modal */}
        {showLogs && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setShowLogs(false)}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 24,
                width: "80%",
                maxWidth: 900,
                maxHeight: "80vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Container Logs: {selectedContainer}</h3>
                <button style={styles.button} onClick={() => setShowLogs(false)}>
                  ✕ Close
                </button>
              </div>
              <div style={styles.logsContainer}>{containerLogs || "No logs available"}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render images tab
  const renderImagesTab = () => {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button style={{ ...styles.button, ...styles.buttonDanger }} onClick={handlePruneImages}>
            🧹 Prune Unused Images
          </button>
        </div>

        {images.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>No images found</div>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Repository</th>
                <th style={styles.th}>Tag</th>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Size</th>
                <th style={styles.th}>Created</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {images.map((image) => (
                <tr key={image.id}>
                  <td style={styles.td}>{image.repository}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: "#e5e7eb", color: "#374151" }}>
                      {image.tag}
                    </span>
                  </td>
                  <td style={{ ...styles.td, fontFamily: "monospace", fontSize: 12 }}>
                    {image.id.substring(0, 12)}
                  </td>
                  <td style={styles.td}>{image.size}</td>
                  <td style={styles.td}>{image.created}</td>
                  <td style={styles.td}>
                    <button
                      style={{ ...styles.button, ...styles.buttonDanger }}
                      onClick={() => handleRemoveImage(image.id)}
                    >
                      🗑 Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  // Render create sandbox tab
  const renderCreateTab = () => {
    return (
      <div style={{ maxWidth: 600 }}>
        <div style={styles.card}>
          <h3 style={{ ...styles.cardTitle, marginBottom: 20 }}>Create New Sandbox</h3>

          <div style={styles.formGroup}>
            <label style={styles.label}>Container Name *</label>
            <input
              style={styles.input}
              type="text"
              placeholder="my-sandbox"
              value={sandboxForm.name}
              onChange={(e) => setSandboxForm({ ...sandboxForm, name: e.target.value })}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Base Image *</label>
            <select
              style={styles.input}
              value={sandboxForm.image}
              onChange={(e) => setSandboxForm({ ...sandboxForm, image: e.target.value })}
            >
              <option value="ubuntu:22.04">Ubuntu 22.04</option>
              <option value="ubuntu:20.04">Ubuntu 20.04</option>
              <option value="node:20">Node.js 20</option>
              <option value="node:18">Node.js 18</option>
              <option value="python:3.11">Python 3.11</option>
              <option value="python:3.10">Python 3.10</option>
              <option value="golang:1.21">Go 1.21</option>
              <option value="rust:latest">Rust (latest)</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Port Mappings (comma separated)</label>
            <input
              style={styles.input}
              type="text"
              placeholder="3000:3000, 8080:8080"
              value={portsInput}
              onChange={(e) => setPortsInput(e.target.value)}
            />
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Format: host_port:container_port
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Volume Mounts (comma separated)</label>
            <input
              style={styles.input}
              type="text"
              placeholder="/path/on/host:/path/in/container"
              value={volumesInput}
              onChange={(e) => setVolumesInput(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Memory Limit</label>
              <select
                style={styles.input}
                value={sandboxForm.memory_limit}
                onChange={(e) => setSandboxForm({ ...sandboxForm, memory_limit: e.target.value })}
              >
                <option value="256m">256 MB</option>
                <option value="512m">512 MB</option>
                <option value="1g">1 GB</option>
                <option value="2g">2 GB</option>
                <option value="4g">4 GB</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>CPU Limit</label>
              <select
                style={styles.input}
                value={sandboxForm.cpu_limit}
                onChange={(e) => setSandboxForm({ ...sandboxForm, cpu_limit: parseFloat(e.target.value) })}
              >
                <option value="0.5">0.5 CPU</option>
                <option value="1">1 CPU</option>
                <option value="2">2 CPUs</option>
                <option value="4">4 CPUs</option>
              </select>
            </div>
          </div>

          <button
            style={{ ...styles.button, ...styles.buttonPrimary, width: "100%", justifyContent: "center", marginTop: 8 }}
            onClick={handleCreateSandbox}
            disabled={creating}
          >
            {creating ? "Creating..." : "🚀 Create Sandbox"}
          </button>
        </div>
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={{ fontSize: 32 }}>⏳</div>
          <div style={{ marginTop: 12 }}>Loading Docker information...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🐳 Docker Sandbox</h1>
          <p style={styles.subtitle}>Manage local Docker containers for testing and development</p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: 12,
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#dc2626",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{error}</span>
          <button style={{ ...styles.button }} onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Status Banner */}
      {renderStatusBanner()}

      {/* Tabs */}
      {dockerInfo?.available && (
        <>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tab, ...(activeTab === "containers" ? styles.tabActive : {}) }}
              onClick={() => setActiveTab("containers")}
            >
              📦 Containers ({containers.length})
            </button>
            <button
              style={{ ...styles.tab, ...(activeTab === "images" ? styles.tabActive : {}) }}
              onClick={() => setActiveTab("images")}
            >
              🖼️ Images ({images.length})
            </button>
            <button
              style={{ ...styles.tab, ...(activeTab === "create" ? styles.tabActive : {}) }}
              onClick={() => setActiveTab("create")}
            >
              ➕ Create Sandbox
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "containers" && renderContainersTab()}
          {activeTab === "images" && renderImagesTab()}
          {activeTab === "create" && renderCreateTab()}
        </>
      )}
    </div>
  );
}
