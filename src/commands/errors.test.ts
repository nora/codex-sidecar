import { describe, expect, it } from "vitest";
import { InvalidStateFileError } from "../codex/state.js";
import {
  formatArchiveWarning,
  formatResumeFailureMessage,
  formatStateRecoveryMessage,
  isInvalidStateFileError,
} from "./errors.js";

describe("command error helpers", () => {
  it("state recovery message を整形する", () => {
    const error = new InvalidStateFileError("/repo/state.json", "invalid JSON");

    expect(formatStateRecoveryMessage(error)).toBe(
      [
        "Invalid sidecar state file: /repo/state.json: invalid JSON",
        "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
      ].join("\n"),
    );
    expect(isInvalidStateFileError(error)).toBe(true);
    expect(isInvalidStateFileError(new Error("x"))).toBe(false);
  });

  it("resume failure message を整形する", () => {
    expect(
      formatResumeFailureMessage("thr_1", "/tmp/thr_1.jsonl", new Error("rollout missing")),
    ).toBe(
      [
        "Failed to resume sidecar thread: thr_1",
        "Thread path: /tmp/thr_1.jsonl",
        "Reason: rollout missing",
        "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
      ].join("\n"),
    );
  });

  it("resume failure は threadPath null と非 Error reason も扱う", () => {
    expect(formatResumeFailureMessage("thr_1", null, "boom")).toBe(
      [
        "Failed to resume sidecar thread: thr_1",
        "Thread path: (none)",
        "Reason: boom",
        "Run `codex-sidecar reset` to recreate the sidecar thread, or `codex-sidecar stop` to clear local state.",
      ].join("\n"),
    );
  });

  it("archive warning を整形する", () => {
    expect(formatArchiveWarning("thr_1", new Error("archive failed"))).toBe(
      "Archive warning for thr_1: archive failed",
    );
    expect(formatArchiveWarning("thr_1", "archive failed")).toBe(
      "Archive warning for thr_1: archive failed",
    );
  });
});
