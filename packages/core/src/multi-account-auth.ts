import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { StoredAuthCredential } from "./oauth-credential-interop.js";

export const MULTI_ACCOUNT_AUTH_VERSION = 1;

export type AccountCredentialKind =
  | "oauth"
  | "api_key"
  | "cli_oauth_home"
  | "env_api_key";

export type AccountCredentialStatus = "active" | "cooldown" | "disabled";

export interface AccountFailureState {
  kind: "rate_limit" | "quota" | "auth" | "transient" | "unknown";
  message: string;
  at: string;
}

export interface AccountCredentialRecord {
  id: string;
  providerId: string;
  label: string;
  credentialKind: AccountCredentialKind;
  accountFingerprint: string;
  accountDisplayHint?: string;
  priority: number;
  status: AccountCredentialStatus;
  createdAt: string;
  updatedAt: string;
  cooldownUntil?: string;
  failureCount?: number;
  lastFailure?: AccountFailureState;
  credential?: StoredAuthCredential;
  envKey?: string;
  home?: string;
  metadata?: Record<string, string>;
}

export interface AccountAuthFile {
  version: number;
  accounts: AccountCredentialRecord[];
}

export interface AccountCredentialSummary {
  id: string;
  providerId: string;
  label: string;
  credentialKind: AccountCredentialKind;
  accountDisplayHint?: string;
  priority: number;
  status: AccountCredentialStatus;
  createdAt: string;
  updatedAt: string;
  cooldownUntil?: string;
  failureCount?: number;
  lastFailure?: AccountFailureState;
}

export interface AddAccountResult {
  status: "added" | "same-account";
  account: AccountCredentialRecord;
  accounts: AccountCredentialRecord[];
  message: string;
}

export interface AddCredentialAccountOptions {
  label?: string;
  accountDisplayHint?: string;
  priority?: number;
  now?: Date;
  metadata?: Record<string, string>;
}

export interface AddCliHomeAccountOptions extends AddCredentialAccountOptions {
  providerId: string;
  credentialKind?: "cli_oauth_home";
  home: string;
  identityFingerprint: string;
  identityLabel?: string;
}

export interface AccountSelectionOptions {
  providerId: string;
  accountId?: string;
  now?: Date;
}

export interface MarkAccountFailureOptions {
  accountId: string;
  failure: AccountFailureState;
  cooldownMs?: number;
  now?: Date;
}

function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

export function getFusionAccountsPath(home = getHomeDir()): string {
  return join(home, ".fusion", "agent", "accounts.json");
}

function stableHash(providerId: string, value: string): string {
  return `sha256:${createHash("sha256").update(`${providerId}\0${value}`).digest("hex")}`;
}

function stableShortId(providerId: string, fingerprint: string): string {
  const digest = createHash("sha256").update(`${providerId}\0${fingerprint}`).digest("hex").slice(0, 12);
  return `${providerId.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}-${digest}`;
}

function parseJwtPayload(token: string | undefined): Record<string, unknown> | undefined {
  if (!token) return undefined;
  try {
    const [, payload = ""] = token.split(".", 3);
    if (!payload) return undefined;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function titleCaseProvider(providerId: string): string {
  if (providerId === "openai-codex") return "OpenAI Codex";
  if (providerId === "minimax") return "MiniMax";
  if (providerId === "claude" || providerId === "claude-cli" || providerId === "anthropic") return "Claude";
  if (providerId === "cursor") return "Cursor";
  return providerId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function nextLabel(providerId: string, accounts: AccountCredentialRecord[]): string {
  const base = `${titleCaseProvider(providerId)} account`;
  let index = 1;
  const existing = new Set(accounts.filter((account) => account.providerId === providerId).map((account) => account.label));
  while (existing.has(`${base} ${index}`)) {
    index += 1;
  }
  return `${base} ${index}`;
}

function maskSecret(secret: string | undefined): string | undefined {
  if (!secret) return undefined;
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 3)}•••••${trimmed.slice(-4)}`;
}

function identityFromCredential(
  providerId: string,
  credential: StoredAuthCredential,
): { fingerprint: string; hint?: string; label?: string } {
  if (credential.type === "api_key") {
    const key = typeof credential.key === "string" ? credential.key : "";
    return {
      fingerprint: stableHash(providerId, key),
      hint: maskSecret(key),
    };
  }

  const accessPayload = parseJwtPayload(credential.access);
  const idPayload = parseJwtPayload(typeof credential.id === "string" ? credential.id : undefined)
    ?? parseJwtPayload(typeof credential.id_token === "string" ? credential.id_token : undefined);
  const authClaim = accessPayload?.["https://api.openai.com/auth"];
  const authRecord = authClaim && typeof authClaim === "object" ? authClaim as Record<string, unknown> : {};
  const accountMaterial = firstNonEmptyString(
    credential.accountId,
    authRecord.chatgpt_account_id,
    authRecord.chatgpt_user_id,
    authRecord.user_id,
    accessPayload?.sub,
    idPayload?.sub,
    idPayload?.email,
    credential.refresh,
    credential.access,
  );
  const label = firstNonEmptyString(idPayload?.email, idPayload?.name, accessPayload?.email, accessPayload?.name);
  const hint = label ?? (accountMaterial ? maskSecret(accountMaterial) : undefined);
  return {
    fingerprint: stableHash(providerId, accountMaterial ?? JSON.stringify(credential)),
    hint,
    label,
  };
}

function normalizeRecord(value: unknown): AccountCredentialRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Partial<AccountCredentialRecord>;
  if (
    typeof record.id !== "string" ||
    typeof record.providerId !== "string" ||
    typeof record.label !== "string" ||
    typeof record.accountFingerprint !== "string"
  ) {
    return undefined;
  }
  const credentialKind = record.credentialKind ?? record.credential?.type;
  if (
    credentialKind !== "oauth" &&
    credentialKind !== "api_key" &&
    credentialKind !== "cli_oauth_home" &&
    credentialKind !== "env_api_key"
  ) {
    return undefined;
  }
  const status =
    record.status === "disabled" || record.status === "cooldown" || record.status === "active"
      ? record.status
      : "active";
  const priority = typeof record.priority === "number" && Number.isFinite(record.priority)
    ? record.priority
    : 100;
  return {
    id: record.id,
    providerId: record.providerId,
    label: record.label,
    credentialKind,
    accountFingerprint: record.accountFingerprint,
    ...(record.accountDisplayHint ? { accountDisplayHint: record.accountDisplayHint } : {}),
    priority,
    status,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    ...(record.cooldownUntil ? { cooldownUntil: record.cooldownUntil } : {}),
    ...(typeof record.failureCount === "number" ? { failureCount: record.failureCount } : {}),
    ...(record.lastFailure ? { lastFailure: record.lastFailure } : {}),
    ...(record.credential ? { credential: record.credential } : {}),
    ...(record.envKey ? { envKey: record.envKey } : {}),
    ...(record.home ? { home: record.home } : {}),
    ...(record.metadata ? { metadata: record.metadata } : {}),
  };
}

export function summarizeAccount(account: AccountCredentialRecord): AccountCredentialSummary {
  return {
    id: account.id,
    providerId: account.providerId,
    label: account.label,
    credentialKind: account.credentialKind,
    ...(account.accountDisplayHint ? { accountDisplayHint: account.accountDisplayHint } : {}),
    priority: account.priority,
    status: account.status,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    ...(account.cooldownUntil ? { cooldownUntil: account.cooldownUntil } : {}),
    ...(typeof account.failureCount === "number" ? { failureCount: account.failureCount } : {}),
    ...(account.lastFailure ? { lastFailure: account.lastFailure } : {}),
  };
}

export class MultiAccountAuthStore {
  constructor(private readonly path = getFusionAccountsPath()) {}

  getPath(): string {
    return this.path;
  }

  read(): AccountAuthFile {
    if (!existsSync(this.path)) {
      return { version: MULTI_ACCOUNT_AUTH_VERSION, accounts: [] };
    }

    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { version: MULTI_ACCOUNT_AUTH_VERSION, accounts: [] };
      }
      const rawAccounts = (parsed as { accounts?: unknown }).accounts;
      if (!Array.isArray(rawAccounts)) {
        return { version: MULTI_ACCOUNT_AUTH_VERSION, accounts: [] };
      }
      return {
        version: MULTI_ACCOUNT_AUTH_VERSION,
        accounts: rawAccounts.map(normalizeRecord).filter((account): account is AccountCredentialRecord => Boolean(account)),
      };
    } catch {
      return { version: MULTI_ACCOUNT_AUTH_VERSION, accounts: [] };
    }
  }

  list(providerId?: string): AccountCredentialRecord[] {
    const accounts = this.read().accounts;
    return providerId ? accounts.filter((account) => account.providerId === providerId) : accounts;
  }

  listSummaries(providerId?: string): AccountCredentialSummary[] {
    return this.list(providerId).map(summarizeAccount);
  }

  addCredentialAccount(
    providerId: string,
    credential: StoredAuthCredential,
    options: AddCredentialAccountOptions = {},
  ): AddAccountResult {
    const now = (options.now ?? new Date()).toISOString();
    const data = this.read();
    const identity = identityFromCredential(providerId, credential);
    const existing = data.accounts.find(
      (account) => account.providerId === providerId && account.accountFingerprint === identity.fingerprint,
    );
    if (existing) {
      const updated: AccountCredentialRecord = {
        ...existing,
        credential,
        updatedAt: now,
        ...(options.accountDisplayHint || identity.hint
          ? { accountDisplayHint: options.accountDisplayHint ?? identity.hint }
          : {}),
        ...(options.metadata ? { metadata: { ...(existing.metadata ?? {}), ...options.metadata } } : {}),
      };
      data.accounts = data.accounts.map((account) => account.id === existing.id ? updated : account);
      this.write(data);
      return {
        status: "same-account",
        account: updated,
        accounts: data.accounts,
        message: `${titleCaseProvider(providerId)} is already logged in as ${updated.label}; no new account was added.`,
      };
    }

    const record: AccountCredentialRecord = {
      id: stableShortId(providerId, identity.fingerprint),
      providerId,
      label: options.label ?? identity.label ?? nextLabel(providerId, data.accounts),
      credentialKind: credential.type === "api_key" ? "api_key" : "oauth",
      accountFingerprint: identity.fingerprint,
      ...(options.accountDisplayHint || identity.hint ? { accountDisplayHint: options.accountDisplayHint ?? identity.hint } : {}),
      priority: options.priority ?? 100,
      status: "active",
      createdAt: now,
      updatedAt: now,
      credential,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    };
    data.accounts.push(record);
    this.write(data);
    return {
      status: "added",
      account: record,
      accounts: data.accounts,
      message: `Added ${record.label}.`,
    };
  }

  addApiKeyAccount(
    providerId: string,
    apiKey: string,
    options: AddCredentialAccountOptions = {},
  ): AddAccountResult {
    return this.addCredentialAccount(providerId, { type: "api_key", key: apiKey }, options);
  }

  addEnvApiKeyAccount(
    providerId: string,
    envKey: string,
    secretValue: string,
    options: AddCredentialAccountOptions = {},
  ): AddAccountResult {
    const now = (options.now ?? new Date()).toISOString();
    const data = this.read();
    const fingerprint = stableHash(providerId, secretValue);
    const existing = data.accounts.find(
      (account) => account.providerId === providerId && account.accountFingerprint === fingerprint,
    );
    if (existing) {
      return {
        status: "same-account",
        account: existing,
        accounts: data.accounts,
        message: `${titleCaseProvider(providerId)} is already logged in as ${existing.label}; no new account was added.`,
      };
    }
    const record: AccountCredentialRecord = {
      id: stableShortId(providerId, fingerprint),
      providerId,
      label: options.label ?? nextLabel(providerId, data.accounts),
      credentialKind: "env_api_key",
      accountFingerprint: fingerprint,
      accountDisplayHint: envKey,
      priority: options.priority ?? 100,
      status: "active",
      createdAt: now,
      updatedAt: now,
      envKey,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    };
    data.accounts.push(record);
    this.write(data);
    return {
      status: "added",
      account: record,
      accounts: data.accounts,
      message: `Added ${record.label}.`,
    };
  }

  addCliHomeAccount(options: AddCliHomeAccountOptions): AddAccountResult {
    const now = (options.now ?? new Date()).toISOString();
    const data = this.read();
    const existing = data.accounts.find(
      (account) => account.providerId === options.providerId && account.accountFingerprint === options.identityFingerprint,
    );
    if (existing) {
      return {
        status: "same-account",
        account: existing,
        accounts: data.accounts,
        message: `${titleCaseProvider(options.providerId)} is already logged in as ${existing.label}; no new account was added.`,
      };
    }
    const record: AccountCredentialRecord = {
      id: stableShortId(options.providerId, options.identityFingerprint),
      providerId: options.providerId,
      label: options.label ?? options.identityLabel ?? nextLabel(options.providerId, data.accounts),
      credentialKind: options.credentialKind ?? "cli_oauth_home",
      accountFingerprint: options.identityFingerprint,
      ...(options.accountDisplayHint || options.identityLabel ? { accountDisplayHint: options.accountDisplayHint ?? options.identityLabel } : {}),
      priority: options.priority ?? 100,
      status: "active",
      createdAt: now,
      updatedAt: now,
      home: options.home,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    };
    data.accounts.push(record);
    this.write(data);
    return {
      status: "added",
      account: record,
      accounts: data.accounts,
      message: `Added ${record.label}.`,
    };
  }

  selectAccount(options: AccountSelectionOptions): AccountCredentialRecord | undefined {
    const now = options.now ?? new Date();
    const accounts = this.list(options.providerId);
    if (options.accountId) {
      return accounts.find((account) => account.id === options.accountId && account.status !== "disabled");
    }
    return accounts
      .filter((account) => account.status !== "disabled")
      .filter((account) => !account.cooldownUntil || Date.parse(account.cooldownUntil) <= now.getTime())
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))[0];
  }

  credentialFor(providerId: string, accountId?: string): StoredAuthCredential | undefined {
    const account = this.selectAccount({ providerId, accountId });
    if (!account) return undefined;
    if (account.credential) return account.credential;
    if (account.envKey) {
      const key = process.env[account.envKey];
      return key ? { type: "api_key", key } : undefined;
    }
    return undefined;
  }

  markFailure(options: MarkAccountFailureOptions): AccountCredentialRecord | undefined {
    const now = options.now ?? new Date();
    const data = this.read();
    let updated: AccountCredentialRecord | undefined;
    data.accounts = data.accounts.map((account) => {
      if (account.id !== options.accountId) return account;
      const cooldownUntil = options.cooldownMs && options.cooldownMs > 0
        ? new Date(now.getTime() + options.cooldownMs).toISOString()
        : undefined;
      updated = {
        ...account,
        status: cooldownUntil ? "cooldown" : account.status,
        ...(cooldownUntil ? { cooldownUntil } : {}),
        failureCount: (account.failureCount ?? 0) + 1,
        lastFailure: options.failure,
        updatedAt: now.toISOString(),
      };
      return updated;
    });
    if (updated) {
      this.write(data);
    }
    return updated;
  }

  markSuccess(accountId: string, now = new Date()): AccountCredentialRecord | undefined {
    const data = this.read();
    let updated: AccountCredentialRecord | undefined;
    data.accounts = data.accounts.map((account) => {
      if (account.id !== accountId) return account;
      updated = {
        ...account,
        status: "active",
        updatedAt: now.toISOString(),
        failureCount: 0,
      };
      delete updated.cooldownUntil;
      delete updated.lastFailure;
      return updated;
    });
    if (updated) {
      this.write(data);
    }
    return updated;
  }

  removeAccount(accountId: string): boolean {
    const data = this.read();
    const before = data.accounts.length;
    data.accounts = data.accounts.filter((account) => account.id !== accountId);
    if (data.accounts.length === before) {
      return false;
    }
    this.write(data);
    return true;
  }

  private write(data: AccountAuthFile): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const tmpPath = `${this.path}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify({ version: MULTI_ACCOUNT_AUTH_VERSION, accounts: data.accounts }, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(tmpPath, this.path);
    try {
      chmodSync(this.path, 0o600);
    } catch {
      // Best effort for non-POSIX filesystems.
    }
  }
}
