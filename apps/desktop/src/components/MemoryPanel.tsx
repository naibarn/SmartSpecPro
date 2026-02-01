/**
 * SmartSpec Pro - Memory Panel Component
 * 
 * Shared component for viewing and managing Long Memory
 * Used across all pages that support workspace-scoped memory
 */

import { useMemo } from 'react';
import { useMemoryStore } from '../stores/memoryStore';
import type { MemoryType } from '../services/kiloCli';

const buttonStyle = {
  padding: "8px 16px",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  background: "#ffffff",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 500 as const,
  transition: "all 0.2s",
};

const inputStyle = {
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid #d1d5db",
  fontSize: "14px",
  outline: "none",
};

const successButtonStyle = {
  ...buttonStyle,
  background: "#10b981",
  color: "#ffffff",
  border: "1px solid #059669",
};

export function MemoryPanel() {
  const {
    project,
    memories,
    showMemoryPanel,
    setShowMemoryPanel,
    deleteMemory,
  } = useMemoryStore();
  
  // Memoize stats to prevent infinite re-renders
  const stats = useMemo(() => ({
    total: memories.length,
    decisions: memories.filter(m => m.type === 'decision').length,
    plans: memories.filter(m => m.type === 'plan').length,
    components: memories.filter(m => m.type === 'component').length,
    tasks: memories.filter(m => m.type === 'task').length,
  }), [memories]);

  if (!showMemoryPanel) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 400,
        background: "white",
        borderLeft: "1px solid #e5e7eb",
        boxShadow: "-4px 0 12px rgba(0,0,0,0.1)",
        zIndex: 999,
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🧠 Long Memory</h3>
        <button
          onClick={() => setShowMemoryPanel(false)}
          style={{ ...buttonStyle, padding: "4px 8px", fontSize: 12 }}
        >
          ✕
        </button>
      </div>
      
      <div style={{ padding: 16, borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          📁 Project: {project?.name || '-'}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, padding: "2px 8px", background: "#dbeafe", borderRadius: 4 }}>
            🎯 {stats.decisions} decisions
          </span>
          <span style={{ fontSize: 11, padding: "2px 8px", background: "#dcfce7", borderRadius: 4 }}>
            📝 {stats.plans} plans
          </span>
          <span style={{ fontSize: 11, padding: "2px 8px", background: "#fef3c7", borderRadius: 4 }}>
            🧩 {stats.components} components
          </span>
          <span style={{ fontSize: 11, padding: "2px 8px", background: "#fce7f3", borderRadius: 4 }}>
            ✅ {stats.tasks} tasks
          </span>
        </div>
      </div>
      
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {memories.length === 0 ? (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🧠</div>
            <div>ยังไม่มี Memory</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>
              เลือกข้อความใน Terminal แล้วคลิกขวา<br/>
              เพื่อบันทึกเข้า Long Memory
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {memories.map(memory => (
              <div
                key={memory.id}
                style={{
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fafafa"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                    {memory.type === 'decision' && '🎯 '}
                    {memory.type === 'plan' && '📝 '}
                    {memory.type === 'architecture' && '🏗️ '}
                    {memory.type === 'component' && '🧩 '}
                    {memory.type === 'task' && '✅ '}
                    {memory.type === 'code_knowledge' && '📚 '}
                    {memory.title}
                  </div>
                  <button
                    onClick={() => deleteMemory(memory.id)}
                    style={{
                      padding: "2px 6px",
                      fontSize: 10,
                      border: "1px solid #fca5a5",
                      background: "#fef2f2",
                      borderRadius: 4,
                      cursor: "pointer",
                      color: "#dc2626"
                    }}
                  >
                    ลบ
                  </button>
                </div>
                <div style={{
                  fontSize: 12,
                  color: "#4b5563",
                  maxHeight: 60,
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}>
                  {memory.content.substring(0, 150)}{memory.content.length > 150 && '...'}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 10, color: "#9ca3af" }}>
                  <span>⭐ {memory.importance}</span>
                  <span>{memory.type}</span>
                  <span>{new Date(memory.created_at).toLocaleDateString('th-TH')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MemoryContextMenu() {
  const {
    selectedText,
    contextMenuPos,
    setContextMenuPos,
    openMemoryDialog,
  } = useMemoryStore();

  if (!contextMenuPos || !selectedText) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: contextMenuPos.x,
        top: contextMenuPos.y,
        background: "white",
        border: "1px solid #d1d5db",
        borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 1000,
        minWidth: 200,
        overflow: "hidden"
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => openMemoryDialog(selectedText)}
        style={{
          display: "block",
          width: "100%",
          padding: "10px 14px",
          border: "none",
          background: "white",
          textAlign: "left",
          cursor: "pointer",
          fontSize: 14,
          transition: "background 0.2s"
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
        onMouseLeave={(e) => e.currentTarget.style.background = "white"}
      >
        🧠 บันทึกเข้า Long Memory
      </button>
      <div style={{ borderTop: "1px solid #e5e7eb" }} />
      <button
        onClick={() => {
          navigator.clipboard.writeText(selectedText);
          setContextMenuPos(null);
        }}
        style={{
          display: "block",
          width: "100%",
          padding: "10px 14px",
          border: "none",
          background: "white",
          textAlign: "left",
          cursor: "pointer",
          fontSize: 14,
          transition: "background 0.2s"
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
        onMouseLeave={(e) => e.currentTarget.style.background = "white"}
      >
        📋 Copy
      </button>
    </div>
  );
}

export function MemorySaveDialog() {
  const {
    showMemoryDialog,
    memoryDialogData,
    closeMemoryDialog,
    saveMemory,
  } = useMemoryStore();

  if (!showMemoryDialog || !memoryDialogData) return null;

  const handleSave = () => {
    const title = (document.getElementById('memory-title') as HTMLInputElement)?.value || memoryDialogData.suggestedTitle;
    const type = (document.getElementById('memory-type') as HTMLSelectElement)?.value as MemoryType || memoryDialogData.suggestedType;
    const importance = parseInt((document.getElementById('memory-importance') as HTMLInputElement)?.value || String(memoryDialogData.importance));
    
    saveMemory(type, title, memoryDialogData.text, {
      importance,
      tags: ['manual'],
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1001
      }}
      onClick={closeMemoryDialog}
    >
      <div
        style={{
          background: "white",
          borderRadius: 12,
          padding: 24,
          maxWidth: 500,
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>
          {memoryDialogData.isAutoSuggestion ? "💡 พบเนื้อหาสำคัญ - บันทึกหรือไม่?" : "🧠 บันทึกเข้า Long Memory"}
        </h3>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>ชื่อ/หัวข้อ</label>
          <input
            type="text"
            defaultValue={memoryDialogData.suggestedTitle}
            id="memory-title"
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          />
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>ประเภท</label>
          <select
            defaultValue={memoryDialogData.suggestedType}
            id="memory-type"
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          >
            <option value="decision">🎯 Decision - การตัดสินใจ</option>
            <option value="plan">📝 Plan - แผนงาน</option>
            <option value="architecture">🏗️ Architecture - โครงสร้าง</option>
            <option value="component">🧩 Component - ส่วนประกอบ</option>
            <option value="task">✅ Task - งานที่ต้องทำ</option>
            <option value="code_knowledge">📚 Code Knowledge - ความรู้</option>
          </select>
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            ความสำคัญ (1-10): <span id="importance-value">{memoryDialogData.importance}</span>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            defaultValue={memoryDialogData.importance}
            id="memory-importance"
            style={{ width: "100%" }}
            onChange={(e) => {
              const span = document.getElementById('importance-value');
              if (span) span.textContent = e.target.value;
            }}
          />
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4 }}>เนื้อหา</label>
          <div style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 6,
            padding: 12,
            maxHeight: 150,
            overflow: "auto",
            fontSize: 13,
            fontFamily: "ui-monospace, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}>
            {memoryDialogData.text}
          </div>
        </div>
        
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={closeMemoryDialog}
            style={buttonStyle}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            style={successButtonStyle}
          >
            🧠 บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

export function MemoryButton() {
  const { project, memories, showMemoryPanel, toggleMemoryPanel } = useMemoryStore();
  
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {project && (
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          📁 {project.name} | 🧠 {memories.length} memories
        </span>
      )}
      <button
        onClick={toggleMemoryPanel}
        style={{
          ...buttonStyle,
          padding: "6px 12px",
          fontSize: 13,
          background: showMemoryPanel ? "#8b5cf6" : "#f3f4f6",
          color: showMemoryPanel ? "white" : "#374151",
          border: showMemoryPanel ? "1px solid #7c3aed" : "1px solid #d1d5db"
        }}
      >
        🧠 Long Memory
      </button>
    </div>
  );
}

// Hook for text selection handling
export function useMemoryTextSelection() {
  const { setSelectedText, setContextMenuPos } = useMemoryStore();
  
  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    setSelectedText(text);
  };
  
  const handleContextMenu = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    
    if (text && text.length > 10) {
      e.preventDefault();
      setSelectedText(text);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    }
  };
  
  return { handleTextSelection, handleContextMenu };
}
