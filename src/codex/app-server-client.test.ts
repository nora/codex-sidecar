import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

describe("app-server client", () => {
  beforeEach(() => {
    vi.resetModules();
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initialize 後に thread/start できる", async () => {
    const server = createFakeServer({
      initialize(request, control) {
        control.respond(request.id, {
          userAgent: "ua",
          codexHome: "/tmp/.codex",
          platformFamily: "unix",
          platformOs: "macos",
        });
      },
      "thread/start"(request, control) {
        expect(request.params).toMatchObject({
          model: "gpt-5.4",
          cwd: "/repo",
          approvalPolicy: "never",
          sandbox: "workspace-write",
          personality: "pragmatic",
          experimentalRawEvents: false,
          persistExtendedHistory: true,
        });
        control.respond(request.id, {
          thread: {
            id: "thr_1",
            path: "/tmp/thr_1.jsonl",
            cwd: "/repo",
          },
        });
      },
    });
    spawnMock.mockReturnValue(server);

    const { createAppServerClient } = await import("./app-server-client.js");
    const client = await createAppServerClient("/repo");
    const thread = await client.createThread();

    expect(thread).toEqual({
      id: "thr_1",
      path: "/tmp/thr_1.jsonl",
      cwd: "/repo",
    });
    expect(spawnMock).toHaveBeenCalledWith("codex", ["app-server", "--listen", "stdio://"], {
      cwd: "/repo",
      stdio: ["pipe", "pipe", "pipe"],
    });

    await client.close();
    await client.close();
    expect(server.kill).toHaveBeenCalledTimes(1);
  });

  it("thread/path を使って resume し、通知から turn 結果を組み立てる", async () => {
    const server = createFakeServer({
      initialize(request, control) {
        control.respond(request.id, {
          userAgent: "ua",
          codexHome: "/tmp/.codex",
          platformFamily: "unix",
          platformOs: "macos",
        });
      },
      "thread/resume"(request, control) {
        expect(request.params).toMatchObject({
          threadId: "thr_1",
          path: "/tmp/thr_1.jsonl",
          model: "gpt-5.4",
        });
        control.respond(request.id, {
          thread: {
            id: "thr_1",
            path: "/tmp/thr_1.jsonl",
            cwd: "/repo",
          },
        });
      },
      "turn/start"(request, control) {
        expect(request.params).toMatchObject({
          threadId: "thr_1",
          effort: "high",
          input: [
            {
              type: "text",
              text: "hello",
              text_elements: [],
            },
          ],
        });
        control.notify("item/completed", {
          threadId: "thr_1",
          turnId: "turn_1",
          item: {
            type: "agentMessage",
            id: "item_1",
            text: "前半です。",
          },
        });
        control.notify("item/completed", {
          threadId: "thr_1",
          turnId: "turn_1",
          item: {
            type: "agentMessage",
            id: "item_2",
            text: "後半です。",
          },
        });
        control.notify("turn/completed", {
          threadId: "thr_1",
          turn: {
            id: "turn_1",
            status: "completed",
            error: null,
          },
        });
        control.respond(request.id, {
          turn: {
            id: "turn_1",
          },
        });
      },
    });
    spawnMock.mockReturnValue(server);

    const { createAppServerClient } = await import("./app-server-client.js");
    const client = await createAppServerClient("/repo");
    await client.resumeThread("thr_1", "/tmp/thr_1.jsonl");
    const turn = await client.startTurn("thr_1", "hello");

    expect(turn).toEqual({
      turnId: "turn_1",
      status: "completed",
      message: "前半です。\n\n後半です。",
      errorMessage: null,
    });

    await client.close();
  });

  it("turn failed を返せる", async () => {
    const server = createFakeServer({
      initialize(request, control) {
        control.respond(request.id, {
          userAgent: "ua",
          codexHome: "/tmp/.codex",
          platformFamily: "unix",
          platformOs: "macos",
        });
      },
      "turn/start"(request, control) {
        control.respond(request.id, {
          turn: {
            id: "turn_1",
          },
        });
        control.notify("turn/completed", {
          threadId: "thr_1",
          turn: {
            id: "turn_1",
            status: "failed",
            error: {
              message: "boom",
            },
          },
        });
      },
    });
    spawnMock.mockReturnValue(server);

    const { createAppServerClient } = await import("./app-server-client.js");
    const client = await createAppServerClient("/repo");
    const turn = await client.startTurn("thr_1", "hello");

    expect(turn).toEqual({
      turnId: "turn_1",
      status: "failed",
      message: "",
      errorMessage: "boom",
    });

    await client.close();
  });

  it("JSON-RPC error を request failure に変換する", async () => {
    const server = createFakeServer({
      initialize(request, control) {
        control.respond(request.id, {
          userAgent: "ua",
          codexHome: "/tmp/.codex",
          platformFamily: "unix",
          platformOs: "macos",
        });
      },
      "thread/archive"(request, control) {
        control.respondError(request.id, "archive failed");
      },
    });
    spawnMock.mockReturnValue(server);

    const { createAppServerClient } = await import("./app-server-client.js");
    const client = await createAppServerClient("/repo");

    await expect(client.archiveThread("thr_1")).rejects.toThrow("archive failed");
    await client.close();
  });

  it("malformed JSON-RPC response をエラーにする", async () => {
    const server = createFakeServer({
      initialize(request, control) {
        control.respond(request.id, {
          userAgent: "ua",
          codexHome: "/tmp/.codex",
          platformFamily: "unix",
          platformOs: "macos",
        });
      },
      "thread/start"(request, control) {
        control.raw({
          id: request.id,
        });
      },
    });
    spawnMock.mockReturnValue(server);

    const { createAppServerClient } = await import("./app-server-client.js");
    const client = await createAppServerClient("/repo");

    await expect(client.createThread()).rejects.toThrow("Received malformed JSON-RPC response");
    await client.close();
  });

  it("child process exit は pending request を reject する", async () => {
    const server = createFakeServer({
      initialize(request, control) {
        control.respond(request.id, {
          userAgent: "ua",
          codexHome: "/tmp/.codex",
          platformFamily: "unix",
          platformOs: "macos",
        });
      },
      "thread/start"() {
        server.emitStderr("fatal");
        server.exit(1);
      },
    });
    spawnMock.mockReturnValue(server);

    const { createAppServerClient } = await import("./app-server-client.js");
    const client = await createAppServerClient("/repo");

    await expect(client.createThread()).rejects.toThrow(
      "codex app-server exited unexpectedly (code 1): fatal",
    );
  });
});

interface JsonRpcRequest {
  id: number;
  method: string;
  params: unknown;
}

interface FakeServerControl {
  respond: (id: number, result: unknown) => void;
  respondError: (id: number, message: string) => void;
  notify: (method: string, params: unknown) => void;
  raw: (message: unknown) => void;
}

type FakeHandler = (request: JsonRpcRequest, control: FakeServerControl) => void;

function createFakeServer(handlers: Record<string, FakeHandler>) {
  const child = new FakeChildProcess();

  child.stdin.on("data", (chunk: Buffer | string) => {
    child.pushInput(chunk.toString());
  });

  child.onRequest = (request) => {
    const handler = handlers[request.method];
    if (!handler) {
      throw new Error(`Unhandled request: ${request.method}`);
    }

    handler(request, {
      respond(id, result) {
        child.emitStdout({
          id,
          result,
        });
      },
      respondError(id, message) {
        child.emitStdout({
          id,
          error: {
            code: -32000,
            message,
          },
        });
      },
      notify(method, params) {
        child.emitStdout({
          method,
          params,
        });
      },
      raw(message) {
        child.emitStdout(message);
      },
    });
  };

  return child;
}

class FakeChildProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => {
    this.emit("exit", 0, null);
    return true;
  });
  onRequest: ((request: JsonRpcRequest) => void) | null = null;
  private inputBuffer = "";

  pushInput(chunk: string): void {
    this.inputBuffer += chunk;

    let newlineIndex = this.inputBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.inputBuffer.slice(0, newlineIndex).trim();
      this.inputBuffer = this.inputBuffer.slice(newlineIndex + 1);

      if (line) {
        this.onRequest?.(JSON.parse(line) as JsonRpcRequest);
      }

      newlineIndex = this.inputBuffer.indexOf("\n");
    }
  }

  emitStdout(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  emitStderr(message: string): void {
    this.stderr.write(`${message}\n`);
  }

  exit(code: number): void {
    this.emit("exit", code, null);
  }
}
