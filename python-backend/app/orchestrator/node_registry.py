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
                    OutputSpec(name="metadata", display_name="Generation Metadata", data_type="json"),
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
                                "placeholder": "Enter value"
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
                        placeholder='[{{node1.output}}, {{node2.output}}]',
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

        # 9. Event Trigger
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

        # 10. File Upload Trigger
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

        # 11. Switch
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

        # 12. Wait/Delay
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

        # 13. Webhook Response
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

        # 14. Error Trigger
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
                    OutputSpec(name="workflowId", display_name="Failed Workflow ID", data_type="text"),
                    OutputSpec(name="timestamp", display_name="Error Timestamp", data_type="text"),
                ],
                executor="app.orchestrator.node_executors.trigger_executors.error_trigger_executor.ErrorTriggerExecutor",
            )
        )
