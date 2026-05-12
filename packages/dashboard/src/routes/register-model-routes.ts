import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolvePlanningSettingsModel, type AccountCredentialSummary } from "@fusion/core";
import { ApiError } from "../api-error.js";
import type { ApiRouteRegistrar } from "./types.js";

/**
 * Read provider names from Fusion's own auth stores (primary + legacy .pi).
 * These represent providers the user has explicitly configured in Fusion,
 * as opposed to supplemental credentials inherited from Codex CLI,
 * Claude Code, or environment variables.
 */
async function getConfiguredProviderNames(): Promise<Set<string>> {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  const providers = new Set<string>();

  // Fusion primary + legacy .pi auth files
  const authPaths = [
    join(home, ".fusion", "agent", "auth.json"),
    join(home, ".pi", "agent", "auth.json"),
    join(home, ".pi", "auth.json"),
  ];

  for (const authPath of authPaths) {
    try {
      await access(authPath);
      const parsed = JSON.parse(await readFile(authPath, "utf-8")) as Record<string, unknown>;
      for (const key of Object.keys(parsed)) {
        providers.add(key);
      }
    } catch {
      // Ignore missing or invalid auth files
    }
  }

  // Check models.json for providers with inline API keys
  const modelsPaths = [
    join(home, ".fusion", "agent", "models.json"),
    join(home, ".pi", "agent", "models.json"),
    join(home, ".pi", "models.json"),
  ];
  for (const modelsPath of modelsPaths) {
    try {
      await access(modelsPath);
      const parsed = JSON.parse(await readFile(modelsPath, "utf-8")) as {
        providers?: Record<string, { apiKey?: string }>;
      };
      const provs = parsed?.providers;
      if (provs) {
        for (const [providerId, config] of Object.entries(provs)) {
          if (config.apiKey) {
            providers.add(providerId);
          }
        }
      }
    } catch {
      // Ignore missing or invalid models.json
    }
  }

  return providers;
}

export const registerModelRoutes: ApiRouteRegistrar = (ctx) => {
  const { router, options, store, runtimeLogger } = ctx;

  type ModelResponseEntry = {
    provider: string;
    id: string;
    name: string;
    reasoning: boolean;
    contextWindow: number;
    accountId?: string;
    accountProvider?: string;
    accountLabel?: string;
    accountDisplayHint?: string;
  };

  function accountProviderForModelProvider(provider: string): string | undefined {
    if (provider === "pi-claude-cli") return "claude-cli";
    if (
      provider === "openai-codex" ||
      provider === "anthropic" ||
      provider === "claude-cli" ||
      provider === "cursor" ||
      provider === "minimax" ||
      provider === "google-gemini-cli"
    ) {
      return provider;
    }
    return undefined;
  }

  function addConfiguredAccountProviders(configuredProviders: Set<string>): void {
    const accounts = options?.authStorage?.listAccounts?.() ?? [];
    for (const account of accounts) {
      if (account.status === "disabled") {
        continue;
      }
      configuredProviders.add(account.providerId);
      if (account.providerId === "claude-cli") {
        configuredProviders.add("pi-claude-cli");
      }
    }
  }

  function appendAccountSpecificModels(models: ModelResponseEntry[]): ModelResponseEntry[] {
    if (!options?.authStorage?.listAccounts) {
      return models;
    }

    const accountsByProvider = new Map<string, AccountCredentialSummary[]>();
    const accountsFor = (provider: string): AccountCredentialSummary[] => {
      const cached = accountsByProvider.get(provider);
      if (cached) return cached;
      const accounts = options.authStorage!.listAccounts!(provider).filter((account) => account.status !== "disabled");
      accountsByProvider.set(provider, accounts);
      return accounts;
    };

    const expanded: ModelResponseEntry[] = [];
    for (const model of models) {
      expanded.push(model);
      const accountProvider = accountProviderForModelProvider(model.provider);
      if (!accountProvider) {
        continue;
      }
      for (const account of accountsFor(accountProvider)) {
        expanded.push({
          ...model,
          name: `${model.name} — ${account.label}`,
          accountId: account.id,
          accountProvider,
          accountLabel: account.label,
          ...(account.accountDisplayHint ? { accountDisplayHint: account.accountDisplayHint } : {}),
        });
      }
    }
    return expanded;
  }

  router.get("/models", async (_req, res) => {
    // Get favoriteProviders/favoriteModels and default model from global settings.
    let favoriteProviders: string[] = [];
    let favoriteModels: string[] = [];
    let defaultProvider: string | undefined;
    let defaultModelId: string | undefined;
    let useClaudeCli = false;
    let useDroidCli = false;
    let useLlamaCpp = false;
    let useCursorCli = false;
    let resolvedPlanningProvider: string | undefined;
    let resolvedPlanningModelId: string | undefined;
    if (store) {
      try {
        const globalStore = store.getGlobalSettingsStore();
        const globalSettings = await globalStore.getSettings();
        favoriteProviders = globalSettings.favoriteProviders ?? [];
        favoriteModels = globalSettings.favoriteModels ?? [];
        defaultProvider = globalSettings.defaultProvider;
        defaultModelId = globalSettings.defaultModelId;
        useClaudeCli = globalSettings.useClaudeCli === true;
        useDroidCli = globalSettings.useDroidCli === true;
        useLlamaCpp = globalSettings.useLlamaCpp === true;
        useCursorCli = (globalSettings as Record<string, unknown>).useCursorCli === true;

        const mergedSettings = await store.getSettingsFast();
        const resolvedPlanningModel = resolvePlanningSettingsModel(mergedSettings);
        resolvedPlanningProvider = resolvedPlanningModel.provider;
        resolvedPlanningModelId = resolvedPlanningModel.modelId;
      } catch {
        // Silently ignore settings errors - just return empty favorites/default model
      }
    }

    const defaultModelResponse =
      defaultProvider && defaultModelId
        ? { defaultProvider, defaultModelId }
        : {};
    const resolvedPlanningModelResponse =
      resolvedPlanningProvider && resolvedPlanningModelId
        ? {
            resolvedPlanningProvider,
            resolvedPlanningModelId,
          }
        : {};

    // Always return 200 with empty array instead of 404 when no models available.
    // This ensures the frontend can handle empty states gracefully.
    if (!options?.modelRegistry) {
      res.json({
        models: [],
        favoriteProviders,
        favoriteModels,
        ...defaultModelResponse,
        ...resolvedPlanningModelResponse,
      });
      return;
    }

    try {
      options.modelRegistry.refresh();
      let models: ModelResponseEntry[] = options.modelRegistry.getAvailable().map((m) => ({
        provider: m.provider,
        id: m.id,
        name: m.name,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow,
      }));

      // The vendored pi-claude-cli extension registers its provider as
      // "pi-claude-cli" (distinct from "anthropic") whenever it loads.
      // When the toggle is OFF, hide those entries from pickers so users
      // don't see CLI-routed models they haven't opted into. When ON,
      // surface everything so the CLI-routed entries appear alongside any
      // direct provider auth the user has connected.
      if (!useClaudeCli) {
        models = models.filter((m) => m.provider !== "pi-claude-cli");
      }
      if (!useDroidCli) {
        models = models.filter((m) => m.provider !== "droid-cli");
      }
      if (!useLlamaCpp) {
        models = models.filter((m) => m.provider !== "llama-server");
      }
      if (!useCursorCli) {
        models = models.filter((m) => m.provider !== "cursor-cli");
      }

      // Filter to only providers the user has explicitly configured in Fusion.
      // getAvailable() checks supplemental credential stores (Codex CLI,
      // Claude Code, env vars) which surface providers the user may not
      // have set up in Fusion. We restrict to providers with credentials
      // in Fusion's own auth stores (primary + legacy .pi + models.json),
      // plus any providers enabled via settings toggles (Claude CLI, etc.).
      if (options.authStorage) {
        const configuredProviders = await getConfiguredProviderNames();
        addConfiguredAccountProviders(configuredProviders);
        if (useClaudeCli) configuredProviders.add("pi-claude-cli");
        if (useDroidCli) configuredProviders.add("droid-cli");
        if (useLlamaCpp) configuredProviders.add("llama-server");
        if (useCursorCli) configuredProviders.add("cursor-cli");
        models = models.filter((m) => configuredProviders.has(m.provider));
      }
      models = appendAccountSpecificModels(models);

      res.json({
        models,
        favoriteProviders,
        favoriteModels,
        ...defaultModelResponse,
        ...resolvedPlanningModelResponse,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      runtimeLogger.child("models").warn(`Failed to load models: ${message}`);
      res.json({
        models: [],
        favoriteProviders,
        favoriteModels,
        ...defaultModelResponse,
        ...resolvedPlanningModelResponse,
      });
    }
  });
};
