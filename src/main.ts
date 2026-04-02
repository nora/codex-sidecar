import { runAskCommand } from "./commands/ask.js";
import { runResetCommand } from "./commands/reset.js";
import { runStartCommand } from "./commands/start.js";
import { runStatusCommand } from "./commands/status.js";
import { runStopCommand } from "./commands/stop.js";
import { createAppServerClient } from "./codex/app-server-client.js";
import { getDefaultStateFilePath } from "./codex/state.js";
import type { CommandContext } from "./codex/types.js";

export function getUsageText(): string {
  return `Usage: codex-sidecar <command> [args]

Commands:
  start           Create and save a new Codex sidecar thread
  ask <message>   Send a message to the active Codex thread
  status          Show current sidecar state and default model settings
  reset           Archive the current thread and create a new one
  stop            Archive the current thread and clear local state`;
}

interface RunCliOptions {
  context?: Partial<CommandContext>;
}

export async function runCli(argv: readonly string[], options: RunCliOptions = {}): Promise<void> {
  const context = createCommandContext(options.context);
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [command = "help", ...rest] = normalizedArgv;

  try {
    switch (command) {
      case "start":
        await runStartCommand(context);
        return;

      case "ask":
        await runAskCommand(context, rest.join(" "));
        return;

      case "reset":
        await runResetCommand(context);
        return;

      case "status":
        await runStatusCommand(context);
        return;

      case "stop":
        await runStopCommand(context);
        return;

      default:
        context.stdout(getUsageText());
    }
  } catch (error) {
    context.stderr(getErrorMessage(error));
    process.exitCode = 1;
  }
}

function createCommandContext(overrides: Partial<CommandContext> | undefined): CommandContext {
  const cwd = overrides?.cwd ?? process.cwd();

  return {
    cwd,
    now: overrides?.now ?? (() => new Date()),
    stateFilePath: overrides?.stateFilePath ?? getDefaultStateFilePath(cwd),
    stdout: overrides?.stdout ?? console.log,
    stderr: overrides?.stderr ?? console.error,
    createClient: overrides?.createClient ?? createAppServerClient,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
