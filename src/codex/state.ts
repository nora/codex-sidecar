import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SidecarState } from "./types.js";

export class InvalidStateFileError extends Error {
  constructor(
    readonly stateFilePath: string,
    message: string,
  ) {
    super(`Invalid sidecar state file: ${stateFilePath}: ${message}`);
    this.name = "InvalidStateFileError";
  }
}

export function isInvalidStateFileError(error: unknown): error is InvalidStateFileError {
  return error instanceof InvalidStateFileError;
}

export function getDefaultStateFilePath(cwd: string): string {
  return path.join(cwd, ".agents", "state", "codex-sidecar.json");
}

export async function readState(stateFilePath: string): Promise<SidecarState | null> {
  try {
    const raw = await readFile(stateFilePath, "utf8");
    return validateState(stateFilePath, JSON.parse(raw));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new InvalidStateFileError(stateFilePath, "invalid JSON");
    }

    throw error;
  }
}

export async function writeState(stateFilePath: string, state: SidecarState): Promise<void> {
  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(stateFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function deleteState(stateFilePath: string): Promise<void> {
  await rm(stateFilePath, { force: true });
}

function validateState(stateFilePath: string, value: unknown): SidecarState {
  if (!isRecord(value)) {
    throw new InvalidStateFileError(stateFilePath, "expected object");
  }

  const { version, threadId, threadPath, cwd, startedAt, updatedAt } = value;

  if (version !== 1) {
    throw new InvalidStateFileError(stateFilePath, "unsupported version");
  }

  if (
    typeof threadId !== "string" ||
    (threadPath !== null && typeof threadPath !== "string") ||
    typeof cwd !== "string" ||
    typeof startedAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    throw new InvalidStateFileError(stateFilePath, "missing required fields");
  }

  return {
    version,
    threadId,
    threadPath,
    cwd,
    startedAt,
    updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
