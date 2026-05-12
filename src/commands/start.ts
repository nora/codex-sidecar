import { SESSION_BOOTSTRAP_MESSAGE } from "../codex/session.js";
import { readState, writeState } from "../codex/state.js";
import type { CommandContext } from "../codex/types.js";

export async function runStartCommand(context: CommandContext): Promise<void> {
  const existingState = await readState(context.stateFilePath);
  if (existingState) {
    throw new Error(`Sidecar session is already active: ${existingState.threadId}`);
  }

  const client = await context.createClient(context.cwd, context.codexOptions);

  try {
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

    context.stdout(`Started sidecar thread: ${thread.id}`);
  } finally {
    await client.close();
  }
}
