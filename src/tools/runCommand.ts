import { spawn, spawnSync } from "node:child_process";
import { truncate } from "../paths.js";
import type { Tool } from "../types.js";

function killTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"]);
  } else {
    try {
      process.kill(-pid, "SIGKILL"); // negative pid = whole process group
    } catch {
      /* already gone */
    }
  }
}

/** Don't leak a parent test-runner's context into commands the agent runs (it makes nested `node --test` always exit 0). */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.ANTHROPIC_API_KEY;
  return env;
}

export const runCommand: Tool = {
  definition: {
    name: "run_command",
    description:
      "Run a shell command with the workspace as the working directory (build, tests, installs). Returns exit code and combined output. Commands are killed after a timeout.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
  run(input, ctx) {
    const command = String(input.command);
    return new Promise((resolve) => {
      const child = spawn(command, {
        cwd: ctx.workspace,
        env: childEnv(),
        shell: true,
        detached: process.platform !== "win32", // own process group so we can kill the tree
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let timedOut = false;
      const onData = (d: Buffer) => {
        output += d.toString();
        if (output.length > 200_000) output = output.slice(-100_000); // bound memory
      };
      child.stdout!.on("data", onData);
      child.stderr!.on("data", onData);

      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) killTree(child.pid);
      }, ctx.commandTimeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ content: `Failed to start command: ${err.message}`, isError: true });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          resolve({
            content: truncate(`${output}\n[killed: command exceeded ${ctx.commandTimeoutMs}ms timeout]`),
            isError: true,
          });
          return;
        }
        resolve({
          content: truncate(`exit code: ${code}\n${output}`),
          isError: code !== 0,
        });
      });
    });
  },
};
