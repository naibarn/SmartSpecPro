"""
WorkflowGenerator — generates ReactFlow workflow JSON from a natural language prompt.

Routes through the SmartSpecWeb LLM gateway (forward_chat_json) so that model
selection, provider routing, credit tracking, and audit logging are all handled
centrally — exactly the same as every other LLM call in the platform.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any

import structlog

from app.clients.web_gateway import forward_chat_json

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """\
You are a workflow architect for a visual workflow builder. Convert the user's
description into a valid, FULLY CONNECTED ReactFlow workflow JSON.

════════════════════════════════════════
STRICT RULES
════════════════════════════════════════
1. Start with EXACTLY ONE trigger node (nodeType "manual_trigger" unless user
   specifies otherwise).  Trigger has NO input ports.
2. Use ONLY node types from the AVAILABLE NODE TYPES section.
3. EVERY node MUST be connected — no orphaned nodes.
4. Edges MUST use exact port names from the node specs:
   • sourceHandle = an OUTPUT port name of the source node
   • targetHandle = an INPUT port name of the target node
   Using wrong port names causes runtime failure.
5. Node IDs: unique, lowercase, snake_case (e.g. "llm_call_1", "filter_1").
6. Positions: left-to-right execution order, 280 px horizontal gap, 120 px
   vertical gap for branches.
7. config object: populate ALL config fields that affect behaviour.
   • For non-connectable inputs (config fields), ALWAYS include the default
     value from the spec so the node works immediately without manual editing.
   • For llm_call nodes: set "model" to WORKFLOW_DEFAULT_MODEL (provided below)
     and always include "temperature" and "maxTokens". ALSO INCLUDE "prompt" (the
     main instruction) and "systemPrompt" (context/behavior instructions) in config.
   • For conditional nodes: set "condition" to a template expression like
     "{{node_id.port}} == 'value'" that references an upstream output.
   • For rag_query nodes: set "collection" to "default" and "topK" to 5.
   • CRITICAL: ALL nodes MUST have proper config values. Never leave prompt, 
     systemPrompt, or other required fields empty.
8. USER INPUT HANDLING: If the workflow requires user input (keywords, query, 
   parameters), ALWAYS add a "form_input" node immediately after the trigger.
   Configure form_input with appropriate fields in config.fields array:
   [{"id":"keywords","label":"Keywords","type":"text","required":true}]
   Connect form_input output (port: "values") to downstream nodes that need the input.
9. End with "workflow_response" (input port: "data") unless user explicitly
   asked for no output node.
9. Output ONLY raw JSON — no markdown fences, no explanations, no comments.

════════════════════════════════════════
CONFIG FIELD RULES
════════════════════════════════════════
Config fields are non-connectable inputs (the user sets them in the node UI).
When the spec shows a default value (e.g. temperature=0.7), ALWAYS include it
in config so the workflow is ready to run.  Fields whose value comes from a
wire connection (accepts_connection=true) should NOT be in config — they are
populated at runtime by edges.

════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════
{
  "nodes": [
    {
      "id": "<snake_case_id>",
      "type": "workflow",
      "position": { "x": <number>, "y": <number> },
      "data": {
        "nodeType": "<type_from_registry>",
        "label": "<human readable label>",
        "config": { <config fields with defaults> }
      }
    }
  ],
  "edges": [
    {
      "id": "edge-<source>-<target>",
      "source": "<source_node_id>",
      "target": "<target_node_id>",
      "sourceHandle": "<exact_output_port_name>",
      "targetHandle": "<exact_input_port_name>",
      "type": "smoothstep"
    }
  ],
  "description": "<one sentence summary>"
}

════════════════════════════════════════
BUILT-IN EXAMPLES (study these carefully)
════════════════════════════════════════

EXAMPLE A — Simple RAG Q&A:
{
  "nodes": [
    {"id":"trigger_1","type":"workflow","position":{"x":0,"y":0},
     "data":{"nodeType":"manual_trigger","label":"Start","config":{}}},
    {"id":"rag_1","type":"workflow","position":{"x":280,"y":0},
     "data":{"nodeType":"rag_query","label":"Search Knowledge Base",
             "config":{"collection":"default","topK":5,"searchMode":"hybrid","scoreThreshold":0.7}}},
    {"id":"llm_1","type":"workflow","position":{"x":560,"y":0},
     "data":{"nodeType":"llm_call","label":"Generate Answer",
             "config":{"model":"gpt-4o-mini","temperature":0.3,"maxTokens":800}}},
    {"id":"resp_1","type":"workflow","position":{"x":840,"y":0},
     "data":{"nodeType":"workflow_response","label":"Return Answer","config":{"status":"success"}}}
  ],
  "edges": [
    {"id":"edge-trigger_1-rag_1","source":"trigger_1","target":"rag_1",
     "sourceHandle":"params","targetHandle":"query","type":"smoothstep"},
    {"id":"edge-rag_1-llm_1","source":"rag_1","target":"llm_1",
     "sourceHandle":"context","targetHandle":"prompt","type":"smoothstep"},
    {"id":"edge-llm_1-resp_1","source":"llm_1","target":"resp_1",
     "sourceHandle":"response","targetHandle":"data","type":"smoothstep"}
  ],
  "description":"RAG pipeline: search knowledge base then answer with LLM"
}

EXAMPLE B — Branching with condition:
{
  "nodes": [
    {"id":"trigger_1","type":"workflow","position":{"x":0,"y":0},
     "data":{"nodeType":"manual_trigger","label":"Start","config":{}}},
    {"id":"llm_1","type":"workflow","position":{"x":280,"y":0},
     "data":{"nodeType":"llm_call","label":"Classify Input",
             "config":{"model":"gpt-4o-mini","temperature":0,"maxTokens":10,
                       "prompt":"Classify the following text as positive or negative. Reply with only one word: positive or negative.",
                       "systemPrompt":"You are a sentiment classifier. Be concise."}}},
    {"id":"cond_1","type":"workflow","position":{"x":560,"y":0},
     "data":{"nodeType":"conditional","label":"Is Positive?",
             "config":{"condition":"{{llm_1.response}} == 'positive'"}}},
    {"id":"llm_pos","type":"workflow","position":{"x":840,"y":-120},
     "data":{"nodeType":"llm_call","label":"Positive Response",
             "config":{"model":"gpt-4o-mini","temperature":0.7,"maxTokens":400,
                       "prompt":"Generate an enthusiastic positive response.",
                       "systemPrompt":"You are an enthusiastic assistant."}}},
    {"id":"llm_neg","type":"workflow","position":{"x":840,"y":120},
     "data":{"nodeType":"llm_call","label":"Negative Response",
             "config":{"model":"gpt-4o-mini","temperature":0.7,"maxTokens":400,
                       "prompt":"Generate a sympathetic response.",
                       "systemPrompt":"You are a sympathetic assistant."}}},
    {"id":"resp_1","type":"workflow","position":{"x":1120,"y":0},
     "data":{"nodeType":"workflow_response","label":"Return","config":{"status":"success"}}}
  ],
  "edges": [
    {"id":"edge-trigger_1-llm_1","source":"trigger_1","target":"llm_1",
     "sourceHandle":"params","targetHandle":"prompt","type":"smoothstep"},
    {"id":"edge-llm_1-cond_1","source":"llm_1","target":"cond_1",
     "sourceHandle":"response","targetHandle":"value","type":"smoothstep"},
    {"id":"edge-cond_1-llm_pos","source":"cond_1","target":"llm_pos",
     "sourceHandle":"true","targetHandle":"prompt","type":"smoothstep"},
    {"id":"edge-cond_1-llm_neg","source":"cond_1","target":"llm_neg",
     "sourceHandle":"false","targetHandle":"prompt","type":"smoothstep"},
    {"id":"edge-llm_pos-resp_1","source":"llm_pos","target":"resp_1",
     "sourceHandle":"response","targetHandle":"data","type":"smoothstep"},
    {"id":"edge-llm_neg-resp_1","source":"llm_neg","target":"resp_1",
     "sourceHandle":"response","targetHandle":"data","type":"smoothstep"}
  ],
  "description":"Classify input then respond differently based on sentiment"
}

EXAMPLE C — Workflow with User Input Form (form_input):
{
  "nodes": [
    {"id":"trigger_1","type":"workflow","position":{"x":0,"y":0},
     "data":{"nodeType":"manual_trigger","label":"Start","config":{}}},
    {"id":"form_1","type":"workflow","position":{"x":280,"y":0},
     "data":{"nodeType":"form_input","label":"Get User Input",
             "config":{"fields":[{"id":"keywords","label":"Keywords","type":"text","required":true,"placeholder":"Enter keywords..."},{"id":"category","label":"Category","type":"select","required":false,"options":["general","tech","health"]}]}}},
    {"id":"search_1","type":"workflow","position":{"x":560,"y":0},
     "data":{"nodeType":"rag_query","label":"Search Articles",
             "config":{"collection":"default","topK":5,"query":"{{form_1.values.keywords}}"}}},
    {"id":"llm_1","type":"workflow","position":{"x":840,"y":0},
     "data":{"nodeType":"llm_call","label":"Summarize Results",
             "config":{"model":"gpt-4o-mini","temperature":0.3,"maxTokens":1000,
                       "prompt":"Summarize these articles about {{form_1.values.keywords}}: {{search_1.context}}",
                       "systemPrompt":"You are a research assistant. Provide clear summaries."}}},
    {"id":"resp_1","type":"workflow","position":{"x":1120,"y":0},
     "data":{"nodeType":"workflow_response","label":"Return Summary","config":{"status":"success"}}}
  ],
  "edges": [
    {"id":"edge-trigger_1-form_1","source":"trigger_1","target":"form_1",
     "sourceHandle":"params","targetHandle":"trigger","type":"smoothstep"},
    {"id":"edge-form_1-search_1","source":"form_1","target":"search_1",
     "sourceHandle":"values","targetHandle":"query","type":"smoothstep"},
    {"id":"edge-search_1-llm_1","source":"search_1","target":"llm_1",
     "sourceHandle":"context","targetHandle":"prompt","type":"smoothstep"},
    {"id":"edge-llm_1-resp_1","source":"llm_1","target":"resp_1",
     "sourceHandle":"response","targetHandle":"data","type":"smoothstep"}
  ],
  "description":"Collect user keywords via form, search knowledge base, and summarize results"
}
"""


class WorkflowGenerationError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class WorkflowGenerator:
    """Generates a ReactFlow workflow JSON from a natural language prompt.

    Uses the SmartSpecWeb LLM gateway (forward_chat_json) so model routing,
    credits, and audit logging are handled by the central gateway.
    """

    async def generate(
        self,
        prompt: str,
        node_types: list[dict[str, Any]] | None = None,
        model: str | None = None,
        user_token: str | None = None,
        default_model: str | None = None,
    ) -> dict[str, Any]:
        """
        Args:
            prompt: User's description of the desired workflow.
            node_types: Full node type specs from the registry (with inputs/outputs).
            model: Model ID selected by the user for the generation call itself.
            user_token: User JWT for gateway credit tracking.
            default_model: Workflow-level default model for llm_call nodes in
                           the generated workflow (e.g. "kimi-k2.5").
        Returns:
            dict with keys: nodes, edges, description
        """
        effective_node_types = node_types or []
        node_types_text = self._format_node_types(effective_node_types)

        # The model to use inside generated llm_call config
        workflow_model = default_model or model or "gpt-4o-mini"

        user_message = (
            "════════════════════════════════════════\n"
            "AVAILABLE NODE TYPES\n"
            "════════════════════════════════════════\n"
            f"{node_types_text}\n\n"
            "════════════════════════════════════════\n"
            "WORKFLOW SETTINGS\n"
            "════════════════════════════════════════\n"
            f'WORKFLOW_DEFAULT_MODEL: "{workflow_model}"\n\n'
            "════════════════════════════════════════\n"
            "USER REQUEST\n"
            "════════════════════════════════════════\n"
            f"{prompt}\n\n"
            "Generate the complete, fully-connected workflow JSON now.\n"
            "• Every node must have at least one edge.\n"
            "• Use ONLY port names listed in the node specs above.\n"
            "• Populate ALL config fields with sensible defaults.\n"
            f'• For every llm_call node set config.model to "{workflow_model}".'
        )

        payload: dict[str, Any] = {
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.1,
            "max_tokens": 6000,
        }
        if model:
            payload["model"] = model

        t0 = time.monotonic()
        try:
            response = await forward_chat_json(payload=payload, user_token=user_token)
        except Exception as exc:
            logger.error("workflow_generator_gateway_error", error=str(exc))
            raise WorkflowGenerationError(f"Gateway call failed: {exc}") from exc

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        if response.status_code != 200:
            body_text = response.text[:500]
            logger.error(
                "workflow_generator_gateway_http_error",
                status=response.status_code,
                body=body_text,
                elapsed_ms=elapsed_ms,
            )
            raise WorkflowGenerationError(
                f"Gateway returned HTTP {response.status_code}: {body_text}"
            )

        try:
            resp_json = response.json()
            raw = resp_json["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise WorkflowGenerationError(
                f"Unexpected gateway response format: {exc}"
            ) from exc

        logger.info(
            "workflow_generator_response",
            elapsed_ms=elapsed_ms,
            model=resp_json.get("model", model),
            chars=len(raw),
            prompt_preview=user_message[:500],
        )

        result = self._parse_and_validate(raw, effective_node_types, workflow_model)
        
        # Log detailed result for debugging
        logger.info(
            "workflow_generator_result",
            node_count=len(result.get("nodes", [])),
            edge_count=len(result.get("edges", [])),
            description=result.get("description", ""),
            node_types=[n.get("data", {}).get("nodeType") for n in result.get("nodes", [])],
        )
        
        return result

    # ------------------------------------------------------------------
    # Format node types — send complete port specs to the LLM
    # ------------------------------------------------------------------

    def _format_node_types(self, node_types: list[dict[str, Any]]) -> str:
        if not node_types:
            return (
                "manual_trigger  outputs: params(json), userId(number), timestamp(text)\n"
                "llm_call        inputs: prompt(text)[required,connectable], systemPrompt(text)[connectable], "
                "model(text)[config,default=\"gpt-4o-mini\"], temperature(number)[config,default=0.7], "
                "maxTokens(number)[config,default=1000]  "
                "outputs: response(text), usage(json)\n"
                "conditional     inputs: value(any)[required,connectable]  "
                "config: condition(text)  outputs: true(any), false(any)\n"
                "workflow_response  inputs: data(any)[required,connectable]  "
                "config: status(text)[default=\"success\"]  outputs: (none)\n"
            )

        blocks: list[str] = []
        for nt in node_types:
            ntype = nt.get("type", "")
            name = nt.get("display_name", ntype)
            desc = nt.get("description", "")

            # Separate inputs into wire-connectable ports vs config-only fields
            connectable_inputs: list[dict] = []
            config_inputs: list[dict] = []

            for i in nt.get("inputs", []):
                if i.get("accepts_connection") or i.get("required"):
                    connectable_inputs.append(i)
                elif i.get("name"):
                    config_inputs.append(i)

            # Wire-connectable input ports
            input_parts: list[str] = []
            for i in connectable_inputs:
                flags: list[str] = []
                if i.get("required"):
                    flags.append("required")
                if i.get("accepts_connection"):
                    flags.append("wire")
                flag_str = f"[{','.join(flags)}]" if flags else ""
                input_parts.append(f"{i.get('name')}({i.get('data_type', 'any')}){flag_str}")

            # Output ports
            output_parts: list[str] = []
            for o in nt.get("outputs", []):
                output_parts.append(f"{o.get('name')}({o.get('data_type', 'any')})")

            # Config fields (non-connectable) — show name, type, default, options
            config_parts: list[str] = []
            for c in config_inputs[:8]:  # cap to avoid too much noise
                default = c.get("default")
                default_str = f"={json.dumps(default)}" if default is not None else ""
                options = c.get("options")
                options_str = ""
                if options and isinstance(options, list):
                    vals = [o.get("value", o.get("label", "")) for o in options[:5]]
                    options_str = f" options:{vals}"
                config_parts.append(
                    f"{c.get('name')}({c.get('data_type', 'any')}){default_str}{options_str}"
                )

            line = f"nodeType: {ntype}  ({name})\n  desc: {desc}"
            if input_parts:
                line += f"\n  INPUT PORTS (wire-connectable):  {', '.join(input_parts)}"
            else:
                line += "\n  INPUT PORTS: (none — trigger/source node)"
            if output_parts:
                line += f"\n  OUTPUT PORTS: {', '.join(output_parts)}"
            else:
                line += "\n  OUTPUT PORTS: (none — terminal node)"
            if config_parts:
                line += f"\n  CONFIG FIELDS (set in config object): {', '.join(config_parts)}"

            blocks.append(line)

        return "\n\n".join(blocks)

    # ------------------------------------------------------------------
    # Parse & validate LLM JSON output, then auto-fill defaults
    # ------------------------------------------------------------------

    @staticmethod
    def _fix_json(text: str) -> str:
        """Best-effort repair of common LLM JSON mistakes."""
        # Remove trailing commas before } or ]
        text = re.sub(r",\s*([}\]])", r"\1", text)
        # Replace single-quoted keys/values with double quotes (simple cases)
        text = re.sub(r"(?<=[\{,\[])\s*'([^']+)'\s*:", r' "\1":', text)
        return text

    def _parse_and_validate(
        self,
        raw: str,
        node_types: list[dict[str, Any]],
        workflow_model: str,
    ) -> dict[str, Any]:
        """Extract JSON from LLM response, validate, and auto-fill config defaults."""
        text = raw.strip()
        # Strip markdown fences
        if "```" in text:
            text = re.sub(r"```(?:json)?\s*", "", text).strip()
            text = re.sub(r"```", "", text).strip()

        # Try parsing, with progressive repair on failure
        data: dict | None = None
        for attempt_text in (text, self._fix_json(text)):
            try:
                data = json.loads(attempt_text)
                break
            except json.JSONDecodeError:
                pass

        if data is None:
            # Last resort: extract the outermost { ... } and repair
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    data = json.loads(self._fix_json(match.group()))
                except json.JSONDecodeError as exc:
                    raise WorkflowGenerationError(
                        f"LLM returned invalid JSON: {exc}"
                    ) from exc
            else:
                raise WorkflowGenerationError(
                    "LLM returned no JSON object in response"
                )

        nodes: list[dict] = data.get("nodes", [])
        edges: list[dict] = data.get("edges", [])
        description: str = data.get("description", "AI-generated workflow")

        if not isinstance(nodes, list) or not nodes:
            raise WorkflowGenerationError("Generated workflow has no nodes.")

        # Build registry lookup
        registry = {nt.get("type"): nt for nt in node_types}

        # Build port lookup for validation
        known_outputs: dict[str, set[str]] = {}
        known_inputs: dict[str, set[str]] = {}

        for node in nodes:
            nid = node.get("id", "")
            ntype = node.get("data", {}).get("nodeType", "")
            spec = registry.get(ntype, {})
            known_outputs[nid] = {o.get("name") for o in spec.get("outputs", [])}
            known_inputs[nid] = {
                i.get("name") for i in spec.get("inputs", [])
                if i.get("accepts_connection") or i.get("required")
            }

        # Validate / fix edges
        valid_edges: list[dict] = []
        for i, edge in enumerate(edges):
            if "id" not in edge:
                edge["id"] = f"edge-{edge.get('source', 's')}-{edge.get('target', 't')}-{i}"
            edge.setdefault("type", "smoothstep")

            src = edge.get("source", "")
            tgt = edge.get("target", "")
            sh = edge.get("sourceHandle", "")
            th = edge.get("targetHandle", "")

            # Warn on port mismatches (keep edge — user can fix visually)
            if known_outputs.get(src) and sh not in known_outputs[src]:
                logger.warning(
                    "workflow_generator_invalid_source_handle",
                    edge_id=edge["id"],
                    source=src,
                    sourceHandle=sh,
                    valid_outputs=list(known_outputs[src]),
                )
            if known_inputs.get(tgt) and th and th not in known_inputs[tgt]:
                logger.warning(
                    "workflow_generator_invalid_target_handle",
                    edge_id=edge["id"],
                    target=tgt,
                    targetHandle=th,
                    valid_inputs=list(known_inputs[tgt]),
                )
            valid_edges.append(edge)

        # Ensure every node has required structure + auto-fill config defaults
        connected_nodes = set()
        for edge in valid_edges:
            connected_nodes.add(edge.get("source"))
            connected_nodes.add(edge.get("target"))
        
        for node in nodes:
            node.setdefault("type", "workflow")
            if "position" not in node:
                node["position"] = {"x": 0, "y": 0}
            node.setdefault("data", {})
            node["data"].setdefault("config", {})

            ntype = node["data"].get("nodeType", "")
            config = node["data"]["config"]
            nid = node.get("id", "")
            
            # Check if node is connected (except trigger nodes)
            if ntype != "manual_trigger" and nid not in connected_nodes:
                logger.warning(
                    "workflow_generator_orphan_node",
                    node_id=nid,
                    node_type=ntype,
                    message="Node has no connections - workflow may be incomplete"
                )

            if node_types and ntype not in registry:
                logger.warning("workflow_generator_unknown_node_type", node_type=ntype)

            # Auto-fill config defaults from node type spec
            spec = registry.get(ntype, {})
            self._auto_fill_config(config, spec, workflow_model, ntype)
            
            # Validate llm_call has prompt content
            if ntype == "llm_call":
                prompt = config.get("prompt", "")
                if not prompt or prompt.strip() == "":
                    logger.warning(
                        "workflow_generator_empty_prompt",
                        node_id=nid,
                        message="llm_call node has empty prompt - using default"
                    )
                    config["prompt"] = "Process the input and provide a response."
                
                system_prompt = config.get("systemPrompt", "")
                if not system_prompt or system_prompt.strip() == "":
                    config["systemPrompt"] = "You are a helpful assistant."

        # Final validation summary
        orphan_count = len([n for n in nodes if n.get("id") not in connected_nodes and n.get("data", {}).get("nodeType") != "manual_trigger"])
        if orphan_count > 0:
            logger.warning(
                "workflow_generator_validation_summary",
                total_nodes=len(nodes),
                connected_nodes=len(connected_nodes),
                orphan_nodes=orphan_count,
                message="Some nodes are not connected - workflow may need manual fixing"
            )

        return {"nodes": nodes, "edges": valid_edges, "description": description}

    # ------------------------------------------------------------------
    # Auto-fill config defaults from node type spec
    # ------------------------------------------------------------------

    def _auto_fill_config(
        self,
        config: dict[str, Any],
        spec: dict[str, Any],
        workflow_model: str,
        ntype: str,
    ) -> None:
        """Fill missing config fields with defaults from the node type spec.

        This ensures generated workflows work immediately without manual
        config editing.
        """
        for inp in spec.get("inputs", []):
            name = inp.get("name", "")
            # Only fill non-connectable config fields (not wired ports)
            if inp.get("accepts_connection"):
                continue
            # If the LLM already set it, don't overwrite
            if name in config:
                continue
            # Fill with default if available
            default = inp.get("default")
            if default is not None:
                config[name] = default

        # Special handling for llm_call — ensure model is set to workflow default
        if ntype == "llm_call":
            if "model" not in config or not config["model"]:
                config["model"] = workflow_model
            if "temperature" not in config:
                config["temperature"] = 0.7
            if "maxTokens" not in config:
                config["maxTokens"] = 1000

        # Special handling for workflow_response — ensure status is set
        if ntype == "workflow_response":
            if "status" not in config:
                config["status"] = "success"

        # Special handling for rag_query — ensure collection defaults
        if ntype == "rag_query":
            if "collection" not in config:
                config["collection"] = "default"
            if "topK" not in config:
                config["topK"] = 5
        
        # Special handling for form_input — ensure fields config
        if ntype == "form_input":
            if "fields" not in config or not config["fields"]:
                config["fields"] = [
                    {
                        "id": "input_1",
                        "label": "Input",
                        "type": "text",
                        "required": True,
                        "placeholder": "Enter value..."
                    }
                ]
                logger.info(
                    "workflow_generator_form_input_default",
                    message="Added default form field configuration"
                )
