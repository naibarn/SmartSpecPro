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
