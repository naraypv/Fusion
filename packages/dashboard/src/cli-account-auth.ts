import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { MultiAccountAuthStore, type AddAccountResult } from "@fusion/core";

const execFileAsync = promisify(execFile);

export type CliAccountProviderId = "claude-cli" | "cursor";

interface CliAccountProviderConfig {
  providerId: CliAccountProviderId;
  displayName: string;
  binary: string;
  loginArgs: string[];
  statusArgs: string[];
  env(home: string): NodeJS.ProcessEnv;
}

export interface CliAccountBinaryProbe {
  available: boolean;
  binaryPath?: string;
  version?: string;
  reason?: string;
  probeDurationMs: number;
}

export const CLI_ACCOUNT_PROVIDER_CONFIGS: Record<CliAccountProviderId, CliAccountProviderConfig> = {
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

function stableHash(providerId: string, value: string): string {
  return `sha256:${createHash("sha256").update(`${providerId}\0${value}`).digest("hex")}`;
}

function runLoginProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function runStatusProcess(config: CliAccountProviderConfig, env: NodeJS.ProcessEnv): Promise<string> {
  try {
    const result = await execFileAsync(config.binary, config.statusArgs, {
      env: { ...process.env, ...env },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    return `${result.stdout}\n${result.stderr}`.trim();
  } catch (error) {
    const err = error as { stdout?: unknown; stderr?: unknown; message?: string };
    return [err.stdout, err.stderr, err.message].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n").trim();
  }
}

export async function probeCliAccountProvider(providerId: CliAccountProviderId): Promise<CliAccountBinaryProbe> {
  const config = CLI_ACCOUNT_PROVIDER_CONFIGS[providerId];
  const started = Date.now();
  try {
    const version = await execFileAsync(config.binary, ["--version"], {
      timeout: 5_000,
      maxBuffer: 256 * 1024,
    }).catch(async () => await execFileAsync(config.binary, config.statusArgs, {
      timeout: 5_000,
      maxBuffer: 256 * 1024,
    }));
    return {
      available: true,
      version: `${version.stdout}\n${version.stderr}`.trim() || undefined,
      probeDurationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      probeDurationMs: Date.now() - started,
    };
  }
}

export async function captureCliAccount(
  providerId: CliAccountProviderId,
  accountStore = new MultiAccountAuthStore(),
): Promise<AddAccountResult> {
  const config = CLI_ACCOUNT_PROVIDER_CONFIGS[providerId];
  const home = join(getHomeDir(), ".fusion", "agent", "account-homes", providerId, String(Date.now()));
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const env = config.env(home);

  await runLoginProcess(config.binary, config.loginArgs, env);

  const identityText = await runStatusProcess(config, env);
  const identityMaterial = identityText || home;
  const identityLabel = identityText.split(/\r?\n/).find((line) => line.trim())?.trim();

  return accountStore.addCliHomeAccount({
    providerId,
    home,
    identityFingerprint: stableHash(providerId, identityMaterial),
    identityLabel,
    accountDisplayHint: identityLabel,
    metadata: {
      source: "fusion-dashboard-login",
      binary: config.binary,
    },
  });
}
