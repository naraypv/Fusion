import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MultiAccountAuthStore } from "@fusion/core";
import {
  DEFAULT_DSPY_ADAPTER_ROOT,
  buildDspyRoutedSystemPrompt,
  createDspyRoutingMetadata,
  syncFusionAccountsToDspyRegistry,
} from "../dspy-bridge.js";

describe("DSPy bridge", () => {
  it("leaves prompts unchanged when routing is disabled", () => {
    const metadata = createDspyRoutingMetadata({ enabled: false });
    expect(buildDspyRoutedSystemPrompt("base system", metadata)).toBe("base system");
  });

  it("adds a declarative DSPy routing contract when enabled", () => {
    const metadata = createDspyRoutingMetadata({ enabled: true, provider: "openai-codex", modelId: "gpt-5" });
    const prompt = buildDspyRoutedSystemPrompt("base system", metadata);
    expect(metadata.adapterRoot).toBe(DEFAULT_DSPY_ADAPTER_ROOT);
    expect(prompt).toContain("base system");
    expect(prompt).toContain("<fusion-dspy-routing>");
    expect(prompt).toContain("FusionAgentCall(system_prompt, user_request, tool_context, account_pool_state) -> agent_response");
    expect(prompt).toContain("dspy.ChainOfThought");
  });

  it("projects Fusion accounts into a DSPy SubscriptionLM-compatible registry without raw secrets", () => {
    const dir = mkdtempSync(join(tmpdir(), "fusion-dspy-"));
    const accountStore = new MultiAccountAuthStore(join(dir, "accounts.json"));
    accountStore.addCliHomeAccount({
      providerId: "claude-cli",
      home: join(dir, "claude-home"),
      identityFingerprint: "sha256:claude",
    });
    accountStore.addEnvApiKeyAccount("minimax", "MINIMAX_TEST_KEY", "mm-secret");

    const result = syncFusionAccountsToDspyRegistry({
      accountStore,
      registryPath: join(dir, "dspy", "accounts.json"),
      defaultModelId: "MiniMax-M2.7",
    });
    const raw = readFileSync(result.path, "utf-8");
    const parsed = JSON.parse(raw) as { accounts: Array<Record<string, unknown>> };

    expect(result.accountsWritten).toBe(2);
    expect(raw).not.toContain("mm-secret");
    expect(parsed.accounts.map((account) => account.provider)).toEqual(["claude", "minimax"]);
    expect(parsed.accounts[0]?.home).toBe(join(dir, "claude-home", ".claude"));
    expect(parsed.accounts[1]?.env_key).toBe("MINIMAX_TEST_KEY");
  });
});
