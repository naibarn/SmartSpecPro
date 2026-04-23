export function formatRuntimeMetricMs(
  value: number | null | undefined,
  fallback: string
): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return `${value.toFixed(1)}ms`;
}

export function formatPerformanceOperationLabel(operation: string): string {
  switch (operation) {
    case "local_skill_get_runtime_status":
      return "Runtime status probe";
    case "local_skill_execute":
      return "Local script skill";
    case "local_http_backend_chat_completion":
      return "Local HTTP backend chat";
    case "local_llm_prepare_model":
      return "Gemma model prepare";
    case "local_llm_verify_model":
      return "Gemma model verify";
    case "local_llm_update_model":
      return "Gemma model update";
    case "local_llm_repair_model":
      return "Gemma model repair";
    case "local_llm_remove_model":
      return "Gemma model remove";
    case "local_llm_generate":
      return "Gemma text";
    case "local_llm_transcribe_audio":
      return "Gemma voice";
    case "local_llm_analyze_image":
      return "Gemma image";
    case "local_llm_generate_stream_end_to_end":
      return "Gemma streaming text";
    default:
      return operation
        .replace(/\./g, " ")
        .replace(/_/g, " ")
        .replace(/\bllm\b/gi, "LLM");
  }
}
