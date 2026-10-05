import type { Risk } from "../types.js";
import { classifyToolCall, isSimple, isStdinFilter, matchesAny, READ_ONLY, splitSegments } from "./classify.js";

export interface PolicyConfig {
  /** Command prefixes that may run without asking (never applies to irreversible commands). */
  allowCommands: string[];
}

export const DEFAULT_ALLOW_COMMANDS = [
  "npm test",
  "npm run test",
  "npm run build",
  "npm run lint",
  "npm run typecheck",
  "npx tsc",
  "node --test",
];

export interface Decision {
  action: "allow" | "ask" | "deny";
  risk: Risk;
  reason: string;
}

const KNOWN_TOOLS = new Set(["read_file", "search", "edit_file", "run_command"]);

export function decide(
  name: string,
  input: Record<string, unknown>,
  policy: PolicyConfig = { allowCommands: DEFAULT_ALLOW_COMMANDS },
): Decision {
  const c = classifyToolCall(name, input);
  if (c.deny) return { action: "deny", risk: c.risk, reason: c.reason };
  // Irreversible actions always need a human, no matter what the allow-list says.
  if (c.risk === "irreversible") return { action: "ask", risk: c.risk, reason: c.reason };
  if (!KNOWN_TOOLS.has(name)) return { action: "ask", risk: c.risk, reason: c.reason };
  if (name !== "run_command") return { action: "allow", risk: c.risk, reason: c.reason };

  if (c.risk === "read") return { action: "allow", risk: c.risk, reason: c.reason };
  const command = String(input.command ?? "");
  const allowed = isSimple(command) && splitSegments(command).every((s) => matchesAny(s, [...policy.allowCommands, ...READ_ONLY]) || isStdinFilter(s));
  return allowed
    ? { action: "allow", risk: c.risk, reason: "allow-listed command" }
    : { action: "ask", risk: c.risk, reason: "command is not on the allow-list" };
}
