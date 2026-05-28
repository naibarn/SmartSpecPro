export type FloatingPreviewDisplayMode = "media" | "tasks";

export function shouldShowFloatingPreviewProgressGrid(input: {
  mode: FloatingPreviewDisplayMode;
  taskCount: number;
  isGenerating: boolean;
  hasStartedTasks: boolean;
}): boolean {
  return input.mode === "tasks"
    && input.taskCount > 1
    && (input.isGenerating || input.hasStartedTasks);
}
