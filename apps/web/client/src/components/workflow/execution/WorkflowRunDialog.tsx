/**
 * WorkflowRunDialog - Pre-execution input collection dialog.
 *
 * Scans workflow nodes for `form_input` nodes and presents a form
 * for the user to fill in required and optional fields before running.
 * Passes collected values as input_data.form_values to the execute call.
 */

import React, { useState } from "react";
import type { Node } from "reactflow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Play, FileText } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "number" | "email" | "select" | "date";
  required: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: string;
}

interface FormInputNode {
  nodeId: string;
  nodeLabel: string;
  fields: FormField[];
}

export interface WorkflowRunDialogProps {
  open: boolean;
  onClose: () => void;
  onRun: (inputData: Record<string, unknown>) => void;
  nodes: Node[];
  isRunning?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractFormInputNodes(nodes: Node[]): FormInputNode[] {
  const result: FormInputNode[] = [];
  for (const node of nodes) {
    if (node.data?.nodeType !== "form_input") continue;
    const rawFields = node.data?.config?.fields;
    const fields: FormField[] = Array.isArray(rawFields)
      ? rawFields.map((f: any) => ({
          id: String(f.id || ""),
          label: String(f.label || f.id || ""),
          type: f.type || "text",
          required: Boolean(f.required),
          placeholder: f.placeholder || "",
          options: Array.isArray(f.options) ? f.options : undefined,
          defaultValue: f.defaultValue ?? "",
        }))
      : [];
    if (fields.length > 0) {
      result.push({
        nodeId: node.id,
        nodeLabel: String(node.data?.label || node.id),
        fields,
      });
    }
  }
  return result;
}

function initValues(formNodes: FormInputNode[]): Record<string, string> {
  const vals: Record<string, string> = {};
  for (const fn of formNodes) {
    for (const field of fn.fields) {
      vals[field.id] = field.defaultValue || "";
    }
  }
  return vals;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorkflowRunDialog({
  open,
  onClose,
  onRun,
  nodes,
  isRunning = false,
}: WorkflowRunDialogProps) {
  const formNodes = React.useMemo(() => extractFormInputNodes(nodes), [nodes]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    initValues(formNodes)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setValues(initValues(formNodes));
      setErrors({});
    }
  }, [open, formNodes]);

  function setValue(fieldId: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const fn of formNodes) {
      for (const field of fn.fields) {
        if (field.required && !values[field.id]?.trim()) {
          newErrors[field.id] = `${field.label} is required`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleRun() {
    if (!validate()) return;
    onRun({ form_values: { ...values } });
  }

  const totalRequired = formNodes.flatMap((fn) =>
    fn.fields.filter((f) => f.required)
  ).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-500" />
            Run Workflow
          </DialogTitle>
          <DialogDescription>
            This workflow requires input before running.{" "}
            {totalRequired > 0 && (
              <span>
                Fill in the <strong>{totalRequired} required</strong> field
                {totalRequired > 1 ? "s" : ""} below.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {formNodes.map((fn) => (
            <div key={fn.nodeId} className="space-y-3">
              {/* Node section header */}
              {formNodes.length > 1 && (
                <div className="flex items-center gap-2 pb-1 border-b border-gray-200 dark:border-gray-700">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {fn.nodeLabel}
                  </span>
                </div>
              )}

              {fn.fields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <Label
                    htmlFor={`field-${field.id}`}
                    className="flex items-center gap-1.5"
                  >
                    {field.label}
                    {field.required && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        required
                      </Badge>
                    )}
                  </Label>

                  {field.type === "textarea" ? (
                    <Textarea
                      id={`field-${field.id}`}
                      value={values[field.id] ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className={
                        errors[field.id]
                          ? "border-red-500 focus-visible:ring-red-500"
                          : ""
                      }
                    />
                  ) : field.type === "select" && field.options ? (
                    <select
                      id={`field-${field.id}`}
                      value={values[field.id] ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      className={`flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                        errors[field.id] ? "border-red-500" : "border-input"
                      }`}
                    >
                      <option value="">
                        {field.placeholder || "Select an option"}
                      </option>
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`field-${field.id}`}
                      type={field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
                      value={values[field.id] ?? ""}
                      onChange={(e) => setValue(field.id, e.target.value)}
                      placeholder={field.placeholder}
                      className={
                        errors[field.id]
                          ? "border-red-500 focus-visible:ring-red-500"
                          : ""
                      }
                    />
                  )}

                  {errors[field.id] && (
                    <p className="text-xs text-red-500">{errors[field.id]}</p>
                  )}
                </div>
              ))}
            </div>
          ))}

          {formNodes.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No input fields required. Click Run to start.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isRunning}>
            Cancel
          </Button>
          <Button
            onClick={handleRun}
            disabled={isRunning}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            <Play className="h-4 w-4" />
            {isRunning ? "Running..." : "Run Workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
