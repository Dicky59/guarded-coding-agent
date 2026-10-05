# Guardrails & checkpoints (M2)

The model proposes; **plain code** decides. Nothing in `src/guardrails/` calls an LLM.

## Decision flow for every tool call

```
tool call ─► classify (risk) ─► policy ─► allow ─────────────► checkpoint (if not read-only) ─► run
                                   ├────► ask ─► approver ─► yes ─┘
                                   │                    └─► no  ─► error result back to the model
                                   └────► deny ───────────────────► error result back to the model
```

Refusals are returned to the model as tool errors (the loop recovers and can pick another route). Repeating a refused call trips the stuck detector.

## Risk classes

| Risk | Examples | Default decision |
|------|----------|------------------|
| read | `read_file`, `search`, `ls`, `git status/diff/log/show` | allow |
| reversible | `edit_file`, build/test commands, unknown shell commands | allow if on the allow-list, otherwise **ask** |
| irreversible | `rm -rf`, `git push`, `git reset --hard`, `git clean`, destructive SQL, `npm publish`, global installs, `sudo`, `curl … \| sh`, … | **ask**, always (the allow-list can't override it) |
| secret | `.env*` (not `.env.example`), `~/.ssh`, `~/.aws`, private keys, `.npmrc` | **deny** (never offered for approval) |

Default allow-list: `npm test`, `npm run test|build|lint|typecheck`, `npx tsc`, `node --test`.
Output filters are allowed when they can only read piped output: `head`, `tail`, `wc` with only flags and numbers, and `grep` with safe flags and exactly one pattern (a plain word or a double-quoted string). So `npm test 2>&1 | grep -E "(pass|fail)"` runs freely, while `head file.txt`, `grep foo file.txt`, `grep -r` and `grep -f` still ask. Single-quoted patterns are not accepted because `cmd.exe` doesn't treat single quotes as quoting.
Commands with redirects, backgrounding or `$(…)` substitution are never auto-allowed.
Writes inside `.git/` are denied (hook injection). `search` skips secret files entirely.

## Approvals

- CLI: interactive `y/N` per action. `--approve-reversible` auto-approves non-destructive asks, never destructive ones. Non-interactive stdin means refuse.
- Evals / library default: deny-all, so every refused attempt is recorded (`blocked=N`).

## Checkpoints

Before every non-read action the workspace is snapshotted into a private git repo stored **outside** the workspace (`~/.guarded-coding-agent/checkpoints/<hash>`), so it never appears in your `git status` and the agent can't reach it. If a snapshot fails the action is refused (fail closed). `node_modules`, `.git`, `.env*` are excluded; snapshots are byte-exact (no CRLF conversion).

```bash
agent -w <dir> --checkpoints                 # list
agent -w <dir> --rollback last               # undo the most recent action
agent -w <dir> --rollback <sha>              # go back to a specific point
```

A rollback snapshots the current state first, so it can be undone too.

## Honest limits

- The classifier is a **heuristic safety net**. A shell can express the same action in countless ways (`node -e`, scripts, encodings), which is why anything unrecognised *asks* rather than being allowed.
- Approved commands run with your permissions. Checkpoints cover the workspace only: not files outside it, not excluded files, not remote side effects (a pushed commit stays pushed).
- Real isolation (container, no network, no host env) is M4.
