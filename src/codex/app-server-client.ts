import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { DEFAULT_MODEL, DEFAULT_REASONING_EFFORT } from "./defaults.js";
import type { CodexClient, CodexThread, CodexTurnResult } from "./types.js";

const CLIENT_VERSION = "0.0.0";
const TURN_TIMEOUT_MS = 5 * 60 * 1000;

const SIDECAR_BASE_INSTRUCTIONS = [
  "あなたはこのリポジトリの senior engineer です。",
  "KISS / DRY / YAGNI を優先してください。",
  "日本語で返答してください。",
  "批判的にレビューしてください。",
  "必要なら代替案を提案してください。",
  "返答は簡潔にしてください。",
].join("\n");

interface RequestHandler {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

interface CompletedTurn {
  status: "completed" | "failed" | "interrupted";
  errorMessage: string | null;
}

interface TurnWaiter {
  resolve: (value: CodexTurnResult) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

interface ThreadResponse {
  thread: {
    id: string;
    path: string | null;
    cwd: string;
  };
}

interface TurnStartResponse {
  turn: {
    id: string;
  };
}

export async function createAppServerClient(cwd: string): Promise<CodexClient> {
  const client = new AppServerClient(cwd);
  await client.initialize();
  return client;
}

class AppServerClient implements CodexClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pendingRequests = new Map<number, RequestHandler>();
  private readonly agentMessages = new Map<string, string[]>();
  private readonly completedTurns = new Map<string, CompletedTurn>();
  private readonly turnWaiters = new Map<string, TurnWaiter>();
  private readonly stderrLines: string[] = [];
  private readonly cwd: string;
  private nextId = 1;
  private stdoutBuffer = "";
  private closed = false;

  constructor(cwd: string) {
    this.cwd = cwd;
    this.child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.handleStdoutChunk(chunk);
    });

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.handleStderrChunk(chunk);
    });

    this.child.on("exit", (code, signal) => {
      this.handleExit(code, signal);
    });

    this.child.on("error", (error) => {
      this.handleFatalError(error);
    });
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.child.stdin.end();
    this.child.kill();
  }

  async createThread(): Promise<CodexThread> {
    const response = await this.request<ThreadResponse>("thread/start", {
      model: DEFAULT_MODEL,
      cwd: this.cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      baseInstructions: SIDECAR_BASE_INSTRUCTIONS,
      personality: "pragmatic",
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    });

    return response.thread;
  }

  async resumeThread(threadId: string, threadPath?: string | null): Promise<CodexThread> {
    const response = await this.request<ThreadResponse>("thread/resume", {
      threadId,
      path: threadPath ?? undefined,
      model: DEFAULT_MODEL,
      cwd: this.cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      baseInstructions: SIDECAR_BASE_INSTRUCTIONS,
      personality: "pragmatic",
      persistExtendedHistory: true,
    });

    return response.thread;
  }

  async archiveThread(threadId: string): Promise<void> {
    await this.request("thread/archive", { threadId });
  }

  async startTurn(threadId: string, message: string): Promise<CodexTurnResult> {
    const response = await this.request<TurnStartResponse>("turn/start", {
      threadId,
      effort: DEFAULT_REASONING_EFFORT,
      input: [
        {
          type: "text",
          text: message,
          text_elements: [],
        },
      ],
    });

    const turnId = response.turn.id;
    const completed = this.completedTurns.get(turnId);
    if (completed) {
      return this.buildTurnResult(turnId, completed);
    }

    return await new Promise<CodexTurnResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.turnWaiters.delete(turnId);
        reject(new Error(`Timed out waiting for turn completion: ${turnId}`));
      }, TURN_TIMEOUT_MS);

      this.turnWaiters.set(turnId, { resolve, reject, timeout });
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "codex-sidecar",
        title: "codex-sidecar",
        version: CLIENT_VERSION,
      },
      capabilities: {
        experimentalApi: true,
      },
    });
  }

  private handleStdoutChunk(chunk: string): void {
    this.stdoutBuffer += chunk;

    let newlineIndex = this.stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);

      if (line) {
        this.handleMessage(line);
      }

      newlineIndex = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleStderrChunk(chunk: string): void {
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      this.stderrLines.push(trimmed);
      if (this.stderrLines.length > 20) {
        this.stderrLines.shift();
      }
    }
  }

  private handleMessage(line: string): void {
    const message = JSON.parse(line) as Record<string, unknown>;

    if (typeof message.method === "string") {
      this.handleNotification(message.method, message.params);
      return;
    }

    if (typeof message.id !== "number") {
      return;
    }

    const handler = this.pendingRequests.get(message.id);
    if (!handler) {
      return;
    }

    this.pendingRequests.delete(message.id);

    if (isJsonRpcFailure(message)) {
      handler.reject(new Error(message.error.message));
      return;
    }

    if ("result" in message) {
      handler.resolve(message.result);
      return;
    }

    handler.reject(new Error("Received malformed JSON-RPC response"));
  }

  private handleNotification(method: string, params: unknown): void {
    if (!isRecord(params)) {
      return;
    }

    if (method === "item/completed") {
      this.handleItemCompleted(params);
      return;
    }

    if (method === "turn/completed") {
      this.handleTurnCompleted(params);
    }
  }

  private handleItemCompleted(params: Record<string, unknown>): void {
    const { turnId, item } = params;

    if (typeof turnId !== "string" || !isRecord(item)) {
      return;
    }

    if (item.type !== "agentMessage" || typeof item.text !== "string") {
      return;
    }

    const messages = this.agentMessages.get(turnId) ?? [];
    messages.push(item.text);
    this.agentMessages.set(turnId, messages);
  }

  private handleTurnCompleted(params: Record<string, unknown>): void {
    const { turn } = params;
    if (!isRecord(turn) || typeof turn.id !== "string") {
      return;
    }

    const status = normalizeTurnStatus(turn.status);
    if (!status) {
      return;
    }

    const errorMessage =
      isRecord(turn.error) && typeof turn.error.message === "string" ? turn.error.message : null;

    const completedTurn = { status, errorMessage };
    this.completedTurns.set(turn.id, completedTurn);

    const waiter = this.turnWaiters.get(turn.id);
    if (!waiter) {
      return;
    }

    clearTimeout(waiter.timeout);
    this.turnWaiters.delete(turn.id);
    waiter.resolve(this.buildTurnResult(turn.id, completedTurn));
  }

  private buildTurnResult(turnId: string, completedTurn: CompletedTurn): CodexTurnResult {
    const message = (this.agentMessages.get(turnId) ?? []).join("\n\n").trim();

    return {
      turnId,
      status: completedTurn.status,
      message,
      errorMessage: completedTurn.errorMessage,
    };
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.closed) {
      return;
    }

    const reason = new Error(
      `codex app-server exited unexpectedly (${formatExit(code, signal)})${this.formatStderrSuffix()}`,
    );

    this.closed = true;
    this.rejectAll(reason);
  }

  private handleFatalError(error: Error): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.rejectAll(error);
  }

  private rejectAll(error: Error): void {
    for (const handler of this.pendingRequests.values()) {
      handler.reject(error);
    }

    this.pendingRequests.clear();

    for (const waiter of this.turnWaiters.values()) {
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }

    this.turnWaiters.clear();
  }

  private formatStderrSuffix(): string {
    if (this.stderrLines.length === 0) {
      return "";
    }

    return `: ${this.stderrLines.at(-1)}`;
  }

  private async request<TResponse = void>(method: string, params: unknown): Promise<TResponse> {
    if (this.closed) {
      throw new Error("codex app-server client is already closed");
    }

    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    const responsePromise = new Promise<TResponse>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as TResponse),
        reject,
      });
    });

    this.child.stdin.write(`${payload}\n`);
    return await responsePromise;
  }
}

function normalizeTurnStatus(status: unknown): "completed" | "failed" | "interrupted" | null {
  if (status === "completed" || status === "failed" || status === "interrupted") {
    return status;
  }

  return null;
}

function formatExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal) {
    return `signal ${signal}`;
  }

  return `code ${code ?? "unknown"}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJsonRpcFailure(value: Record<string, unknown>): value is {
  id: number;
  error: {
    code: number;
    message: string;
  };
} {
  return (
    typeof value.id === "number" &&
    isRecord(value.error) &&
    typeof value.error.code === "number" &&
    typeof value.error.message === "string"
  );
}
