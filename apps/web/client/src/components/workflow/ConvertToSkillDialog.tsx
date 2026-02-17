/**
 * ConvertToSkillDialog - Dialog for converting workflows to agent skills
 * 
 * Features:
 * - Analyze workflow compatibility
 * - Show conversion preview
 * - Configure skill settings (name, description, trigger patterns)
 * - Execute conversion
 */

import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Plus,
  X,
} from "lucide-react";

interface ConvertToSkillDialogProps {
  workflowId: number;
  workflowName: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: (skillId: string) => void;
}

type Step = "analyze" | "configure" | "preview" | "converting" | "success";

interface AnalysisResult {
  eligible: boolean;
  compatibility_score: number;
  level: "fully_compatible" | "adapter_required" | "not_compatible";
  unsupported_nodes: Array<{
    node_id: string;
    node_type: string;
    reason: string;
  }>;
  adapters_required: Array<{
    node_id: string;
    node_type: string;
    adapter: string;
  }>;
  recommendations: string[];
}

export function ConvertToSkillDialog({
  workflowId,
  workflowName,
  open,
  onClose,
  onSuccess,
}: ConvertToSkillDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("analyze");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [config, setConfig] = useState({
    name: "",
    description: "",
    triggerPatterns: [""] as string[],
    isEnabled: false,
  });
  const [createdSkillId, setCreatedSkillId] = useState<string | null>(null);

  // Analysis query - use type assertion for tRPC
  const analyzeMutation = (trpc as any).workflow.analyzeConversion.useMutation({
    onSuccess: (data: AnalysisResult) => {
      setAnalysis(data);
      if (data.eligible) {
        setStep("configure");
      }
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Convert mutation - use type assertion for tRPC
  const convertMutation = (trpc as any).workflow.convertToSkill.useMutation({
    onSuccess: (data: { skillId: string }) => {
      setCreatedSkillId(data.skillId);
      setStep("success");
      onSuccess?.(data.skillId);
      toast({
        title: "Conversion Successful",
        description: `Skill "${config.name}" has been created successfully.`,
      });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Conversion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Start analysis when dialog opens
  React.useEffect(() => {
    if (open && step === "analyze") {
      analyzeMutation.mutate({ workflowId });
    }
  }, [open, workflowId]);

  // Reset state when dialog closes
  React.useEffect(() => {
    if (!open) {
      setStep("analyze");
      setAnalysis(null);
      setConfig({
        name: workflowName,
        description: "",
        triggerPatterns: [""],
        isEnabled: false,
      });
      setCreatedSkillId(null);
    }
  }, [open, workflowName]);

  const handleConvert = () => {
    setStep("converting");
    convertMutation.mutate({
      workflowId,
      config: {
        name: config.name,
        description: config.description,
        triggerPatterns: config.triggerPatterns.filter((p) => p.trim() !== ""),
        isEnabled: config.isEnabled,
      },
    });
  };

  const addTriggerPattern = () => {
    setConfig({ ...config, triggerPatterns: [...config.triggerPatterns, ""] });
  };

  const updateTriggerPattern = (index: number, value: string) => {
    const newPatterns = [...config.triggerPatterns];
    newPatterns[index] = value;
    setConfig({ ...config, triggerPatterns: newPatterns });
  };

  const removeTriggerPattern = (index: number) => {
    const newPatterns = config.triggerPatterns.filter((_, i) => i !== index);
    setConfig({ ...config, triggerPatterns: newPatterns });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-green-600";
    if (score >= 50) return "bg-yellow-600";
    return "bg-red-600";
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Convert Workflow to Skill
          </DialogTitle>
          <DialogDescription>
            Transform "{workflowName}" into an agent skill that can be triggered
            through chat conversations.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Analysis */}
        {step === "analyze" && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-muted-foreground">Analyzing workflow compatibility...</p>
          </div>
        )}

        {/* Analysis Results - Not Compatible */}
        {analysis && !analysis.eligible && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Workflow Not Compatible</AlertTitle>
              <AlertDescription>
                This workflow cannot be converted to a skill due to incompatible
                node types.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <h4 className="font-medium">Issues Found:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {analysis.unsupported_nodes.map((node) => (
                  <li key={node.node_id} className="text-red-600">
                    <strong>{node.node_type}</strong>: {node.reason}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Recommendations:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {analysis.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Configuration */}
        {step === "configure" && analysis?.eligible && (
          <div className="space-y-6">
            {/* Compatibility Score */}
            <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
              <div className="relative w-20 h-20">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <path
                    className="text-muted-foreground/20"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className={getScoreColor(analysis.compatibility_score)}
                    strokeDasharray={`${analysis.compatibility_score}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-lg font-bold ${getScoreColor(analysis.compatibility_score)}`}>
                    {analysis.compatibility_score}
                  </span>
                </div>
              </div>
              <div>
                <h4 className="font-medium">Compatibility Score</h4>
                <p className="text-sm text-muted-foreground">
                  {analysis.level === "fully_compatible"
                    ? "✅ Fully compatible - ready to convert!"
                    : "⚠️ Adapters will be applied for chat compatibility"}
                </p>
              </div>
            </div>

            {/* Adapters Warning */}
            {analysis.adapters_required.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Adapters Required</AlertTitle>
                <AlertDescription>
                  The following nodes will be adapted for chat:
                  <ul className="list-disc list-inside mt-1">
                    {analysis.adapters_required.map((adapter) => (
                      <li key={adapter.node_id}>
                        {adapter.node_type} → {adapter.adapter}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Skill Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="skill-name">Skill Name *</Label>
                <Input
                  id="skill-name"
                  value={config.name}
                  onChange={(e) =>
                    setConfig({ ...config, name: e.target.value })
                  }
                  placeholder="My Awesome Skill"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="skill-description">Description</Label>
                <Textarea
                  id="skill-description"
                  value={config.description}
                  onChange={(e) =>
                    setConfig({ ...config, description: e.target.value })
                  }
                  placeholder="What does this skill do?"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Trigger Patterns</Label>
                <p className="text-sm text-muted-foreground">
                  Phrases that will trigger this skill. Use {"{variable}"} for
                  parameters.
                </p>
                <div className="space-y-2">
                  {config.triggerPatterns.map((pattern, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={pattern}
                        onChange={(e) =>
                          updateTriggerPattern(index, e.target.value)
                        }
                        placeholder='e.g., Process {filename} and email to {email}'
                      />
                      {config.triggerPatterns.length > 1 && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removeTriggerPattern(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addTriggerPattern}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Pattern
                  </Button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="enable-skill"
                  checked={config.isEnabled}
                  onChange={(e) =>
                    setConfig({ ...config, isEnabled: e.target.checked })
                  }
                  className="rounded border-gray-300"
                />
                <Label htmlFor="enable-skill" className="text-sm">
                  Enable skill immediately after conversion
                </Label>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={!config.name.trim()}
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && (
          <div className="space-y-6">
            <div className="bg-muted p-4 rounded-lg space-y-4">
              <h4 className="font-medium">Conversion Preview</h4>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skill Name:</span>
                  <span className="font-medium">{config.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source Workflow:</span>
                  <span className="font-medium">{workflowName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trigger Patterns:</span>
                  <span className="font-medium">
                    {config.triggerPatterns.filter((p) => p.trim() !== "").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auto-Enable:</span>
                  <span className="font-medium">
                    {config.isEnabled ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              <div className="border-t pt-4">
                <h5 className="font-medium mb-2">Trigger Examples:</h5>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {config.triggerPatterns
                    .filter((p) => p.trim() !== "")
                    .map((pattern, i) => (
                      <li key={i} className="text-muted-foreground">
                        &quot;{pattern}&quot;
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Note</AlertTitle>
              <AlertDescription>
                Once converted, this skill can be triggered in chat conversations.
                You can edit the skill settings later from the Skills page.
              </AlertDescription>
            </Alert>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("configure")}>
                Back
              </Button>
              <Button onClick={handleConvert} disabled={!config.name.trim()}>
                <Sparkles className="w-4 h-4 mr-2" />
                Convert to Skill
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Converting */}
        {step === "converting" && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            <p className="text-muted-foreground">Creating your skill...</p>
            <Progress value={50} className="w-48" />
          </div>
        )}

        {/* Step 5: Success */}
        {step === "success" && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-medium">Conversion Successful!</h3>
                <p className="text-muted-foreground">
                  Your skill &quot;{config.name}&quot; has been created.
                </p>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h4 className="font-medium">What&apos;s Next?</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Test your skill in the chat interface</li>
                <li>Edit trigger patterns to improve matching</li>
                <li>Enable the skill for all users (if disabled)</li>
              </ul>
            </div>

            <div className="flex justify-center">
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
