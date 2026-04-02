import { DEFAULT_MODEL, DEFAULT_REASONING_EFFORT } from "../codex/defaults.js";
import { formatStateRecoveryMessage, isInvalidStateFileError } from "./errors.js";
import { readState } from "../codex/state.js";
import type { CommandContext } from "../codex/types.js";

export async function runStatusCommand(context: CommandContext): Promise<void> {
  try {
    const state = await readState(context.stateFilePath);
    if (!state) {
      context.stdout(formatStoppedStatus(context.stateFilePath));
      return;
    }

    context.stdout(
      [
        "Sidecar session: active",
        `Thread ID: ${state.threadId}`,
        `Thread path: ${state.threadPath ?? "(none)"}`,
        `Thread cwd: ${state.cwd}`,
        `Started at: ${state.startedAt}`,
        `Updated at: ${state.updatedAt}`,
        `State file: ${context.stateFilePath}`,
        `Default model: ${DEFAULT_MODEL}`,
        `Default reasoning effort: ${DEFAULT_REASONING_EFFORT}`,
      ].join("\n"),
    );
  } catch (error) {
    if (!isInvalidStateFileError(error)) {
      throw error;
    }

    context.stdout(
      [
        "Sidecar session: invalid-state",
        `State file: ${context.stateFilePath}`,
        formatStateRecoveryMessage(error),
        `Default model: ${DEFAULT_MODEL}`,
        `Default reasoning effort: ${DEFAULT_REASONING_EFFORT}`,
      ].join("\n"),
    );
  }
}

function formatStoppedStatus(stateFilePath: string): string {
  return [
    "Sidecar session: stopped",
    `State file: ${stateFilePath}`,
    `Default model: ${DEFAULT_MODEL}`,
    `Default reasoning effort: ${DEFAULT_REASONING_EFFORT}`,
  ].join("\n");
}
