import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import { MultiAccountAuthStore, type AddAccountResult, type AccountCredentialSummary } from "@fusion/core";
import { createReadOnlyAuthFileStorage, mergeAuthStorageReads, wrapAuthStorageWithApiKeyProviders } from "./provider-auth.js";
import { getCodexCliAuthPath, getFusionAuthPath, getLegacyAuthPaths, getModelRegistryModelsPath } from "./auth-paths.js";

type AuthAction = "status" | "login" | "add-account" | "api-key" | "remove-account";

interface CliHomeProvider {
  providerId: "claude-cli" | "cursor";
  displayName: string;
  binary: string;
  loginArgs: string[];
  statusArgs: string[];
  env(home: string): NodeJS.ProcessEnv;
}

const PROVIDER_ALIASES: Record<string, string> = {
  codex: "openai-codex",
  "openai-codex": "openai-codex",
  openai: "openai-codex",
  claude: "claude-cli",
  anthropic: "claude-cli",
  "claude-cli": "claude-cli",
  cursor: "cursor",
  "cursor-agent": "cursor",
  minimax: "minimax",
};

const CLI_HOME_PROVIDERS: Record<string, CliHomeProvider> = {
  "claude-cli": {
    providerId: "claude-cli",
    displayName: "Claude",
    binary: "claude",
    loginArgs: ["auth", "login"],
    statusArgs: ["auth", "status"],
    env: (home) => ({
      HOME: home,
      CLAUDE_CONFIG_DIR: join(home, ".claude"),
    }),
  },
  cursor: {
    providerId: "cursor",
    displayName: "Cursor",
    binary: "cursor-agent",
    loginArgs: ["login"],
    statusArgs: ["status"],
    env: (home) => ({
      HOME: home,
      CURSOR_AGENT_HOME: join(home, ".cursor-agent"),
    }),
  },
};

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function normalizeProviderId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return PROVIDER_ALIASES[value.toLowerCase()] ?? value;
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function stableHash(providerId: string, value: string): string {
  return `sha256:${createHash("sha256").update(`${providerId}\0${value}`).digest("hex")}`;
}

function formatAccount(account: AccountCredentialSummary): string {
  const hint = account.accountDisplayHint ? ` (${account.accountDisplayHint})` : "";
  const cooldown = account.cooldownUntil ? ` until ${account.cooldownUntil}` : "";
  return `  - ${account.label}${hint} [${account.status}${cooldown}] id=${account.id}`;
}

function printAddAccountResult(result: AddAccountResult): void {
  console.log(result.message);
  console.log(formatAccount({
    id: result.account.id,
    providerId: result.account.providerId,
    label: result.account.label,
    credentialKind: result.account.credentialKind,
    accountDisplayHint: result.account.accountDisplayHint,
    priority: result.account.priority,
    status: result.account.status,
    createdAt: result.account.createdAt,
    updatedAt: result.account.updatedAt,
    cooldownUntil: result.account.cooldownUntil,
    failureCount: result.account.failureCount,
    lastFailure: result.account.lastFailure,
  }));
}

function createDashboardAuthStorage() {
  const primary = AuthStorage.create(getFusionAuthPath());
  const supplemental = createReadOnlyAuthFileStorage([
    ...getLegacyAuthPaths(),
    getCodexCliAuthPath(),
  ]);
  const merged = mergeAuthStorageReads(primary, [supplemental]);
  const modelRegistry = ModelRegistry.create(merged, getModelRegistryModelsPath());
  return wrapAuthStorageWithApiKeyProviders(merged, modelRegistry);
}

function runProcess(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; stdio?: "inherit" | "pipe" } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });
    }
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

async function captureCliHomeAccount(provider: CliHomeProvider, accountStore: MultiAccountAuthStore): Promise<AddAccountResult> {
  const home = join(getHomeDir(), ".fusion", "agent", "account-homes", provider.providerId, String(Date.now()));
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const env = provider.env(home);

  console.log(`Starting ${provider.displayName} login in an isolated Fusion account home.`);
  const login = await runProcess(provider.binary, provider.loginArgs, { env, stdio: "inherit" });
  if (login.code !== 0) {
    throw new Error(`${provider.displayName} login failed with exit code ${login.code ?? "unknown"}`);
  }

  const status = await runProcess(provider.binary, provider.statusArgs, { env, stdio: "pipe" }).catch(() => ({
    stdout: "",
    stderr: "",
    code: 1,
  }));
  const identityText = `${status.stdout}\n${status.stderr}`.trim() || home;
  const identityFingerprint = stableHash(provider.providerId, identityText);
  const identityLabel = identityText.split(/\r?\n/).find((line) => line.trim())?.trim();

  return accountStore.addCliHomeAccount({
    providerId: provider.providerId,
    home,
    identityFingerprint,
    identityLabel,
    accountDisplayHint: identityLabel,
    metadata: {
      source: "fusion-cli-login",
      binary: provider.binary,
    },
  });
}

async function loginOAuthProvider(providerId: string): Promise<void> {
  const storage = createDashboardAuthStorage();
  const found = storage.getOAuthProviders().find((provider) => provider.id === providerId);
  if (!found) {
    throw new Error(`Provider ${providerId} is not an OAuth provider. Use fn auth add-account ${providerId} --api-key <key> for API-key providers.`);
  }

  const result = await storage.login(providerId, {
    onAuth: (info) => {
      if (info.instructions) {
        console.log(info.instructions);
      }
      console.log(`Open this URL to continue login:\n${info.url}`);
    },
    onPrompt: async () => "",
    onProgress: (message) => console.log(message),
  });

  if (result) {
    printAddAccountResult(result);
  } else {
    console.log(`Logged in to ${providerId}.`);
  }
}

function printStatus(providerId?: string): void {
  const storage = createDashboardAuthStorage();
  storage.reload();
  const accounts = storage.listAccounts?.(providerId) ?? [];
  if (providerId) {
    console.log(`${providerId}: ${accounts.length} account${accounts.length === 1 ? "" : "s"}`);
  } else {
    console.log(`Fusion auth accounts: ${accounts.length}`);
  }
  for (const account of accounts) {
    console.log(formatAccount(account));
  }
}

async function addApiKeyAccount(providerId: string, apiKey: string | undefined, envKey: string | undefined): Promise<void> {
  const accountStore = new MultiAccountAuthStore();
  if (envKey) {
    const value = process.env[envKey];
    if (!value) {
      throw new Error(`Environment variable ${envKey} is not set.`);
    }
    printAddAccountResult(accountStore.addEnvApiKeyAccount(providerId, envKey, value, {
      metadata: { source: "fusion-cli-env-api-key" },
    }));
    return;
  }
  if (!apiKey) {
    throw new Error(`Usage: fn auth add-account ${providerId} --api-key <key> or --env <ENV_VAR>`);
  }
  const storage = createDashboardAuthStorage();
  const result = storage.setApiKey(providerId, apiKey);
  if (result) {
    printAddAccountResult(result);
  }
}

export async function runAuth(args: string[]): Promise<void> {
  const action = (args[0] ?? "status") as AuthAction;
  const providerId = normalizeProviderId(args[1]);

  switch (action) {
    case "status":
      printStatus(providerId);
      return;
    case "login":
    case "add-account": {
      if (!providerId) {
        throw new Error(`Usage: fn auth ${action} <codex|claude|cursor|minimax>`);
      }
      if (providerId === "minimax") {
        await addApiKeyAccount(providerId, getFlagValue(args, "--api-key"), getFlagValue(args, "--env"));
        return;
      }
      const cliProvider = CLI_HOME_PROVIDERS[providerId];
      if (cliProvider) {
        printAddAccountResult(await captureCliHomeAccount(cliProvider, new MultiAccountAuthStore()));
        return;
      }
      await loginOAuthProvider(providerId);
      return;
    }
    case "api-key": {
      const subcommand = args[1];
      const apiProviderId = normalizeProviderId(args[2]);
      if (subcommand !== "add" || !apiProviderId) {
        throw new Error("Usage: fn auth api-key add <provider> --api-key <key> or --env <ENV_VAR>");
      }
      await addApiKeyAccount(apiProviderId, getFlagValue(args, "--api-key"), getFlagValue(args, "--env"));
      return;
    }
    case "remove-account": {
      const accountId = args[1];
      if (!accountId) {
        throw new Error("Usage: fn auth remove-account <account-id>");
      }
      const removed = new MultiAccountAuthStore().removeAccount(accountId);
      console.log(removed ? `Removed account ${accountId}.` : `Account ${accountId} was not found.`);
      return;
    }
    default:
      throw new Error(`Unknown auth command: ${action}. Try: fn auth status | login | add-account | api-key | remove-account`);
  }
}
