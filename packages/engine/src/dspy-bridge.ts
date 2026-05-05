import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { MultiAccountAuthStore, type AccountCredentialRecord } from "@fusion/core";

export interface DspyRoutingMetadata {
  enabled: boolean;
  adapterRoot: string;
  accountRegistryPath?: string;
  signatureName: string;
  moduleName: string;
  provider?: string;
  modelId?: string;
}

export const DEFAULT_DSPY_ADAPTER_ROOT = "/media/naray/backup_np_2/github/dspy";
export const DSPY_ACCOUNT_REGISTRY_VERSION = 1;

interface DspyAccountRef {
  name: string;
  provider: "claude" | "codex" | "cursor" | "minimax";
  model?: string;
  env_key?: string;
  command?: string;
  home?: string;
  priority: number;
  metadata?: Record<string, string>;
}

export interface DspyAccountRegistrySyncResult {
  path: string;
  accountsWritten: number;
}

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function safeEnvName(accountId: string): string {
  return `FUSION_DSPY_ACCOUNT_${accountId.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_API_KEY`;
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function mapDspyProvider(providerId: string): DspyAccountRef["provider"] | undefined {
  if (providerId === "openai-codex" || providerId === "codex") return "codex";
  if (providerId === "claude-cli" || providerId === "anthropic" || providerId === "claude") return "claude";
  if (providerId === "cursor") return "cursor";
  if (providerId === "minimax") return "minimax";
  return undefined;
}

function commandForProvider(provider: DspyAccountRef["provider"]): string | undefined {
  if (provider === "codex") return "codex";
  if (provider === "claude") return "claude";
  if (provider === "cursor") return "cursor-agent";
  return undefined;
}

function homeForDspyAccount(account: AccountCredentialRecord, provider: DspyAccountRef["provider"]): string | undefined {
  if (!account.home) return undefined;
  if (provider === "claude" && account.providerId === "claude-cli") {
    return join(account.home, ".claude");
  }
  return account.home;
}

function toDspyAccountRef(account: AccountCredentialRecord, defaultModelId?: string): DspyAccountRef | undefined {
  const provider = mapDspyProvider(account.providerId);
  if (!provider || account.status === "disabled") {
    return undefined;
  }

  let envKey = account.envKey;
  if (!envKey && account.credential?.type === "api_key" && typeof account.credential.key === "string") {
    envKey = safeEnvName(account.id);
    process.env[envKey] = account.credential.key;
  }

  const home = homeForDspyAccount(account, provider);
  if (provider === "minimax" && !envKey) {
    return undefined;
  }
  if ((provider === "claude" || provider === "cursor" || provider === "codex") && !home && !account.credential) {
    return undefined;
  }

  const metadata: Record<string, string> = {
    fusion_account_id: account.id,
    fusion_provider_id: account.providerId,
    credential_kind: account.credentialKind,
  };
  if (account.accountDisplayHint) {
    metadata.account_hint = account.accountDisplayHint;
  }
  if (account.credential?.type === "api_key" && typeof account.credential.key === "string") {
    metadata.secret_fingerprint = hashSecret(account.credential.key);
  }

  return {
    name: account.id,
    provider,
    priority: account.priority,
    ...(defaultModelId ? { model: defaultModelId } : {}),
    ...(envKey ? { env_key: envKey } : {}),
    ...(commandForProvider(provider) ? { command: commandForProvider(provider) } : {}),
    ...(home ? { home } : {}),
    metadata,
  };
}

export function syncFusionAccountsToDspyRegistry(options: {
  accountStore?: MultiAccountAuthStore;
  registryPath?: string;
  defaultModelId?: string;
} = {}): DspyAccountRegistrySyncResult {
  const accountStore = options.accountStore ?? new MultiAccountAuthStore();
  const registryPath = options.registryPath
    ?? join(process.env.DSPY_ACCOUNT_CONFIG_DIR ?? join(getHomeDir(), ".fusion", "dspy"), "accounts.json");
  const accounts = accountStore
    .list()
    .map((account) => toDspyAccountRef(account, options.defaultModelId))
    .filter((account): account is DspyAccountRef => Boolean(account));

  mkdirSync(dirname(registryPath), { recursive: true, mode: 0o700 });
  writeFileSync(
    registryPath,
    `${JSON.stringify({ version: DSPY_ACCOUNT_REGISTRY_VERSION, accounts }, null, 2)}\n`,
    { mode: 0o600 },
  );
  try {
    chmodSync(registryPath, 0o600);
  } catch {
    // Best effort for non-POSIX filesystems.
  }
  process.env.DSPY_ACCOUNT_CONFIG_DIR = dirname(registryPath);

  return { path: registryPath, accountsWritten: accounts.length };
}

export function createDspyRoutingMetadata(options: {
  enabled?: boolean;
  provider?: string;
  modelId?: string;
  adapterRoot?: string;
  accountRegistryPath?: string;
}): DspyRoutingMetadata {
  return {
    enabled: options.enabled === true,
    adapterRoot: options.adapterRoot ?? process.env.FUSION_DSPY_ADAPTER_ROOT ?? DEFAULT_DSPY_ADAPTER_ROOT,
    ...(options.accountRegistryPath ? { accountRegistryPath: options.accountRegistryPath } : {}),
    signatureName: "FusionAgentCall",
    moduleName: "FusionAgentProgram",
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.modelId ? { modelId: options.modelId } : {}),
  };
}

export function buildDspyRoutedSystemPrompt(systemPrompt: string, metadata: DspyRoutingMetadata): string {
  if (!metadata.enabled) {
    return systemPrompt;
  }

  const routingContract = [
    "<fusion-dspy-routing>",
    `adapter_root: ${metadata.adapterRoot}`,
    ...(metadata.accountRegistryPath ? [`account_config_dir: ${dirname(metadata.accountRegistryPath)}`] : []),
    ...(metadata.accountRegistryPath ? [`account_registry: ${metadata.accountRegistryPath}`] : []),
    `module: ${metadata.moduleName}`,
    `signature: ${metadata.signatureName}(system_prompt, user_request, tool_context, account_pool_state) -> agent_response`,
    "predictor: dspy.ChainOfThought",
    "lm: dspy.SubscriptionLM.from_registry(providers=['codex', 'claude', 'cursor', 'minimax'])",
    "routing: all LLM completions for this Fusion session are declared as DSPy program calls before provider execution",
    "quality_contract: preserve the existing Fusion behavior while treating instructions, inputs, outputs, and tool observations as typed DSPy fields",
    "</fusion-dspy-routing>",
  ].join("\n");

  return `${systemPrompt}\n\n${routingContract}`;
}
