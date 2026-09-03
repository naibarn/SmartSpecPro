class DirectorRuntimeError(RuntimeError): pass
class StageContractError(DirectorRuntimeError): pass
class StageExecutionError(DirectorRuntimeError): pass
class ApprovalRequiredError(DirectorRuntimeError): pass
class BudgetExceededError(DirectorRuntimeError): pass
class UnauthorizedAssetError(DirectorRuntimeError): pass
class PaidSideEffectBoundaryError(DirectorRuntimeError): pass
