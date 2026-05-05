import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempWorkspace } from "@fusion/test-utils";
import { runAuth } from "../auth.js";

const originalHome = process.env.HOME;

afterEach(() => {
  process.env.HOME = originalHome;
  delete process.env.MINIMAX_TEST_KEY;
  vi.restoreAllMocks();
});

function useTempHome(prefix: string): string {
  const home = tempWorkspace(prefix);
  process.env.HOME = home;
  return home;
}

function spyConsole(): { log: ReturnType<typeof vi.spyOn>; output: () => string } {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.join(" "));
  });
  return { log, output: () => lines.join("\n") };
}

describe("fn auth", () => {
  it("adds MiniMax token-plan keys as independent accounts and reports duplicates", async () => {
    const home = useTempHome("fusion-auth-cli-");
    const consoleSpy = spyConsole();

    await runAuth(["add-account", "minimax", "--api-key", "minimax-key-1"]);
    await runAuth(["add-account", "minimax", "--api-key", "minimax-key-1"]);
    await runAuth(["add-account", "minimax", "--api-key", "minimax-key-2"]);

    const accountPath = join(home, ".fusion", "agent", "accounts.json");
    expect(existsSync(accountPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(accountPath, "utf-8")) as { accounts: Array<{ providerId: string }> };
    expect(parsed.accounts.filter((account) => account.providerId === "minimax")).toHaveLength(2);
    expect(consoleSpy.output()).toContain("already logged in");
  });

  it("stores env-backed API key accounts without writing the secret", async () => {
    const home = useTempHome("fusion-auth-cli-env-");
    process.env.MINIMAX_TEST_KEY = "minimax-secret-from-env";
    spyConsole();

    await runAuth(["api-key", "add", "minimax", "--env", "MINIMAX_TEST_KEY"]);

    const accountPath = join(home, ".fusion", "agent", "accounts.json");
    const raw = readFileSync(accountPath, "utf-8");
    expect(raw).toContain("MINIMAX_TEST_KEY");
    expect(raw).not.toContain("minimax-secret-from-env");
  });

  it("prints account status for a provider", async () => {
    useTempHome("fusion-auth-cli-status-");
    const consoleSpy = spyConsole();

    await runAuth(["add-account", "minimax", "--api-key", "minimax-key"]);
    await runAuth(["status", "minimax"]);

    expect(consoleSpy.output()).toContain("minimax: 1 account");
    expect(consoleSpy.output()).toContain("MiniMax account 1");
  });
});
