"""Cost estimation for workflow execution."""
import structlog

logger = structlog.get_logger(__name__)


class CostEstimator:
    """Estimates workflow execution cost based on node types and configuration."""

    # Base costs (in credits)
    RAG_QUERY_COST = 1.0
    IMAGE_GENERATION_BASE_COST = {
        "dalle2": 10.0,
        "dalle3": 15.0,
        "stable-diffusion": 5.0,
        "midjourney": 20.0,
        "default": 10.0,
    }

    # Model costs (per 1k tokens)
    MODEL_COSTS = {
        "gpt-4": 0.03,  # $0.03 per 1k tokens
        "gpt-4-turbo": 0.01,
        "gpt-3.5-turbo": 0.001,
        "claude-3-opus": 0.015,
        "claude-3-sonnet": 0.003,
        "claude-3-haiku": 0.00025,
        "gemini-pro": 0.0005,
        "default": 0.01,
    }

    def estimate(self, workflow_json: dict) -> dict[str, float]:
        """
        Estimate total cost for workflow execution.

        Args:
            workflow_json: Workflow definition with nodes and edges

        Returns:
            Dictionary with 'total' and 'breakdown' (by node type)
        """
        nodes = workflow_json.get("nodes", [])

        breakdown = {
            "llm_calls": 0.0,
            "image_generation": 0.0,
            "rag_queries": 0.0,
            "skills": 0.0,
            "other": 0.0,
        }

        for node in nodes:
            node_data = node.get("data", {})
            node_type = node_data.get("nodeType", "")
            config = node_data.get("config", {})

            if node_type == "llm_call":
                cost = self.estimate_llm_cost(config)
                breakdown["llm_calls"] += cost

            elif node_type == "generate_image":
                cost = self.estimate_image_cost(config)
                breakdown["image_generation"] += cost

            elif node_type == "rag_query":
                cost = self.RAG_QUERY_COST
                breakdown["rag_queries"] += cost

            elif node_type == "skill":
                cost = self.estimate_skill_cost(config)
                breakdown["skills"] += cost

            else:
                # Other node types (conditional, loop, approval) have no direct cost
                pass

        total = sum(breakdown.values())

        logger.info(
            "workflow_cost_estimated",
            total=total,
            breakdown=breakdown,
            node_count=len(nodes),
        )

        return {"total": total, "breakdown": breakdown}

    def estimate_llm_cost(self, config: dict) -> float:
        """
        Estimate cost of single LLM call.

        Args:
            config: Node configuration with prompt and model

        Returns:
            Estimated cost in credits
        """
        prompt = config.get("prompt", "")
        model = config.get("model", "gpt-4")

        # Estimate tokens (rough: 1 token ≈ 4 chars)
        prompt_tokens = len(prompt) / 4

        # Estimate response tokens (assume 2x prompt for safety)
        estimated_response_tokens = prompt_tokens * 2

        total_tokens = prompt_tokens + estimated_response_tokens

        # Get model cost per 1k tokens
        cost_per_1k = self.MODEL_COSTS.get(model, self.MODEL_COSTS["default"])

        # Calculate total cost
        cost = (total_tokens / 1000) * cost_per_1k

        logger.debug(
            "llm_cost_estimated",
            model=model,
            prompt_length=len(prompt),
            estimated_tokens=total_tokens,
            cost=cost,
        )

        return cost

    def estimate_image_cost(self, config: dict) -> float:
        """
        Estimate cost of image generation.

        Args:
            config: Node configuration with provider, size, quality

        Returns:
            Estimated cost in credits
        """
        provider = config.get("provider", "dalle3")
        size = config.get("size", "1024x1024")
        quality = config.get("quality", "standard")

        base_cost = self.IMAGE_GENERATION_BASE_COST.get(
            provider, self.IMAGE_GENERATION_BASE_COST["default"]
        )

        # Adjust for size
        size_multiplier = 1.0
        if "2048" in size or "2k" in size.lower():
            size_multiplier = 2.0
        elif "4096" in size or "4k" in size.lower():
            size_multiplier = 4.0

        # Adjust for quality
        quality_multiplier = 1.0
        if quality == "hd":
            quality_multiplier = 1.5

        cost = base_cost * size_multiplier * quality_multiplier

        logger.debug(
            "image_cost_estimated",
            provider=provider,
            size=size,
            quality=quality,
            cost=cost,
        )

        return cost

    def estimate_skill_cost(self, config: dict) -> float:
        """
        Estimate cost of skill execution.

        Args:
            config: Node configuration with skill name

        Returns:
            Estimated cost in credits
        """
        skill_name = config.get("skillName", "unknown")

        # Base skill cost (can be refined per skill type)
        base_cost = 2.0

        # Some skills may have variable costs
        if "video" in skill_name.lower():
            return 50.0  # Video generation is expensive
        elif "image" in skill_name.lower():
            return 15.0
        elif "llm" in skill_name.lower() or "chat" in skill_name.lower():
            # Estimate based on prompt length if available
            prompt = config.get("prompt", "")
            if prompt:
                return self.estimate_llm_cost({"prompt": prompt, "model": "gpt-4"})
            return 5.0
        else:
            return base_cost
