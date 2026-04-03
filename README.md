# codex-sidecar

[English](README.md) | [日本語](README_ja.md)

A sidecar CLI that lets Claude Code keep talking to the same Codex thread.

Claude Code is the primary executor. Codex Sidecar is the reviewer / design partner sitting next to it. Repeated `ask` calls from the same project directory continue the same Codex-side context.

## Install

```bash
npm install -g codex-sidecar
npx skills add nora/codex-sidecar
```

Run `npx skills add` from the project root where you want the skill installed. Add `--global` only if you want a global install.

Requirements: Node.js 22+ and OpenAI Codex CLI.

## Use from Claude Code

```text
Use $codex-sidecar to review this design and list the top 3 risks.
```

```text
Use $codex-sidecar to focus on the second risk and suggest the smallest safe fix.
```

The skill calls `codex-sidecar status/start/ask/reset/stop` under the hood.

## CLI

```bash
codex-sidecar start
codex-sidecar ask "Review this implementation and point out likely regressions."
codex-sidecar ask "Continue from your previous answer and propose a minimal fix."
codex-sidecar status
codex-sidecar reset
codex-sidecar ask "Start fresh under this new assumption: ..."
codex-sidecar stop
```

- `start`: create and save a new Codex thread
- `ask <message>`: send a message to the active thread and print Codex's reply
- `status`: show the saved thread state and default model settings
- `reset`: archive the current thread and switch to a new one
- `stop`: archive the current thread and delete local state

## Session model

- State file: `.agents/state/codex-sidecar.json` under each project directory
- Current limit: 1 directory = 1 sidecar session
- Default model: `gpt-5.4`
- Default reasoning effort: `high`
- No daemon: each command launches `codex app-server`, resumes the saved thread, runs one operation, and exits

If `ask` fails with a state/resume error, run `codex-sidecar status`, then `codex-sidecar reset` if needed. Use `codex-sidecar stop` for a hard cleanup.
