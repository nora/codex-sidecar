import { formatArchiveWarning, formatStateRecoveryMessage } from "./errors.js";
import { SESSION_BOOTSTRAP_MESSAGE } from "../codex/session.js";
import { isInvalidStateFileError, readState, writeState } from "../codex/state.js";
import type { CommandContext } from "../codex/types.js";

type ResetSourceState =
  | { kind: "active"; threadId: string }
  | { kind: "invalid" }
  | { kind: "missing" };

export async function runResetCommand(context: CommandContext): Promise<void> {
  const existingState = await readExistingState(context);
  if (existingState.kind === "missing") {
    throw new Error("Sidecar session is not started. Run `codex-sidecar start`.");
  }

  const client = await context.createClient(context.cwd, context.codexOptions);

  try {
    if (existingState.kind === "active") {
      try {
        await client.archiveThread(existingState.threadId);
      } catch (error) {
        context.stderr(formatArchiveWarning(existingState.threadId, error));
      }
    }

    const thread = await client.createThread();
    const turn = await client.startTurn(thread.id, SESSION_BOOTSTRAP_MESSAGE);
    if (turn.status !== "completed") {
      throw new Error(turn.errorMessage ?? `Turn ended with status: ${turn.status}`);
    }

    const timestamp = context.now().toISOString();

    await writeState(context.stateFilePath, {
      version: 1,
      threadId: thread.id,
      threadPath: thread.path,
      cwd: thread.cwd,
      startedAt: timestamp,
      updatedAt: timestamp,
    });

    context.stdout(`Reset sidecar thread: ${thread.id}`);
  } finally {
    await client.close();
  }
}

async function readExistingState(context: CommandContext): Promise<ResetSourceState> {
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
