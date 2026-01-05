import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppLayout, ViewType, viewTitles } from "./components/AppLayout";
import { TopBar } from "./components/TopBar";
import TabBar from "./components/TabBar";
import { ModeSelector, type Mode } from "./components/ModeSelector";
import { ChatInterface } from "./components/ChatInterface";
import { OutputViewer } from "./components/OutputViewer";
import { ConversationHistory } from "./components/ConversationHistory";
import { GitStatusBar } from "./components/GitStatusBar";
import { SkillManager } from "./components/SkillManager";
import { MemoryDashboard } from "./components/MemoryDashboard";
import { ExecutionProgress, type Execution } from "./components/ExecutionProgress";
import { SettingsPanel } from "./components/SettingsPanel";
import AuthGeneratorPanel from "./components/AuthGeneratorPanel";
import { GenerationPanel, PublicGallery, SDKCodeViewer } from "./components/generation";
import { AdminDashboard } from "./components/admin";
import { WorkflowsView } from "./components/workflows";
import { HistoryView } from "./components/history";
import { FactoryPanel } from "./components/FactoryPanel";
import { useWorkflows } from "./hooks/useWorkflows";
import { useWorkflowExecution } from "./hooks/useWorkflowExecution";
import type { Workflow, WorkflowArgs } from "./types/workflow";





function App() {
  const [activeView, setActiveView] = useState<ViewType>("chat");
  const [selectedMode, setSelectedMode] = useState<Mode>("orchestrator");
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const { workflows } = useWorkflows();
  const workflowExecution = useWorkflowExecution();

  const latestExecution = workflowExecution.executions[workflowExecution.executions.length - 1];
  const running = latestExecution?.status === "running";
  const runningCount = workflowExecution.executions.filter(e => e.status === "running").length;

  const handleRunWorkflow = async (workflow: Workflow, args: WorkflowArgs) => {
    try {
      await workflowExecution.startWorkflow(workflow.name, args);
    } catch (err) {
      console.error("Failed to start workflow:", err);
    }
  };

  // Header content based on active view
  const getHeaderContent = () => {
    return (
      <div className="flex items-center justify-between w-full">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {viewTitles[activeView]}
        </h1>
        {activeView === "chat" && (
          <ModeSelector
            selectedMode={selectedMode}
            onModeChange={setSelectedMode}
          />
        )}
      </div>
    );
  };

  // Render content based on active view
  const renderContent = () => {
    switch (activeView) {
      case "chat":
        return (
          <div className="flex flex-col h-full">
            {/* Messages/Output Area */}
            <div className="flex-1 overflow-auto">
              {latestExecution ? (
                <div className="max-w-4xl mx-auto p-4">
                  <OutputViewer execution={latestExecution} />
                </div>
              ) : (
                <ConversationHistory />
              )}
            </div>

            {/* Chat Input */}
            <ChatInterface
              workflow={selectedWorkflow}
              onRun={handleRunWorkflow}
              running={running}
              mode={selectedMode}
              workflows={workflows}
              onWorkflowChange={setSelectedWorkflow}
            />

            {/* Git Status Bar */}
            <GitStatusBar />
          </div>
        );

      case "workflows":
        return <WorkflowsView />;

      case "factory":
        return <FactoryPanel />;

      case "skills":
        return (
          <SkillManager
            workspace="/home/ubuntu/SmartSpec"
            onSkillSelect={(skill) => console.log("Selected skill:", skill)}
          />
        );

      case "memory":
        return <MemoryDashboard />;

      case "history":
        return <HistoryView />;

      case "auth-generator":
        return <AuthGeneratorPanel />;

      case "generation":
        return <GenerationPanel />;

      case "gallery":
        return <PublicGallery />;

      case "sdk":
        return <SDKCodeViewer />;

      case "admin":
        return <AdminDashboard />;

      case "settings":
        return <SettingsPanel />;

      default:
        return null;
    }
  };

  return (
    <AppLayout
      activeView={activeView}
      onViewChange={setActiveView}
      headerContent={getHeaderContent()}
      runningWorkflows={runningCount}
    >
      {renderContent()}
    </AppLayout>
  );
}

export default App;
