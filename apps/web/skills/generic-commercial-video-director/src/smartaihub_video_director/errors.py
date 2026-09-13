import re

class DirectorRuntimeError(RuntimeError): pass
class StageContractError(DirectorRuntimeError): pass
class StageExecutionError(DirectorRuntimeError): pass
class ApprovalRequiredError(DirectorRuntimeError): pass
class BudgetExceededError(DirectorRuntimeError): pass
class UnauthorizedAssetError(DirectorRuntimeError): pass
class PaidSideEffectBoundaryError(DirectorRuntimeError): pass

def safe_bridge_error_line(error: BaseException) -> str:
    """Return a stable child-process diagnostic without provider response data."""
    status = getattr(error, "status_code", None)
    response = getattr(error, "response", None)
    if status is None:
        status = getattr(response, "status_code", None)
    if status is None:
        status = getattr(error, "status", None) or getattr(error, "http_status", None)
    message = str(error)
    if status == 402 or re.search(r"(?:error code|status)[:= ]+402|requires more credits|credit limit", message, re.I):
        return "ENHANCED_PROVIDER_CREDIT_LIMIT: Provider credit limit reached; lower the output token limit or add provider credits."
    if status == 429 or re.search(r"rate limit|too many requests|error code[:= ]+429", message, re.I):
        return "ENHANCED_PROVIDER_RATE_LIMIT: Provider rate limit reached; try again later."
    if status in {401, 403} or re.search(r"unauthori[sz]ed|forbidden|error code[:= ]+(?:401|403)", message, re.I):
        return "ENHANCED_PROVIDER_AUTH_FAILED: Provider authentication failed; check the provider configuration."
    if status in {400, 404, 413, 422}:
        return "ENHANCED_PROVIDER_REQUEST_FAILED: The authoring provider rejected the Enhanced request; check model, schema, and input compatibility."
    if message == "ENHANCED_UNSUPPORTED_PROVIDER_TRANSPORT":
        return "ENHANCED_UNSUPPORTED_PROVIDER_TRANSPORT: The selected provider transport is not supported by this Agent bridge."
    # Local validation errors must not be reported as provider outages. Emit
    # fixed codes only: exception messages may contain prompts or credentials.
    for prefix in (
        "SPEAKER_POSITION_BINDING_FAILED", "DIALOGUE_TIMELINE_BINDING_FAILED",
        "PHYSICAL_ACTION_SPEECH_CONFLICT", "VIDEO_PROMPT_BUDGET_EXCEEDED",
        "VIDEO_PROMPT_BUDGET_INVALID", "AGENT_MODEL_NOT_CONFIGURED",
    ):
        if message.startswith(prefix + ":") or message == prefix:
            return f"ENHANCED_{prefix}: Local Enhanced validation failed."
    if isinstance(error, StageContractError):
        return "ENHANCED_CONTRACT_FAILED: Enhanced stage output did not match its schema."
    if isinstance(error, StageExecutionError):
        return "ENHANCED_STAGE_FAILED: Enhanced stage execution failed."
    if isinstance(error, (TimeoutError,)) or type(error).__name__ == "APITimeoutError":
        return "ENHANCED_PROVIDER_TIMEOUT: Enhanced provider request timed out."
    error_name = type(error).__name__
    if error_name == "MaxTurnsExceeded":
        return "ENHANCED_AGENT_MAX_TURNS: Enhanced Agent exceeded its bounded turn limit."
    if error_name == "ModelRefusalError":
        return "ENHANCED_AGENT_REFUSED: Enhanced authoring model refused the request."
    if error_name in {"ModelBehaviorError", "ValidationError", "JSONDecodeError"}:
        return "ENHANCED_AGENT_OUTPUT_INVALID: Enhanced authoring model returned an unusable structured result."
    return "ENHANCED_AGENT_FAILED: Enhanced Agent execution failed; review the provider configuration or try again."
