import { EventEmitter } from "node:events";
import { execFile, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiAccountAuthStore } from "@fusion/core";
import { startCliAccountLogin } from "../cli-account-auth.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

describe("startCliAccountLogin", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(execFile).mockImplementation(((
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      callback(null, { stdout: "Logged in as claude@example.com", stderr: "" });
      return new EventEmitter();
    }) as typeof execFile);
    process.env.HOME = mkdtempSync(join(tmpdir(), "fusion-cli-login-home-"));
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps Claude CLI login alive after the authorization URL is emitted", async () => {
    const child = new FakeChildProcess();
    const stdinChunks: string[] = [];
    child.stdin.on("data", (chunk) => {
      stdinChunks.push(chunk.toString("utf-8"));
    });
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);

    const store = new MultiAccountAuthStore(join(mkdtempSync(join(tmpdir(), "fusion-accounts-")), "accounts.json"));
    const startedPromise = startCliAccountLogin("claude-cli", store);

    child.stdout.write(
      "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=test\nPaste code here if prompted > ",
    );
    const started = await startedPromise;

    expect(started.manualCode?.prompt).toBe("Paste the Claude authorization code");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(child.kill).not.toHaveBeenCalled();

    expect(started.submitManualCode("claude-code-123")).toBe(true);
    expect(stdinChunks).toEqual(["claude-code-123\n"]);

    child.emit("close", 0);
    await expect(started.completion).resolves.toMatchObject({
      status: "added",
      account: {
        providerId: "claude-cli",
      },
    });
  });
});
