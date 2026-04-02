import { formatArchiveWarning, formatStateRecoveryMessage } from "./errors.js";
import { deleteState, isInvalidStateFileError, readState } from "../codex/state.js";
import type { CommandContext } from "../codex/types.js";

type StopSourceState =
  | { kind: "active"; threadId: string }
  | { kind: "invalid" }
  | { kind: "missing" };

export async function runStopCommand(context: CommandContext): Promise<void> {
  const state = await readStateForStop(context);
  if (state.kind === "missing") {
    context.stdout("No active sidecar session.");
    return;
  }

  if (state.kind === "active") {
    const client = await context.createClient(context.cwd);

    try {
      try {
        await client.archiveThread(state.threadId);
      } catch (error) {
        context.stderr(formatArchiveWarning(state.threadId, error));
      }
    } finally {
      await client.close();
    }
  }

  await deleteState(context.stateFilePath);
  context.stdout("Stopped sidecar session.");
}

async function readStateForStop(context: CommandContext): Promise<StopSourceState> {
  try {
    const state = await readState(context.stateFilePath);
    if (!state) {
      return { kind: "missing" };
    }

    return { kind: "active", threadId: state.threadId };
  } catch (error) {
    if (!isInvalidStateFileError(error)) {
      throw error;
    }

    context.stderr(formatStateRecoveryMessage(error));
    return { kind: "invalid" };
  }
}
