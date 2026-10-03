// ---- Conversation / model types (shaped like Anthropic content blocks, provider-agnostic) ----

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ModelRequest {
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
}

export interface ModelResponse {
  content: Array<TextBlock | ToolUseBlock>;
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  usage?: Usage;
}

/** The only thing the orchestrator knows about an LLM. M4 swaps in a gateway with failover. */
export interface ModelClient {
  complete(req: ModelRequest): Promise<ModelResponse>;
}

// ---- Tool types ----

export interface ToolContext {
  /** Absolute path of the directory the agent is confined to. */
  workspace: string;
  commandTimeoutMs: number;
}

export interface ToolOutput {
  content: string;
  isError?: boolean;
}

export interface Tool {
  definition: ToolDefinition;
  run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput>;
}

// ---- Orchestrator events (consumed by CLI now, by a session store / dashboard later) ----

export type AgentEvent =
  | { type: "iteration"; n: number }
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; content: string; isError: boolean }
  | { type: "stopped"; status: RunStatus; reason: string };

export type RunStatus = "completed" | "max_iterations" | "stuck" | "error";
