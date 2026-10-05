import type { Approver } from "../types.js";
import { DEFAULT_ALLOW_COMMANDS, type PolicyConfig } from "./policy.js";

export * from "./classify.js";
export * from "./policy.js";
export * from "./secrets.js";

export interface Guardrails {
  policy: PolicyConfig;
  approver: Approver;
}

/** Non-interactive default: anything needing approval is refused. */
export const denyAll: Approver = async () => false;
export const approveAll: Approver = async () => true;

export function defaultGuardrails(approver: Approver = denyAll): Guardrails {
  return { policy: { allowCommands: DEFAULT_ALLOW_COMMANDS }, approver };
}
