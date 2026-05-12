import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MultiAccountAuthStore, getFusionAccountsPath } from "../multi-account-auth.js";

function tempAccountPath(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "fusion-account-auth-"));
  return { dir, path: join(dir, ".fusion", "agent", "accounts.json") };
}

describe("MultiAccountAuthStore", () => {
  it("stores multiple OAuth accounts for the same provider and masks summaries", () => {
    const { dir, path } = tempAccountPath();
    try {
      const store = new MultiAccountAuthStore(path);

      const first = store.addCredentialAccount("openai-codex", {
        type: "oauth",
        access: "access-1",
        refresh: "refresh-1",
        expires: Date.now() + 60_000,
        accountId: "acct_1",
      });
      const second = store.addCredentialAccount("openai-codex", {
        type: "oauth",
        access: "access-2",
        refresh: "refresh-2",
        expires: Date.now() + 60_000,
        accountId: "acct_2",
      });

      expect(first.status).toBe("added");
      expect(second.status).toBe("added");
      expect(store.list("openai-codex")).toHaveLength(2);
      expect(store.listSummaries("openai-codex")[0]).not.toHaveProperty("credential");
      expect(existsSync(path)).toBe(true);
      if (process.platform !== "win32") {
        expect((statSync(path).mode & 0o777).toString(8)).toBe("600");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects same-account OAuth logins without creating duplicates", () => {
    const { dir, path } = tempAccountPath();
    try {
      const store = new MultiAccountAuthStore(path);
      const first = store.addCredentialAccount("openai-codex", {
        type: "oauth",
        access: "old-access",
        refresh: "old-refresh",
        expires: Date.now() + 60_000,
        accountId: "acct_same",
      });
      const duplicate = store.addCredentialAccount("openai-codex", {
        type: "oauth",
        access: "new-access",
        refresh: "new-refresh",
        expires: Date.now() + 120_000,
        accountId: "acct_same",
      });

      expect(first.status).toBe("added");
      expect(duplicate.status).toBe("same-account");
      expect(duplicate.message).toContain("already logged in");
      expect(store.list("openai-codex")).toHaveLength(1);
      expect(store.credentialFor("openai-codex")?.access).toBe("new-access");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects same MiniMax token-plan key and keeps different keys as separate accounts", () => {
    const { dir, path } = tempAccountPath();
    try {
      const store = new MultiAccountAuthStore(path);

      expect(store.addApiKeyAccount("minimax", "minimax-key-1").status).toBe("added");
      expect(store.addApiKeyAccount("minimax", "minimax-key-1").status).toBe("same-account");
      expect(store.addApiKeyAccount("minimax", "minimax-key-2").status).toBe("added");

      const accounts = store.list("minimax");
      expect(accounts).toHaveLength(2);
      expect(accounts[0]?.accountDisplayHint).toBe("min•••••ey-1");
      expect(store.credentialFor("minimax")?.key).toBe("minimax-key-1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("selects active accounts by priority and skips cooldown accounts", () => {
    const { dir, path } = tempAccountPath();
    try {
      const store = new MultiAccountAuthStore(path);
      const high = store.addApiKeyAccount("minimax", "high", { priority: 10 }).account;
      const low = store.addApiKeyAccount("minimax", "low", { priority: 20 }).account;

      expect(store.selectAccount({ providerId: "minimax" })?.id).toBe(high.id);
      store.markFailure({
        accountId: high.id,
        failure: { kind: "rate_limit", message: "429", at: new Date().toISOString() },
        cooldownMs: 60_000,
      });

      expect(store.selectAccount({ providerId: "minimax" })?.id).toBe(low.id);
      store.markSuccess(high.id);
      expect(store.selectAccount({ providerId: "minimax" })?.id).toBe(high.id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("switches the default account for a provider", () => {
    const { dir, path } = tempAccountPath();
    try {
      const store = new MultiAccountAuthStore(path);
      const first = store.addApiKeyAccount("minimax", "first", { priority: 10 }).account;
      const second = store.addApiKeyAccount("minimax", "second", { priority: 20 }).account;

      expect(store.selectAccount({ providerId: "minimax" })?.id).toBe(first.id);

      const switched = store.switchAccount(second.id);

      expect(switched?.id).toBe(second.id);
      expect(store.selectAccount({ providerId: "minimax" })?.id).toBe(second.id);
      expect(store.credentialFor("minimax")?.key).toBe("second");
      const summaries = store.listSummaries("minimax");
      expect(summaries.find((account) => account.id === first.id)).not.toHaveProperty("isDefault");
      expect(summaries.find((account) => account.id === second.id)).toEqual(
        expect.objectContaining({ isDefault: true }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("registers CLI-home OAuth accounts without storing raw tokens", () => {
    const { dir, path } = tempAccountPath();
    try {
      const store = new MultiAccountAuthStore(path);
      const first = store.addCliHomeAccount({
        providerId: "cursor",
        home: join(dir, "cursor-home-1"),
        identityFingerprint: "sha256:cursor-identity",
        identityLabel: "user@example.com",
      });
      const duplicate = store.addCliHomeAccount({
        providerId: "cursor",
        home: join(dir, "cursor-home-2"),
        identityFingerprint: "sha256:cursor-identity",
        identityLabel: "user@example.com",
      });

      expect(first.status).toBe("added");
      expect(duplicate.status).toBe("same-account");
      const accounts = store.list("cursor");
      expect(accounts).toEqual([
        expect.objectContaining({
          credentialKind: "cli_oauth_home",
          home: join(dir, "cursor-home-1"),
        }),
      ]);
      expect(accounts[0]).not.toHaveProperty("credential");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves the default Fusion account-store path under the user home", () => {
    expect(getFusionAccountsPath("/tmp/home")).toBe("/tmp/home/.fusion/agent/accounts.json");
  });
});
