import type { ModelClient, ModelRequest, ModelResponse, ToolUseBlock } from "../src/types.js";

/** A scripted model: returns the queued responses in order. Lets us test the loop with no API. */
export class ScriptedModel implements ModelClient {
  calls: ModelRequest[] = [];
  constructor(private script: Array<(req: ModelRequest) => ModelResponse>) {}
  async complete(req: ModelRequest): Promise<ModelResponse> {
    this.calls.push(structuredClone(req));
    const next = this.script.shift();
    if (!next) throw new Error("script exhausted");
    return next(req);
  }
}

let n = 0;
export const toolCall = (name: string, input: Record<string, unknown>): ModelResponse => ({
  content: [{ type: "tool_use", id: `t${++n}`, name, input } as ToolUseBlock],
  stopReason: "tool_use",
});
export const done = (text: string): ModelResponse => ({
  content: [{ type: "text", text }],
  stopReason: "end_turn",
});
