"""
Node type registry - single source of truth for all workflow node definitions.
"""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class InputSpec:
    """Specification for a node input."""

    name: str
    display_name: str
    data_type: str  # Port data type: text, json, array, image, number, boolean, any
    ui_type: str  # UI control: text, textarea, number, slider, select, multiselect, toggle, json_editor
    required: bool
    accepts_connection: bool  # Can receive data from upstream node port
    default: Any = None
    options: list[dict] | None = None  # For select/multiselect (static options)
    options_endpoint: str | None = None  # For dynamic options (API endpoint)
    validation: dict | None = None  # {min, max, pattern, min_length, max_length}
    placeholder: str | None = None


@dataclass
class OutputSpec:
    """Specification for a node output."""

    name: str
    display_name: str
    data_type: str  # Port data type: text, json, array, image, number, boolean, any


@dataclass
class NodeTypeSpec:
    """Complete specification for a node type."""

    type: str  # Unique identifier (e.g., "llm_call")
    display_name: str
    description: str
    icon: str  # Lucide icon name
    color: str  # Tailwind color name (blue, green, purple, etc.)
    category: str  # ai, flow_control, human, skills, media
    inputs: list[InputSpec]
    outputs: list[OutputSpec]
    executor: str  # Python dotpath to executor class


class NodeRegistry:
    """Singleton registry for all node types."""

    _instance = None

    def __init__(self):
        self._node_types: dict[str, NodeTypeSpec] = {}

    @classmethod
    def get_instance(cls) -> "NodeRegistry":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._register_core_nodes()
        return cls._instance

    def register_node_type(self, spec: NodeTypeSpec) -> None:
        """Register a node type. Raises ValueError if already registered."""
        if spec.type in self._node_types:
            raise ValueError(f"Node type '{spec.type}' is already registered")
        self._node_types[spec.type] = spec

    def get_node_type(self, node_type: str) -> NodeTypeSpec | None:
        """Get node type by identifier."""
        return self._node_types.get(node_type)

    def get_all_node_types(self) -> list[NodeTypeSpec]:
        """Get all registered node types."""
        return list(self._node_types.values())

    def _register_core_nodes(self) -> None:
        """Register core node types."""

        # 1. LLM Call Node
        self.register_node_type(
            NodeTypeSpec(
                type="llm_call",
                display_name="LLM Call",
                description="Send a prompt to a large language model and receive a response",
                icon="brain",
                color="blue",
                category="ai",
                inputs=[
                    InputSpec(
                        name="prompt",
                        display_name="Prompt",
                        data_type="text",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder="Enter your prompt or connect from previous node...",
                    ),
                    InputSpec(
                        name="systemPrompt",
                        display_name="System Prompt",
                        data_type="text",
                        ui_type="textarea",
                        required=False,
                        accepts_connection=True,
                        placeholder="Optional system instructions...",
                    ),
                    InputSpec(
                        name="model",
                        display_name="Model",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="gpt-4o-mini",
                        options_endpoint="/api/v1/workflow/available-models",
                    ),
                    InputSpec(
                        name="temperature",
                        display_name="Temperature",
                        data_type="number",
                        ui_type="slider",
                        required=False,
                        accepts_connection=False,
                        default=0.7,
                        validation={"min": 0, "max": 2, "step": 0.1},
                    ),
                    InputSpec(
                        name="maxTokens",
                        display_name="Max Tokens",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=1000,
                        validation={"min": 1, "max": 32000},
                    ),
                    InputSpec(
                        name="contextData",
                        display_name="Context Data",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Optional JSON context...",
                    ),
                ],
                outputs=[
                    OutputSpec(name="response", display_name="Response", data_type="text"),
                    OutputSpec(name="usage", display_name="Token Usage", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.llm_executor.LLMExecutor",
            )
        )

        # 2. RAG Query Node
        self.register_node_type(
            NodeTypeSpec(
                type="rag_query",
                display_name="RAG Query",
                description="Query a vector database collection for relevant documents",
                icon="database",
                color="green",
                category="ai",
                inputs=[
                    InputSpec(
                        name="query",
                        display_name="Query",
                        data_type="text",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder="Enter search query...",
                    ),
                    InputSpec(
                        name="collection",
                        display_name="Collection",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        options_endpoint="/api/v1/workflow/rag-collections",
                    ),
                    InputSpec(
                        name="topK",
                        display_name="Top K Results",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=5,
                        validation={"min": 1, "max": 50},
                    ),
                    InputSpec(
                        name="searchMode",
                        display_name="Search Mode",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="hybrid",
                        options=[
                            {"label": "Hybrid (Vector + Keywords)", "value": "hybrid"},
                            {"label": "Vector Only", "value": "vector"},
                            {"label": "Keywords Only", "value": "keywords"},
                        ],
                    ),
                    InputSpec(
                        name="scoreThreshold",
                        display_name="Score Threshold",
                        data_type="number",
                        ui_type="slider",
                        required=False,
                        accepts_connection=False,
                        default=0.7,
                        validation={"min": 0, "max": 1, "step": 0.05},
                    ),
                    InputSpec(
                        name="metadataFilter",
                        display_name="Metadata Filter",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"category": "documentation"}',
                    ),
                ],
                outputs=[
                    OutputSpec(name="documents", display_name="Documents", data_type="array"),
                    OutputSpec(name="context", display_name="Combined Context", data_type="text"),
                    OutputSpec(name="metadata", display_name="Search Metadata", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.rag_executor.RAGExecutor",
            )
        )

        # 3. Conditional Node
        self.register_node_type(
            NodeTypeSpec(
                type="conditional",
                display_name="Conditional Branch",
                description="Route execution based on conditions",
                icon="split",
                color="yellow",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="value",
                        display_name="Value to Evaluate",
                        data_type="any",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="Connect value to evaluate...",
                    ),
                ],
                outputs=[
                    OutputSpec(name="true", display_name="True Branch", data_type="any"),
                    OutputSpec(name="false", display_name="False Branch", data_type="any"),
                ],
                executor="app.orchestrator.node_executors.conditional_executor.ConditionalExecutor",
            )
        )

        # 4. Loop Node
        self.register_node_type(
            NodeTypeSpec(
                type="loop",
                display_name="Loop",
                description="Iterate over data or repeat execution",
                icon="repeat",
                color="purple",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="data",
                        display_name="Data to Iterate",
                        data_type="any",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="Connect array or data source...",
                    ),
                ],
                outputs=[
                    OutputSpec(name="item", display_name="Current Item", data_type="any"),
                    OutputSpec(name="results", display_name="All Results", data_type="array"),
                    OutputSpec(name="index", display_name="Index", data_type="number"),
                ],
                executor="app.orchestrator.node_executors.loop_executor.LoopExecutor",
            )
        )

        # 5. Approval Gate Node
        self.register_node_type(
            NodeTypeSpec(
                type="approval_gate",
                display_name="Approval Gate",
                description="Pause workflow for human approval",
                icon="user-check",
                color="orange",
                category="human",
                inputs=[
                    InputSpec(
                        name="data",
                        display_name="Data to Review",
                        data_type="json",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="Data requiring approval...",
                    ),
                    InputSpec(
                        name="approvers",
                        display_name="Approvers",
                        data_type="array",
                        ui_type="multiselect",
                        required=True,
                        accepts_connection=False,
                        options_endpoint="/api/v1/workflow/available-approvers",
                    ),
                    InputSpec(
                        name="message",
                        display_name="Approval Message",
                        data_type="text",
                        ui_type="textarea",
                        required=False,
                        accepts_connection=True,
                        placeholder="Please review and approve...",
                    ),
                    InputSpec(
                        name="timeout",
                        display_name="Timeout (hours)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=24,
                        validation={"min": 1, "max": 168},
                    ),
                    InputSpec(
                        name="requiredApprovals",
                        display_name="Required Approvals",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=1,
                        validation={"min": 1, "max": 10},
                    ),
                ],
                outputs=[
                    OutputSpec(name="approved", display_name="Approved Data", data_type="json"),
                    OutputSpec(name="rejected", display_name="Rejected Data", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.approval_executor.ApprovalExecutor",
            )
        )

        # 6. Generate Image Node
        self.register_node_type(
            NodeTypeSpec(
                type="generate_image",
                display_name="Generate Image",
                description="Generate an image from a text prompt",
                icon="image",
                color="pink",
                category="media",
                inputs=[
                    InputSpec(
                        name="prompt",
                        display_name="Prompt",
                        data_type="text",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder="Describe the image...",
                    ),
                    InputSpec(
                        name="negativePrompt",
                        display_name="Negative Prompt",
                        data_type="text",
                        ui_type="textarea",
                        required=False,
                        accepts_connection=True,
                        placeholder="What to avoid in the image...",
                    ),
                    InputSpec(
                        name="provider",
                        display_name="Provider",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="openai",
                        options_endpoint="/api/v1/workflow/image-providers",
                    ),
                    InputSpec(
                        name="size",
                        display_name="Size",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="1024x1024",
                        options=[
                            {"label": "Square (1024x1024)", "value": "1024x1024"},
                            {"label": "Portrait (1024x1792)", "value": "1024x1792"},
                            {"label": "Landscape (1792x1024)", "value": "1792x1024"},
                        ],
                    ),
                    InputSpec(
                        name="quality",
                        display_name="Quality",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="standard",
                        options=[
                            {"label": "Standard", "value": "standard"},
                            {"label": "HD", "value": "hd"},
                        ],
                    ),
                    InputSpec(
                        name="style",
                        display_name="Style",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="natural",
                        options=[
                            {"label": "Natural", "value": "natural"},
                            {"label": "Vivid", "value": "vivid"},
                        ],
                    ),
                ],
                outputs=[
                    OutputSpec(name="imageUrl", display_name="Image URL", data_type="text"),
                    OutputSpec(
                        name="metadata", display_name="Generation Metadata", data_type="json"
                    ),
                ],
                executor="app.orchestrator.node_executors.image_executor.ImageExecutor",
            )
        )

        # Skill node
        self.register_node_type(
            NodeTypeSpec(
                type="skill",
                display_name="Skill",
                description="Execute a registered skill (text analysis, summarization, etc.)",
                icon="Sparkles",
                color="green",
                category="skills",
                inputs=[
                    InputSpec(
                        name="skill_id",
                        display_name="Skill",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        options_endpoint="/api/v1/workflows/skills",
                        placeholder="Select a skill...",
                    ),
                    InputSpec(
                        name="input_data",
                        display_name="Input Data",
                        data_type="any",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Skill input data...",
                    ),
                ],
                outputs=[
                    OutputSpec(name="result", display_name="Skill Output", data_type="json"),
                    OutputSpec(name="status", display_name="Status", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.skill_executor.SkillExecutor",
            )
        )

        # ===== PHASE 2.1: Core Triggers & I/O =====

        # 1. Manual Trigger
        self.register_node_type(
            NodeTypeSpec(
                type="manual_trigger",
                display_name="Manual Trigger",
                description="Start workflow manually with optional input parameters",
                icon="play",
                color="green",
                category="triggers",
                inputs=[],
                outputs=[
                    OutputSpec(name="userId", display_name="User ID", data_type="number"),
                    OutputSpec(name="timestamp", display_name="Timestamp", data_type="text"),
                    OutputSpec(name="params", display_name="Input Parameters", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.trigger_executors.manual_trigger_executor.ManualTriggerExecutor",
            )
        )

        # 2. Form Input
        self.register_node_type(
            NodeTypeSpec(
                type="form_input",
                display_name="Form Input",
                description="Collect structured input from user before workflow execution",
                icon="form-input",
                color="blue",
                category="inputs",
                inputs=[
                    InputSpec(
                        name="fields",
                        display_name="Form Fields",
                        data_type="json",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=False,
                        default=[
                            {
                                "id": "field1",
                                "label": "Field 1",
                                "type": "text",
                                "required": True,
                                "placeholder": "Enter value",
                            }
                        ],
                        placeholder='[{"id":"field1","label":"Field 1","type":"text","required":true}]',
                    ),
                ],
                outputs=[
                    OutputSpec(name="values", display_name="Form Values", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.input_executors.form_input_executor.FormInputExecutor",
            )
        )

        # 3. Workflow Response
        self.register_node_type(
            NodeTypeSpec(
                type="workflow_response",
                display_name="Workflow Response",
                description="Return final output from workflow",
                icon="check-circle",
                color="purple",
                category="outputs",
                inputs=[
                    InputSpec(
                        name="data",
                        display_name="Response Data",
                        data_type="any",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="Data to return as workflow result...",
                    ),
                    InputSpec(
                        name="status",
                        display_name="Status",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="success",
                        options=[
                            {"label": "Success", "value": "success"},
                            {"label": "Partial", "value": "partial"},
                            {"label": "Failed", "value": "failed"},
                        ],
                    ),
                ],
                outputs=[],
                executor="app.orchestrator.node_executors.output_executors.response_executor.ResponseExecutor",
            )
        )

        # ===== PHASE 2.2: Data Manipulation =====

        # 4. Set Variable
        self.register_node_type(
            NodeTypeSpec(
                type="set_variable",
                display_name="Set Variable",
                description="Assign a value to a variable",
                icon="variable",
                color="orange",
                category="data",
                inputs=[
                    InputSpec(
                        name="variableName",
                        display_name="Variable Name",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=False,
                        placeholder="myVariable",
                    ),
                    InputSpec(
                        name="value",
                        display_name="Value",
                        data_type="any",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="Value to assign (supports {{expressions}})...",
                    ),
                ],
                outputs=[
                    OutputSpec(name="value", display_name="Assigned Value", data_type="any"),
                ],
                executor="app.orchestrator.node_executors.data_executors.set_executor.SetExecutor",
            )
        )

        # 5. Merge Data
        self.register_node_type(
            NodeTypeSpec(
                type="merge_data",
                display_name="Merge Data",
                description="Combine multiple data sources into one object",
                icon="merge",
                color="orange",
                category="data",
                inputs=[
                    InputSpec(
                        name="sources",
                        display_name="Data Sources",
                        data_type="array",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="[{{node1.output}}, {{node2.output}}]",
                    ),
                    InputSpec(
                        name="strategy",
                        display_name="Merge Strategy",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="overwrite",
                        options=[
                            {"label": "Overwrite (last wins)", "value": "overwrite"},
                            {"label": "Keep First", "value": "keep_first"},
                            {"label": "Deep Merge", "value": "deep_merge"},
                        ],
                    ),
                ],
                outputs=[
                    OutputSpec(name="merged", display_name="Merged Data", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.data_executors.merge_executor.MergeExecutor",
            )
        )

        # 6. Code Runner
        self.register_node_type(
            NodeTypeSpec(
                type="code_runner",
                display_name="Code Runner",
                description="Execute custom Python code for data transformation",
                icon="code",
                color="red",
                category="data",
                inputs=[
                    InputSpec(
                        name="code",
                        display_name="Python Code",
                        data_type="text",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=False,
                        placeholder='# Input available as "input" variable\nresult = input["field1"] + input["field2"]\nreturn result',
                    ),
                    InputSpec(
                        name="input",
                        display_name="Input Data",
                        data_type="any",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Data passed to code as 'input' variable...",
                    ),
                    InputSpec(
                        name="timeout",
                        display_name="Timeout (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=30,
                        validation={"min": 1, "max": 300},
                    ),
                ],
                outputs=[
                    OutputSpec(name="result", display_name="Execution Result", data_type="any"),
                    OutputSpec(name="stdout", display_name="Standard Output", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.data_executors.code_executor.CodeExecutor",
            )
        )

        # 7. Map Array
        self.register_node_type(
            NodeTypeSpec(
                type="map_array",
                display_name="Map Array",
                description="Transform each item in an array using field extraction, expressions, or custom code",
                icon="list",
                color="orange",
                category="data",
                inputs=[
                    InputSpec(
                        name="inputArray",
                        display_name="Input Array",
                        data_type="array",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="{{previousNode.items}}",
                    ),
                    InputSpec(
                        name="mapMode",
                        display_name="Map Mode",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="extract",
                        options=[
                            {"label": "Extract Field", "value": "extract"},
                            {"label": "Transform Expression", "value": "transform"},
                            {"label": "Custom Code", "value": "custom_code"},
                        ],
                    ),
                    InputSpec(
                        name="field",
                        display_name="Field Path",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="user.name",
                    ),
                    InputSpec(
                        name="expression",
                        display_name="Transform Expression",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="{{item.price}}",
                    ),
                    InputSpec(
                        name="customCode",
                        display_name="Custom Code",
                        data_type="text",
                        ui_type="textarea",
                        required=False,
                        accepts_connection=False,
                        placeholder="# 'item' and 'index' are available\nresult = item['price'] * 1.1",
                    ),
                    InputSpec(
                        name="outputField",
                        display_name="Output Field Name",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="transformedPrice",
                    ),
                ],
                outputs=[
                    OutputSpec(name="mapped", display_name="Mapped Items", data_type="array"),
                    OutputSpec(name="mappedCount", display_name="Mapped Count", data_type="number"),
                    OutputSpec(name="errors", display_name="Errors", data_type="array"),
                ],
                executor="app.orchestrator.node_executors.data_executors.map_executor.MapExecutor",
            )
        )

        # 8. Database Query
        self.register_node_type(
            NodeTypeSpec(
                type="database_query",
                display_name="Database Query",
                description="Execute SQL queries against a PostgreSQL database",
                icon="database",
                color="teal",
                category="data",
                inputs=[
                    InputSpec(
                        name="queryType",
                        display_name="Query Type",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="select",
                        options=[
                            {"label": "SELECT (Read)", "value": "select"},
                            {"label": "INSERT (Create)", "value": "insert"},
                            {"label": "UPDATE (Modify)", "value": "update"},
                            {"label": "DELETE (Remove)", "value": "delete"},
                        ],
                    ),
                    InputSpec(
                        name="query",
                        display_name="SQL Query",
                        data_type="text",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder=(
                            "SELECT * FROM users WHERE status = :status\n"
                            "-- Use :param_name for parameters"
                        ),
                    ),
                    InputSpec(
                        name="parameters",
                        display_name="Query Parameters",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        default={},
                        placeholder='{"status": "active", "limit": 10}',
                    ),
                    InputSpec(
                        name="database",
                        display_name="Database",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="primary",
                        options=[
                            {"label": "Primary (Default)", "value": "primary"},
                            {"label": "Secondary (Read Replica)", "value": "secondary"},
                        ],
                    ),
                    InputSpec(
                        name="timeout",
                        display_name="Timeout (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=30,
                        validation={"min": 1, "max": 300},
                    ),
                    InputSpec(
                        name="maxRows",
                        display_name="Max Rows (SELECT only)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=1000,
                        validation={"min": 1, "max": 10000},
                    ),
                ],
                outputs=[
                    OutputSpec(name="rows", display_name="Result Rows", data_type="array"),
                    OutputSpec(
                        name="affectedRows", display_name="Affected Rows", data_type="number"
                    ),
                    OutputSpec(
                        name="lastInsertId", display_name="Last Insert ID", data_type="number"
                    ),
                    OutputSpec(
                        name="executionTime", display_name="Execution Time (ms)", data_type="number"
                    ),
                ],
                executor="app.orchestrator.node_executors.data_executors.database_query_executor.DatabaseQueryExecutor",
            )
        )

        # 9. Filter (Array Filtering)
        self.register_node_type(
            NodeTypeSpec(
                type="filter",
                display_name="Filter",
                description="Filter array items based on conditions",
                icon="filter",
                color="orange",
                category="data",
                inputs=[
                    InputSpec(
                        name="inputArray",
                        display_name="Input Array",
                        data_type="array",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="Connect array data or enter {{nodeId.output}}...",
                    ),
                    InputSpec(
                        name="filterMode",
                        display_name="Filter Mode",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="simple",
                        options=[
                            {"label": "Simple (field comparison)", "value": "simple"},
                            {"label": "Expression", "value": "expression"},
                            {"label": "Custom Code (Python)", "value": "custom_code"},
                        ],
                    ),
                    # --- Simple mode fields ---
                    InputSpec(
                        name="field",
                        display_name="Field Path",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="e.g., user.profile.age",
                    ),
                    InputSpec(
                        name="operator",
                        display_name="Operator",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="==",
                        options=[
                            {"label": "Equals (==)", "value": "=="},
                            {"label": "Not Equals (!=)", "value": "!="},
                            {"label": "Greater Than (>)", "value": ">"},
                            {"label": "Less Than (<)", "value": "<"},
                            {"label": "Greater or Equal (>=)", "value": ">="},
                            {"label": "Less or Equal (<=)", "value": "<="},
                            {"label": "Contains", "value": "contains"},
                            {"label": "Starts With", "value": "startsWith"},
                            {"label": "Ends With", "value": "endsWith"},
                            {"label": "In List", "value": "in"},
                            {"label": "Not In List", "value": "not_in"},
                            {"label": "Exists (not null)", "value": "exists"},
                            {"label": "Not Exists (null)", "value": "not_exists"},
                        ],
                    ),
                    InputSpec(
                        name="value",
                        display_name="Comparison Value",
                        data_type="any",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Value to compare against...",
                    ),
                    # --- Expression mode field ---
                    InputSpec(
                        name="expression",
                        display_name="Filter Expression",
                        data_type="text",
                        ui_type="textarea",
                        required=False,
                        accepts_connection=False,
                        placeholder="item.get('age', 0) > 18 and item.get('status') == 'active'",
                    ),
                    # --- Custom code mode field ---
                    InputSpec(
                        name="customCode",
                        display_name="Filter Code (Python)",
                        data_type="text",
                        ui_type="textarea",
                        required=False,
                        accepts_connection=False,
                        placeholder="# 'item' is the current element\n# Set 'result' to True to keep the item\nresult = item.get('score', 0) > 80",
                    ),
                    # --- Shared options ---
                    InputSpec(
                        name="nullHandling",
                        display_name="Null Value Handling",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="exclude",
                        options=[
                            {"label": "Exclude nulls (skip items)", "value": "exclude"},
                            {"label": "Include nulls (keep items)", "value": "include"},
                        ],
                    ),
                ],
                outputs=[
                    OutputSpec(name="filtered", display_name="Filtered Items", data_type="array"),
                    OutputSpec(
                        name="filteredCount",
                        display_name="Filtered Count",
                        data_type="number",
                    ),
                    OutputSpec(
                        name="originalCount",
                        display_name="Original Count",
                        data_type="number",
                    ),
                    OutputSpec(
                        name="removedCount",
                        display_name="Removed Count",
                        data_type="number",
                    ),
                ],
                executor="app.orchestrator.node_executors.data_executors.filter_executor.FilterExecutor",
            )
        )

        # 10. Split (String/Array Splitting)
        self.register_node_type(
            NodeTypeSpec(
                type="split",
                display_name="Split",
                description="Split strings by delimiter/regex or arrays into chunks",
                icon="scissors",
                color="orange",
                category="data",
                inputs=[
                    InputSpec(
                        name="splitMode",
                        display_name="Split Mode",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="string_split",
                        options=[
                            {"label": "String Split (by delimiter)", "value": "string_split"},
                            {"label": "Array Chunk (by size)", "value": "array_chunk"},
                            {"label": "Regex Split (by pattern)", "value": "regex_split"},
                        ],
                    ),
                    InputSpec(
                        name="input",
                        display_name="Input",
                        data_type="any",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder="Text to split or array to chunk (supports {{variable}})...",
                    ),
                    # --- string_split mode field ---
                    InputSpec(
                        name="delimiter",
                        display_name="Delimiter",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default=",",
                        placeholder="e.g., , or ; or |",
                    ),
                    # --- regex_split mode field ---
                    InputSpec(
                        name="pattern",
                        display_name="Regex Pattern",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder=r"e.g., [\s,;]+ or \d{4}-\d{2}-\d{2}",
                    ),
                    # --- array_chunk mode field ---
                    InputSpec(
                        name="chunkSize",
                        display_name="Chunk Size",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=10,
                        validation={"min": 1, "max": 10000},
                    ),
                    # --- Shared options ---
                    InputSpec(
                        name="maxSplits",
                        display_name="Max Splits",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=0,
                        validation={"min": 0, "max": 10000},
                        placeholder="0 = unlimited",
                    ),
                    InputSpec(
                        name="trimWhitespace",
                        display_name="Trim Whitespace",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=True,
                    ),
                ],
                outputs=[
                    OutputSpec(name="parts", display_name="Parts", data_type="array"),
                    OutputSpec(name="partCount", display_name="Part Count", data_type="number"),
                ],
                executor="app.orchestrator.node_executors.data_executors.split_executor.SplitExecutor",
            )
        )

        # 11. Batch Processor
        self.register_node_type(
            NodeTypeSpec(
                type="batch",
                display_name="Batch Processor",
                description="Split an array into batches by size, time window, or field value",
                icon="layers",
                color="orange",
                category="data",
                inputs=[
                    InputSpec(
                        name="inputArray",
                        display_name="Input Array",
                        data_type="array",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="{{previousNode.items}}",
                    ),
                    InputSpec(
                        name="batchMode",
                        display_name="Batch Mode",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="size_based",
                        options=[
                            {"label": "Size-Based (fixed chunks)", "value": "size_based"},
                            {"label": "Time-Based (time windows)", "value": "time_based"},
                            {"label": "Field-Based (group by field)", "value": "field_based"},
                        ],
                    ),
                    InputSpec(
                        name="batchSize",
                        display_name="Batch Size",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=10,
                        validation={"min": 1, "max": 5000},
                    ),
                    InputSpec(
                        name="timeWindow",
                        display_name="Time Window (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=60,
                        validation={"min": 0.001, "max": 86400},
                    ),
                    InputSpec(
                        name="groupByField",
                        display_name="Group By Field",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="e.g., user.id or category",
                    ),
                    InputSpec(
                        name="includeRemainder",
                        display_name="Include Remainder",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=True,
                    ),
                ],
                outputs=[
                    OutputSpec(name="batches", display_name="Batches", data_type="array"),
                    OutputSpec(name="batchCount", display_name="Batch Count", data_type="number"),
                    OutputSpec(name="itemCount", display_name="Item Count", data_type="number"),
                ],
                executor="app.orchestrator.node_executors.data_executors.batch_executor.BatchExecutor",
            )
        )

        # 12. Transformer
        self.register_node_type(
            NodeTypeSpec(
                type="transformer",
                display_name="Transformer",
                description="Transform data between formats (JSON, CSV, XML)",
                icon="shuffle",
                color="orange",
                category="data",
                inputs=[
                    InputSpec(
                        name="input",
                        display_name="Input Data",
                        data_type="any",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder="Data to transform...",
                    ),
                    InputSpec(
                        name="transformMode",
                        display_name="Transform Mode",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="json_to_csv",
                        options=[
                            {"label": "JSON to CSV", "value": "json_to_csv"},
                            {"label": "CSV to JSON", "value": "csv_to_json"},
                            {"label": "JSON to XML", "value": "json_to_xml"},
                            {"label": "XML to JSON", "value": "xml_to_json"},
                        ],
                    ),
                    InputSpec(
                        name="csvDelimiter",
                        display_name="CSV Delimiter",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default=",",
                    ),
                    InputSpec(
                        name="xmlRootElement",
                        display_name="XML Root Element",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default="root",
                    ),
                ],
                outputs=[
                    OutputSpec(name="output", display_name="Transformed Output", data_type="any"),
                    OutputSpec(name="format", display_name="Output Format", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.data_executors.transformer_executor.TransformerExecutor",
            )
        )

        # 13. Validator
        self.register_node_type(
            NodeTypeSpec(
                type="validator",
                display_name="Validator",
                description="Validate data against schemas, patterns, or rules",
                icon="check-circle",
                color="green",
                category="data",
                inputs=[
                    InputSpec(
                        name="input",
                        display_name="Input Data",
                        data_type="any",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="Data to validate...",
                    ),
                    InputSpec(
                        name="validationMode",
                        display_name="Validation Mode",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="json_schema",
                        options=[
                            {"label": "JSON Schema", "value": "json_schema"},
                            {"label": "Regex Pattern", "value": "regex"},
                            {"label": "Type Check", "value": "type"},
                        ],
                    ),
                    InputSpec(
                        name="schema",
                        display_name="JSON Schema",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=False,
                        placeholder='{"type": "object", "properties": {...}}',
                    ),
                    InputSpec(
                        name="pattern",
                        display_name="Regex Pattern",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder=r"^[A-Z]{3}-\d{4}$",
                    ),
                    InputSpec(
                        name="expectedType",
                        display_name="Expected Type",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="string",
                        options=[
                            {"label": "String", "value": "string"},
                            {"label": "Number", "value": "number"},
                            {"label": "Boolean", "value": "boolean"},
                            {"label": "Array", "value": "array"},
                            {"label": "Object", "value": "object"},
                        ],
                    ),
                ],
                outputs=[
                    OutputSpec(name="isValid", display_name="Is Valid", data_type="boolean"),
                    OutputSpec(name="errors", display_name="Validation Errors", data_type="array"),
                    OutputSpec(name="validatedData", display_name="Validated Data", data_type="any"),
                ],
                executor="app.orchestrator.node_executors.data_executors.validator_executor.ValidatorExecutor",
            )
        )

        # ===== PHASE 2.3: Advanced Triggers =====

        # 7. Webhook Trigger
        self.register_node_type(
            NodeTypeSpec(
                type="webhook_trigger",
                display_name="Webhook Trigger",
                description="Start workflow from HTTP webhook call",
                icon="webhook",
                color="green",
                category="triggers",
                inputs=[
                    InputSpec(
                        name="method",
                        display_name="HTTP Method",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="POST",
                        options=[
                            {"label": "POST", "value": "POST"},
                            {"label": "GET", "value": "GET"},
                            {"label": "PUT", "value": "PUT"},
                        ],
                    ),
                    InputSpec(
                        name="authRequired",
                        display_name="Require Authentication",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=False,
                    ),
                ],
                outputs=[
                    OutputSpec(name="body", display_name="Request Body", data_type="json"),
                    OutputSpec(name="headers", display_name="Request Headers", data_type="json"),
                    OutputSpec(name="query", display_name="Query Parameters", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.trigger_executors.webhook_trigger_executor.WebhookTriggerExecutor",
            )
        )

        # 8. Schedule Trigger
        self.register_node_type(
            NodeTypeSpec(
                type="schedule_trigger",
                display_name="Schedule Trigger",
                description="Start workflow on a schedule (cron)",
                icon="clock",
                color="green",
                category="triggers",
                inputs=[
                    InputSpec(
                        name="schedule",
                        display_name="Cron Expression",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=False,
                        placeholder="0 9 * * 1",
                        validation={"pattern": r"^(\S+\s+){4}\S+$"},
                    ),
                    InputSpec(
                        name="timezone",
                        display_name="Timezone",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default="UTC",
                        placeholder="Asia/Bangkok",
                    ),
                ],
                outputs=[
                    OutputSpec(name="timestamp", display_name="Execution Time", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.trigger_executors.schedule_trigger_executor.ScheduleTriggerExecutor",
            )
        )

        # 9. Queue Trigger
        self.register_node_type(
            NodeTypeSpec(
                type="queue_trigger",
                display_name="Queue Trigger",
                description="Start workflow from Redis Streams message queue",
                icon="inbox",
                color="green",
                category="triggers",
                inputs=[
                    InputSpec(
                        name="queueName",
                        display_name="Queue Name",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=False,
                        placeholder="my-queue-stream",
                    ),
                    InputSpec(
                        name="consumerGroup",
                        display_name="Consumer Group",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default="default",
                        placeholder="default",
                    ),
                    InputSpec(
                        name="batchSize",
                        display_name="Batch Size",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=10,
                        validation={"min": 1, "max": 100},
                    ),
                    InputSpec(
                        name="ackMode",
                        display_name="Acknowledgment Mode",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="after_process",
                        options=[
                            {"label": "After Process (safer)", "value": "after_process"},
                            {"label": "Immediate (faster)", "value": "immediate"},
                        ],
                    ),
                ],
                outputs=[
                    OutputSpec(name="messages", display_name="Messages", data_type="array"),
                    OutputSpec(
                        name="messageCount", display_name="Message Count", data_type="number"
                    ),
                    OutputSpec(name="queueName", display_name="Queue Name", data_type="text"),
                    OutputSpec(name="consumedAt", display_name="Consumed At", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.trigger_executors.queue_trigger_executor.QueueTriggerExecutor",
            )
        )

        # 11. Event Trigger
        self.register_node_type(
            NodeTypeSpec(
                type="event_trigger",
                display_name="Event Trigger",
                description="Start workflow when system event occurs",
                icon="zap",
                color="green",
                category="triggers",
                inputs=[
                    InputSpec(
                        name="eventType",
                        display_name="Event Type",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        options=[
                            {"label": "User Created", "value": "user.created"},
                            {"label": "User Updated", "value": "user.updated"},
                            {"label": "Skill Completed", "value": "skill.completed"},
                            {"label": "Media Generated", "value": "media.generated"},
                            {"label": "Workflow Completed", "value": "workflow.completed"},
                        ],
                    ),
                    InputSpec(
                        name="filter",
                        display_name="Event Filter",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=False,
                        placeholder='{"userId": 123}',
                    ),
                ],
                outputs=[
                    OutputSpec(name="event", display_name="Event Data", data_type="json"),
                    OutputSpec(name="eventType", display_name="Event Type", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.trigger_executors.event_trigger_executor.EventTriggerExecutor",
            )
        )

        # 12. File Upload Trigger
        self.register_node_type(
            NodeTypeSpec(
                type="file_upload_trigger",
                display_name="File Upload Trigger",
                description="Start workflow when file is uploaded",
                icon="upload",
                color="green",
                category="triggers",
                inputs=[
                    InputSpec(
                        name="acceptedTypes",
                        display_name="Accepted File Types",
                        data_type="array",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default=["*/*"],
                        placeholder="image/*, application/pdf",
                    ),
                    InputSpec(
                        name="maxSize",
                        display_name="Max Size (MB)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=10,
                        validation={"min": 1, "max": 100},
                    ),
                ],
                outputs=[
                    OutputSpec(name="fileUrl", display_name="File URL", data_type="text"),
                    OutputSpec(name="fileName", display_name="File Name", data_type="text"),
                    OutputSpec(name="fileSize", display_name="File Size", data_type="number"),
                    OutputSpec(name="mimeType", display_name="MIME Type", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.trigger_executors.file_upload_trigger_executor.FileUploadTriggerExecutor",
            )
        )

        # ===== PHASE 2.4: Advanced Flow Control =====

        # 13. Switch
        self.register_node_type(
            NodeTypeSpec(
                type="switch",
                display_name="Switch",
                description="Multi-way branch based on value matching",
                icon="git-branch",
                color="yellow",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="value",
                        display_name="Value to Match",
                        data_type="any",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="Value to compare against cases...",
                    ),
                    InputSpec(
                        name="cases",
                        display_name="Cases",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=False,
                        default=[
                            {"match": "value1", "label": "Case 1"},
                            {"match": "value2", "label": "Case 2"},
                        ],
                        placeholder='[{"match":"value1","label":"Case 1"}]',
                    ),
                    InputSpec(
                        name="defaultCase",
                        display_name="Default Case Label",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default="default",
                    ),
                ],
                outputs=[
                    OutputSpec(name="matched", display_name="Matched Case", data_type="text"),
                    OutputSpec(name="value", display_name="Input Value", data_type="any"),
                ],
                executor="app.orchestrator.node_executors.flow_executors.switch_executor.SwitchExecutor",
            )
        )

        # 14. Wait/Delay
        self.register_node_type(
            NodeTypeSpec(
                type="wait",
                display_name="Wait",
                description="Pause workflow execution for specified duration",
                icon="pause",
                color="gray",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="duration",
                        display_name="Duration",
                        data_type="number",
                        ui_type="number",
                        required=True,
                        accepts_connection=False,
                        validation={"min": 1},
                    ),
                    InputSpec(
                        name="unit",
                        display_name="Time Unit",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="seconds",
                        options=[
                            {"label": "Seconds", "value": "seconds"},
                            {"label": "Minutes", "value": "minutes"},
                            {"label": "Hours", "value": "hours"},
                            {"label": "Days", "value": "days"},
                        ],
                    ),
                ],
                outputs=[
                    OutputSpec(name="resumedAt", display_name="Resumed At", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.flow_executors.wait_executor.WaitExecutor",
            )
        )

        # Retry
        self.register_node_type(
            NodeTypeSpec(
                type="retry",
                display_name="Retry",
                description="Automatically retry a failed operation with configurable backoff strategy",
                icon="refresh-cw",
                color="yellow",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="input",
                        display_name="Input Data",
                        data_type="any",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Data to pass to the retried operation...",
                    ),
                    InputSpec(
                        name="maxAttempts",
                        display_name="Max Attempts",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=3,
                        validation={"min": 1, "max": 10},
                    ),
                    InputSpec(
                        name="strategy",
                        display_name="Backoff Strategy",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="exponential",
                        options=[
                            {"label": "Fixed Delay", "value": "fixed"},
                            {"label": "Exponential Backoff", "value": "exponential"},
                            {"label": "Linear Increase", "value": "linear"},
                        ],
                    ),
                    InputSpec(
                        name="initialDelay",
                        display_name="Initial Delay (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=1,
                        validation={"min": 0.1, "max": 300},
                    ),
                    InputSpec(
                        name="maxDelay",
                        display_name="Max Delay (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=60,
                        validation={"min": 1, "max": 600},
                    ),
                    InputSpec(
                        name="backoffMultiplier",
                        display_name="Backoff Multiplier",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=2,
                        validation={"min": 1, "max": 10},
                    ),
                    InputSpec(
                        name="retryOnErrors",
                        display_name="Retry On Error Types",
                        data_type="array",
                        ui_type="multiselect",
                        required=False,
                        accepts_connection=False,
                        default=["all"],
                        options=[
                            {"label": "All Errors", "value": "all"},
                            {"label": "Timeout", "value": "timeout"},
                            {"label": "Rate Limit", "value": "rate_limit"},
                            {"label": "Server Error (5xx)", "value": "server_error"},
                            {"label": "Connection Error", "value": "connection"},
                        ],
                    ),
                    InputSpec(
                        name="stopOnSuccess",
                        display_name="Stop on Success",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=True,
                    ),
                ],
                outputs=[
                    OutputSpec(name="output", display_name="Result", data_type="any"),
                    OutputSpec(
                        name="attemptNumber", display_name="Final Attempt", data_type="number"
                    ),
                    OutputSpec(
                        name="totalRetries", display_name="Total Retries", data_type="number"
                    ),
                    OutputSpec(
                        name="totalDelay", display_name="Total Delay (ms)", data_type="number"
                    ),
                    OutputSpec(name="lastError", display_name="Last Error", data_type="json"),
                    OutputSpec(name="succeeded", display_name="Succeeded", data_type="boolean"),
                ],
                executor="app.orchestrator.node_executors.flow_executors.retry_executor.RetryExecutor",
            )
        )

        # Execution Timeout
        self.register_node_type(
            NodeTypeSpec(
                type="execution_timeout",
                display_name="Execution Timeout",
                description="Enforce a time limit on upstream operations with configurable timeout behavior",
                icon="timer",
                color="red",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="input",
                        display_name="Input Data",
                        data_type="any",
                        ui_type="json_editor",
                        required=True,
                        accepts_connection=True,
                        placeholder="Connect output from node to time-bound...",
                    ),
                    InputSpec(
                        name="timeout",
                        display_name="Timeout (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=True,
                        accepts_connection=False,
                        default=30,
                        validation={"min": 1, "max": 3600},
                    ),
                    InputSpec(
                        name="timeoutMode",
                        display_name="Timeout Mode",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="hard",
                        options=[
                            {"label": "Hard (kill immediately)", "value": "hard"},
                            {"label": "Soft (allow cleanup)", "value": "soft"},
                            {"label": "Fallback (return default value)", "value": "fallback"},
                        ],
                    ),
                    InputSpec(
                        name="fallbackValue",
                        display_name="Fallback Value",
                        data_type="any",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=False,
                        default=None,
                        placeholder="Value to return if timeout occurs (fallback mode only)...",
                    ),
                    InputSpec(
                        name="includeStackTrace",
                        display_name="Include Stack Trace",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=True,
                    ),
                ],
                outputs=[
                    OutputSpec(name="result", display_name="Result", data_type="any"),
                    OutputSpec(name="timedOut", display_name="Timed Out", data_type="boolean"),
                    OutputSpec(
                        name="executionTime",
                        display_name="Execution Time (ms)",
                        data_type="number",
                    ),
                    OutputSpec(name="error", display_name="Error Details", data_type="json"),
                ],
                executor="app.orchestrator.node_executors.flow_executors.timeout_executor.TimeoutExecutor",
            )
        )

        # Rate Limiter
        self.register_node_type(
            NodeTypeSpec(
                type="rate_limiter",
                display_name="Rate Limiter",
                description="Throttle workflow execution rate using distributed Redis-based rate limiting",
                icon="gauge",
                color="red",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="algorithm",
                        display_name="Algorithm",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="token_bucket",
                        options=[
                            {
                                "label": "Token Bucket (smooth, allows bursts)",
                                "value": "token_bucket",
                            },
                            {"label": "Fixed Window (simple counter)", "value": "fixed_window"},
                            {
                                "label": "Sliding Window (precise, higher Redis cost)",
                                "value": "sliding_window",
                            },
                        ],
                    ),
                    InputSpec(
                        name="maxRequests",
                        display_name="Max Requests",
                        data_type="number",
                        ui_type="number",
                        required=True,
                        accepts_connection=True,
                        default=60,
                        validation={"min": 1, "max": 100000},
                        placeholder="Number of requests allowed per window",
                    ),
                    InputSpec(
                        name="windowSize",
                        display_name="Window Size (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=True,
                        accepts_connection=True,
                        default=60,
                        validation={"min": 1, "max": 86400},
                        placeholder="Time window in seconds",
                    ),
                    InputSpec(
                        name="rateLimitKey",
                        display_name="Rate Limit Key",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        default="default",
                        placeholder="Key for grouping (supports {{expressions}})",
                    ),
                    InputSpec(
                        name="waitOnLimit",
                        display_name="Wait When Limited",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=False,
                    ),
                    InputSpec(
                        name="maxWaitTime",
                        display_name="Max Wait Time (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=60,
                        validation={"min": 1, "max": 300},
                        placeholder="Maximum time to wait if rate limited",
                    ),
                ],
                outputs=[
                    OutputSpec(name="allowed", display_name="Allowed", data_type="boolean"),
                    OutputSpec(
                        name="remainingRequests",
                        display_name="Remaining Requests",
                        data_type="number",
                    ),
                    OutputSpec(
                        name="resetTime", display_name="Reset Time (Unix)", data_type="number"
                    ),
                    OutputSpec(name="waited", display_name="Had to Wait", data_type="boolean"),
                    OutputSpec(
                        name="waitedTime", display_name="Wait Time (ms)", data_type="number"
                    ),
                ],
                executor="app.orchestrator.node_executors.flow_executors.rate_limiter_executor.RateLimiterExecutor",
            )
        )

        # Circuit Breaker
        self.register_node_type(
            NodeTypeSpec(
                type="circuit_breaker",
                display_name="Circuit Breaker",
                description="Prevent cascading failures with circuit breaker pattern",
                icon="shield",
                color="red",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="operationName",
                        display_name="Operation Name",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=False,
                        placeholder="e.g., external_api_call",
                    ),
                    InputSpec(
                        name="failureThreshold",
                        display_name="Failure Threshold",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=5,
                        validation={"min": 1, "max": 100},
                    ),
                    InputSpec(
                        name="resetTimeout",
                        display_name="Reset Timeout (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=60,
                        validation={"min": 1, "max": 3600},
                    ),
                ],
                outputs=[
                    OutputSpec(name="circuitState", display_name="Circuit State", data_type="text"),
                    OutputSpec(name="failureCount", display_name="Failure Count", data_type="number"),
                    OutputSpec(name="allowed", display_name="Request Allowed", data_type="boolean"),
                ],
                executor="app.orchestrator.node_executors.flow_executors.circuit_breaker_executor.CircuitBreakerExecutor",
            )
        )

        # Idempotency Guard
        self.register_node_type(
            NodeTypeSpec(
                type="idempotency",
                display_name="Idempotency Guard",
                description="Prevent duplicate execution using idempotency keys",
                icon="fingerprint",
                color="purple",
                category="flow_control",
                inputs=[
                    InputSpec(
                        name="idempotencyKey",
                        display_name="Idempotency Key",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="{{request.id}} or {{sha256(request.body)}}",
                    ),
                    InputSpec(
                        name="ttl",
                        display_name="TTL (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=86400,
                        validation={"min": 60, "max": 2592000},
                    ),
                ],
                outputs=[
                    OutputSpec(name="isDuplicate", display_name="Is Duplicate", data_type="boolean"),
                    OutputSpec(name="fingerprint", display_name="Fingerprint", data_type="text"),
                    OutputSpec(name="cachedResult", display_name="Cached Result", data_type="any"),
                ],
                executor="app.orchestrator.node_executors.flow_executors.idempotency_executor.IdempotencyExecutor",
            )
        )

        # 15. Webhook Response
        self.register_node_type(
            NodeTypeSpec(
                type="webhook_response",
                display_name="Webhook Response",
                description="Send HTTP response back to webhook caller",
                icon="reply",
                color="purple",
                category="outputs",
                inputs=[
                    InputSpec(
                        name="statusCode",
                        display_name="HTTP Status Code",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=200,
                        validation={"min": 100, "max": 599},
                    ),
                    InputSpec(
                        name="body",
                        display_name="Response Body",
                        data_type="any",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Data to return...",
                    ),
                    InputSpec(
                        name="headers",
                        display_name="Response Headers",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=False,
                        placeholder='{"Content-Type":"application/json"}',
                    ),
                ],
                outputs=[],
                executor="app.orchestrator.node_executors.output_executors.webhook_response_executor.WebhookResponseExecutor",
            )
        )

        # ===== Send Notification =====

        # Send Notification Node
        self.register_node_type(
            NodeTypeSpec(
                type="send_notification",
                display_name="Send Notification",
                description="Send notifications via Email, SMS, Slack, Discord, or Telegram",
                icon="bell",
                color="indigo",
                category="outputs",
                inputs=[
                    InputSpec(
                        name="notificationType",
                        display_name="Channel",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="email",
                        options=[
                            {"label": "Email", "value": "email"},
                            {"label": "SMS", "value": "sms"},
                            {"label": "Slack", "value": "slack"},
                            {"label": "Discord", "value": "discord"},
                            {"label": "Telegram", "value": "telegram"},
                        ],
                    ),
                    InputSpec(
                        name="recipient",
                        display_name="Recipient",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="Email, phone, webhook URL, or chat ID...",
                    ),
                    InputSpec(
                        name="subject",
                        display_name="Subject",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="Email subject line (email only)...",
                    ),
                    InputSpec(
                        name="message",
                        display_name="Message",
                        data_type="text",
                        ui_type="textarea",
                        required=True,
                        accepts_connection=True,
                        placeholder="Notification message. Use {{nodeId.output}} for dynamic values...",
                    ),
                    InputSpec(
                        name="attachments",
                        display_name="Attachments",
                        data_type="array",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='[{"filename": "report.pdf", "url": "https://..."}]',
                    ),
                ],
                outputs=[
                    OutputSpec(name="messageId", display_name="Message ID", data_type="text"),
                    OutputSpec(name="status", display_name="Status", data_type="text"),
                    OutputSpec(
                        name="deliveryTime",
                        display_name="Delivery Time (ms)",
                        data_type="number",
                    ),
                    OutputSpec(
                        name="providerResponse",
                        display_name="Provider Response",
                        data_type="json",
                    ),
                ],
                executor="app.orchestrator.node_executors.output_executors.notification_executor.NotificationExecutor",
            )
        )

        # 16. Error Trigger
        self.register_node_type(
            NodeTypeSpec(
                type="error_trigger",
                display_name="Error Trigger",
                description="Start workflow when another workflow fails",
                icon="alert-circle",
                color="red",
                category="triggers",
                inputs=[
                    InputSpec(
                        name="watchWorkflow",
                        display_name="Workflow to Watch",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="workflow_id_to_monitor",
                    ),
                    InputSpec(
                        name="errorTypes",
                        display_name="Error Types",
                        data_type="array",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        default=["all"],
                        placeholder="all, timeout, validation",
                    ),
                ],
                outputs=[
                    OutputSpec(name="error", display_name="Error Details", data_type="json"),
                    OutputSpec(
                        name="workflowId", display_name="Failed Workflow ID", data_type="text"
                    ),
                    OutputSpec(name="timestamp", display_name="Error Timestamp", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.trigger_executors.error_trigger_executor.ErrorTriggerExecutor",
            )
        )

        # ===== Core I/O Nodes =====

        # HTTP Request
        self.register_node_type(
            NodeTypeSpec(
                type="http_request",
                display_name="HTTP Request",
                description="Make an outbound HTTP request to an external API",
                icon="globe",
                color="blue",
                category="integrations",
                inputs=[
                    InputSpec(
                        name="url",
                        display_name="URL",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="https://api.example.com/data",
                    ),
                    InputSpec(
                        name="method",
                        display_name="Method",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="GET",
                        options=[
                            {"label": "GET", "value": "GET"},
                            {"label": "POST", "value": "POST"},
                            {"label": "PUT", "value": "PUT"},
                            {"label": "DELETE", "value": "DELETE"},
                            {"label": "PATCH", "value": "PATCH"},
                            {"label": "HEAD", "value": "HEAD"},
                            {"label": "OPTIONS", "value": "OPTIONS"},
                        ],
                    ),
                    InputSpec(
                        name="headers",
                        display_name="Headers",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"Content-Type": "application/json", "Authorization": "Bearer {{secrets.API_KEY}}"}',
                    ),
                    InputSpec(
                        name="queryParams",
                        display_name="Query Parameters",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"page": "1", "limit": "10"}',
                    ),
                    InputSpec(
                        name="body",
                        display_name="Request Body",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"key": "value"}',
                    ),
                    InputSpec(
                        name="auth",
                        display_name="Authentication",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=False,
                        placeholder='{"type": "bearer", "token": "{{secrets.API_KEY}}"}',
                    ),
                    InputSpec(
                        name="timeout",
                        display_name="Timeout (seconds)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=30,
                        validation={"min": 1, "max": 300},
                    ),
                    InputSpec(
                        name="followRedirects",
                        display_name="Follow Redirects",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=True,
                    ),
                    InputSpec(
                        name="validateSSL",
                        display_name="Validate SSL",
                        data_type="boolean",
                        ui_type="toggle",
                        required=False,
                        accepts_connection=False,
                        default=True,
                    ),
                ],
                outputs=[
                    OutputSpec(
                        name="statusCode", display_name="Status Code", data_type="number"
                    ),
                    OutputSpec(name="body", display_name="Response Body", data_type="any"),
                    OutputSpec(
                        name="headers", display_name="Response Headers", data_type="json"
                    ),
                    OutputSpec(
                        name="responseTime",
                        display_name="Response Time (ms)",
                        data_type="number",
                    ),
                    OutputSpec(name="error", display_name="Error", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.io_executors.http_request_executor.HttpRequestExecutor",
            )
        )

        # Storage Action (S3/R2/MinIO)
        self.register_node_type(
            NodeTypeSpec(
                type="storage_action",
                display_name="Storage Action",
                description="Perform file operations on S3, R2, or MinIO storage",
                icon="database",
                color="blue",
                category="integrations",
                inputs=[
                    InputSpec(
                        name="action",
                        display_name="Action",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="upload",
                        options=[
                            {"label": "Upload", "value": "upload"},
                            {"label": "Download", "value": "download"},
                            {"label": "Delete", "value": "delete"},
                            {"label": "List", "value": "list"},
                        ],
                    ),
                    InputSpec(
                        name="provider",
                        display_name="Storage Provider",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="s3",
                        options=[
                            {"label": "AWS S3", "value": "s3"},
                            {"label": "Cloudflare R2", "value": "r2"},
                            {"label": "MinIO", "value": "minio"},
                        ],
                    ),
                    InputSpec(
                        name="bucket",
                        display_name="Bucket Name",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="my-bucket",
                    ),
                    InputSpec(
                        name="key",
                        display_name="Object Key (Path)",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="folder/file.txt",
                    ),
                    InputSpec(
                        name="data",
                        display_name="Data (for upload)",
                        data_type="any",
                        ui_type="textarea",
                        required=False,
                        accepts_connection=True,
                        placeholder="File content or {{variable}}...",
                    ),
                ],
                outputs=[
                    OutputSpec(name="success", display_name="Success", data_type="boolean"),
                    OutputSpec(name="result", display_name="Result", data_type="any"),
                    OutputSpec(name="url", display_name="URL", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.io_executors.storage_action_executor.StorageActionExecutor",
            )
        )

        # Metrics Collector
        self.register_node_type(
            NodeTypeSpec(
                type="metrics_collector",
                display_name="Metrics Collector",
                description="Collect and export metrics in Prometheus format",
                icon="bar-chart",
                color="green",
                category="observability",
                inputs=[
                    InputSpec(
                        name="metricType",
                        display_name="Metric Type",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="counter",
                        options=[
                            {"label": "Counter", "value": "counter"},
                            {"label": "Gauge", "value": "gauge"},
                            {"label": "Histogram", "value": "histogram"},
                        ],
                    ),
                    InputSpec(
                        name="metricName",
                        display_name="Metric Name",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=False,
                        placeholder="workflow_executions_total",
                    ),
                    InputSpec(
                        name="value",
                        display_name="Value",
                        data_type="number",
                        ui_type="number",
                        required=True,
                        accepts_connection=True,
                        placeholder="1 or {{duration}}",
                    ),
                    InputSpec(
                        name="labels",
                        display_name="Labels",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"status": "success", "node_type": "http_request"}',
                    ),
                ],
                outputs=[
                    OutputSpec(name="recorded", display_name="Recorded", data_type="boolean"),
                    OutputSpec(name="metricName", display_name="Metric Name", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.output_executors.metrics_collector_executor.MetricsCollectorExecutor",
            )
        )

        # Secrets Vault
        self.register_node_type(
            NodeTypeSpec(
                type="secrets_vault",
                display_name="Secrets Vault",
                description="Retrieve secrets from environment, database, or external vaults",
                icon="lock",
                color="purple",
                category="security",
                inputs=[
                    InputSpec(
                        name="secretName",
                        display_name="Secret Name",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=True,
                        placeholder="API_KEY or {{variable}}",
                    ),
                    InputSpec(
                        name="provider",
                        display_name="Provider",
                        data_type="text",
                        ui_type="select",
                        required=False,
                        accepts_connection=False,
                        default="environment",
                        options=[
                            {"label": "Environment Variables", "value": "environment"},
                            {"label": "Database (Encrypted)", "value": "database"},
                            {"label": "HashiCorp Vault", "value": "vault"},
                            {"label": "AWS Secrets Manager", "value": "aws"},
                        ],
                    ),
                    InputSpec(
                        name="path",
                        display_name="Path/Namespace",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=False,
                        placeholder="secret/data/myapp",
                    ),
                    InputSpec(
                        name="defaultValue",
                        display_name="Default Value",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="Fallback if secret not found",
                    ),
                ],
                outputs=[
                    OutputSpec(name="secretValue", display_name="Secret Value", data_type="text"),
                    OutputSpec(name="found", display_name="Found", data_type="boolean"),
                    OutputSpec(name="source", display_name="Source", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.security_executors.secrets_vault_executor.SecretsVaultExecutor",
            )
        )

        # Dead Letter Queue
        self.register_node_type(
            NodeTypeSpec(
                type="dead_letter_queue",
                display_name="Dead Letter Queue",
                description="Manage failed messages via Redis Streams DLQ",
                icon="inbox",
                color="red",
                category="observability",
                inputs=[
                    InputSpec(
                        name="operation",
                        display_name="Operation",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="send_to_dlq",
                        options=[
                            {"label": "Send to DLQ", "value": "send_to_dlq"},
                            {"label": "Read from DLQ", "value": "read_from_dlq"},
                            {"label": "Delete from DLQ", "value": "delete_from_dlq"},
                        ],
                    ),
                    InputSpec(
                        name="queueName",
                        display_name="Queue Name",
                        data_type="text",
                        ui_type="text",
                        required=True,
                        accepts_connection=False,
                        placeholder="failed-api-calls",
                    ),
                    InputSpec(
                        name="message",
                        display_name="Message Data",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder='{"error": "...", "payload": "..."}',
                    ),
                    InputSpec(
                        name="messageId",
                        display_name="Message ID",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="For delete operation",
                    ),
                    InputSpec(
                        name="batchSize",
                        display_name="Batch Size (for read)",
                        data_type="number",
                        ui_type="number",
                        required=False,
                        accepts_connection=False,
                        default=10,
                        validation={"min": 1, "max": 100},
                    ),
                ],
                outputs=[
                    OutputSpec(name="success", display_name="Success", data_type="boolean"),
                    OutputSpec(name="messages", display_name="Messages", data_type="array"),
                    OutputSpec(name="messageId", display_name="Message ID", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.flow_executors.dlq_executor.DLQExecutor",
            )
        )

        # Run History (Checkpoint) - Stub for future implementation
        self.register_node_type(
            NodeTypeSpec(
                type="run_history",
                display_name="Run History",
                description="Save or load workflow execution checkpoints (stub)",
                icon="history",
                color="blue",
                category="observability",
                inputs=[
                    InputSpec(
                        name="operation",
                        display_name="Operation",
                        data_type="text",
                        ui_type="select",
                        required=True,
                        accepts_connection=False,
                        default="save_checkpoint",
                        options=[
                            {"label": "Save Checkpoint", "value": "save_checkpoint"},
                            {"label": "Load Checkpoint", "value": "load_checkpoint"},
                            {"label": "List Checkpoints", "value": "list_checkpoints"},
                        ],
                    ),
                    InputSpec(
                        name="checkpointName",
                        display_name="Checkpoint Name",
                        data_type="text",
                        ui_type="text",
                        required=False,
                        accepts_connection=True,
                        placeholder="before_api_call",
                    ),
                    InputSpec(
                        name="stateData",
                        display_name="State Data",
                        data_type="json",
                        ui_type="json_editor",
                        required=False,
                        accepts_connection=True,
                        placeholder="Data to checkpoint...",
                    ),
                ],
                outputs=[
                    OutputSpec(name="success", display_name="Success", data_type="boolean"),
                    OutputSpec(name="checkpointId", display_name="Checkpoint ID", data_type="text"),
                    OutputSpec(name="stateData", display_name="Loaded State", data_type="any"),
                ],
                executor="app.orchestrator.node_executors.flow_executors.dlq_executor.DLQExecutor",  # Temporary stub
            )
        )
