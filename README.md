# guarded-coding-agent

A minimal Claude-Code-style coding agent, built by hand to understand the architecture:
the model proposes tool calls; **the system** decides what runs, bounds the blast radius, and decides when to stop.

## Status: M1 (agent loop)

- Hand-built orchestrator loop (`src/orchestrator/loop.ts`), no agent framework
- Tools: `read_file`, `search`, `edit_file` (unique-match, atomic write), `run_command`
- Loop safety: iteration cap, identical-tool-call detection, per-command timeout with process-tree kill
- Workspace confinement for all file paths
- Provider-agnostic `ModelClient` interface (Anthropic adapter included; gateway/failover comes in M4)
- Stable system-prompt prefix with `cache_control` for prompt caching
- Tests run against a scripted model, so no API key is needed

## Run

```bash
npm install
npm test                         # offline, scripted-model tests
export ANTHROPIC_API_KEY=...
npm run eval                     # real model vs. fixture repos in evals/
npm start -- -w path/to/repo "Fix the failing tests"
```

`AGENT_MODEL` overrides the default model id.

## Roadmap

| Milestone | Scope |
|-----------|-------|
| M2 | Guardrails: read-only / reversible / irreversible classification (plain code, never the LLM), human approval, shadow-git checkpoints + `rollback`, symlink-safe paths |
| M3 | Repo map, explore subagent (returns summary only), context compaction |
| M4 | Model gateway with provider failover, Docker sandbox for `run_command`, session-replay dashboard |

## Known M1 limits (by design)

`run_command` executes directly on the host with your permissions. Only run it on throwaway or version-controlled workspaces until M2 lands.
