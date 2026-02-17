# Section E: Workflow to Skill Conversion

## Overview
Build complete workflow-to-agent-skill conversion system with compatibility analysis, node adapters, and execution.

---

## E.1 Conversion Analysis API

### Description
Analyze workflow for skill conversion eligibility and generate compatibility report.

### Backend Implementation

**New File**: `python-backend/app/services/conversion_analyzer.py`

```python
from typing import List, Dict, Optional
from dataclasses import dataclass
from enum import Enum

class CompatibilityLevel(Enum):
    FULLY_COMPATIBLE = "fully_compatible"      # 90-100 points
    ADAPTER_REQUIRED = "adapter_required"      # 50-89 points
    NOT_COMPATIBLE = "not_compatible"          # 0-49 points

@dataclass
class NodeCompatibility:
    node_id: str
    node_type: str
    supported: bool
    adapter_required: Optional[str]
    reason: Optional[str]
    score_impact: int

@dataclass
class ConversionAnalysis:
    workflow_id: int
    eligible: bool
    compatibility_score: int  # 0-100
    level: CompatibilityLevel
    unsupported_nodes: List[NodeCompatibility]
    adapters_required: List[NodeCompatibility]
    complexity_score: int
    recommendations: List[str]

class ConversionAnalyzer:
    """
    Analyze workflow for conversion to agent skill.
    
    Scoring:
    - Base score: 100
    - Each unsupported node: -20 points
    - Each adapter required: -10 points
    - Parallel branches: -10 points
    - Complex loops: -5 points
    """
    
    NODE_COMPATIBILITY = {
        # AI Nodes (Fully Compatible)
        'llm_call': {'supported': True, 'adapter': None, 'score': 0},
        'rag_query': {'supported': True, 'adapter': None, 'score': 0},
        'prompt_template': {'supported': True, 'adapter': None, 'score': 0},
        'output_parser': {'supported': True, 'adapter': None, 'score': 0},
        'multi_model_router': {'supported': True, 'adapter': None, 'score': 0},
        
        # Flow Control (Compatible with limitations)
        'conditional': {'supported': True, 'adapter': None, 'score': 0},
        'delay': {'supported': True, 'adapter': None, 'score': 0},
        'try_catch': {'supported': True, 'adapter': None, 'score': 0},
        'retry': {'supported': True, 'adapter': None, 'score': 0},
        'circuit_breaker': {'supported': True, 'adapter': None, 'score': 0},
        'parallel': {'supported': False, 'adapter': None, 'score': -20, 'reason': 'Chat requires sequential processing'},
        'subworkflow': {'supported': True, 'adapter': None, 'score': 0},
        
        # Input Nodes (Require Adapters)
        'form_input': {
            'supported': True,
            'adapter': 'conversational_input',
            'score': -10,
            'reason': 'UI form needs conversational adaptation'
        },
        'text_input': {'supported': True, 'adapter': None, 'score': 0},
        'file_upload': {
            'supported': True,
            'adapter': 'file_attachment',
            'score': -10,
            'reason': 'File upload via chat attachment'
        },
        
        # Human Interaction (Require Adapters)
        'approval_gate': {
            'supported': True,
            'adapter': 'chat_approval',
            'score': -10,
            'reason': 'Approval via chat interaction'
        },
        'human_task': {
            'supported': True,
            'adapter': 'chat_task',
            'score': -10,
            'reason': 'Task assignment via chat'
        },
        
        # Output Nodes (Compatible)
        'webhook_response': {'supported': False, 'adapter': None, 'score': -20, 'reason': 'No webhook context in chat'},
        'send_email': {'supported': True, 'adapter': None, 'score': 0},
        'write_file': {'supported': True, 'adapter': None, 'score': 0},
        
        # Integration (Compatible)
        'http_request': {'supported': True, 'adapter': None, 'score': 0},
        'graphql_request': {'supported': True, 'adapter': None, 'score': 0},
        'websocket_client': {'supported': True, 'adapter': None, 'score': 0},
        
        # Data (Compatible)
        'csv_parser': {'supported': True, 'adapter': None, 'score': 0},
        'template_engine': {'supported': True, 'adapter': None, 'score': 0},
        'read_file': {'supported': True, 'adapter': None, 'score': 0},
        
        # Trigger Nodes (NOT Compatible)
        'webhook_trigger': {'supported': False, 'adapter': None, 'score': -20, 'reason': 'Cannot trigger via webhook in chat'},
        'schedule_trigger': {'supported': False, 'adapter': None, 'score': -20, 'reason': 'Cannot trigger via schedule in chat'},
        
        # Skills (Compatible)
        'skill': {'supported': True, 'adapter': None, 'score': 0},
    }
    
    def analyze(self, workflow: dict) -> ConversionAnalysis:
        """Analyze workflow for conversion."""
        nodes = workflow.get('nodes', [])
        edges = workflow.get('edges', [])
        
        base_score = 100
        unsupported = []
        adapters_required = []
        
        for node in nodes:
            node_type = node.get('type', '')
            node_id = node.get('id', '')
            
            compat = self.NODE_COMPATIBILITY.get(node_type, {
                'supported': False,
                'adapter': None,
                'score': -20,
                'reason': 'Unknown node type'
            })
            
            node_compat = NodeCompatibility(
                node_id=node_id,
                node_type=node_type,
                supported=compat['supported'],
                adapter_required=compat.get('adapter'),
                reason=compat.get('reason'),
                score_impact=compat.get('score', 0)
            )
            
            base_score += compat.get('score', 0)
            
            if not compat['supported']:
                unsupported.append(node_compat)
            elif compat.get('adapter'):
                adapters_required.append(node_compat)
        
        # Check for parallel branches
        parallel_count = len([n for n in nodes if n.get('type') == 'parallel'])
        base_score -= parallel_count * 10
        
        # Calculate complexity
        complexity = self._calculate_complexity(nodes, edges)
        
        # Determine eligibility
        if len(unsupported) > 0:
            eligible = False
            level = CompatibilityLevel.NOT_COMPATIBLE
        elif len(adapters_required) > 0:
            eligible = True
            level = CompatibilityLevel.ADAPTER_REQUIRED
        else:
            eligible = True
            level = CompatibilityLevel.FULLY_COMPATIBLE
        
        final_score = max(0, min(100, base_score))
        
        # Generate recommendations
        recommendations = self._generate_recommendations(
            unsupported, adapters_required, complexity
        )
        
        return ConversionAnalysis(
            workflow_id=workflow.get('id'),
            eligible=eligible,
            compatibility_score=final_score,
            level=level,
            unsupported_nodes=unsupported,
            adapters_required=adapters_required,
            complexity_score=complexity,
            recommendations=recommendations
        )
    
    def _calculate_complexity(self, nodes: list, edges: list) -> int:
        """Calculate workflow complexity score."""
        score = 0
        
        # Node count
        score += len(nodes) * 2
        
        # Edge count (connections)
        score += len(edges)
        
        # Decision points
        conditionals = len([n for n in nodes if n.get('type') == 'conditional'])
        score += conditionals * 5
        
        # Loop detection (simplified)
        # In a real implementation, detect cycles in the graph
        
        return min(score, 100)
    
    def _generate_recommendations(
        self,
        unsupported: List[NodeCompatibility],
        adapters: List[NodeCompatibility],
        complexity: int
    ) -> List[str]:
        """Generate conversion recommendations."""
        recommendations = []
        
        if unsupported:
            node_types = set(n.node_type for n in unsupported)
            recommendations.append(
                f"Remove or replace unsupported nodes: {', '.join(node_types)}"
            )
        
        if adapters:
            adapter_types = set(n.adapter_required for n in adapters)
            recommendations.append(
                f"The following adapters will be applied: {', '.join(adapter_types)}"
            )
        
        if complexity > 50:
            recommendations.append(
                "Workflow is complex. Consider simplifying for better chat experience."
            )
        
        if not recommendations:
            recommendations.append("Workflow is ready for conversion!")
        
        return recommendations
```

### API Endpoint

**Add to**: `apps/web/server/routers/workflow.ts`

```typescript
analyzeConversion: protectedProcedure
  .input(z.object({ workflowId: z.number() }))
  .output(z.object({
    eligible: z.boolean(),
    compatibilityScore: z.number(),
    level: z.enum(['fully_compatible', 'adapter_required', 'not_compatible']),
    unsupportedNodes: z.array(z.object({
      nodeId: z.string(),
      nodeType: z.string(),
      reason: z.string()
    })),
    adaptersRequired: z.array(z.object({
      nodeId: z.string(),
      nodeType: z.string(),
      adapter: z.string()
    })),
    recommendations: z.array(z.string())
  }))
  .query(async ({ input, ctx }) => {
    const workflow = await ctx.db.workflow.findUnique({
      where: { id: input.workflowId }
    });
    
    if (!workflow) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }
    
    // Call Python analyzer
    const analysis = await fetch(`${PYTHON_BACKEND_URL}/api/v1/workflows/analyze-conversion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: workflow.id,
        workflowJson: workflow.workflowJson
      })
    }).then(r => r.json());
    
    return analysis;
  })
```

---

## E.2 Node Adapters

### Description
Transform UI-heavy nodes into chat-compatible formats.

### Adapter Implementations

**New File**: `python-backend/app/conversion/adapters/base.py`

```python
from abc import ABC, abstractmethod
from typing import Dict, Any

class NodeAdapter(ABC):
    """Base class for node adapters."""
    
    @abstractmethod
    def can_adapt(self, node_type: str) -> bool:
        """Check if this adapter can handle the node type."""
        pass
    
    @abstractmethod
    def adapt(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """Transform node to chat-compatible format."""
        pass
```

**New File**: `python-backend/app/conversion/adapters/form_input_adapter.py`

```python
from typing import Dict, Any
from .base import NodeAdapter

class FormInputAdapter(NodeAdapter):
    """
    Transform form_input node to conversational input.
    
    Strategy: Sequential field collection
    - Bot asks for each field one at a time
    - Validates each response
    - Collects all responses before continuing
    """
    
    def can_adapt(self, node_type: str) -> bool:
        return node_type == 'form_input'
    
    def adapt(self, node: Dict[str, Any]) -> Dict[str, Any]:
        config = node.get('config', {})
        fields = config.get('fields', [])
        
        conversational_fields = []
        for field in fields:
            conv_field = {
                'fieldId': field.get('id'),
                'fieldName': field.get('name', field.get('id')),
                'prompt': self._generate_prompt(field),
                'required': field.get('required', False),
                'type': field.get('type', 'text'),
                'validation': field.get('validation'),
                'examples': field.get('examples', [])
            }
            conversational_fields.append(conv_field)
        
        return {
            'type': 'conversational_input',
            'originalType': 'form_input',
            'config': {
                'fields': conversational_fields,
                'collectionStrategy': 'sequential',
                'acknowledgmentMessage': config.get('acknowledgment', 'Thank you! I have all the information I need.')
            }
        }
    
    def _generate_prompt(self, field: Dict[str, Any]) -> str:
        """Generate natural language prompt for field."""
        label = field.get('label', field.get('id'))
        description = field.get('description', '')
        
        prompt = f"Please provide {label}"
        if description:
            prompt += f" ({description})"
        prompt += ":"
        
        return prompt
```

**New File**: `python-backend/app/conversion/adapters/approval_gate_adapter.py`

```python
from typing import Dict, Any
from .base import NodeAdapter

class ApprovalGateAdapter(NodeAdapter):
    """
    Transform approval_gate node to chat approval.
    
    Strategy: Interactive approval request
    - Bot presents approval request with details
    - User responds with approve/reject
    - Optional: Request more information
    """
    
    def can_adapt(self, node_type: str) -> bool:
        return node_type == 'approval_gate'
    
    def adapt(self, node: Dict[str, Any]) -> Dict[str, Any]:
        config = node.get('config', {})
        
        return {
            'type': 'chat_approval',
            'originalType': 'approval_gate',
            'config': {
                'promptTemplate': config.get('message', 'Please review the following:'),
                'detailsDataPath': config.get('detailsData', ''),  # JSONPath to details
                'timeoutSeconds': config.get('timeout', 3600),
                'approvalOptions': {
                    'approve': {'label': 'Approve', 'value': 'approved'},
                    'reject': {'label': 'Reject', 'value': 'rejected'},
                    'requestInfo': {'label': 'Request More Info', 'value': 'more_info'}
                },
                'escalation': {
                    'enabled': config.get('escalateOnTimeout', False),
                    'escalateTo': config.get('escalateTo')
                }
            }
        }
```

**New File**: `python-backend/app/conversion/adapters/file_upload_adapter.py`

```python
from typing import Dict, Any
from .base import NodeAdapter

class FileUploadAdapter(NodeAdapter):
    """
    Transform file_upload node to chat file attachment.
    
    Strategy: Request file via chat
    - Bot asks user to upload file
    - Accepts drag-drop or attachment
    - Validates file type and size
    """
    
    def can_adapt(self, node_type: str) -> bool:
        return node_type == 'file_upload'
    
    def adapt(self, node: Dict[str, Any]) -> Dict[str, Any]:
        config = node.get('config', {})
        
        return {
            'type': 'file_attachment',
            'originalType': 'file_upload',
            'config': {
                'prompt': config.get('prompt', 'Please upload a file:'),
                'acceptedTypes': config.get('acceptedTypes', []),
                'maxSizeMB': config.get('maxSizeMB', 10),
                'multiple': config.get('multiple', False),
                'validationMessage': config.get('validationMessage', 'Invalid file. Please try again.')
            }
        }
```

### Adapter Registry

**New File**: `python-backend/app/conversion/adapter_registry.py`

```python
from typing import Dict, Any, Optional
from .adapters.form_input_adapter import FormInputAdapter
from .adapters.approval_gate_adapter import ApprovalGateAdapter
from .adapters.file_upload_adapter import FileUploadAdapter

class AdapterRegistry:
    """Registry for node adapters."""
    
    _adapters = [
        FormInputAdapter(),
        ApprovalGateAdapter(),
        FileUploadAdapter(),
    ]
    
    @classmethod
    def get_adapter(cls, node_type: str) -> Optional[NodeAdapter]:
        """Get adapter for node type."""
        for adapter in cls._adapters:
            if adapter.can_adapt(node_type):
                return adapter
        return None
    
    @classmethod
    def adapt_node(cls, node: Dict[str, Any]) -> Dict[str, Any]:
        """Adapt a node if adapter exists."""
        node_type = node.get('type', '')
        adapter = cls.get_adapter(node_type)
        
        if adapter:
            return adapter.adapt(node)
        
        return node
```

---

## E.3 Conversion UI Flow

### Frontend Implementation

**New File**: `apps/web/client/src/components/workflow/ConvertToSkillDialog.tsx`

```typescript
import { useState } from 'react';
import { trpc } from '~/utils/trpc';

interface ConvertToSkillDialogProps {
  workflowId: number;
  open: boolean;
  onClose: () => void;
}

export function ConvertToSkillDialog({ workflowId, open, onClose }: ConvertToSkillDialogProps) {
  const [step, setStep] = useState<'analyze' | 'configure' | 'preview' | 'success'>('analyze');
  const [config, setConfig] = useState({
    name: '',
    description: '',
    triggerPatterns: [''],
    isEnabled: false
  });
  
  // Query conversion analysis
  const { data: analysis, isLoading } = trpc.workflow.analyzeConversion.useQuery(
    { workflowId },
    { enabled: open }
  );
  
  // Mutation to convert
  const convertMutation = trpc.workflow.convertToSkill.useMutation({
    onSuccess: () => setStep('success')
  });
  
  const handleConvert = () => {
    convertMutation.mutate({ workflowId, config });
  };
  
  if (isLoading) return <LoadingDialog />;
  
  if (!analysis?.eligible) {
    return (
      <Dialog open={open} onClose={onClose}>
        <DialogTitle>Cannot Convert Workflow</DialogTitle>
        <DialogContent>
          <Alert severity="error">
            This workflow cannot be converted to a skill.
          </Alert>
          <Typography variant="subtitle1" className="mt-4">
            Issues Found:
          </Typography>
          <ul>
            {analysis?.unsupportedNodes.map(node => (
              <li key={node.nodeId}>
                <strong>{node.nodeType}</strong>: {node.reason}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    );
  }
  
  // Render based on step
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Convert Workflow to Skill</DialogTitle>
      
      <Stepper activeStep={['analyze', 'configure', 'preview', 'success'].indexOf(step)}>
        <Step label="Analyze" />
        <Step label="Configure" />
        <Step label="Preview" />
        <Step label="Complete" />
      </Stepper>
      
      <DialogContent>
        {step === 'analyze' && (
          <AnalysisView 
            analysis={analysis} 
            onContinue={() => setStep('configure')} 
          />
        )}
        
        {step === 'configure' && (
          <ConfigurationView
            config={config}
            onChange={setConfig}
            onContinue={() => setStep('preview')}
          />
        )}
        
        {step === 'preview' && (
          <PreviewView
            workflowId={workflowId}
            config={config}
            onConvert={handleConvert}
          />
        )}
        
        {step === 'success' && <SuccessView skillId={convertMutation.data?.skillId} />}
      </DialogContent>
    </Dialog>
  );
}

// Analysis View Component
function AnalysisView({ analysis, onContinue }: { analysis: ConversionAnalysis, onContinue: () => void }) {
  const scoreColor = analysis.compatibilityScore >= 80 ? 'success' : 
                     analysis.compatibilityScore >= 50 ? 'warning' : 'error';
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <CircularProgress 
          variant="determinate" 
          value={analysis.compatibilityScore} 
          color={scoreColor}
          size={80}
        />
        <div>
          <Typography variant="h6">
            Compatibility Score: {analysis.compatibilityScore}/100
          </Typography>
          <Chip 
            label={analysis.level.replace('_', ' ')} 
            color={scoreColor}
          />
        </div>
      </div>
      
      {analysis.adaptersRequired.length > 0 && (
        <Alert severity="info">
          <AlertTitle>Adapters Required</AlertTitle>
          The following nodes will be adapted for chat:
          <ul>
            {analysis.adaptersRequired.map(adapter => (
              <li key={adapter.nodeId}>
                {adapter.nodeType} → {adapter.adapter}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      
      <Button variant="contained" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}

// Configuration View Component
function ConfigurationView({ config, onChange, onContinue }: ConfigurationViewProps) {
  return (
    <div className="space-y-4">
      <TextField
        label="Skill Name"
        value={config.name}
        onChange={e => onChange({ ...config, name: e.target.value })}
        fullWidth
        required
      />
      
      <TextField
        label="Description"
        value={config.description}
        onChange={e => onChange({ ...config, description: e.target.value })}
        multiline
        rows={3}
        fullWidth
      />
      
      <Typography variant="subtitle2">Trigger Patterns</Typography>
      <Typography variant="caption" className="text-gray-500">
        Phrases that will trigger this skill. Use {'{variable}'} for parameters.
      </Typography>
      
      {config.triggerPatterns.map((pattern, idx) => (
        <div key={idx} className="flex gap-2">
          <TextField
            value={pattern}
            onChange={e => {
              const patterns = [...config.triggerPatterns];
              patterns[idx] = e.target.value;
              onChange({ ...config, triggerPatterns: patterns });
            }}
            fullWidth
            placeholder="e.g., Process {filename} and email to {email}"
          />
          <IconButton 
            onClick={() => {
              const patterns = config.triggerPatterns.filter((_, i) => i !== idx);
              onChange({ ...config, triggerPatterns: patterns });
            }}
          >
            <DeleteIcon />
          </IconButton>
        </div>
      ))}
      
      <Button
        variant="outlined"
        onClick={() => onChange({ 
          ...config, 
          triggerPatterns: [...config.triggerPatterns, ''] 
        })}
      >
        Add Pattern
      </Button>
      
      <FormControlLabel
        control={
          <Switch
            checked={config.isEnabled}
            onChange={e => onChange({ ...config, isEnabled: e.target.checked })}
          />
        }
        label="Enable skill immediately after conversion"
      />
      
      <Button variant="contained" onClick={onContinue}>
        Preview
      </Button>
    </div>
  );
}
```

---

## E.4 Skill Registration

### Backend Implementation

**New File**: `python-backend/app/services/workflow_skill_service.py`

```python
from typing import Dict, Any
from datetime import datetime, timezone

class WorkflowSkillService:
    """Convert workflows to agent skills."""
    
    def __init__(self, db_pool):
        self.db_pool = db_pool
        self.analyzer = ConversionAnalyzer()
        
    async def convert_to_skill(
        self,
        workflow_id: int,
        user_id: int,
        tenant_id: int,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Convert workflow to agent skill."""
        
        # Load workflow
        workflow = await self._load_workflow(workflow_id, tenant_id)
        
        # Analyze compatibility
        analysis = self.analyzer.analyze(workflow)
        
        if not analysis.eligible:
            raise ValueError(f"Workflow not eligible: {analysis.recommendations}")
        
        # Adapt nodes
        adapted_nodes = [
            AdapterRegistry.adapt_node(node)
            for node in workflow.get('nodes', [])
        ]
        
        # Build skill definition
        skill = {
            'slug': f"user_workflow_{workflow_id}_{int(datetime.now().timestamp())}",
            'name': config['name'],
            'description': config.get('description', workflow.get('name', '')),
            'category': 'automation',
            'isAutoTrigger': True,
            'triggerPatterns': config.get('triggerPatterns', []),
            'executionMode': 'workflow',
            'workflowId': workflow_id,
            'adaptedNodes': adapted_nodes,
            'conversionMetadata': {
                'originalWorkflowId': workflow_id,
                'convertedBy': user_id,
                'convertedAt': datetime.now(timezone.utc).isoformat(),
                'compatibilityScore': analysis.compatibility_score,
                'adaptersUsed': [a.adapter_required for a in analysis.adapters_required]
            },
            'isEnabled': config.get('isEnabled', False),
            'enabledByDefault': False,
            'importSource': 'workflow_conversion'
        }
        
        # Save skill
        skill_id = await self._save_skill(skill, tenant_id)
        
        return {
            'skillId': skill_id,
            'slug': skill['slug'],
            'name': skill['name'],
            'status': 'created'
        }
    
    async def _save_skill(self, skill: Dict[str, Any], tenant_id: int) -> int:
        """Save skill to database."""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow("""
                INSERT INTO skills (
                    slug, name, description, category,
                    is_auto_trigger, trigger_patterns,
                    execution_mode, workflow_id,
                    config, is_enabled, enabled_by_default,
                    import_source, tenant_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
            """,
                skill['slug'],
                skill['name'],
                skill['description'],
                skill['category'],
                skill['isAutoTrigger'],
                skill['triggerPatterns'],
                skill['executionMode'],
                skill['workflowId'],
                skill['conversionMetadata'],
                skill['isEnabled'],
                skill['enabledByDefault'],
                skill['importSource'],
                tenant_id
            )
            
            return row['id']
```

---

## E.5 Skill Executor Integration

### Description
Execute converted skills in chat context.

### Backend Implementation

**New File**: `python-backend/app/execution/workflow_skill_executor.py`

```python
from typing import Dict, Any, AsyncGenerator

class WorkflowSkillExecutor:
    """
    Execute workflow-based skills in chat context.
    
    Handles:
    - Trigger pattern matching
    - Parameter extraction
    - Workflow execution
    - Response formatting
    """
    
    def __init__(self, db_pool):
        self.db_pool = db_pool
        
    async def execute(
        self,
        skill: Dict[str, Any],
        message: str,
        chat_context: Dict[str, Any]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute workflow skill."""
        
        # Extract parameters from message
        params = self._extract_parameters(
            message, 
            skill['triggerPatterns']
        )
        
        # Build workflow inputs
        workflow_inputs = {
            'message': message,
            'params': params,
            'user': chat_context.get('user'),
            'conversation': chat_context.get('conversation')
        }
        
        # Load workflow
        workflow_id = skill['workflowId']
        workflow = await self._load_workflow(workflow_id)
        
        # Adapt nodes for chat context
        adapted_workflow = self._adapt_for_chat(workflow, skill.get('adaptedNodes', []))
        
        # Compile and execute
        from app.orchestrator.workflow_compiler import WorkflowCompiler
        from app.orchestrator.langgraph_runtime import LangGraphRuntime
        
        compiler = WorkflowCompiler()
        manifest = compiler.compile(
            nodes=adapted_workflow['nodes'],
            edges=adapted_workflow['edges']
        )
        
        runtime = LangGraphRuntime()
        
        # Stream execution results
        async for event in runtime.execute_streaming(manifest, workflow_inputs):
            # Format event for chat
            formatted = self._format_for_chat(event, skill)
            if formatted:
                yield formatted
    
    def _extract_parameters(self, message: str, patterns: list) -> Dict[str, Any]:
        """Extract parameters from message using patterns."""
        import re
        
        for pattern in patterns:
            # Convert pattern to regex
            # "Process {filename} and email to {email}"
            # → r"Process (.+) and email to (.+)"
            
            param_names = re.findall(r'\{(\w+)\}', pattern)
            regex_pattern = re.sub(r'\{\w+\}', '(.+)', re.escape(pattern))
            
            match = re.search(regex_pattern, message, re.IGNORECASE)
            if match:
                return {
                    name: value.strip()
                    for name, value in zip(param_names, match.groups())
                }
        
        return {}
    
    def _format_for_chat(self, event: Dict[str, Any], skill: Dict[str, Any]) -> Dict[str, Any]:
        """Format workflow event for chat display."""
        event_type = event.get('type')
        
        if event_type == 'node_start':
            # Optionally show progress
            return None  # Skip for cleaner chat
            
        elif event_type == 'node_complete':
            node_type = event.get('nodeType')
            
            if node_type == 'conversational_input':
                # Send question to user
                return {
                    'type': 'question',
                    'text': event.get('data', {}).get('prompt')
                }
            
            elif node_type == 'chat_approval':
                # Send approval request
                return {
                    'type': 'approval_request',
                    'text': event.get('data', {}).get('prompt'),
                    'options': event.get('data', {}).get('approvalOptions')
                }
            
            elif node_type == 'llm_call':
                # Stream LLM response
                return {
                    'type': 'text',
                    'text': event.get('data', {}).get('content')
                }
        
        elif event_type == 'workflow_complete':
            return {
                'type': 'complete',
                'result': event.get('result')
            }
        
        elif event_type == 'error':
            return {
                'type': 'error',
                'text': f"Error in skill execution: {event.get('error')}"
            }
        
        return None
```

---

## Testing Requirements

### Unit Tests
```python
# tests/unit/conversion/test_analyzer.py
# tests/unit/conversion/adapters/test_form_input.py
# tests/unit/conversion/adapters/test_approval_gate.py
# tests/unit/services/test_workflow_skill_service.py
# tests/unit/execution/test_workflow_skill_executor.py
```

### Integration Tests
```bash
# Test conversion analysis
curl -X POST http://localhost:8000/api/v1/workflows/analyze-conversion \
  -H "Content-Type: application/json" \
  -d '{"workflowId": 1}'

# Test conversion
curl -X POST http://localhost:8000/api/v1/workflows/convert-to-skill \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": 1,
    "config": {
      "name": "Data Processor",
      "triggerPatterns": ["process {filename}"]
    }
  }'

# Test skill execution (via chat API)
curl -X POST http://localhost:8000/api/v1/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "process sales_data.csv"}'
```

---

## Definition of Done

- [ ] Conversion analysis API with scoring
- [ ] All node adapters implemented
- [ ] Frontend conversion UI flow
- [ ] Skill registration backend
- [ ] Skill executor for chat context
- [ ] Unit tests for all adapters
- [ ] Integration tests for conversion flow
- [ ] Documentation for skill conversion feature
- [ ] User guide for converting workflows
