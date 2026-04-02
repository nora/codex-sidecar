import { formatResumeFailureMessage, readStateWithRecoveryHint } from "./errors.js";
import { writeState } from "../codex/state.js";
import type { CodexClient, CommandContext } from "../codex/types.js";

export async function runAskCommand(context: CommandContext, message: string): Promise<void> {
  if (!message.trim()) {
    throw new Error("Usage: codex-sidecar ask <message>");
  }

  const state = await readStateWithRecoveryHint(context.stateFilePath);
  if (!state) {
    throw new Error("Sidecar session is not started. Run `codex-sidecar start`.");
  }

  const client = await context.createClient(context.cwd);

  try {
    const thread = await resumeThreadWithRecoveryHint(client, state.threadId, state.threadPath);
    const turn = await client.startTurn(thread.id, message);

    await writeState(context.stateFilePath, {
      ...state,
      threadPath: thread.path,
      cwd: thread.cwd,
      updatedAt: context.now().toISOString(),
    });

    if (turn.status !== "completed") {
      throw new Error(turn.errorMessage ?? `Turn ended with status: ${turn.status}`);
    }

    context.stdout(turn.message);
  } finally {
    await client.close();
  }
}

async function resumeThreadWithRecoveryHint(
  client: CodexClient,
  threadId: string,
  threadPath: string | null,
) {
  try {
    return await client.resumeThread(threadId, threadPath);
  } catch (error) {
    throw new Error(formatResumeFailureMessage(threadId, threadPath, error));
  }
}
