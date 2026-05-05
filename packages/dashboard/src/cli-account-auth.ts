import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { MultiAccountAuthStore, type AddAccountResult } from "@fusion/core";

const execFileAsync = promisify(execFile);

export type CliAccountProviderId = "claude-cli" | "cursor" | "google-gemini-cli";

interface CliAccountProviderConfig {
  providerId: CliAccountProviderId;
  displayName: string;
  binary: string;
  loginArgs: string[];
  statusArgs: string[];
  env(home: string): NodeJS.ProcessEnv;
  browserSuppressionEnv?: NodeJS.ProcessEnv;
  manualCode?: CliManualCodeConfig;
  requiresPty?: boolean;
  prepareHome?(home: string): void;
  identityHint?(home: string, statusText: string): { material: string; label?: string; hint?: string };
}

export interface CliAccountBinaryProbe {
  available: boolean;
  binaryPath?: string;
  version?: string;
  reason?: string;
  probeDurationMs: number;
}

export interface CliManualCodeConfig {
  prompt: string;
  placeholder?: string;
  helpText?: string;
}

export interface StartedCliAccountLogin {
  providerId: CliAccountProviderId;
  url: string;
  instructions: string;
  manualCode?: CliManualCodeConfig;
  completion: Promise<AddAccountResult>;
  submitManualCode(code: string): boolean;
  cancel(): void;
}

export const CLI_ACCOUNT_PROVIDER_CONFIGS: Record<CliAccountProviderId, CliAccountProviderConfig> = {
  "claude-cli": {
    providerId: "claude-cli",
    displayName: "Claude",
    binary: "claude",
    loginArgs: ["auth", "login", "--claudeai"],
    statusArgs: ["auth", "status"],
    env: (home) => ({
      HOME: home,
      CLAUDE_CONFIG_DIR: join(home, ".claude"),
    }),
    browserSuppressionEnv: {
      BROWSER: "true",
    },
    manualCode: {
      prompt: "Paste the Claude authorization code",
      placeholder: "code...",
      helpText: "After Claude sign-in, copy the one-time code from the browser and submit it here so Fusion can finish adding this account.",
    },
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
    browserSuppressionEnv: {
      NO_OPEN_BROWSER: "1",
    },
  },
  "google-gemini-cli": {
    providerId: "google-gemini-cli",
    displayName: "Google Gemini CLI",
    binary: "gemini",
    loginArgs: [],
    statusArgs: ["--version"],
    requiresPty: true,
    env: (home) => ({
      HOME: home,
      GEMINI_FORCE_FILE_STORAGE: "true",
      NO_BROWSER: "true",
    }),
    prepareHome: (home) => {
      const geminiDir = join(home, ".gemini");
      mkdirSync(geminiDir, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(geminiDir, "settings.json"),
        `${JSON.stringify({ security: { auth: { selectedType: "oauth-personal" } } }, null, 2)}\n`,
        { mode: 0o600 },
      );
    },
    manualCode: {
      prompt: "Paste the Google authorization code",
      placeholder: "4/0...",
      helpText: "Complete Google sign-in in the browser tab, then copy the authorization code from Google and submit it here.",
    },
    identityHint: (home, statusText) => {
      const accountsPath = join(home, ".gemini", "google_accounts.json");
      try {
        const parsed = JSON.parse(readFileSync(accountsPath, "utf-8")) as { active?: unknown };
        if (typeof parsed.active === "string" && parsed.active.trim()) {
          return {
            material: parsed.active.trim(),
            label: parsed.active.trim(),
            hint: parsed.active.trim(),
          };
        }
      } catch {
        // Fall back to credential-file material below.
      }
      return {
        material: readIdentityMaterialFromHome(home) || statusText || home,
      };
    },
  },
};

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

function stableHash(providerId: string, value: string): string {
  return `sha256:${createHash("sha256").update(`${providerId}\0${value}`).digest("hex")}`;
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function extractFirstUrl(value: string): string | undefined {
  const match = stripAnsi(value).match(/https?:\/\/[^\s"'<>]+/);
  if (!match) return undefined;
  return match[0].replace(/[)\],.]+$/, "");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function loginInstructionsFor(config: CliAccountProviderConfig): string {
  if (config.providerId === "claude-cli") {
    return "Fusion opened the Claude login URL from this dashboard browser. Finish sign-in there, then paste the Claude authorization code below.";
  }
  if (config.providerId === "google-gemini-cli") {
    return "Fusion opened the Google Gemini login URL from this dashboard browser. Finish sign-in there, then paste the Google authorization code below.";
  }
  return "Fusion opened the login URL from this dashboard browser. Finish sign-in there and keep this Settings window open while Fusion records the account.";
}

function spawnLoginProcess(
  config: CliAccountProviderConfig,
  env: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  const mergedEnv = { ...process.env, ...env, ...(config.browserSuppressionEnv ?? {}) };
  if (!config.requiresPty) {
    return spawn(config.binary, config.loginArgs, {
      env: mergedEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  const envAssignments = Object.entries({ ...env, ...(config.browserSuppressionEnv ?? {}) })
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");
  const command = `${envAssignments} ${[config.binary, ...config.loginArgs].map(shellQuote).join(" ")}`.trim();
  return spawn("script", ["-qfec", command, "/dev/null"], {
    env: { ...process.env, TERM: process.env.TERM || "xterm-256color" },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function readIdentityMaterialFromHome(home: string): string | undefined {
  const root = join(home, ".gemini");
  const chunks: string[] = [];
  const visit = (dir: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        visit(path);
        continue;
      }
      if (!stat.isFile() || stat.size > 1024 * 1024) {
        continue;
      }
      try {
        chunks.push(`${path.slice(home.length)}\n${readFileSync(path, "utf-8")}`);
      } catch {
        // Ignore unreadable or binary files.
      }
    }
  };
  visit(root);
  return chunks.length > 0 ? chunks.join("\n---\n") : undefined;
}

function runInteractiveLoginProcess(
  config: CliAccountProviderConfig,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnLoginProcess(config, env);
    const onInput = (chunk: Buffer) => {
      if (child.stdin.writable) {
        child.stdin.write(chunk);
      }
    };
    process.stdin.on("data", onInput);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    const cleanup = () => {
      process.stdin.off("data", onInput);
    };
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      cleanup();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${config.binary} ${config.loginArgs.join(" ")} failed with exit code ${code ?? "unknown"}`));
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
  config.prepareHome?.(home);
  const env = config.env(home);

  await runInteractiveLoginProcess(config, env);

  const identityText = await runStatusProcess(config, env);
  const identity = config.identityHint?.(home, identityText) ?? {
    material: identityText || home,
    label: identityText.split(/\r?\n/).find((line) => line.trim())?.trim(),
    hint: identityText.split(/\r?\n/).find((line) => line.trim())?.trim(),
  };

  return accountStore.addCliHomeAccount({
    providerId,
    home,
    identityFingerprint: stableHash(providerId, identity.material),
    identityLabel: identity.label,
    accountDisplayHint: identity.hint,
    metadata: {
      source: "fusion-dashboard-login",
      binary: config.binary,
    },
  });
}

export function startCliAccountLogin(
  providerId: CliAccountProviderId,
  accountStore = new MultiAccountAuthStore(),
): Promise<StartedCliAccountLogin> {
  const config = CLI_ACCOUNT_PROVIDER_CONFIGS[providerId];
  const home = join(getHomeDir(), ".fusion", "agent", "account-homes", providerId, String(Date.now()));
  mkdirSync(home, { recursive: true, mode: 0o700 });
  config.prepareHome?.(home);
  const env = config.env(home);

  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnLoginProcess(config, env);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let output = "";
    let started = false;
    let completionResolve: (result: AddAccountResult) => void = () => {};
    let completionReject: (error: Error) => void = () => {};
    const completion = new Promise<AddAccountResult>((resolveCompletion, rejectCompletion) => {
      completionResolve = resolveCompletion;
      completionReject = rejectCompletion;
    });
    let startupTimeout: NodeJS.Timeout | undefined;

    const rejectStart = (error: Error) => {
      if (started) {
        completionReject(error);
        return;
      }
      reject(error);
    };

    const maybeResolveStart = () => {
      if (started) return;
      const url = extractFirstUrl(output);
      if (!url) return;
      started = true;
      if (startupTimeout) {
        clearTimeout(startupTimeout);
        startupTimeout = undefined;
      }
      resolve({
        providerId,
        url,
        instructions: loginInstructionsFor(config),
        ...(config.manualCode ? { manualCode: config.manualCode } : {}),
        completion,
        submitManualCode(code: string) {
          if (!child.stdin.writable) return false;
          child.stdin.write(`${code.trim()}\n`);
          return true;
        },
        cancel() {
          child.kill("SIGTERM");
        },
      });
    };

    startupTimeout = setTimeout(() => {
      rejectStart(new Error(`${config.displayName} login did not produce an authorization URL within 30 seconds`));
      child.kill("SIGTERM");
    }, 30_000);
    startupTimeout.unref();

    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf-8");
      maybeResolveStart();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => {
      if (startupTimeout) {
        clearTimeout(startupTimeout);
        startupTimeout = undefined;
      }
      rejectStart(error);
    });
    child.on("close", (code) => {
      if (startupTimeout) {
        clearTimeout(startupTimeout);
        startupTimeout = undefined;
      }
      if (code !== 0) {
        const message = stripAnsi(output).trim();
        rejectStart(new Error(`${config.displayName} login failed with exit code ${code ?? "unknown"}${message ? `: ${message}` : ""}`));
        return;
      }
      if (!started) {
        rejectStart(new Error(`${config.displayName} login completed before Fusion received an authorization URL`));
        return;
      }

      void (async () => {
        const statusText = await runStatusProcess(config, env);
        const identity = config.identityHint?.(home, statusText) ?? {
          material: statusText || home,
          label: statusText.split(/\r?\n/).find((line) => line.trim())?.trim(),
          hint: statusText.split(/\r?\n/).find((line) => line.trim())?.trim(),
        };
        return accountStore.addCliHomeAccount({
          providerId,
          home,
          identityFingerprint: stableHash(providerId, identity.material),
          identityLabel: identity.label,
          accountDisplayHint: identity.hint,
          metadata: {
            source: "fusion-dashboard-login",
            binary: config.binary,
          },
        });
      })().then(completionResolve, (error: unknown) => {
        completionReject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  });
}
