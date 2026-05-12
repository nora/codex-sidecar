export interface SidecarState {
  version: 1;
  threadId: string;
  threadPath: string | null;
  cwd: string;
  startedAt: string;
  updatedAt: string;
}

export interface CodexThread {
  id: string;
  path: string | null;
  cwd: string;
}

export interface CodexTurnResult {
  turnId: string;
  status: "completed" | "failed" | "interrupted";
  message: string;
  errorMessage: string | null;
}

export interface CodexClientOptions {
  model?: string;
  reasoningEffort: string;
}

export interface CodexClient {
  createThread(): Promise<CodexThread>;
  resumeThread(threadId: string, threadPath?: string | null): Promise<CodexThread>;
  archiveThread(threadId: string): Promise<void>;
  startTurn(threadId: string, message: string): Promise<CodexTurnResult>;
  close(): Promise<void>;
}

export interface CommandContext {
  cwd: string;
  now: () => Date;
  stateFilePath: string;
  codexOptions: CodexClientOptions;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  createClient: (cwd: string, options: CodexClientOptions) => Promise<CodexClient>;
}
