Perfect! Now I have all the context. Let me extract the relevant content for section-11-dynamic-config from both the plan and TDD document.

Based on the index, section-11 is about:
**Frontend DynamicNodeConfig + ExpressionInput** — Build `DynamicNodeConfig` component that renders forms from `InputSpec` definitions. UI type mapping (text, textarea, slider, select, toggle, json_editor). Async option loading for `options_endpoint` fields. `ExpressionInput` with `{{` autocomplete, upstream node detection, token highlighting. `ConditionBuilder` visual + advanced modes.

Let me generate the section content:

---

# Frontend DynamicNodeConfig + ExpressionInput

## Overview

Section 11 implements the frontend configuration panel for workflow nodes. The `DynamicNodeConfig` component dynamically renders form controls based on the backend node type registry, enabling users to configure node inputs without hardcoded UI mappings. This section also includes the `ExpressionInput` component for writing templated expressions (e.g., `{{nodeId.output.field}}`) and the `ConditionBuilder` for visual condition logic.

**Dependencies:** Section 10 (BaseNode + useNodeRegistry) must be complete. Section 02 (Backend Registry API) provides the `/api/v1/workflow/node-types` endpoint that DynamicNodeConfig fetches.

**Blocks:** Section 14 (Editor Refactor) depends on this section being complete.

## Architecture

### Component Hierarchy

```
DynamicNodeConfig (main config panel)
├── FormField (for each input in InputSpec)
│   ├── TextInput / TextArea (text, textarea)
│   ├── NumberInput / Slider (number, slider)
│   ├── Select / MultiSelect (select, multiselect)
│   ├── Toggle (toggle)
│   ├── JSONEditor (json_editor)
│   └── ExpressionInput (special type for inputs with accepts_connection: true)
└── ConditionBuilder (for Conditional node only)

ExpressionInput
├── TextInput with {{}} detection
├── AutocompleteDropdown (triggered by {{)
│   └── UpstreamNodeSelector
│       └── OutputPortList
└── ExpressionToken Highlighter

ConditionBuilder
├── VisualMode
│   ├── ConditionRow (field, operator, compareValue, combineWith)
│   ├── OperatorDropdown
│   └── AddConditionButton
└── AdvancedMode
    └── ExpressionTextArea
```

### Data Flow

1. User selects a node in the editor canvas
2. WorkflowEditor passes `node.data.nodeType` to DynamicNodeConfig
3. DynamicNodeConfig fetches node definition from useNodeRegistry (already cached from BaseNode phase)
4. For each input in the definition:
   - If `ui_type` is 'text' / 'textarea' / 'number' / etc. → render corresponding control
   - If input has `accepts_connection: true` → show dual-mode toggle (manual or connected)
   - If `options_endpoint` is set → use TanStack Query to fetch dynamic options
5. User changes value → updates `node.data.config` object
6. For expression inputs → ExpressionInput detects `{{` and shows autocomplete
7. For Conditional nodes → ConditionBuilder manages condition rules (visual or advanced mode)

## Tests (TDD First)

### DynamicNodeConfig Tests

```typescript
// apps/web/client/src/components/workflow/config/__tests__/DynamicNodeConfig.test.tsx

describe('DynamicNodeConfig', () => {
  // Test: renders text input for ui_type: text
  it('should render text input for text ui_type', () => {
    // Mock node with text input
    // Verify TextInput component rendered
  });

  // Test: renders textarea for ui_type: textarea
  it('should render textarea for textarea ui_type', () => {
    // Verify Textarea component rendered with proper props
  });

  // Test: renders slider for ui_type: slider with min/max
  it('should render slider with min/max validation', () => {
    // Verify Slider component with validation props
  });

  // Test: renders select dropdown for ui_type: select
  it('should render select dropdown with options', () => {
    // Verify Select component with options array
  });

  // Test: renders toggle switch for ui_type: toggle
  it('should render toggle switch', () => {
    // Verify Switch/Toggle component
  });

  // Test: fetches async options from options_endpoint
  it('should fetch dynamic options from endpoint', async () => {
    // Mock options_endpoint
    // Verify API call made
    // Verify options loaded into select
  });

  // Test: shows loading spinner while fetching options
  it('should show loading spinner during option fetch', () => {
    // Verify spinner visible during loading state
  });

  // Test: shows validation errors for invalid input
  it('should display validation errors', () => {
    // Trigger validation
    // Verify error message displayed
  });

  // Test: connected inputs show connection indicator instead of form control
  it('should show connection indicator for connected inputs', () => {
    // Mock connected input (node has edge)
    // Verify form control hidden, connection label shown
  });
});
```

### ExpressionInput Tests

```typescript
// apps/web/client/src/components/workflow/config/__tests__/ExpressionInput.test.tsx

describe('ExpressionInput', () => {
  // Test: renders as text input
  it('should render as text input', () => {
    // Verify input element rendered
  });

  // Test: detects {{ trigger and shows autocomplete dropdown
  it('should show autocomplete on {{ trigger', () => {
    // Type {{
    // Verify autocomplete dropdown appears
  });

  // Test: autocomplete lists upstream nodes and their outputs
  it('should list upstream nodes in autocomplete', () => {
    // Mock upstream nodes (from graph dependency analysis)
    // Type {{
    // Verify dropdown shows node list with outputs
  });

  // Test: selecting autocomplete option inserts {{nodeId.output}}
  it('should insert selected expression', () => {
    // Type {{
    // Click option
    // Verify {{nodeId.output}} inserted
  });

  // Test: highlights expression tokens visually
  it('should highlight expression tokens', () => {
    // Type {{node1.response}}
    // Verify token highlighted
  });

  // Test: validates that referenced nodes exist in graph
  it('should validate expression references', () => {
    // Type {{nonexistent.output}}
    // Verify error shown (or at validation time)
  });
});
```

### ConditionBuilder Tests

```typescript
// apps/web/client/src/components/workflow/config/__tests__/ConditionBuilder.test.tsx

describe('ConditionBuilder', () => {
  // Test: visual mode renders operator dropdown and compare value field
  it('should render visual mode with operator dropdown', () => {
    // Verify operator select and compare value input
  });

  // Test: visual mode allows adding multiple conditions with AND/OR
  it('should allow adding multiple conditions', () => {
    // Click add condition button
    // Verify second condition row added
    // Verify AND/OR dropdown
  });

  // Test: advanced mode renders expression text area
  it('should render advanced mode with expression textarea', () => {
    // Switch to advanced mode
    // Verify textarea rendered
  });

  // Test: switching modes preserves equivalent expression where possible
  it('should preserve expression when switching modes', () => {
    // Build condition in visual mode
    // Switch to advanced mode
    // Verify expression equivalent
  });
});
```

## Implementation Details

### File Structure

```
apps/web/client/src/
  components/workflow/config/
    DynamicNodeConfig.tsx           # Main config panel component
    DynamicNodeConfig.test.tsx      # Tests
    ExpressionInput.tsx             # Expression autocomplete text input
    ExpressionInput.test.tsx        # Tests
    ConditionBuilder.tsx            # Visual/advanced condition builder
    ConditionBuilder.test.tsx       # Tests
    components/                     # Sub-components
      FormField.tsx                 # Wrapper for form fields
      OperatorSelector.tsx          # Dropdown for conditional operators
      DynamicSelect.tsx             # Select with async option loading
```

### DynamicNodeConfig Component

**Purpose:** Renders a form panel for configuring the selected node's inputs.

**Props:**
- `nodeId: string` — Currently selected node ID
- `nodeType: string` — Logical node type (e.g., 'llm_call')
- `config: Record<string, any>` — Current node configuration values
- `connections: { [inputName]: boolean }` — Inputs that have incoming connections
- `onConfigChange: (config: Record<string, any>) => void` — Callback when config changes

**Behavior:**
1. Fetch node definition from `useNodeRegistry` (cached)
2. For each input in definition:
   - Render FormField component based on `ui_type`
   - If has `options_endpoint` → fetch options with TanStack Query
   - If `accepts_connection: true` → show manual/connected toggle
3. Show connection indicator for inputs with active connections (edge pointing to this input)
4. Validate input on blur/change
5. Call `onConfigChange` with updated config object

**Stub signature:**
```typescript
interface DynamicNodeConfigProps {
  nodeId: string;
  nodeType: string;
  config: Record<string, any>;
  connections: { [inputName]: boolean };
  onConfigChange: (config: Record<string, any>) => void;
}

export function DynamicNodeConfig(props: DynamicNodeConfigProps) {
  const registry = useNodeRegistry();
  const nodeDef = registry?.getNodeType(props.nodeType);

  if (!nodeDef) {
    return <div>Node type not found</div>;
  }

  return (
    <div className="space-y-4 p-4">
      {nodeDef.inputs.map((input) => (
        <FormField
          key={input.name}
          input={input}
          value={props.config[input.name]}
          isConnected={props.connections[input.name] ?? false}
          onChange={(value) => {
            props.onConfigChange({
              ...props.config,
              [input.name]: value,
            });
          }}
        />
      ))}
    </div>
  );
}
```

### ExpressionInput Component

**Purpose:** Text input with `{{` autocomplete for writing templated expressions.

**Props:**
- `value: string` — Current expression value
- `onChange: (value: string) => void` — Change callback
- `upstreamNodes: Node[]` — Nodes that can be referenced (dependency graph)
- `placeholder?: string`

**Behavior:**
1. Render as text input with onChange handler
2. On keystroke, detect `{{` pattern and compute upstream nodes
3. Show autocomplete dropdown with node list
4. On node selection, show ports (outputs) for that node
5. On port selection, insert `{{nodeId.outputName}}` at cursor
6. Highlight all `{{...}}` tokens with visual styling (e.g., color background)
7. On blur, validate all referenced nodes/outputs exist

**Stub signature:**
```typescript
interface ExpressionInputProps {
  value: string;
  onChange: (value: string) => void;
  upstreamNodes: Node[];
  placeholder?: string;
}

export function ExpressionInput(props: ExpressionInputProps) {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  
  const handleInputChange = (newValue: string) => {
    props.onChange(newValue);
    // Detect {{ pattern
    // Show/hide autocomplete
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={props.value}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full border rounded p-2"
      />
      {showAutocomplete && (
        <AutocompleteDropdown
          nodes={props.upstreamNodes}
          onSelectPort={(nodeId, outputName) => {
            // Insert {{nodeId.outputName}}
          }}
        />
      )}
    </div>
  );
}
```

### ConditionBuilder Component

**Purpose:** Build boolean conditions for Conditional nodes in visual or advanced mode.

**Props:**
- `mode: 'visual' | 'advanced'` — Builder mode
- `value: any` — Current condition config (array of rules in visual, string in advanced)
- `onChange: (value: any) => void` — Change callback
- `onModeChange: (mode: 'visual' | 'advanced') => void` — Mode toggle

**Visual Mode Structure:**
```typescript
interface ConditionRule {
  field: string;           // JSONPath (e.g., "user.age")
  operator: string;        // equals, notEquals, greaterThan, etc.
  compareValue: any;       // Value to compare against
  combineWith: 'AND' | 'OR'; // How to combine with next rule
}
```

**Supported Operators (Visual Mode):**
- equals, notEquals
- greaterThan, lessThan, greaterOrEqual, lessOrEqual
- contains, startsWith, endsWith
- isEmpty, isNotEmpty
- matchesRegex

**Behavior:**
1. Visual mode: Render array of ConditionRow components, each with operator dropdown
2. Advanced mode: Render text area with expression (passed to backend `simpleeval`)
3. Mode toggle button preserves equivalent expression where possible
4. "Add Condition" button appends new rule
5. "Remove" button removes rule

**Stub signature:**
```typescript
interface ConditionBuilderProps {
  mode: 'visual' | 'advanced';
  value: ConditionRule[] | string;
  onChange: (value: ConditionRule[] | string) => void;
  onModeChange: (mode: 'visual' | 'advanced') => void;
}

export function ConditionBuilder(props: ConditionBuilderProps) {
  if (props.mode === 'visual') {
    return (
      <div className="space-y-2">
        {Array.isArray(props.value) && props.value.map((rule, idx) => (
          <ConditionRow
            key={idx}
            rule={rule}
            onChange={(updated) => {
              const newValue = [...props.value, updated];
              props.onChange(newValue);
            }}
          />
        ))}
        <button onClick={() => {/* Add new rule */}}>
          + Add Condition
        </button>
      </div>
    );
  }

  return (
    <textarea
      value={typeof props.value === 'string' ? props.value : ''}
      onChange={(e) => props.onChange(e.target.value)}
      className="w-full border rounded p-2"
      rows={4}
    />
  );
}
```

### FormField Component

**Purpose:** Wrapper that renders the appropriate control for each input based on `ui_type`.

**Props:**
- `input: InputSpec` — Input definition from registry
- `value: any` — Current value
- `isConnected: boolean` — Whether this input has an incoming connection
- `onChange: (value: any) => void` — Change callback

**Behavior:**
1. If `isConnected` is true → show "Connected to [nodeId]" label instead of form control
2. Otherwise, render control based on `ui_type`:
   - text → TextInput with optional ExpressionInput if `accepts_connection`
   - textarea → Textarea (with expression support if `accepts_connection`)
   - number → NumberInput with min/max validation
   - slider → Slider with min/max from validation
   - select → DynamicSelect with options or options_endpoint
   - multiselect → MultiSelect with search
   - toggle → Switch/Toggle
   - json_editor → CodeMirror JSON editor

**Stub signature:**
```typescript
interface FormFieldProps {
  input: InputSpec;
  value: any;
  isConnected: boolean;
  onChange: (value: any) => void;
}

export function FormField(props: FormFieldProps) {
  if (props.isConnected) {
    return (
      <div className="p-2 bg-blue-50 border border-blue-200 rounded">
        <span className="text-sm text-blue-700">
          Connected from upstream node
        </span>
      </div>
    );
  }

  switch (props.input.ui_type) {
    case 'text':
      return (
        <input
          type="text"
          value={props.value ?? ''}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.input.placeholder}
        />
      );
    // ... other cases
    default:
      return null;
  }
}
```

### DynamicSelect Component

**Purpose:** Select dropdown with optional async option loading.

**Props:**
- `options?: Array<{ value: any; label: string }>` — Static options
- `optionsEndpoint?: string` — API endpoint for dynamic options
- `value: any`
- `onChange: (value: any) => void`
- `isMulti?: boolean` — For multiselect

**Behavior:**
1. If `optionsEndpoint` is set → use TanStack Query with appropriate staleTime
2. Show loading spinner while fetching
3. Render Select component (from Radix or custom) with options
4. Cache options per endpoint

**Stub signature:**
```typescript
interface DynamicSelectProps {
  options?: { value: any; label: string }[];
  optionsEndpoint?: string;
  value: any;
  onChange: (value: any) => void;
  isMulti?: boolean;
}

export function DynamicSelect(props: DynamicSelectProps) {
  const { data: dynamicOptions, isLoading } = useQuery({
    queryKey: ['dynamic-options', props.optionsEndpoint],
    queryFn: () =>
      fetch(`/api/v1/workflow${props.optionsEndpoint}`).then((r) =>
        r.json()
      ),
    enabled: !!props.optionsEndpoint,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const allOptions = props.options ?? dynamicOptions ?? [];

  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      disabled={isLoading}
    >
      {isLoading && <option>Loading...</option>}
      {allOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
```

## Integration Points

### With BaseNode (Section 10)
- DynamicNodeConfig is rendered in a side panel when node is selected
- Node type is read from `node.data.nodeType` (set by BaseNode)
- Form values stored in `node.data.config`

### With Workflow Compiler (Section 7 — Backend)
- Configuration values are sent to backend in `POST /compile` request
- Backend validates against InputSpec and marks inputs as configured

### With ExpressionInput
- Used for textarea/text inputs that have `accepts_connection: true`
- Displays `{{` autocomplete for referencing upstream node outputs

### With Editor (Section 14)
- DynamicNodeConfig panel is opened when a node is selected
- Configuration changes update the node's data in ReactFlow state

## Key Design Decisions

### 1. No Dynamic Tailwind Classes
The color map approach (static CSS classes) ensures Tailwind's JIT compiler sees all class names at build time. Instead of `border-${color}-400`, maintain a static map:

```typescript
const colorMap: Record<string, string> = {
  blue: 'border-blue-400 text-blue-600 bg-blue-50',
  green: 'border-green-400 text-green-600 bg-green-50',
  // ... all colors
};

// Usage
<div className={colorMap[dataType]}>...</div>
```

### 2. Async Options Loading
For inputs with `options_endpoint`:
- Use TanStack Query with appropriate staleTime (5 min for models, 30 sec for collections, 1 min for approvers)
- Show loading spinner during fetch
- Avoid re-fetching on every render (proper dependency array)

### 3. Dual-Mode Inputs (Manual vs Connected)
Inputs with `accepts_connection: true` should show:
- **Manual mode:** Form control (text, select, etc.)
- **Connected mode:** "Connected to Node X" label (if edge exists)

Toggle between modes when user adds/removes edge.

### 4. Expression Validation
ExpressionInput validates on blur, not on every keystroke:
- Check that all `{{nodeId.outputName}}` references exist in graph
- Show red underline for invalid references
- Validation happens client-side for UX speed

### 5. Upstream Node Detection
When ExpressionInput shows autocomplete, only list nodes that are **guaranteed to execute before the current node** (topological order from FlowCompiler). Prevent forward references.

## Testing Strategy

### Unit Tests
- FormField renders correct control for each ui_type
- DynamicNodeConfig fetches from registry and renders all inputs
- ExpressionInput detects `{{` and shows autocomplete
- ExpressionInput highlights tokens and validates references
- ConditionBuilder switches modes and preserves expression
- DynamicSelect handles async option loading with staleTime

### Integration Tests
- Node selection opens DynamicNodeConfig with correct config
- Changing input value updates node.data.config in editor
- Connected input shows connection indicator instead of form control
- ExpressionInput autocomplete inserts correct `{{nodeId.output}}` format
- ConditionBuilder mode switch preserves logic equivalence

## Related Sections

- **Section 10:** BaseNode must be complete for DynamicNodeConfig to integrate
- **Section 02:** Registry API endpoints (`/node-types`, `/available-models`, etc.) must exist
- **Section 04:** Expression Resolver (backend) validates and resolves expressions at execution time
- **Section 07:** FlowCompiler validates expressions and generates resolution metadata
- **Section 14:** WorkflowEditor integrates DynamicNodeConfig into the editor UI

---

This section is now ready for implementation. The implementer should start with the test stubs above, then implement components in order: FormField → DynamicSelect → ExpressionInput → ConditionBuilder → DynamicNodeConfig.