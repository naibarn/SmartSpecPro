import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, ArrowLeftRight, AlertCircle, CheckCircle2, FolderOpen, X } from "lucide-react";
import skillService from "../services/skillService";

interface SkillSyncManagerProps {
  workspace: string;
  onSyncComplete?: () => void;
}

interface DiffResult {
  synced: string[];
  only_kilo: string[];
  only_claude: string[];
  total_kilo: number;
  total_claude: number;
}

export function SkillSyncManager({ workspace, onSyncComplete }: SkillSyncManagerProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [syncDirection, setSyncDirection] = useState<"kilo-to-claude" | "claude-to-kilo" | "bidirectional">("bidirectional");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Load diff when dialog opens
  useEffect(() => {
    if (showDialog) {
      loadDiff();
    }
  }, [showDialog]);

  // Load diff
  const loadDiff = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await skillService.diffSkills(workspace);
      setDiffResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setLoading(false);
    }
  };

  // Handle sync
  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await skillService.syncSkills(workspace, {
        sourceFormat: syncDirection === "claude-to-kilo" ? "claude" : "kilo",
        bidirectional: syncDirection === "bidirectional",
      });

      setSuccess(`Synced ${result.synced_count} skill(s) successfully${result.failed_count > 0 ? `, ${result.failed_count} failed` : ""}`);

      // Reload diff after sync
      await loadDiff();

      setTimeout(() => {
        setShowDialog(false);
        setSuccess(null);
        onSyncComplete?.();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      {/* Sync Button */}
      <button
        onClick={() => setShowDialog(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          background: "#8b5cf6",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <ArrowLeftRight size={16} />
        Sync Kilo ↔ Claude
      </button>

      {/* Sync Dialog */}
      <AnimatePresence>
        {showDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setShowDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#1f2937",
                borderRadius: 12,
                padding: 24,
                maxWidth: 700,
                width: "90%",
                maxHeight: "80vh",
                overflow: "auto",
                color: "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Sync Skills: Kilo ↔ Claude</h2>
                <button
                  onClick={() => setShowDialog(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#9ca3af",
                    cursor: "pointer",
                    padding: 4,
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>
                Synchronize skills between .kilocode/skills and .claude/skills directories
              </div>

              {error && (
                <div style={{ padding: 12, background: "#dc2626", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {success && (
                <div style={{ padding: 12, background: "#10b981", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle2 size={16} />
                  {success}
                </div>
              )}

              {/* Directory Status */}
              {loading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                  <RefreshCw size={32} className="animate-spin" style={{ margin: "0 auto 12px" }} />
                  Loading diff...
                </div>
              ) : diffResult ? (
                <>
                  {/* Stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                    <div style={{ padding: 16, background: "#111827", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <FolderOpen size={16} style={{ color: "#3b82f6" }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af" }}>KILO CODE</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>{diffResult.total_kilo}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>skills in .kilocode/</div>
                    </div>
                    <div style={{ padding: 16, background: "#111827", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <FolderOpen size={16} style={{ color: "#8b5cf6" }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af" }}>CLAUDE CODE</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "#8b5cf6" }}>{diffResult.total_claude}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>skills in .claude/</div>
                    </div>
                  </div>

                  {/* Sync Status */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>Sync Status</span>
                      <button
                        onClick={loadDiff}
                        disabled={loading}
                        style={{
                          background: "none",
                          border: "1px solid #4b5563",
                          borderRadius: 6,
                          padding: "4px 12px",
                          color: "#9ca3af",
                          cursor: "pointer",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <RefreshCw size={12} />
                        Refresh
                      </button>
                    </div>

                    {/* Synced Skills */}
                    {diffResult.synced.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#10b981", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                          <CheckCircle2 size={14} />
                          Synced ({diffResult.synced.length})
                        </div>
                        <div style={{ maxHeight: 100, overflow: "auto", background: "#111827", borderRadius: 8, padding: 8 }}>
                          {diffResult.synced.map(name => (
                            <div key={name} style={{ padding: "4px 8px", fontSize: 12, color: "#9ca3af" }}>
                              {name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Only in Kilo */}
                    {diffResult.only_kilo.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#3b82f6", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                          <AlertCircle size={14} />
                          Only in Kilo ({diffResult.only_kilo.length})
                        </div>
                        <div style={{ maxHeight: 100, overflow: "auto", background: "#111827", borderRadius: 8, padding: 8 }}>
                          {diffResult.only_kilo.map(name => (
                            <div key={name} style={{ padding: "4px 8px", fontSize: 12, color: "#9ca3af" }}>
                              {name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Only in Claude */}
                    {diffResult.only_claude.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#8b5cf6", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                          <AlertCircle size={14} />
                          Only in Claude ({diffResult.only_claude.length})
                        </div>
                        <div style={{ maxHeight: 100, overflow: "auto", background: "#111827", borderRadius: 8, padding: 8 }}>
                          {diffResult.only_claude.map(name => (
                            <div key={name} style={{ padding: "4px 8px", fontSize: 12, color: "#9ca3af" }}>
                              {name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {diffResult.only_kilo.length === 0 && diffResult.only_claude.length === 0 && (
                      <div style={{ textAlign: "center", padding: 20, color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <CheckCircle2 size={16} />
                        All skills are in sync
                      </div>
                    )}
                  </div>

                  {/* Sync Direction */}
                  {(diffResult.only_kilo.length > 0 || diffResult.only_claude.length > 0) && (
                    <>
                      <div style={{ marginBottom: 20 }}>
                        <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
                          Sync Direction
                        </label>
                        <div style={{ display: "grid", gap: 8 }}>
                          <button
                            onClick={() => setSyncDirection("kilo-to-claude")}
                            style={{
                              padding: 12,
                              background: syncDirection === "kilo-to-claude" ? "#3b82f6" : "#374151",
                              border: "none",
                              borderRadius: 8,
                              color: "white",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ fontWeight: 500, marginBottom: 4 }}>Kilo → Claude</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Copy {diffResult.only_kilo.length} skill(s) from .kilocode/ to .claude/
                            </div>
                          </button>
                          <button
                            onClick={() => setSyncDirection("claude-to-kilo")}
                            style={{
                              padding: 12,
                              background: syncDirection === "claude-to-kilo" ? "#8b5cf6" : "#374151",
                              border: "none",
                              borderRadius: 8,
                              color: "white",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ fontWeight: 500, marginBottom: 4 }}>Claude → Kilo</div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Copy {diffResult.only_claude.length} skill(s) from .claude/ to .kilocode/
                            </div>
                          </button>
                          <button
                            onClick={() => setSyncDirection("bidirectional")}
                            style={{
                              padding: 12,
                              background: syncDirection === "bidirectional" ? "#10b981" : "#374151",
                              border: "none",
                              borderRadius: 8,
                              color: "white",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ fontWeight: 500, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                              <ArrowLeftRight size={16} />
                              Bidirectional (Recommended)
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>
                              Sync both directions - merge all skills
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => setShowDialog(false)}
                          style={{
                            padding: "8px 16px",
                            background: "#374151",
                            border: "none",
                            borderRadius: 8,
                            color: "white",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSync}
                          disabled={syncing}
                          style={{
                            padding: "8px 16px",
                            background: syncing ? "#4b5563" : "#10b981",
                            border: "none",
                            borderRadius: 8,
                            color: "white",
                            cursor: syncing ? "not-allowed" : "pointer",
                            fontSize: 14,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                          {syncing ? "Syncing..." : "Sync Now"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
