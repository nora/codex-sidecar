import { describe, expect, it, vi } from "vitest";
import { getUsageText, runCli } from "./main.js";

describe("codex-sidecar CLI", () => {
  it("usage 文字列に主要コマンドが含まれる", () => {
    const usage = getUsageText();

    expect(usage).toContain("codex-sidecar <command>");
    expect(usage).toContain("start");
    expect(usage).toContain("ask");
    expect(usage).toContain("reset");
    expect(usage).toContain("stop");
  });

  it("未実装コマンドはエラー終了コードを設定する", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    process.exitCode = undefined;
    await runCli(["start"]);

    expect(error).toHaveBeenCalledWith("Not implemented yet: start");
    expect(process.exitCode).toBe(1);
  });

  it("引数なしでは usage を表示する", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    process.exitCode = undefined;
    await runCli([]);

    expect(log).toHaveBeenCalledWith(getUsageText());
    expect(process.exitCode).toBeUndefined();
  });
});
