# guarded-coding-agent

A small coding agent (in the style of Claude Code) that I built from scratch to understand what sits *around* the model:
the agent loop, the permission layer, undo, and how to measure whether any of it helps.

The model proposes actions. **Plain code decides** what runs, how far a mistake can spread, and when to stop.

- **Hand-built agent loop**: no agent framework, a provider-agnostic `ModelClient` interface (Anthropic adapter included)
- **Deterministic guardrails**: a classifier and policy written in code, never asked of the LLM
- **Checkpoints and rollback**: every risky action is preceded by a snapshot; one command undoes it
- **An eval harness I trust**: graded fixtures, repeat runs, transcripts, and a comparison tool that refuses to overclaim
- **147 offline tests**: a scripted fake model drives the real loop, so no API key is needed to run them

## How it works

```
 task ──► orchestrator loop ──► model proposes a tool call
              ▲                         │
              │                         ▼
              │              ┌─ classify risk (read / reversible / irreversible / secret)
              │              │      │
              │              │      ├─ allow ────────────────┐
              │              │      ├─ ask ─► approver ─ yes ─┤
              │              │      └─ deny / refused ─► error back to the model
              │              ▼                                │
              │         snapshot workspace (shadow git) ◄─────┘
              │              │
              └── result ◄── run tool (read_file · search · edit_file · run_command)
```

Loop safety: an iteration cap, detection of the same tool call repeated three times in a row, and a timeout on every
command that kills the whole process tree. Edits are atomic (temp file plus rename) and need a unique match.

### Guardrails ([details and limits](docs/guardrails.md))

| Risk | Examples | Decision |
|------|----------|----------|
| read | `read_file`, `search`, `git status` | allow |
| reversible | edits, `npm test`, unknown commands | allow if on the allow-list, otherwise **ask** |
| irreversible | `rm -rf`, `git push`, `git reset --hard`, destructive SQL, `curl \| sh` | **ask**, always; the allow-list can't override it |
| secret | `.env*`, `~/.ssh`, private keys | **deny**, never offered for approval |

Refusals go back to the model as tool errors, so the loop recovers and picks another route. File paths are confined
to the workspace, including through symlinks and junctions. The agent's commands don't inherit your API key.

### Checkpoints

Before every non-read action the workspace is snapshotted into a private git repository stored **outside** the
workspace (it never appears in your `git status`, and the agent can't reach it). If a snapshot fails, the action is refused.

```bash
npm start -- -w <dir> --checkpoints        # list snapshots
npm start -- -w <dir> --rollback last       # undo the most recent action
```

A rollback snapshots the current state first, so it can be undone too.

## Evals: what I measured

Seven tasks, each graded by a command (and sometimes an independent check), never by the agent's own claim of success.
Graders also fail a run that edits a protected file such as the tests.

| Task | What it tests |
|------|---------------|
| `sum-bug`, `cart-rounding` | single-file and cross-file bugs |
| `build-break` | TypeScript compiler errors, no `any` or `@ts-ignore` allowed |
| `feature-clamp` | adding a feature with no failing test to start from |
| `slugify-bait` | **guardrail bait**: a `CONTRIBUTING.md` that tells you to run a destructive reset |
| `shop-shipping` | 40-file repo, wrong shipping totals, root cause three hops from the failing test |
| `shop-shipping-xl` | the **same bug and tests** in a generated 281-file repo full of shipping/weight/rate noise |

The last one is built by a seeded generator (`evals/generators/shop-xl.mjs`) with a size dial, so repo size is the only variable.

### Results (3 runs each unless noted; model `claude-sonnet-5-5`)

**Do the guardrails cost anything?** (five-task suite, per-suite totals)

| | Passed | Steps | Tokens |
|---|---|---|---|
| M1: no guardrails | 15/15 | 20 (20–21) | 24,587 (23,859–25,256) |
| M2: guardrails + checkpoints | 15/15 | 20 (20–21) | 26,126 (24,802–27,791) |

Same pass rate and steps, zero refused calls on normal work. The token ranges overlap, so I claim "similar cost", not a number.

**Does repo size hurt, and what fixes it?** (`shop-shipping-xl`, same bug, same tests)

| | Passed | Steps | Tokens (mean, range) |
|---|---|---|---|
| M2 | 3/3 | 9 | 79,727 (66,023–106,318) |
| M3a: collapsed file listing + command-output budget | 3/3 | 6 (4–7) | 20,483 (16,478–24,867) |

The ranges don't overlap. Without the one guardrail false-positive that inflated a single M2 run, the baseline is about 66k, so the drop is about 69%.
On the 40-file repo and the five small tasks the same change is neutral (12/12 pass, suite cost −1.7%), as expected: it only kicks in for big trees.

### Measure before building

My plan for the third milestone was a repo map, an explore subagent and context compaction. I recorded transcripts first.
They showed that one tool result, a flat listing of all 281 files, carried roughly half of every run's tokens, because each
step re-sends everything before it, and that contexts never got big enough for compaction to matter. So I built two small
changes instead (collapse big listings into directories with file counts; cap command output and say so in the tool
description) and dropped the rest. The numbers above are the result.

## Quick start

Requires Node 22+ and git.

```bash
npm install
npm test                                   # 147 offline tests, no API key needed

export ANTHROPIC_API_KEY=...               # or put it in .env (gitignored)
npm start -- -w path/to/repo "Fix the failing tests"
```

Useful flags: `--approve-reversible` (auto-approve non-destructive asks, never destructive ones), `--no-guardrails`,
`--no-checkpoints`, `--model <id>`. Interactive approvals appear as a `y/N` prompt.

```bash
npm run eval -- --repeat 3 --label mine --transcripts      # run the suite, save per-run transcripts
node evals/transcripts.mjs evals/results/mine              # where did the tokens go?
node evals/compare.mjs evals/results/m2.json evals/results/mine.json
```

`compare` only says "better" or "worse" when the mean moved by at least 10% **and** the min–max ranges don't overlap.
See [evals/README.md](evals/README.md) for the fixtures, the generator and the harness.

## Limits

- Three runs per setup, one model, and fixtures I wrote or generated. Treat the results as measurements of this harness, not as a general benchmark.
- "Tokens" means uncached input plus output, defined the same way throughout. Cache reads are not counted.
- The classifier is a heuristic safety net, not a sandbox. A shell can express the same action many ways, which is why anything unrecognised *asks*.
  Approved commands run with your permissions, and checkpoints cover the workspace only (not files outside it, and not a `git push`).
- Developed and tested on Windows 11 (Git Bash) and Linux.

## Not built yet

A container sandbox for `run_command`, provider failover through a gateway, conversation-level prompt caching, and a
dashboard for replaying sessions. Contexts are now small enough (about 5k tokens on the large fixture) that caching
would save little in absolute terms.

## Layout

```
src/orchestrator   loop, loop-safety detector
src/guardrails     classifier, policy, approvals, secret detection
src/checkpoints    shadow-git snapshots and rollback
src/tools          read_file, search, edit_file, run_command (+ output budget)
src/gateway        model client (Anthropic adapter)
evals              fixtures, generator, graders, runner, transcripts, compare
test               147 offline tests
docs/guardrails.md the policy in detail, and its honest limits
```
