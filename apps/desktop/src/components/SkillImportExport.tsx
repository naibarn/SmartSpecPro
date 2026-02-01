import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Upload, FileJson, FileText, X, CheckCircle2, AlertCircle } from "lucide-react";
import type { Skill } from "../types/skill";
import skillService from "../services/skillService";

interface SkillImportExportProps {
  workspace: string;
  onImportComplete?: () => void;
}

export function SkillImportExport({ workspace, onImportComplete }: SkillImportExportProps) {
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "yaml">("json");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Skill[]>([]);
  const [importConflicts, setImportConflicts] = useState<string[]>([]);

  // Load skills for export
  const loadSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await skillService.listSkills(workspace);
      setSkills(response.skills);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  };

  // Open export dialog
  const openExportDialog = async () => {
    setShowExportDialog(true);
    await loadSkills();
  };

  // Handle export
  const handleExport = async () => {
    if (selectedSkills.length === 0) {
      setError("Please select at least one skill to export");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const skillsToExport = skills.filter(s => selectedSkills.includes(s.name));
      const data = {
        version: "1.0",
        exported_at: new Date().toISOString(),
        skills: skillsToExport,
      };

      let content: string;
      let filename: string;
      let mimeType: string;

      if (exportFormat === "json") {
        content = JSON.stringify(data, null, 2);
        filename = `skills-export-${Date.now()}.json`;
        mimeType = "application/json";
      } else {
        // Simple YAML export (without dependencies)
        content = `version: "1.0"\nexported_at: "${data.exported_at}"\nskills:\n`;
        skillsToExport.forEach(skill => {
          content += `  - name: ${skill.name}\n`;
          content += `    description: ${skill.description}\n`;
          content += `    scope: ${skill.scope}\n`;
          content += `    mode: ${skill.mode}\n`;
          if (skill.version) content += `    version: ${skill.version}\n`;
          if (skill.author) content += `    author: ${skill.author}\n`;
          if (skill.tags.length > 0) content += `    tags: [${skill.tags.join(", ")}]\n`;
          content += `    content: |\n`;
          skill.content.split("\n").forEach(line => {
            content += `      ${line}\n`;
          });
        });
        filename = `skills-export-${Date.now()}.yaml`;
        mimeType = "application/x-yaml";
      }

      // Download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(`Exported ${selectedSkills.length} skill(s) successfully`);
      setTimeout(() => {
        setShowExportDialog(false);
        setSuccess(null);
        setSelectedSkills([]);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  // Handle import file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setError(null);
    setLoading(true);

    try {
      const text = await file.text();
      let data: any;

      if (file.name.endsWith(".json")) {
        data = JSON.parse(text);
      } else if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
        // Simple YAML parsing (for demo - use proper parser in production)
        setError("YAML import not yet implemented. Please use JSON format.");
        setLoading(false);
        return;
      } else {
        setError("Unsupported file format. Please use .json or .yaml files.");
        setLoading(false);
        return;
      }

      // Validate structure
      if (!data.skills || !Array.isArray(data.skills)) {
        setError("Invalid file format. Missing 'skills' array.");
        setLoading(false);
        return;
      }

      setImportPreview(data.skills);

      // Check for conflicts
      const response = await skillService.listSkills(workspace);
      const existingNames = response.skills.map(s => s.name);
      const conflicts = data.skills
        .map((s: Skill) => s.name)
        .filter((name: string) => existingNames.includes(name));
      setImportConflicts(conflicts);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setLoading(false);
    }
  };

  // Handle import
  const handleImport = async (overwrite: boolean = false) => {
    if (!importPreview.length) {
      setError("No skills to import");
      return;
    }

    setLoading(true);
    setError(null);

    let imported = 0;
    let failed = 0;

    for (const skill of importPreview) {
      // Skip if conflict and not overwriting
      if (!overwrite && importConflicts.includes(skill.name)) {
        continue;
      }

      try {
        // Check if exists
        const exists = importConflicts.includes(skill.name);

        if (exists && overwrite) {
          await skillService.updateSkill(workspace, skill.name, {
            description: skill.description,
            content: skill.content,
            scope: skill.scope,
            mode: skill.mode,
            tags: skill.tags,
          });
        } else if (!exists) {
          await skillService.createSkill(workspace, {
            name: skill.name,
            description: skill.description,
            content: skill.content,
            scope: skill.scope,
            mode: skill.mode,
            tags: skill.tags,
            version: skill.version,
            author: skill.author,
            allowedTools: skill.allowedTools,
            model: skill.model,
          });
        }
        imported++;
      } catch (err) {
        console.error(`Failed to import ${skill.name}:`, err);
        failed++;
      }
    }

    setLoading(false);
    setSuccess(`Imported ${imported} skill(s)${failed > 0 ? `, ${failed} failed` : ""}`);

    setTimeout(() => {
      setShowImportDialog(false);
      setSuccess(null);
      setImportFile(null);
      setImportPreview([]);
      setImportConflicts([]);
      onImportComplete?.();
    }, 2000);
  };

  return (
    <>
      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={openExportDialog}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <Download size={16} />
          Export Skills
        </button>
        <button
          onClick={() => setShowImportDialog(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: "#10b981",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <Upload size={16} />
          Import Skills
        </button>
      </div>

      {/* Export Dialog */}
      <AnimatePresence>
        {showExportDialog && (
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
            onClick={() => setShowExportDialog(false)}
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
                maxWidth: 600,
                width: "90%",
                maxHeight: "80vh",
                overflow: "auto",
                color: "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Export Skills</h2>
                <button
                  onClick={() => setShowExportDialog(false)}
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

              {/* Format Selection */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>
                  Export Format
                </label>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={() => setExportFormat("json")}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: exportFormat === "json" ? "#3b82f6" : "#374151",
                      border: "none",
                      borderRadius: 8,
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <FileJson size={16} />
                    JSON
                  </button>
                  <button
                    onClick={() => setExportFormat("yaml")}
                    style={{
                      flex: 1,
                      padding: 12,
                      background: exportFormat === "yaml" ? "#3b82f6" : "#374151",
                      border: "none",
                      borderRadius: 8,
                      color: "white",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <FileText size={16} />
                    YAML
                  </button>
                </div>
              </div>

              {/* Skill Selection */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 500 }}>
                    Select Skills ({selectedSkills.length}/{skills.length})
                  </label>
                  <button
                    onClick={() => {
                      if (selectedSkills.length === skills.length) {
                        setSelectedSkills([]);
                      } else {
                        setSelectedSkills(skills.map(s => s.name));
                      }
                    }}
                    style={{
                      background: "none",
                      border: "1px solid #4b5563",
                      borderRadius: 6,
                      padding: "4px 12px",
                      color: "#9ca3af",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {selectedSkills.length === skills.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div style={{ maxHeight: 300, overflow: "auto", background: "#111827", borderRadius: 8, padding: 12 }}>
                  {loading ? (
                    <div style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>Loading skills...</div>
                  ) : skills.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: "#9ca3af" }}>No skills found</div>
                  ) : (
                    skills.map(skill => (
                      <label
                        key={skill.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: 8,
                          cursor: "pointer",
                          borderRadius: 6,
                          background: selectedSkills.includes(skill.name) ? "#1f2937" : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSkills.includes(skill.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSkills([...selectedSkills, skill.name]);
                            } else {
                              setSelectedSkills(selectedSkills.filter(n => n !== skill.name));
                            }
                          }}
                          style={{ cursor: "pointer" }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{skill.name}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>{skill.description}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowExportDialog(false)}
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
                  onClick={handleExport}
                  disabled={loading || selectedSkills.length === 0}
                  style={{
                    padding: "8px 16px",
                    background: selectedSkills.length > 0 ? "#3b82f6" : "#4b5563",
                    border: "none",
                    borderRadius: 8,
                    color: "white",
                    cursor: selectedSkills.length > 0 ? "pointer" : "not-allowed",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Download size={16} />
                  {loading ? "Exporting..." : "Export"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Dialog */}
      <AnimatePresence>
        {showImportDialog && (
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
            onClick={() => setShowImportDialog(false)}
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
                maxWidth: 600,
                width: "90%",
                maxHeight: "80vh",
                overflow: "auto",
                color: "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Import Skills</h2>
                <button
                  onClick={() => setShowImportDialog(false)}
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

              {/* File Upload */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    padding: 40,
                    border: "2px dashed #4b5563",
                    borderRadius: 12,
                    textAlign: "center",
                    cursor: "pointer",
                    background: "#111827",
                  }}
                >
                  <input
                    type="file"
                    accept=".json,.yaml,.yml"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                  />
                  <Upload size={32} style={{ margin: "0 auto 12px", color: "#9ca3af" }} />
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    {importFile ? importFile.name : "Click to select file"}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    Supports .json and .yaml files
                  </div>
                </label>
              </div>

              {/* Preview */}
              {importPreview.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                    Preview ({importPreview.length} skill(s))
                  </div>
                  <div style={{ maxHeight: 200, overflow: "auto", background: "#111827", borderRadius: 8, padding: 12 }}>
                    {importPreview.map(skill => (
                      <div
                        key={skill.name}
                        style={{
                          padding: 8,
                          marginBottom: 8,
                          borderRadius: 6,
                          background: importConflicts.includes(skill.name) ? "#7f1d1d" : "#1f2937",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{skill.name}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>{skill.description}</div>
                        </div>
                        {importConflicts.includes(skill.name) && (
                          <span style={{ fontSize: 11, color: "#fca5a5", fontWeight: 500 }}>EXISTS</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {importConflicts.length > 0 && (
                    <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 8 }}>
                      ⚠️ {importConflicts.length} skill(s) already exist. Choose "Overwrite" to replace them.
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setShowImportDialog(false)}
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
                {importConflicts.length > 0 && (
                  <button
                    onClick={() => handleImport(true)}
                    disabled={loading || importPreview.length === 0}
                    style={{
                      padding: "8px 16px",
                      background: "#dc2626",
                      border: "none",
                      borderRadius: 8,
                      color: "white",
                      cursor: importPreview.length > 0 ? "pointer" : "not-allowed",
                      fontSize: 14,
                    }}
                  >
                    {loading ? "Importing..." : "Overwrite"}
                  </button>
                )}
                <button
                  onClick={() => handleImport(false)}
                  disabled={loading || importPreview.length === 0}
                  style={{
                    padding: "8px 16px",
                    background: importPreview.length > 0 ? "#10b981" : "#4b5563",
                    border: "none",
                    borderRadius: 8,
                    color: "white",
                    cursor: importPreview.length > 0 ? "pointer" : "not-allowed",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Upload size={16} />
                  {loading ? "Importing..." : importConflicts.length > 0 ? "Import New Only" : "Import"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
