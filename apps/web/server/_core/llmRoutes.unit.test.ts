import { describe, expect, it } from "vitest";

import {
  createMessagesSseTransformState,
  extractStreamingUsageFromSsePayload,
  finalizeMessagesSseTransformToOpenAi,
  transformMessagesSseChunkToOpenAi,
  transformRequestBody,
  validateKieRequestFields,
} from "./llmRoutes";

describe("transformRequestBody", () => {
  it("preserves documented messages-style fields for Kie Claude", () => {
    const transformed = transformRequestBody(
      {
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hi" },
        ],
        max_tokens: 2048,
        temperature: 0.4,
        top_p: 0.8,
        metadata: { trace: "abc" },
        tools: [{ name: "lookup_weather", type: "function" }],
        thinkingFlag: true,
        thinking: { type: "enabled", budget_tokens: 2048 },
        output_config: { include_reasoning: true },
      },
      "kie_ai",
      "claude-sonnet-4-6",
      false,
      "messages",
      {
        requestBodyFormat: "anthropic-messages",
        passthroughFields: ["tools", "thinkingFlag", "thinking", "output_config"],
      },
    );

    expect(transformed).toEqual({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      stream: false,
      temperature: 0.4,
      top_p: 0.8,
      metadata: { trace: "abc" },
      system: "You are helpful",
      messages: [{ role: "user", content: "Hi" }],
      tools: [{ name: "lookup_weather", type: "function" }],
      thinkingFlag: true,
      thinking: { type: "enabled", budget_tokens: 2048 },
      output_config: { include_reasoning: true },
    });
  });

  it("converts assistant tool calls and tool results into Anthropic message blocks", () => {
    const transformed = transformRequestBody(
      {
        messages: [
          { role: "system", content: "You are helpful" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_weather",
                type: "function",
                function: {
                  name: "lookup_weather",
                  arguments: "{\"city\":\"Bangkok\"}",
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_weather",
            content: "Sunny and 31C",
          },
        ],
      },
      "kie_ai",
      "claude-sonnet-4-6",
      false,
      "messages",
      {
        requestBodyFormat: "anthropic-messages",
        inputFields: [
          { key: "messages", label: "Messages", type: "messages", documented: true, required: true },
          { key: "tools", label: "Tools", type: "tools", documented: true },
        ],
      },
    );

    expect(transformed).toEqual({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      stream: false,
      system: "You are helpful",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_weather",
              name: "lookup_weather",
              input: { city: "Bangkok" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_weather",
              content: "Sunny and 31C",
            },
          ],
        },
      ],
    });
  });

  it("converts chat messages into responses-style input for Kie GPT/Codex models", () => {
    const transformed = transformRequestBody(
      {
        messages: [
          { role: "system", content: "Reply in Thai" },
          { role: "user", content: "วันนี้วันอะไร" },
          { role: "assistant", content: "ขอคิดก่อน" },
        ],
        temperature: 0.2,
        metadata: { trace: "kie-responses" },
        reasoning: { effort: "medium" },
      },
      "kie_ai",
      "gpt-5-4",
      false,
      "responses",
      {
        requestBodyFormat: "responses",
        passthroughFields: ["reasoning"],
      },
    );

    expect(transformed).toEqual({
      model: "gpt-5-4",
      input: [
        { role: "user", content: "วันนี้วันอะไร" },
        { role: "assistant", content: "ขอคิดก่อน" },
      ],
      stream: false,
      instructions: "Reply in Thai",
      temperature: 0.2,
      metadata: { trace: "kie-responses" },
      reasoning: { effort: "medium" },
    });
  });
});

describe("validateKieRequestFields", () => {
  it("rejects unknown top-level fields for Kie chat-completions requests", () => {
    const result = validateKieRequestFields(
      {
        model: "gemini-3-pro",
        messages: [{ role: "user", content: "hi" }],
        unsupported: true,
      },
      "chat-completions",
      {
        requestBodyFormat: "openai-chat-completions",
        passthroughFields: ["include_thoughts"],
      },
    );

    expect(result).toEqual({
      status: 400,
      message: "Unsupported request fields for Kie model: unsupported",
    });
  });

  it("allows configured passthrough fields and rejects documented tool conflicts", () => {
    const result = validateKieRequestFields(
      {
        model: "gemini-3-pro",
        messages: [{ role: "user", content: "hi" }],
        include_thoughts: true,
        response_format: { type: "json_schema" },
        tools: [{ type: "function", name: "lookup_weather" }],
      },
      "chat-completions",
      {
        requestBodyFormat: "openai-chat-completions",
        inputFields: [
          { key: "messages", label: "Messages", type: "messages", documented: true, required: true },
          { key: "tools", label: "Tools", type: "tools", documented: true },
          { key: "stream", label: "Stream", type: "boolean", documented: true },
          { key: "include_thoughts", label: "Include Thoughts", type: "boolean", documented: true },
          { key: "reasoning_effort", label: "Reasoning Effort", type: "select", documented: true },
          { key: "response_format", label: "Response Format", type: "json", documented: true },
        ],
        passthroughFields: ["tools", "stream", "include_thoughts", "reasoning_effort", "response_format"],
        conflicts: [{ type: "xor", fields: ["response_format", "function_tools"] }],
      },
    );

    expect(result).toEqual({
      status: 400,
      message: "Kie Gemini models do not allow response_format together with function tools.",
    });
  });

  it("rejects fields that are not documented for the specific Claude model config", () => {
    const result = validateKieRequestFields(
      {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "hi" }],
        output_config: { include_reasoning: true },
      },
      "messages",
      {
        requestBodyFormat: "anthropic-messages",
        inputFields: [
          { key: "messages", label: "Messages", type: "messages", documented: true, required: true },
          { key: "tools", label: "Tools", type: "tools", documented: true },
          { key: "thinkingFlag", label: "Thinking Flag", type: "boolean", documented: true },
          { key: "stream", label: "Stream", type: "boolean", documented: true },
        ],
        passthroughFields: ["tools", "thinkingFlag", "stream"],
      },
    );

    expect(result).toEqual({
      status: 400,
      message: "Unsupported request fields for Kie model: output_config",
    });
  });

  it("rejects response_format when the specific Gemini model config does not document it", () => {
    const result = validateKieRequestFields(
      {
        model: "gemini-3.1-pro",
        messages: [{ role: "user", content: "hi" }],
        response_format: { type: "json_schema" },
      },
      "chat-completions",
      {
        requestBodyFormat: "openai-chat-completions",
        inputFields: [
          { key: "messages", label: "Messages", type: "messages", documented: true, required: true },
          { key: "tools", label: "Tools", type: "tools", documented: true },
          { key: "stream", label: "Stream", type: "boolean", documented: true },
          { key: "include_thoughts", label: "Include Thoughts", type: "boolean", documented: true },
          { key: "reasoning_effort", label: "Reasoning Effort", type: "select", documented: true },
        ],
        passthroughFields: ["tools", "stream", "include_thoughts", "reasoning_effort"],
      },
    );

    expect(result).toEqual({
      status: 400,
      message: "Unsupported request fields for Kie model: response_format",
    });
  });

  it("accepts allowlisted Kie responses fields", () => {
    const result = validateKieRequestFields(
      {
        model: "gpt-5-4",
        input: [{ role: "user", content: "hi" }],
        reasoning: { effort: "medium" },
        stream: true,
      },
      "responses",
      {
        requestBodyFormat: "responses",
        passthroughFields: ["reasoning"],
      },
    );

    expect(result).toBeNull();
  });
});

describe("transformMessagesSseChunkToOpenAi", () => {
  it("normalizes Claude text streaming events into OpenAI chat chunks", () => {
    const state = createMessagesSseTransformState("claude-sonnet-4-6");
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_123","model":"claude-sonnet-4-6","usage":{"input_tokens":11}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" from Claude"}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");

    const output =
      transformMessagesSseChunkToOpenAi(
        raw,
        state,
        "claude-sonnet-4-6",
      )
      + finalizeMessagesSseTransformToOpenAi(
        state,
        "claude-sonnet-4-6",
      ).output;

    expect(output).toContain('"object":"chat.completion.chunk"');
    expect(output).toContain('"role":"assistant"');
    expect(output).toContain('"content":"Hello"');
    expect(output).toContain('"content":" from Claude"');
    expect(output).toContain('"finish_reason":"stop"');
    expect(output).toContain("data: [DONE]");
  });

  it("normalizes Claude tool-use streaming events into OpenAI tool call deltas", () => {
    const state = createMessagesSseTransformState("claude-sonnet-4-6");
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_456","model":"claude-sonnet-4-6"}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"lookup_weather","input":{}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"Bangkok\\"}"}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");

    const output =
      transformMessagesSseChunkToOpenAi(
        raw,
        state,
        "claude-sonnet-4-6",
      )
      + finalizeMessagesSseTransformToOpenAi(
        state,
        "claude-sonnet-4-6",
      ).output;

    expect(output).toContain('"tool_calls"');
    expect(output).toContain('"name":"lookup_weather"');
    expect(output).toContain('"arguments":""');
    expect(output).toContain('\\"city\\":\\"Bangkok\\"');
    expect(output).not.toContain('"arguments":"{}{"');
    expect(output).toContain('"finish_reason":"tool_calls"');
    expect(output).toContain("data: [DONE]");
  });

  it("preserves non-empty seeded tool arguments from Claude content_block_start", () => {
    const state = createMessagesSseTransformState("claude-sonnet-4-6");
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_seeded","model":"claude-sonnet-4-6"}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_seeded","name":"lookup_weather","input":{"city":"Bangkok","unit":"c"}}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");

    const output =
      transformMessagesSseChunkToOpenAi(
        raw,
        state,
        "claude-sonnet-4-6",
      )
      + finalizeMessagesSseTransformToOpenAi(
        state,
        "claude-sonnet-4-6",
      ).output;

    expect(output).toContain('"tool_calls"');
    expect(output).toContain('"name":"lookup_weather"');
    expect(output).toContain('\\"city\\":\\"Bangkok\\"');
    expect(output).toContain('\\"unit\\":\\"c\\"');
    expect(output).toContain('"finish_reason":"tool_calls"');
  });

  it("preserves multi-fragment Claude tool argument deltas without malformed prefixes", () => {
    const state = createMessagesSseTransformState("claude-sonnet-4-6");
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_fragments","model":"claude-sonnet-4-6"}}',
      "",
      "event: content_block_start",
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_fragments","name":"lookup_weather","input":{}}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":\\"Bang"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"kok\\",\\"unit\\":\\"c\\"}"}}',
      "",
      "event: message_delta",
      'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}',
      "",
      "event: message_stop",
      'data: {"type":"message_stop"}',
      "",
    ].join("\n");

    const output =
      transformMessagesSseChunkToOpenAi(
        raw,
        state,
        "claude-sonnet-4-6",
      )
      + finalizeMessagesSseTransformToOpenAi(
        state,
        "claude-sonnet-4-6",
      ).output;

    expect(output).toContain('"arguments":""');
    expect(output).toContain('{\\"city\\":\\"Bang');
    expect(output).toContain('kok\\",\\"unit\\":\\"c\\"}');
    expect(output).not.toContain('"arguments":"{}{"');
  });

  it("records unsupported Claude SSE event families for observability", () => {
    const state = createMessagesSseTransformState("claude-sonnet-4-6");
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_unknown","model":"claude-sonnet-4-6"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"step"}}',
      "",
      "event: ping",
      'data: {"type":"ping"}',
      "",
    ].join("\n");

    transformMessagesSseChunkToOpenAi(
      raw,
      state,
      "claude-sonnet-4-6",
    );

    expect(Array.from(state.unsupportedEventCounts.keys())).toContain(
      "content_block_delta:thinking_delta",
    );
    expect(
      Array.from(state.unsupportedEventCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      ),
    ).toBeGreaterThanOrEqual(1);
  });

  it("does not synthesize a successful terminator when Claude stream is truncated", () => {
    const state = createMessagesSseTransformState("claude-sonnet-4-6");
    const raw = [
      "event: message_start",
      'data: {"type":"message_start","message":{"id":"msg_partial","model":"claude-sonnet-4-6"}}',
      "",
      "event: content_block_delta",
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Partial"}}',
      "",
    ].join("\n");

    const streamed = transformMessagesSseChunkToOpenAi(
      raw,
      state,
      "claude-sonnet-4-6",
    );
    const finalized = finalizeMessagesSseTransformToOpenAi(
      state,
      "claude-sonnet-4-6",
    );

    expect(streamed).toContain('"role":"assistant"');
    expect(finalized.completedGracefully).toBe(false);
    expect(finalized.output).toContain('"content":"Partial"');
    expect(finalized.output).not.toContain("data: [DONE]");
    expect(finalized.output).not.toContain('"finish_reason":"');
  });
});

describe("extractStreamingUsageFromSsePayload", () => {
  it("merges Claude messages usage across multiple SSE events", () => {
    const raw = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":11}}}',
      'data: {"type":"message_delta","usage":{"output_tokens":7}}',
    ].join("\n");

    expect(extractStreamingUsageFromSsePayload(raw, "messages")).toEqual({
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
      providerReportedCostUsd: undefined,
      providerReportedCreditsConsumed: undefined,
    });
  });
});
