import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_BOOTSTRAP_MESSAGE } from "./codex/session.js";
import { runCli, getUsageText } from "./main.js";
import type { CodexClient, CodexThread, CodexTurnResult } from "./codex/types.js";

describe("codex-sidecar CLI", () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it("usage 文字列に主要コマンドが含まれる", () => {
    const usage = getUsageText();

    expect(usage).toContain("codex-sidecar <command>");
    expect(usage).toContain("start");
    expect(usage).toContain("ask <message>");
    expect(usage).toContain("status");
    expect(usage).toContain("reset");
    expect(usage).toContain("stop");
  });

  it("start が thread を作成して state を保存する", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_start",
        path: "/tmp/thr_start.jsonl",
        cwd: "/repo",
      },
    });
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath();

    await runCli(["start"], {
      context: {
        cwd: "/repo",
        now: () => new Date("2026-04-02T01:00:00.000Z"),
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => client,
      },
    });

    expect(stdout).toHaveBeenCalledWith("Started sidecar thread: thr_start");
    expect(client.startTurnCalls).toEqual([
      {
        threadId: "thr_start",
        message: SESSION_BOOTSTRAP_MESSAGE,
      },
    ]);
    expect(await readJsonFile(stateFilePath)).toEqual({
      version: 1,
      threadId: "thr_start",
      threadPath: "/tmp/thr_start.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });
    expect(client.closeCalls).toBe(1);
  });

  it("ask が同じ thread を再利用して最終メッセージを返す", async () => {
    const client = new FakeCodexClient({
      resumeThread: {
        id: "thr_active",
        path: "/tmp/thr_active.jsonl",
        cwd: "/repo",
      },
      startTurn: {
        turnId: "turn_1",
        status: "completed",
        message: "設計の弱点は状態管理の責務がまだ曖昧な点です。",
        errorMessage: null,
      },
    });
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["ask", "この設計の弱点を挙げて"], {
      context: {
        cwd: "/repo",
        now: () => new Date("2026-04-02T01:05:00.000Z"),
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => client,
      },
    });

    expect(client.resumeThreadCalls).toEqual([
      {
        threadId: "thr_active",
        threadPath: "/tmp/thr_active.jsonl",
      },
    ]);
    expect(client.startTurnCalls).toEqual([
      {
        threadId: "thr_active",
        message: "この設計の弱点を挙げて",
      },
    ]);
    expect(stdout).toHaveBeenCalledWith("設計の弱点は状態管理の責務がまだ曖昧な点です。");
    expect(await readJsonFile(stateFilePath)).toMatchObject({
      threadId: "thr_active",
      updatedAt: "2026-04-02T01:05:00.000Z",
    });
  });

  it("ask は message が空だとエラーにする", async () => {
    const error = vi.fn();

    await runCli(["ask"], {
      context: {
        cwd: "/repo",
        stateFilePath: "/tmp/unused.json",
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(error).toHaveBeenCalledWith("Usage: codex-sidecar ask <message>");
    expect(process.exitCode).toBe(1);
  });

  it("ask は state が無いとエラーにする", async () => {
    const error = vi.fn();
    const stateFilePath = await createStateFilePath();

    await runCli(["ask", "hello"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(error).toHaveBeenCalledWith(
      "Sidecar session is not started. Run `codex-sidecar start`.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("ask は turn failed をエラーにする", async () => {
    const client = new FakeCodexClient({
      resumeThread: {
        id: "thr_active",
        path: "/tmp/thr_active.jsonl",
        cwd: "/repo",
      },
      startTurn: {
        turnId: "turn_1",
        status: "failed",
        message: "",
        errorMessage: "turn failed",
      },
    });
    const error = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["ask", "hello"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => client,
      },
    });

    expect(error).toHaveBeenCalledWith("turn failed");
    expect(process.exitCode).toBe(1);
  });

  it("ask は errorMessage が無ければ status を出す", async () => {
    const client = new FakeCodexClient({
      resumeThread: {
        id: "thr_active",
        path: "/tmp/thr_active.jsonl",
        cwd: "/repo",
      },
      startTurn: {
        turnId: "turn_1",
        status: "interrupted",
        message: "",
        errorMessage: null,
      },
    });
    const error = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["ask", "hello"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => client,
      },
    });

    expect(error).toHaveBeenCalledWith("Turn ended with status: interrupted");
    expect(process.exitCode).toBe(1);
  });

  it("ask は壊れた state に reset/stop の復旧案内を出す", async () => {
    const error = vi.fn();
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-test-"));
    const stateFilePath = path.join(directory, "state.json");
    await writeJsonFile(stateFilePath, {
      version: 2,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["ask", "hello"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(error).toHaveBeenCalledWith(
      [
        `Invalid sidecar state file: ${stateFilePath}: unsupported version`,
        "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
      ].join("\n"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("ask は readState の想定外エラーをそのまま出す", async () => {
    const error = vi.fn();
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-test-"));

    await runCli(["ask", "hello"], {
      context: {
        cwd: "/repo",
        stateFilePath: directory,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(error).toHaveBeenCalledWith(expect.stringContaining("EISDIR"));
    expect(process.exitCode).toBe(1);
  });

  it("ask は resume 失敗に reset/stop の復旧案内を出す", async () => {
    const client = new FakeCodexClient({
      resumeThreadError: new Error("no rollout found"),
    });
    const error = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: null,
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["ask", "hello"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => client,
      },
    });

    expect(error).toHaveBeenCalledWith(
      [
        "Failed to resume sidecar thread: thr_active",
        "Thread path: (none)",
        "Reason: no rollout found",
        "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
      ].join("\n"),
    );
    expect(process.exitCode).toBe(1);
    expect(client.closeCalls).toBe(1);
  });

  it("reset が thread を差し替える", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_new",
        path: "/tmp/thr_new.jsonl",
        cwd: "/repo",
      },
    });
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_old",
      threadPath: "/tmp/thr_old.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["reset"], {
      context: {
        cwd: "/repo",
        now: () => new Date("2026-04-02T01:10:00.000Z"),
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => client,
      },
    });

    expect(client.archiveThreadCalls).toEqual(["thr_old"]);
    expect(client.startTurnCalls).toEqual([
      {
        threadId: "thr_new",
        message: SESSION_BOOTSTRAP_MESSAGE,
      },
    ]);
    expect(stdout).toHaveBeenCalledWith("Reset sidecar thread: thr_new");
    expect(await readJsonFile(stateFilePath)).toEqual({
      version: 1,
      threadId: "thr_new",
      threadPath: "/tmp/thr_new.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:10:00.000Z",
      updatedAt: "2026-04-02T01:10:00.000Z",
    });
  });

  it("reset は state が無いとエラーにする", async () => {
    const error = vi.fn();
    const stateFilePath = await createStateFilePath();

    await runCli(["reset"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(error).toHaveBeenCalledWith(
      "Sidecar session is not started. Run `codex-sidecar start`.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("reset は壊れた state を warning して新規 thread で上書きする", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_new",
        path: "/tmp/thr_new.jsonl",
        cwd: "/repo",
      },
    });
    const stdout = vi.fn();
    const stderr = vi.fn();
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-test-"));
    const stateFilePath = path.join(directory, "state.json");
    await writeJsonFile(stateFilePath, {
      version: 2,
      threadId: "thr_old",
      threadPath: "/tmp/thr_old.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["reset"], {
      context: {
        cwd: "/repo",
        now: () => new Date("2026-04-02T01:10:00.000Z"),
        stateFilePath,
        stdout,
        stderr,
        createClient: async () => client,
      },
    });

    expect(stderr).toHaveBeenCalledWith(
      [
        `Invalid sidecar state file: ${stateFilePath}: unsupported version`,
        "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
      ].join("\n"),
    );
    expect(client.archiveThreadCalls).toEqual([]);
    expect(stdout).toHaveBeenCalledWith("Reset sidecar thread: thr_new");
    expect(await readJsonFile(stateFilePath)).toMatchObject({
      threadId: "thr_new",
      threadPath: "/tmp/thr_new.jsonl",
      cwd: "/repo",
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("reset は archive 失敗を warning にして続行する", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_new",
        path: "/tmp/thr_new.jsonl",
        cwd: "/repo",
      },
      archiveThreadError: new Error("archive failed"),
    });
    const stderr = vi.fn();
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_old",
      threadPath: "/tmp/thr_old.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["reset"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr,
        createClient: async () => client,
      },
    });

    expect(stderr).toHaveBeenCalledWith("Archive warning for thr_old: archive failed");
    expect(stdout).toHaveBeenCalledWith("Reset sidecar thread: thr_new");
  });

  it("reset は非 Error warning も文字列化する", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_new",
        path: "/tmp/thr_new.jsonl",
        cwd: "/repo",
      },
      archiveThreadError: "archive failed",
    });
    const stderr = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_old",
      threadPath: "/tmp/thr_old.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["reset"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr,
        createClient: async () => client,
      },
    });

    expect(stderr).toHaveBeenCalledWith("Archive warning for thr_old: archive failed");
  });

  it("reset は bootstrap turn の status fallback を使う", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_new",
        path: "/tmp/thr_new.jsonl",
        cwd: "/repo",
      },
      startTurn: {
        turnId: "turn_bootstrap",
        status: "interrupted",
        message: "",
        errorMessage: null,
      },
    });
    const error = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_old",
      threadPath: "/tmp/thr_old.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["reset"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => client,
      },
    });

    expect(error).toHaveBeenCalledWith("Turn ended with status: interrupted");
    expect(process.exitCode).toBe(1);
  });

  it("stop が state を削除する", async () => {
    const client = new FakeCodexClient();
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["stop"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => client,
      },
    });

    expect(client.archiveThreadCalls).toEqual(["thr_active"]);
    expect(stdout).toHaveBeenCalledWith("Stopped sidecar session.");
    await expect(readJsonFile(stateFilePath)).rejects.toThrow();
  });

  it("stop は state が無ければ no-op にする", async () => {
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath();

    await runCli(["stop"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(stdout).toHaveBeenCalledWith("No active sidecar session.");
    expect(process.exitCode).toBeUndefined();
  });

  it("stop は壊れた state を warning して state file を削除する", async () => {
    const createClient = vi.fn(async () => new FakeCodexClient());
    const stdout = vi.fn();
    const stderr = vi.fn();
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-test-"));
    const stateFilePath = path.join(directory, "state.json");
    await writeJsonFile(stateFilePath, {
      version: 2,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["stop"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr,
        createClient,
      },
    });

    expect(stderr).toHaveBeenCalledWith(
      [
        `Invalid sidecar state file: ${stateFilePath}: unsupported version`,
        "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
      ].join("\n"),
    );
    expect(createClient).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith("Stopped sidecar session.");
    await expect(readJsonFile(stateFilePath)).rejects.toThrow();
  });

  it("stop は archive 失敗を warning にして state を削除する", async () => {
    const client = new FakeCodexClient({
      archiveThreadError: new Error("archive failed"),
    });
    const stdout = vi.fn();
    const stderr = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["stop"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr,
        createClient: async () => client,
      },
    });

    expect(stderr).toHaveBeenCalledWith("Archive warning for thr_active: archive failed");
    expect(stdout).toHaveBeenCalledWith("Stopped sidecar session.");
    await expect(readJsonFile(stateFilePath)).rejects.toThrow();
  });

  it("stop は非 Error warning も文字列化する", async () => {
    const client = new FakeCodexClient({
      archiveThreadError: "archive failed",
    });
    const stderr = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["stop"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr,
        createClient: async () => client,
      },
    });

    expect(stderr).toHaveBeenCalledWith("Archive warning for thr_active: archive failed");
  });

  it("status は active state を表示する", async () => {
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:05:00.000Z",
    });

    await runCli(["status"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(stdout).toHaveBeenCalledWith(
      [
        "Sidecar session: active",
        "Thread ID: thr_active",
        "Thread path: /tmp/thr_active.jsonl",
        "Thread cwd: /repo",
        "Started at: 2026-04-02T01:00:00.000Z",
        "Updated at: 2026-04-02T01:05:00.000Z",
        `State file: ${stateFilePath}`,
        "Default model: gpt-5.4",
        "Default reasoning effort: high",
      ].join("\n"),
    );
  });

  it("status は threadPath が null なら none 表示にする", async () => {
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: null,
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:05:00.000Z",
    });

    await runCli(["status"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("Thread path: (none)"));
  });

  it("status は stopped state を表示する", async () => {
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath();

    await runCli(["status"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(stdout).toHaveBeenCalledWith(
      [
        "Sidecar session: stopped",
        `State file: ${stateFilePath}`,
        "Default model: gpt-5.4",
        "Default reasoning effort: high",
      ].join("\n"),
    );
  });

  it("status は壊れた state に復旧案内を表示する", async () => {
    const stdout = vi.fn();
    const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-test-"));
    const stateFilePath = path.join(directory, "state.json");
    await writeJsonFile(stateFilePath, {
      version: 2,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["status"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(stdout).toHaveBeenCalledWith(
      [
        "Sidecar session: invalid-state",
        `State file: ${stateFilePath}`,
        `Invalid sidecar state file: ${stateFilePath}: unsupported version`,
        "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
        "Default model: gpt-5.4",
        "Default reasoning effort: high",
      ].join("\n"),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("引数なしでは usage を表示する", async () => {
    const log = vi.fn();

    await runCli([], {
      context: {
        cwd: "/repo",
        stateFilePath: "/tmp/unused.json",
        stdout: log,
        stderr: vi.fn(),
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(log).toHaveBeenCalledWith(getUsageText());
    expect(process.exitCode).toBeUndefined();
  });

  it("先頭の -- を無視してコマンドを解釈する", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_start",
        path: "/tmp/thr_start.jsonl",
        cwd: "/repo",
      },
    });
    const stdout = vi.fn();
    const stateFilePath = await createStateFilePath();

    await runCli(["--", "start"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout,
        stderr: vi.fn(),
        createClient: async () => client,
      },
    });

    expect(stdout).toHaveBeenCalledWith("Started sidecar thread: thr_start");
  });

  it("start 済みで再度 start するとエラー終了コードを設定する", async () => {
    const error = vi.fn();
    const stateFilePath = await createStateFilePath({
      version: 1,
      threadId: "thr_active",
      threadPath: "/tmp/thr_active.jsonl",
      cwd: "/repo",
      startedAt: "2026-04-02T01:00:00.000Z",
      updatedAt: "2026-04-02T01:00:00.000Z",
    });

    await runCli(["start"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => new FakeCodexClient(),
      },
    });

    expect(error).toHaveBeenCalledWith("Sidecar session is already active: thr_active");
    expect(process.exitCode).toBe(1);
  });

  it("start は bootstrap turn failed をエラーにする", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_start",
        path: "/tmp/thr_start.jsonl",
        cwd: "/repo",
      },
      startTurn: {
        turnId: "turn_bootstrap",
        status: "failed",
        message: "",
        errorMessage: "bootstrap failed",
      },
    });
    const error = vi.fn();
    const stateFilePath = await createStateFilePath();

    await runCli(["start"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => client,
      },
    });

    expect(error).toHaveBeenCalledWith("bootstrap failed");
    await expect(readJsonFile(stateFilePath)).rejects.toThrow();
  });

  it("start は bootstrap turn の status fallback を使う", async () => {
    const client = new FakeCodexClient({
      createThread: {
        id: "thr_start",
        path: "/tmp/thr_start.jsonl",
        cwd: "/repo",
      },
      startTurn: {
        turnId: "turn_bootstrap",
        status: "interrupted",
        message: "",
        errorMessage: null,
      },
    });
    const error = vi.fn();
    const stateFilePath = await createStateFilePath();

    await runCli(["start"], {
      context: {
        cwd: "/repo",
        stateFilePath,
        stdout: vi.fn(),
        stderr: error,
        createClient: async () => client,
      },
    });

    expect(error).toHaveBeenCalledWith("Turn ended with status: interrupted");
    expect(process.exitCode).toBe(1);
  });
});

class FakeCodexClient implements CodexClient {
  readonly archiveThreadCalls: string[] = [];
  readonly resumeThreadCalls: Array<{
    threadId: string;
    threadPath: string | null | undefined;
  }> = [];
  readonly startTurnCalls: Array<{ threadId: string; message: string }> = [];
  closeCalls = 0;

  private readonly createThreadResult: CodexThread;
  private readonly resumeThreadResult: CodexThread;
  private readonly startTurnResult: CodexTurnResult;
  private readonly archiveThreadError: Error | string | null;
  private readonly resumeThreadError: Error | null;

  constructor(
    overrides: {
      createThread?: CodexThread;
      resumeThread?: CodexThread;
      startTurn?: CodexTurnResult;
      archiveThreadError?: Error | string;
      resumeThreadError?: Error;
    } = {},
  ) {
    this.createThreadResult = overrides.createThread ?? {
      id: "thr_default",
      path: "/tmp/thr_default.jsonl",
      cwd: "/repo",
    };
    this.resumeThreadResult = overrides.resumeThread ?? this.createThreadResult;
    this.startTurnResult = overrides.startTurn ?? {
      turnId: "turn_default",
      status: "completed",
      message: "ok",
      errorMessage: null,
    };
    this.archiveThreadError = overrides.archiveThreadError ?? null;
    this.resumeThreadError = overrides.resumeThreadError ?? null;
  }

  async createThread(): Promise<CodexThread> {
    return this.createThreadResult;
  }

  async resumeThread(threadId: string, threadPath?: string | null): Promise<CodexThread> {
    this.resumeThreadCalls.push({ threadId, threadPath });
    if (this.resumeThreadError) {
      throw this.resumeThreadError;
    }

    return this.resumeThreadResult;
  }

  async archiveThread(threadId: string): Promise<void> {
    this.archiveThreadCalls.push(threadId);
    if (this.archiveThreadError) {
      throw this.archiveThreadError;
    }
  }

  async startTurn(threadId: string, message: string): Promise<CodexTurnResult> {
    this.startTurnCalls.push({ threadId, message });
    return this.startTurnResult;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

async function createStateFilePath(initialState?: object): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-sidecar-test-"));
  const stateFilePath = path.join(directory, "state.json");

  if (initialState) {
    await writeJsonFile(stateFilePath, initialState);
  }

  return stateFilePath;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJsonFile(filePath: string, value: object): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
