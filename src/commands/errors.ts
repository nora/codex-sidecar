import { InvalidStateFileError, isInvalidStateFileError, readState } from "../codex/state.js";
import type { SidecarState } from "../codex/types.js";

export async function readStateWithRecoveryHint(
  stateFilePath: string,
): Promise<SidecarState | null> {
  try {
    return await readState(stateFilePath);
  } catch (error) {
    if (isInvalidStateFileError(error)) {
      throw new Error(formatStateRecoveryMessage(error));
    }

    throw error;
  }
}

export function formatStateRecoveryMessage(error: InvalidStateFileError): string {
  return [
    error.message,
    "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
  ].join("\n");
}

export function formatResumeFailureMessage(
  threadId: string,
  threadPath: string | null,
  error: unknown,
): string {
  const reason = error instanceof Error ? error.message : String(error);

  return [
    `Failed to resume sidecar thread: ${threadId}`,
    `Thread path: ${threadPath ?? "(none)"}`,
    `Reason: ${reason}`,
    "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
  ].join("\n");
}

export function formatArchiveWarning(threadId: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Archive warning for ${threadId}: ${message}`;
}

export { isInvalidStateFileError };
