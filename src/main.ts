import { runAskCommand } from "./commands/ask.js";
import { runResetCommand } from "./commands/reset.js";
import { runStartCommand } from "./commands/start.js";
import { runStatusCommand } from "./commands/status.js";
import { runStopCommand } from "./commands/stop.js";
import { createAppServerClient } from "./codex/app-server-client.js";
import { DEFAULT_REASONING_EFFORT } from "./codex/defaults.js";
import { getDefaultStateFilePath } from "./codex/state.js";
import type { CodexClientOptions, CommandContext } from "./codex/types.js";

export function getUsageText(): string {
  return `Usage: codex-sidecar [--model <model>] [--effort <effort>] <command> [args]

Commands:
  start           Create and save a new Codex sidecar thread
  ask <message>   Send a message to the active Codex thread
  status          Show current sidecar state and effective model settings
  reset           Archive the current thread and create a new one
  stop            Archive the current thread and clear local state

Options:
  -m, --model <model>       Model to pass to Codex. Use "latest" to use the Codex CLI default.
      --effort <effort>     Reasoning effort for turns. Default: high`;
}

interface RunCliOptions {
  context?: Partial<CommandContext>;
}

export async function runCli(argv: readonly string[], options: RunCliOptions = {}): Promise<void> {
  let context = createCommandContext(options.context, {
    options: {},
    modelSpecified: false,
  });

  try {
    const parsed = parseCliArgs(argv);
    context = createCommandContext(options.context, parsed);
    const [command = "help", ...rest] = parsed.commandArgs;

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

interface ParsedCliArgs {
  commandArgs: readonly string[];
  options: Partial<CodexClientOptions>;
  modelSpecified: boolean;
}

function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const options: Partial<CodexClientOptions> = {};
  let modelSpecified = false;
  let index = 0;

  while (index < args.length) {
    const arg = args[index];
    if (arg === undefined) {
      break;
    }

    if (arg === "--") {
      index += 1;
      break;
    }

    if (arg === "-m" || arg === "--model") {
      const value = readOptionValue(args, index, arg);
      modelSpecified = true;
      setModelOption(options, value);
      index += 2;
      continue;
    }

    if (arg.startsWith("--model=")) {
      modelSpecified = true;
      setModelOption(options, arg.slice("--model=".length));
      index += 1;
      continue;
    }

    if (arg === "--effort" || arg === "--reasoning-effort") {
      options.reasoningEffort = readNonEmptyOptionValue(args, index, arg);
      index += 2;
      continue;
    }

    if (arg.startsWith("--effort=")) {
      options.reasoningEffort = normalizeNonEmptyOptionValue(arg.slice("--effort=".length), arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--reasoning-effort=")) {
      options.reasoningEffort = normalizeNonEmptyOptionValue(
        arg.slice("--reasoning-effort=".length),
        arg,
      );
      index += 1;
      continue;
    }

    break;
  }

  return {
    commandArgs: args.slice(index),
    options,
    modelSpecified,
  };
}

function readOptionValue(args: readonly string[], index: number, name: string): string {
  const value = args[index + 1];
  if (value === undefined || value === "--") {
    throw new Error(`Missing value for ${name}`);
  }

  return value;
}

function readNonEmptyOptionValue(args: readonly string[], index: number, name: string): string {
  return normalizeNonEmptyOptionValue(readOptionValue(args, index, name), name);
}

function normalizeNonEmptyOptionValue(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Missing value for ${name}`);
  }

  return normalized;
}

function normalizeModelOption(value: string): string | undefined {
  const model = normalizeNonEmptyOptionValue(value, "--model");
  return model === "latest" ? undefined : model;
}

function setModelOption(options: Partial<CodexClientOptions>, value: string): void {
  const model = normalizeModelOption(value);
  if (model) {
    options.model = model;
    return;
  }

  delete options.model;
}

function createCommandContext(
  overrides: Partial<CommandContext> | undefined,
  cliOptions: Pick<ParsedCliArgs, "modelSpecified" | "options">,
): CommandContext {
  const cwd = overrides?.cwd ?? process.cwd();
  const model =
    cliOptions.modelSpecified === true
      ? cliOptions.options.model
      : (cliOptions.options.model ?? overrides?.codexOptions?.model);
  const reasoningEffort =
    cliOptions.options.reasoningEffort ??
    overrides?.codexOptions?.reasoningEffort ??
    DEFAULT_REASONING_EFFORT;

  return {
    cwd,
    now: overrides?.now ?? (() => new Date()),
    stateFilePath: overrides?.stateFilePath ?? getDefaultStateFilePath(cwd),
    codexOptions: {
      ...(model ? { model } : {}),
      reasoningEffort,
    },
    stdout: overrides?.stdout ?? console.log,
    stderr: overrides?.stderr ?? console.error,
    createClient: overrides?.createClient ?? createAppServerClient,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
