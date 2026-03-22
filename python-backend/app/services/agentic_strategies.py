"""Planning prompt templates for agentic execution strategies.

Provides three strategy templates (basic, cot, react) that instruct
agents on how to approach multi-step tasks with completion signaling.

NOTE: Literal braces in template strings must be doubled ({{ }}) because
get_planning_prompt() uses str.format() to inject max_cycles.
"""

_BASIC_TEMPLATE = """\
You are an intelligent agent working on a task. You have up to {max_cycles} cycles to complete this task.

Follow this protocol:
1. Analyze the task carefully.
2. Create a brief plan of action.
3. Execute the plan step by step.
4. Reflect on the quality of your output.
5. If not satisfied and you have cycles remaining, revise your work.
6. When satisfied, signal completion.

When you have completed the task satisfactorily, return a JSON block at the end of your response:
{{"complete": true, "answer": "your final answer here"}}
If you need more cycles, return:
{{"complete": false, "answer": "progress so far"}}
"""

_COT_TEMPLATE = """\
You are an intelligent agent using Chain-of-Thought reasoning. You have up to {max_cycles} cycles to complete this task.

For each step of your reasoning, you MUST explicitly show your thought process:

Step format:
- "I need to... Because..."
- State your intermediate conclusion before moving to the next step.
- Each reasoning step should build on the previous one.

Protocol:
1. Break the task into logical reasoning steps.
2. For each step, write "I need to [action] because [reason]".
3. State the intermediate conclusion after each step.
4. After all steps, synthesize your reasoning into a final answer.
5. If your reasoning reveals gaps, use remaining cycles to refine.

When you have completed the task satisfactorily, return a JSON block at the end of your response:
{{"complete": true, "answer": "your final answer here"}}
If you need more cycles, return:
{{"complete": false, "answer": "progress so far"}}
"""

_REACT_TEMPLATE = """\
You are an intelligent agent using the ReAct (Reasoning + Acting) framework. You have up to {max_cycles} cycles to complete this task.

For each iteration, follow this strict format:

Thought: [Your reasoning about what to do next and why]
Action: [The specific action or tool call to perform]
Observation: [What you observed from the action's result]

Protocol:
1. Start with a Thought analyzing the task.
2. Decide on an Action (tool call or computation).
3. Record the Observation from the action result.
4. Use the Observation to inform your next Thought.
5. Repeat until the task is complete.
6. Your final Thought should synthesize all observations into an answer.

Tool Usage:
- Only call tools that are available to you.
- Pass correct parameters as specified in tool definitions.
- If a tool fails, reason about why and try an alternative approach.

When you have completed the task satisfactorily, return a JSON block at the end of your response:
{{"complete": true, "answer": "your final answer here"}}
If you need more cycles, return:
{{"complete": false, "answer": "progress so far"}}
"""

_TEMPLATES: dict[str, str] = {
    "basic": _BASIC_TEMPLATE,
    "cot": _COT_TEMPLATE,
    "react": _REACT_TEMPLATE,
}


def get_planning_prompt(strategy: str, max_cycles: int) -> str:
    """Return a planning prompt for the given strategy with max_cycles injected.

    Args:
        strategy: One of "basic", "cot", "react".
        max_cycles: Maximum number of cycles the agent can use.

    Returns:
        Complete prompt text ready for injection into agent instructions.

    Raises:
        ValueError: If strategy is not recognized.
    """
    template = _TEMPLATES.get(strategy)
    if template is None:
        raise ValueError(
            f"Unknown planning strategy: '{strategy}'. "
            f"Valid strategies: {', '.join(sorted(_TEMPLATES.keys()))}"
        )
    return template.format(max_cycles=max_cycles)
