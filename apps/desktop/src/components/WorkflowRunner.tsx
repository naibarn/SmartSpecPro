import { useState } from "react";
import { motion } from "framer-motion";
import type { Workflow, WorkflowArgs, WorkflowExecution } from "../types/workflow";
import { OutputViewer } from "./OutputViewer";
import { NaturalLanguageInput } from "./NaturalLanguageInput";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface WorkflowRunnerProps {
  workflow: Workflow;
  executions: WorkflowExecution[];
  onRun: (workflow: Workflow, args: WorkflowArgs) => Promise<void>;
  onStop: (workflowId: string) => Promise<void>;
}

export function WorkflowRunner({
  workflow,
  executions,
  onRun,
  onStop,
}: WorkflowRunnerProps) {
  const [specId, setSpecId] = useState("");
  const [category, setCategory] = useState("general");
  const [mode, setMode] = useState("standard");
  const [platform, setPlatform] = useState("web");
  const [running, setRunning] = useState(false);
  const [showNLInput, setShowNLInput] = useState(true);

  const latestExecution = executions[executions.length - 1];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!specId.trim()) {
      alert("Please enter a Spec ID");
      return;
    }

    setRunning(true);
    try {
      await onRun(workflow, {
        spec_id: specId,
        category,
        mode,
        platform,
      });
    } catch (err) {
      alert(`Failed to start workflow: ${err}`);
    } finally {
      setRunning(false);
    }
  };

  const handleStop = async () => {
    if (latestExecution && latestExecution.status === "running") {
      try {
        await onStop(latestExecution.id);
      } catch (err) {
        alert(`Failed to stop workflow: ${err}`);
      }
    }
  };

  const handleNLExecute = async (_workflowName: string, args: Record<string, any>) => {
    const workflowArgs: WorkflowArgs = {
      spec_id: args.topic || args.spec_path || args.source || "nl-generated",
      category: args.category || "general",
      mode: args.format === "comprehensive" ? "comprehensive" : "standard",
      platform: args.platform || "web",
    };

    setRunning(true);
    try {
      await onRun(workflow, workflowArgs);
    } catch (err) {
      alert(`Failed to start workflow: ${err}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Natural Language Input */}
      {showNLInput && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="m-6 mb-0"
        >
          <NaturalLanguageInput onExecute={handleNLExecute} />
        </motion.div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        <Card className="m-6 mb-4 border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{workflow.name}</CardTitle>
                <CardDescription className="mt-2">{workflow.description}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNLInput(!showNLInput)}
              >
                {showNLInput ? "Hide" : "Show"} NL Input
              </Button>
            </div>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <Card className="mx-6 mb-4 border-2">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Spec ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={specId}
                    onChange={(e) => setSpecId(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="my-spec"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="general">General</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="fintech">Fintech</option>
                    <option value="iot">IoT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Mode
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="minimal">Minimal</option>
                    <option value="standard">Standard</option>
                    <option value="comprehensive">Comprehensive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Platform
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white"
                  >
                    <option value="web">Web</option>
                    <option value="mobile">Mobile</option>
                    <option value="desktop">Desktop</option>
                    <option value="api">API</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={running || latestExecution?.status === "running"}
                  size="lg"
                >
                  {running || latestExecution?.status === "running"
                    ? "⏳ Running..."
                    : "▶️ Run Workflow"}
                </Button>

                {latestExecution?.status === "running" && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="lg"
                    onClick={handleStop}
                  >
                    ⏹️ Stop
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Output */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="flex-1 mx-6 mb-6 overflow-hidden"
      >
        {latestExecution ? (
          <OutputViewer execution={latestExecution} />
        ) : (
          <Card className="h-full flex items-center justify-center border-2 border-dashed">
            <div className="text-center p-8">
              <motion.div
                animate={{
                  scale: [1, 1.05, 1],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 mb-4"
              >
                <svg
                  className="w-10 h-10 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No execution yet
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">
                Fill in the form and click "Run Workflow" to start
              </p>
            </div>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
