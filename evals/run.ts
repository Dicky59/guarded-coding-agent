// Usage: ANTHROPIC_API_KEY=... npm run eval
// Copies each fixture to a temp dir, runs the agent, then runs the verify command.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnthropicModel } from "../src/gateway/anthropic.js";
import { runAgent } from "../src/orchestrator/loop.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const tasks = JSON.parse(fs.readFileSync(path.join(here, "tasks.json"), "utf8")) as Array<{
  id: string;
  fixture: string;
  task: string;
  verify: string;
}>;

let passed = 0;
for (const t of tasks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `eval-${t.id}-`));
  fs.cpSync(path.join(here, "fixtures", t.fixture), dir, { recursive: true });

  const result = await runAgent({ task: t.task, workspace: dir, model: new AnthropicModel(), maxIterations: 20 });

  let ok = false;
  try {
    execSync(t.verify, { cwd: dir, stdio: "pipe" });
    ok = true;
  } catch {
    ok = false;
  }
  if (ok) passed++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${t.id}  status=${result.status} steps=${result.iterations} tokens=${result.usage.inputTokens + result.usage.outputTokens}`,
  );
}
console.log(`\n${passed}/${tasks.length} passed`);
process.exit(passed === tasks.length ? 0 : 1);
