/**
 * OrchestrationConfirmForm — inline parameter confirmation for orchestrated skills.
 *
 * Part of Feature 045: Hybrid Skill Orchestrator (Section 11).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface FormField {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  options?: string[];
  required: boolean;
  defaultValue?: unknown;
}

export interface OrchestrationConfirmFormProps {
  skillId: string;
  skillName: string;
  prefilledParams: Record<string, unknown>;
  missingFields: string[];
  formFields: FormField[];
  conversationId: number;
  traceId: string;
  onConfirmed: (params: Record<string, unknown>) => void;
  onSkipped: () => void;
}

export function OrchestrationConfirmForm({
  skillId,
  skillName,
  prefilledParams,
  missingFields,
  formFields,
  onConfirmed,
  onSkipped,
}: OrchestrationConfirmFormProps) {
  const [formState, setFormState] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = { ...prefilledParams };
    for (const field of formFields) {
      if (!(field.name in initial) && field.defaultValue !== undefined) {
        initial[field.name] = field.defaultValue;
      }
    }
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (name: string, value: unknown) => {
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleConfirm = () => {
    setIsSubmitting(true);
    onConfirmed(formState);
  };

  const isMissing = (name: string) => missingFields.includes(name);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">{skillName}</h3>
        <Badge variant="outline" className="text-xs">
          Confirm Parameters
        </Badge>
      </div>

      <div className="space-y-3">
        {formFields
          .filter((f) => f.required || isMissing(f.name) || f.name in prefilledParams)
          .map((field) => (
            <div key={field.name} className="space-y-1">
              <Label htmlFor={`orch-${field.name}`} className="text-xs">
                {field.label}
                {field.required && (
                  <span className="text-destructive ml-1">*</span>
                )}
                {isMissing(field.name) && (
                  <Badge variant="destructive" className="ml-2 text-xs py-0">
                    Required
                  </Badge>
                )}
              </Label>

              {field.type === "select" && field.options ? (
                <select
                  id={`orch-${field.name}`}
                  className={`w-full rounded-md border px-3 py-2 text-sm ${
                    isMissing(field.name) ? "ring-2 ring-destructive" : ""
                  }`}
                  value={String(formState[field.name] ?? "")}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                >
                  <option value="">Select...</option>
                  {field.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === "boolean" ? (
                <input
                  id={`orch-${field.name}`}
                  type="checkbox"
                  checked={Boolean(formState[field.name])}
                  onChange={(e) => handleChange(field.name, e.target.checked)}
                  className="h-4 w-4"
                />
              ) : (
                <Input
                  id={`orch-${field.name}`}
                  type={field.type === "number" ? "number" : "text"}
                  value={String(formState[field.name] ?? "")}
                  onChange={(e) =>
                    handleChange(
                      field.name,
                      field.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                    )
                  }
                  className={
                    isMissing(field.name) ? "ring-2 ring-destructive" : ""
                  }
                  placeholder={field.label}
                />
              )}
            </div>
          ))}
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleConfirm} disabled={isSubmitting} size="sm">
          {isSubmitting ? "Processing..." : "Confirm"}
        </Button>
        <Button
          onClick={onSkipped}
          variant="ghost"
          size="sm"
          disabled={isSubmitting}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}
