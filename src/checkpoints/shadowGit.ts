import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Checkpointer } from "../types.js";

const execFileP = promisify(execFile);

export interface Checkpoint {
  sha: string;
  date: string;
  label: string;
}

/** Default store lives OUTSIDE the workspace, so it never shows up in the user's git status and the agent can't reach it. */
export function defaultStoreDir(workspace: string): string {
  const id = crypto.createHash("sha1").update(fs.realpathSync(workspace).toLowerCase()).digest("hex").slice(0, 16);
  return path.join(os.homedir(), ".guarded-coding-agent", "checkpoints", id);
}

const EXCLUDES = [".git/", "node_modules/", ".env", ".env.*", ".eval-tmp/"];

/**
 * Workspace snapshots in a private bare-style git repo (separate GIT_DIR, workspace as work tree).
 * The user's own repo and history are never touched.
 */
export class ShadowGit implements Checkpointer {
  private ready = false;

  constructor(
    readonly workspace: string,
    readonly storeDir: string = defaultStoreDir(workspace),
  ) {}

  private async git(args: string[]): Promise<string> {
    const { stdout } = await execFileP("git", ["--git-dir", this.storeDir, "--work-tree", this.workspace, ...args], {
      cwd: this.workspace,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return stdout;
  }

  /** Create/configure the store without committing anything. Safe to call from any process. */
  private async ensureStore(): Promise<void> {
    if (this.ready) return;
    if (!fs.existsSync(path.join(this.storeDir, "HEAD"))) {
      fs.mkdirSync(this.storeDir, { recursive: true });
      await this.git(["init", "--quiet"]);
    }
    for (const [k, v] of [
      ["user.name", "guarded-agent"],
      ["user.email", "agent@localhost"],
      ["core.autocrlf", "false"], // snapshot/restore must be byte-exact
      ["core.safecrlf", "false"],
      ["core.longpaths", "true"],
      ["commit.gpgsign", "false"],
      ["gc.auto", "0"],
    ] as const) {
      await this.git(["config", k, v]);
    }
    fs.mkdirSync(path.join(this.storeDir, "info"), { recursive: true });
    fs.writeFileSync(path.join(this.storeDir, "info", "exclude"), EXCLUDES.join("\n") + "\n");
    this.ready = true;
  }

  /** Prepare the store; takes a "baseline" snapshot only the very first time (never re-snapshots an existing store). */
  async init(): Promise<void> {
    await this.ensureStore();
    if (!(await this.hasHead())) await this.snapshot("baseline");
  }

  private async hasHead(): Promise<boolean> {
    try {
      await this.git(["rev-parse", "--verify", "--quiet", "HEAD"]);
      return true;
    } catch {
      return false;
    }
  }

  /** Commit the current workspace state (if changed) and return the sha that represents it. */
  async snapshot(label: string): Promise<string> {
    await this.ensureStore();
    await this.git(["add", "-A"]);
    const head = await this.hasHead();
    const dirty = (await this.git(["status", "--porcelain"])).trim() !== "";
    if (dirty || !head) {
      await this.git(["commit", "--quiet", "--no-verify", "--allow-empty", "-m", label]);
    }
    return (await this.git(["rev-parse", "HEAD"])).trim();
  }

  async list(): Promise<Checkpoint[]> {
    if (!fs.existsSync(path.join(this.storeDir, "HEAD"))) return [];
    await this.ensureStore();
    if (!(await this.hasHead())) return [];
    const out = await this.git(["log", "--format=%H%x1f%aI%x1f%s"]);
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, date, label] = line.split("\x1f");
        return { sha: sha!, date: date!, label: label ?? "" };
      });
  }

  private async resolve(ref: string): Promise<string> {
    if (ref === "last") return (await this.git(["rev-parse", "HEAD"])).trim();
    if (ref === "first") {
      const roots = (await this.git(["rev-list", "--max-parents=0", "HEAD"])).trim().split("\n");
      return roots.at(-1)!;
    }
    if (!/^[0-9a-f]{4,40}$/i.test(ref)) throw new Error(`Unknown checkpoint "${ref}" (use a sha, "last" or "first")`);
    return (await this.git(["rev-parse", "--verify", `${ref}^{commit}`])).trim();
  }

  /**
   * Restore the workspace to a checkpoint. The current state is snapshotted first,
   * so a rollback can itself be undone. Returns the sha restored to.
   */
  async rollback(ref: string = "last"): Promise<string> {
    await this.ensureStore();
    if (!(await this.hasHead())) throw new Error("No checkpoints exist for this workspace yet.");
    const target = await this.resolve(ref);
    await this.snapshot("pre-rollback");
    await this.git(["read-tree", "--reset", "-u", target]);
    await this.git(["clean", "-fd"]);
    await this.snapshot(`rollback to ${target.slice(0, 7)}`);
    return target;
  }
}
