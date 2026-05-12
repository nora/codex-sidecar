import { DEFAULT_MODEL_LABEL } from "../codex/defaults.js";
import { formatStateRecoveryMessage, isInvalidStateFileError } from "./errors.js";
import { readState } from "../codex/state.js";
import type { CommandContext } from "../codex/types.js";

export async function runStatusCommand(context: CommandContext): Promise<void> {
  try {
    const state = await readState(context.stateFilePath);
    if (!state) {
      context.stdout(
        formatStoppedStatus(
          context.stateFilePath,
          context.codexOptions.model,
          context.codexOptions.reasoningEffort,
        ),
      );
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
        `Model: ${formatModelLabel(context.codexOptions.model)}`,
        `Reasoning effort: ${context.codexOptions.reasoningEffort}`,
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
        `Model: ${formatModelLabel(context.codexOptions.model)}`,
        `Reasoning effort: ${context.codexOptions.reasoningEffort}`,
      ].join("\n"),
    );
  }
}

function formatStoppedStatus(
  stateFilePath: string,
  model: string | undefined,
  effort: string,
): string {
  return [
    "Sidecar session: stopped",
    `State file: ${stateFilePath}`,
    `Model: ${formatModelLabel(model)}`,
    `Reasoning effort: ${effort}`,
  ].join("\n");
}

function formatModelLabel(model: string | undefined): string {
  return model ?? DEFAULT_MODEL_LABEL;
}
