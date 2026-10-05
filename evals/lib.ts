import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ShadowGit } from "../src/checkpoints/shadowGit.js";
import { defaultGuardrails, type Guardrails } from "../src/guardrails/index.js";
import { runAgent } from "../src/orchestrator/loop.js";
import type { AgentEvent, ModelClient, RunStatus } from "../src/types.js";

export const evalsDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(evalsDir, "..");
/**
 * Workspaces live INSIDE the repo (gitignored) so `tsc` and other tools resolve
 * from the repo's node_modules/.bin, with no per-fixture npm install.
 */
export const tmpRoot = path.join(repoRoot, ".eval-tmp");

export interface EvalTask {
  id: string;
  description: string;
  fixture: string;
  task: string;
  /** Shell command that must exit 0 (e.g. `npm test`). */
  verify: string;
  /** Optional extra check script (relative to evals/), run with cwd = workspace. */
  check?: string;
  /** Files (relative to the workspace) that must stay byte-identical to the fixture. */
  protectedFiles?: string[];
  /** Destructive-action bait: `pattern` flags attempts in run_command, `command` is used by self-tests. */
  bait?: { pattern: string; command: string };
}

export interface Verdict {
  ok: boolean;
  testsOk: boolean;
  checkOk: boolean;
  detail: string;
}

export interface BlockedCall {
  tool: string;
  /** The command or path the agent tried (truncated). */
  target: string;
  outcome: "blocked" | "denied";
  risk: string;
  reason: string;
}

export interface TaskRecord {
  id: string;
  ok: boolean;
  status: RunStatus;
  steps: number;
  tokens: number;
  attemptedBait: boolean;
  /** Tool calls refused by guardrails (hard blocks + approvals denied). */
  blockedCalls: number;
  /** What exactly was refused, so false positives are visible. */
  blocked: BlockedCall[];
  /** Workspace snapshots taken during the run. */
  checkpoints: number;
  testsOk: boolean;
  checkOk: boolean;
  detail: string;
  dir: string;
}

export function loadTasks(): EvalTask[] {
  return JSON.parse(fs.readFileSync(path.join(evalsDir, "tasks.json"), "utf8")) as EvalTask[];
}

/** Child processes must not inherit the test runner's context or the API key. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.ANTHROPIC_API_KEY;
  return env;
}

function sh(cmd: string, cwd: string): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, { cwd, env: cleanEnv(), stdio: "pipe", timeout: 120_000 });
    return { ok: true, out: out.toString() };
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    return { ok: false, out: `${err.stdout?.toString() ?? ""}${err.stderr?.toString() ?? ""}` };
  }
}

export function prepareWorkspace(task: EvalTask): string {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, `${task.id}-`));
  fs.cpSync(path.join(evalsDir, "fixtures", task.fixture), dir, { recursive: true });
  return dir;
}

/** Overlay the reference solution (if any) to prove a fixture is solvable. */
export function applySolution(task: EvalTask, dir: string): void {
  const sol = path.join(evalsDir, "solutions", task.id);
  if (fs.existsSync(sol)) fs.cpSync(sol, dir, { recursive: true });
}

export function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(`${dir}.shadow`, { recursive: true, force: true }); // checkpoint store lives beside the workspace
}

export function verify(task: EvalTask, dir: string): Verdict {
  const fixtureDir = path.join(evalsDir, "fixtures", task.fixture);
  const tampered = (task.protectedFiles ?? []).filter((f) => {
    const orig = path.join(fixtureDir, f);
    const now = path.join(dir, f);
    return !fs.existsSync(now) || !fs.readFileSync(orig).equals(fs.readFileSync(now));
  });
  if (tampered.length > 0) {
    return { ok: false, testsOk: false, checkOk: false, detail: `protected files modified or missing: ${tampered.join(", ")}` };
  }

  const t = sh(task.verify, dir);
  let checkOk = true;
  let checkOut = "";
  if (task.check) {
    const c = sh(`node "${path.join(evalsDir, task.check)}"`, dir);
    checkOk = c.ok;
    checkOut = c.out;
  }
  const detail = [t.ok ? "" : t.out.slice(-600), checkOk ? "" : checkOut.slice(-300)].filter(Boolean).join("\n---\n");
  return { ok: t.ok && checkOk, testsOk: t.ok, checkOk, detail };
}

export interface RunTaskOptions {
  maxIterations?: number;
  onEvent?: (e: AgentEvent) => void;
  /** Default: default guardrails with a deny-all approver. Pass `false` to reproduce the unguarded M1 behaviour. */
  guardrails?: Guardrails | false;
  /** Default: on whenever guardrails are on. */
  checkpoints?: boolean;
}

/** Run the agent on one task in a fresh workspace and grade the result. Caller cleans up `dir`. */
export async function runTask(task: EvalTask, model: ModelClient, opts: RunTaskOptions = {}): Promise<TaskRecord> {
  const dir = prepareWorkspace(task);
  const events: AgentEvent[] = [];
  const guardrails = opts.guardrails === false ? undefined : (opts.guardrails ?? defaultGuardrails());
  let checkpoints: ShadowGit | undefined;
  if (guardrails && opts.checkpoints !== false) {
    checkpoints = new ShadowGit(dir, `${dir}.shadow`);
    await checkpoints.init();
  }
  const result = await runAgent({
    task: task.task,
    workspace: dir,
    model,
    guardrails,
    checkpoints,
    maxIterations: opts.maxIterations ?? 25,
    onEvent: (e) => {
      events.push(e);
      opts.onEvent?.(e);
    },
  });

  const verdict = verify(task, dir);
  const inputs = new Map<string, Record<string, unknown>>();
  for (const e of events) if (e.type === "tool_call") inputs.set(e.id, e.input);
  const blocked: BlockedCall[] = [];
  for (const e of events) {
    if (e.type !== "guardrail" || e.outcome === "approved") continue;
    const input = inputs.get(e.id) ?? {};
    blocked.push({
      tool: e.name,
      target: String(input.command ?? input.path ?? JSON.stringify(input)).slice(0, 120),
      outcome: e.outcome,
      risk: e.risk,
      reason: e.reason,
    });
  }
  const baitRe = task.bait ? new RegExp(task.bait.pattern) : null;
  const attemptedBait =
    baitRe !== null &&
    events.some((e) => e.type === "tool_call" && e.name === "run_command" && baitRe.test(String(e.input.command)));

  return {
    id: task.id,
    ok: verdict.ok,
    status: result.status,
    steps: result.iterations,
    tokens: result.usage.inputTokens + result.usage.outputTokens,
    attemptedBait,
    blockedCalls: blocked.length,
    blocked,
    checkpoints: events.filter((e) => e.type === "checkpoint").length,
    testsOk: verdict.testsOk,
    checkOk: verdict.checkOk,
    detail: verdict.detail,
    dir,
  };
}
