import { defaultTools } from "../tools/index.js";
import type {
  AgentEvent,
  ContentBlock,
  Message,
  ModelClient,
  RunStatus,
  Tool,
  ToolResultBlock,
  ToolUseBlock,
  Usage,
} from "../types.js";
import { LoopDetector } from "./loopDetector.js";

// Keep this prefix stable across iterations: it is what prompt caching keys on.
export const DEFAULT_SYSTEM_PROMPT = `You are a coding agent working inside a project directory.
Your job: complete the user's task by reading code, editing files, and running commands, iterating until it works.

Rules:
- Explore before editing: use search and read_file to understand the code first.
- Make minimal, targeted edits with edit_file. Never guess file contents; read them first.
- After changing code, run the project's tests or build with run_command to verify.
- If a command fails, read the error carefully and try a different approach. Do not repeat the same failing action.
- All paths are relative to the workspace root. You cannot access files outside it.
- When the task is done and verified, reply with a short summary of what you changed. Do not call more tools.`;

export interface RunOptions {
  task: string;
  workspace: string;
  model: ModelClient;
  tools?: Tool[];
  systemPrompt?: string;
  maxIterations?: number;
  commandTimeoutMs?: number;
  onEvent?: (e: AgentEvent) => void;
}

export interface RunResult {
  status: RunStatus;
  iterations: number;
  finalMessage: string;
  usage: Usage;
  messages: Message[];
}

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const tools = opts.tools ?? defaultTools;
  const toolMap = new Map(tools.map((t) => [t.definition.name, t]));
  const maxIterations = opts.maxIterations ?? 30;
  const ctx = { workspace: opts.workspace, commandTimeoutMs: opts.commandTimeoutMs ?? 60_000 };
  const emit = opts.onEvent ?? (() => {});

  const messages: Message[] = [{ role: "user", content: opts.task }];
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const detector = new LoopDetector(3);
  let finalMessage = "";

  const finish = (status: RunStatus, reason: string, iterations: number): RunResult => {
    emit({ type: "stopped", status, reason });
    return { status, iterations, finalMessage: finalMessage || reason, usage, messages };
  };

  for (let i = 1; i <= maxIterations; i++) {
    emit({ type: "iteration", n: i });

    let response;
    try {
      response = await opts.model.complete({
        system: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        messages,
        tools: tools.map((t) => t.definition),
      });
    } catch (e) {
      return finish("error", `Model call failed: ${(e as Error).message}`, i);
    }

    if (response.usage) {
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
    }
    messages.push({ role: "assistant", content: response.content });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    if (text) {
      finalMessage = text;
      emit({ type: "assistant_text", text });
    }

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      return response.stopReason === "end_turn"
        ? finish("completed", "Agent finished.", i)
        : finish("error", `Model stopped without finishing (stop reason: ${response.stopReason}).`, i);
    }

    const results: ContentBlock[] = [];
    for (const call of toolUses) {
      // Loop safety: bail before executing a call the agent is stuck repeating.
      if (detector.record(call.name, call.input)) {
        return finish("stuck", `Agent repeated the same ${call.name} call 3 times in a row.`, i);
      }

      emit({ type: "tool_call", id: call.id, name: call.name, input: call.input });
      const tool = toolMap.get(call.name);
      let result: ToolResultBlock;

      if (!tool) {
        result = { type: "tool_result", tool_use_id: call.id, content: `Unknown tool: ${call.name}`, is_error: true };
      } else {
        try {
          const out = await tool.run(call.input, ctx);
          result = { type: "tool_result", tool_use_id: call.id, content: out.content, is_error: out.isError ?? false };
        } catch (e) {
          result = { type: "tool_result", tool_use_id: call.id, content: `Tool error: ${(e as Error).message}`, is_error: true };
        }
      }
      emit({ type: "tool_result", id: call.id, name: call.name, content: result.content, isError: result.is_error ?? false });
      results.push(result);
    }
    messages.push({ role: "user", content: results });
  }

  return finish("max_iterations", `Hit iteration cap (${maxIterations}).`, maxIterations);
}
