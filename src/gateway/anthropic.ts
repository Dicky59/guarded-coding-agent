import Anthropic from "@anthropic-ai/sdk";
import type { ModelClient, ModelRequest, ModelResponse, TextBlock, ToolUseBlock } from "../types.js";

export class AnthropicModel implements ModelClient {
  private client: Anthropic;

  constructor(
    private readonly model: string = process.env.AGENT_MODEL ?? "claude-sonnet-5-5",
    apiKey: string | undefined = process.env.ANTHROPIC_API_KEY,
    private readonly maxTokens = 4096,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: ModelRequest): Promise<ModelResponse> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      // cache_control marks the stable prefix for prompt caching.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
      messages: req.messages as Anthropic.MessageParam[],
    });

    const content: Array<TextBlock | ToolUseBlock> = [];
    for (const b of res.content) {
      if (b.type === "text") content.push({ type: "text", text: b.text });
      else if (b.type === "tool_use") {
        content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input as Record<string, unknown> });
      }
    }

    const stopReason: ModelResponse["stopReason"] =
      res.stop_reason === "end_turn" || res.stop_reason === "tool_use" || res.stop_reason === "max_tokens"
        ? res.stop_reason
        : "other";

    return {
      content,
      stopReason,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }
}
