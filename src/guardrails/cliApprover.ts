import readline from "node:readline/promises";
import type { Approver } from "../types.js";

export interface CliApproverOptions {
  /** Auto-approve "reversible" asks (never irreversible ones). */
  approveReversible?: boolean;
}

export function cliApprover(opts: CliApproverOptions = {}): Approver {
  return async (req) => {
    if (opts.approveReversible && req.risk !== "irreversible") return true;
    if (!process.stdin.isTTY) return false; // non-interactive: refuse
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log(`\n⚠  approval needed [${req.risk}] ${req.tool} ${JSON.stringify(req.input)}`);
      console.log(`   reason: ${req.reason}`);
      const answer = await rl.question("   Allow once? [y/N] ");
      return /^y(es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  };
}
