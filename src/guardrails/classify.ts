import type { Risk } from "../types.js";
import { isSecretPath, referencesSecret } from "./secrets.js";

export interface Classification {
  risk: Risk;
  reason: string;
  /** Hard block: never offered for approval. */
  deny?: boolean;
}

// Plain code, never the LLM. Heuristics are a safety net; the real boundary is a sandbox (M4).

const START = String.raw`(?:^|[\s;&|("'\x60])`;
const IRREVERSIBLE: Array<[RegExp, string]> = [
  [new RegExp(`${START}rm\\s+(?:-[a-zA-Z]*[rRf][a-zA-Z]*|--recursive|--force)`), "recursive/forced file deletion"],
  [new RegExp(`${START}(?:rmdir|rd)\\s+/s`, "i"), "recursive directory deletion"],
  [new RegExp(`${START}del\\s+(?:/[sfq]\\s*)+`, "i"), "forced file deletion"],
  [/Remove-Item\b[^|;]*-Recurse/i, "recursive directory deletion"],
  [/\bfind\b[^|;]*\s-delete\b/, "find -delete"],
  [/\bshred\b|\bmkfs\b|\bdd\s+[^|;]*of=/, "disk/file overwrite"],
  [/\bgit\s+push\b/, "git push publishes to a remote"],
  [/\bgit\s+reset\s+[^|;]*--hard\b/, "git reset --hard discards work"],
  [/\bgit\s+clean\b/, "git clean deletes untracked files"],
  [/\bgit\s+branch\s+[^|;]*-D\b/, "force-deleting a branch"],
  [/\bgit\s+(?:rebase|filter-branch|update-ref|reflog\s+expire|gc\s+[^|;]*--prune)\b/, "rewrites git history"],
  [/\bgit\s+stash\s+(?:drop|clear)\b/, "dropping stashes"],
  [/\b(?:drop|truncate)\s+(?:table|database|schema)\b/i, "destructive SQL"],
  [/\bdelete\s+from\b/i, "destructive SQL"],
  [/\bnpm\s+(?:publish|unpublish|deprecate)\b/, "publishes/changes a package"],
  [/\bnpm\s+(?:i|install|add)\s+[^|;]*(?:-g\b|--global\b)/, "global install"],
  [/\bdocker\s+push\b|\bkubectl\s+delete\b|\bterraform\s+(?:destroy|apply)\b|\bgh\s+repo\s+delete\b/, "changes remote infrastructure"],
  [/\bsudo\b|\bchmod\s+-R\b|\bchown\s+-R\b|\bshutdown\b|\breboot\b/, "privileged or system-wide change"],
  [/\b(?:curl|wget|iwr|Invoke-WebRequest)\b[^;]*\|\s*(?:sh|bash|zsh|node|python3?|iex|Invoke-Expression)\b/i, "pipes a download into an interpreter"],
];

const PROTECTED_WRITE = /^(?:\.\/)?\.git(?:\/|$)/i;

export function classifyToolCall(name: string, input: Record<string, unknown>): Classification {
  switch (name) {
    case "read_file":
    case "search": {
      const p = String(input.path ?? "");
      if (name === "read_file" && isSecretPath(p)) return deny("secret/credential file");
      return { risk: "read", reason: "read-only" };
    }
    case "edit_file": {
      const p = String(input.path ?? "").replace(/\\/g, "/");
      if (isSecretPath(p)) return deny("secret/credential file");
      if (PROTECTED_WRITE.test(p)) return deny("writes inside .git are blocked");
      return { risk: "reversible", reason: "workspace edit (checkpointed)" };
    }
    case "run_command":
      return classifyCommand(String(input.command ?? ""));
    default:
      return { risk: "reversible", reason: `unknown tool "${name}"` };
  }
}

function deny(reason: string): Classification {
  return { risk: "irreversible", reason, deny: true };
}

export function classifyCommand(command: string): Classification {
  if (referencesSecret(command)) return deny("command references a secret/credential file");
  for (const [re, why] of IRREVERSIBLE) {
    if (re.test(command)) return { risk: "irreversible", reason: why };
  }
  if (isSimple(command) && splitSegments(command).every((s) => matchesAny(s, READ_ONLY) || isStdinFilter(s))) {
    return { risk: "read", reason: "read-only command" };
  }
  return { risk: "reversible", reason: "shell command" };
}

// ---- shell helpers shared with the policy ----

/** Commands that only look at things. */
export const READ_ONLY = ["ls", "dir", "pwd", "cd", "git status", "git diff", "git log", "git show", "git rev-parse", "git ls-files"];

const ENV_ASSIGN = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/;

/**
 * `grep` used as an output filter: safe flags, exactly ONE pattern, no file arguments.
 * The pattern must be a plain word or a double-quoted string with no $ ` \\ % or '. Those are inert in both
 * POSIX shells and cmd.exe (which does not treat single quotes as quotes, so those stay unsupported).
 * `-r`, `-R`, `-f`, `-e` are deliberately not in the flag set: they read files.
 * The pattern is folded to a placeholder so a `|` inside quotes is not mistaken for a pipe.
 */
const GREP_FILTER = /\bgrep((?:\s+-[EFivcnwxoqsh]+)*)\s+(?:"[^"$`\\%']*"|[\w.-]+)(?=\s*(?:$|[|;&]))/g;

function prepare(command: string): string {
  return command.replace(/2>&1/g, "").replace(GREP_FILTER, (_m, flags: string) => `grep${flags} __PAT__`);
}

export function splitSegments(command: string): string[] {
  return prepare(command)
    .split(/&&|\|\||;|\||\n/)
    .map((s) => s.trim().replace(ENV_ASSIGN, ""))
    .filter(Boolean);
}

/** No redirects, backgrounding, command substitution: only plain `a && b | c` chains. */
export function isSimple(command: string): boolean {
  return !/[<>`&]|\$\(|\$\{/.test(prepare(command).replace(/&&/g, ""));
}

/**
 * `head`/`tail`/`wc` with only flags and numbers (e.g. `head -50`, `tail -n 30`, `wc -l`),
 * or a folded `grep` filter (see GREP_FILTER).
 * With no file arguments they can only filter piped output, so `npm test 2>&1 | head -50` is fine
 * while `head .env` or `head secrets.txt` is not.
 */
export function isStdinFilter(segment: string): boolean {
  const s = segment.trim();
  return /^(?:head|tail|wc)(?:\s+(?:-[A-Za-z0-9]+|\d+))*$/.test(s) || /^grep(?:\s+-[EFivcnwxoqsh]+)*\s+__PAT__$/.test(s);
}

export function matchesAny(segment: string, prefixes: string[]): boolean {
  const s = segment.replace(/\s+/g, " ");
  return prefixes.some((p) => s === p || s.startsWith(p + " "));
}
