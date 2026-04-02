import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deleteState, getDefaultStateFilePath, readState, writeState } from "./state.js";

describe("state helpers", () => {
  it("default state path を返す", () => {
    expect(getDefaultStateFilePath("/repo")).toBe(
      path.join("/repo", ".agents", "state", "codex-sidecar.json"),
    );
  });

  it("missing file は null を返す", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-state-"));
    const stateFilePath = path.join(directory, "missing.json");

    await expect(readState(stateFilePath)).resolves.toBeNull();
  });

  it("state を保存して読み戻せる", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-state-"));
    const stateFilePath = path.join(directory, "state.json");

    await writeState(stateFilePath, {
      version: 1,
      threadId: "thr_1",
      threadPath: "/tmp/thr_1.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:05:00.000Z",
    });

    await expect(readState(stateFilePath)).resolves.toEqual({
      version: 1,
      threadId: "thr_1",
      threadPath: "/tmp/thr_1.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:05:00.000Z",
    });

    await deleteState(stateFilePath);
    await expect(readState(stateFilePath)).resolves.toBeNull();
  });

  it("invalid state file はエラーにする", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-state-"));
    const stateFilePath = path.join(directory, "state.json");

    await writeFile(
      stateFilePath,
      JSON.stringify({
        version: 1,
        threadId: 1,
      }),
      "utf8",
    );

    await expect(readState(stateFilePath)).rejects.toThrow(
      `Invalid sidecar state file: ${stateFilePath}: missing required fields`,
    );
  });

  it("object 以外は expected object エラーにする", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-state-"));
    const stateFilePath = path.join(directory, "state.json");

    await writeFile(stateFilePath, JSON.stringify("invalid"), "utf8");

    await expect(readState(stateFilePath)).rejects.toThrow(
      `Invalid sidecar state file: ${stateFilePath}: expected object`,
    );
  });

  it("unsupported version はエラーにする", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-state-"));
    const stateFilePath = path.join(directory, "state.json");

    await writeFile(
      stateFilePath,
      JSON.stringify({
        version: 2,
        threadId: "thr_1",
        threadPath: null,
        cwd: "/repo",
        startedAt: "2026-04-02T01:00:00.000Z",
        updatedAt: "2026-04-02T01:05:00.000Z",
      }),
      "utf8",
    );

    await expect(readState(stateFilePath)).rejects.toThrow(
      `Invalid sidecar state file: ${stateFilePath}: unsupported version`,
    );
  });

  it("invalid JSON は invalid JSON エラーにする", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-state-"));
    const stateFilePath = path.join(directory, "state.json");

    await writeFile(stateFilePath, "{", "utf8");

    await expect(readState(stateFilePath)).rejects.toThrow(
      `Invalid sidecar state file: ${stateFilePath}: invalid JSON`,
    );
  });
});
