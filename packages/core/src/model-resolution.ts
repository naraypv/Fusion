import type { ModelFallbackChainEntry, Settings } from "./types.js";

export interface ResolvedModelSelection {
  provider?: string;
  modelId?: string;
}

export interface ResolvedModelFallbackEntry {
  provider: string;
  modelId: string;
  accountId?: string;
  accountProvider?: string;
  priority: number;
}

type ModelPair =
  | ResolvedModelSelection
  | {
      provider?: string | null;
      modelId?: string | null;
    }
  | undefined;

type TaskModelLike = {
  modelProvider?: string | null;
  modelId?: string | null;
  validatorModelProvider?: string | null;
  validatorModelId?: string | null;
  planningModelProvider?: string | null;
  planningModelId?: string | null;
};

function hasCompleteModelPair(pair: ModelPair): pair is { provider: string; modelId: string } {
  return Boolean(pair?.provider && pair?.modelId);
}

function pickFirstModelPair(...pairs: ModelPair[]): ResolvedModelSelection {
  for (const pair of pairs) {
    if (hasCompleteModelPair(pair)) {
      return { provider: pair.provider, modelId: pair.modelId };
    }
  }
  return {};
}

function normalizeFallbackChain(chain: ModelFallbackChainEntry[] | undefined): ResolvedModelFallbackEntry[] {
  if (!Array.isArray(chain)) {
    return [];
  }
  return chain
    .slice(0, 10)
    .map((entry, index) => ({
      provider: entry.provider?.trim() ?? "",
      modelId: entry.modelId?.trim() ?? "",
      accountId: entry.accountId?.trim(),
      accountProvider: entry.accountProvider?.trim(),
      enabled: entry.enabled !== false,
      priority: index + 1,
    }))
    .filter((entry) => entry.enabled && Boolean(entry.provider && entry.modelId))
    .map(({ provider, modelId, accountId, accountProvider, priority }) => ({
      provider,
      modelId,
      ...(accountId ? { accountId } : {}),
      ...(accountProvider ? { accountProvider } : {}),
      priority,
    }));
}

export function resolveModelFallbackChain(settings?: Partial<Settings>): ResolvedModelFallbackEntry[] {
  const projectChain = normalizeFallbackChain(settings?.projectModelFallbackChain);
  if (projectChain.length > 0) {
    return projectChain;
  }

  const globalChain = normalizeFallbackChain(settings?.modelFallbackChain);
  if (globalChain.length > 0) {
    return globalChain;
  }

  if (settings?.fallbackProvider && settings.fallbackModelId) {
    return [{ provider: settings.fallbackProvider, modelId: settings.fallbackModelId, priority: 1 }];
  }

  return [];
}

export function resolveRouteAllLlmCallsViaDspy(settings?: Partial<Settings>): boolean {
  if (typeof settings?.projectRouteAllLlmCallsViaDspy === "boolean") {
    return settings.projectRouteAllLlmCallsViaDspy;
  }
  return settings?.routeAllLlmCallsViaDspy === true;
}

export function resolveProjectDefaultModel(settings?: Partial<Settings>): ResolvedModelSelection {
  return pickFirstModelPair(
    {
      provider: settings?.defaultProviderOverride,
      modelId: settings?.defaultModelIdOverride,
    },
    {
      provider: settings?.defaultProvider,
      modelId: settings?.defaultModelId,
    },
  );
}

export function resolveExecutionSettingsModel(settings?: Partial<Settings>): ResolvedModelSelection {
  return pickFirstModelPair(
    {
      provider: settings?.executionProvider,
      modelId: settings?.executionModelId,
    },
    {
      provider: settings?.executionGlobalProvider,
      modelId: settings?.executionGlobalModelId,
    },
    resolveProjectDefaultModel(settings),
  );
}

export function resolvePlanningSettingsModel(settings?: Partial<Settings>): ResolvedModelSelection {
  return pickFirstModelPair(
    {
      provider: settings?.planningProvider,
      modelId: settings?.planningModelId,
    },
    {
      provider: settings?.planningGlobalProvider,
      modelId: settings?.planningGlobalModelId,
    },
    resolveProjectDefaultModel(settings),
  );
}

export function resolveValidatorSettingsModel(settings?: Partial<Settings>): ResolvedModelSelection {
  return pickFirstModelPair(
    {
      provider: settings?.validatorProvider,
      modelId: settings?.validatorModelId,
    },
    {
      provider: settings?.validatorGlobalProvider,
      modelId: settings?.validatorGlobalModelId,
    },
    resolveProjectDefaultModel(settings),
  );
}

export function resolveTitleSummarizerSettingsModel(settings?: Partial<Settings>): ResolvedModelSelection {
  return pickFirstModelPair(
    {
      provider: settings?.titleSummarizerProvider,
      modelId: settings?.titleSummarizerModelId,
    },
    {
      provider: settings?.titleSummarizerGlobalProvider,
      modelId: settings?.titleSummarizerGlobalModelId,
    },
    {
      provider: settings?.planningProvider,
      modelId: settings?.planningModelId,
    },
    resolveProjectDefaultModel(settings),
  );
}

export function resolveTaskExecutionModel(
  task: TaskModelLike,
  settings?: Partial<Settings>,
): ResolvedModelSelection {
  return pickFirstModelPair(
    {
      provider: task.modelProvider,
      modelId: task.modelId,
    },
    resolveExecutionSettingsModel(settings),
  );
}

export function resolveTaskValidatorModel(
  task: TaskModelLike,
  settings?: Partial<Settings>,
): ResolvedModelSelection {
  return pickFirstModelPair(
    {
      provider: task.validatorModelProvider,
      modelId: task.validatorModelId,
    },
    resolveValidatorSettingsModel(settings),
  );
}

export function resolveTaskPlanningModel(
  task: TaskModelLike,
  settings?: Partial<Settings>,
): ResolvedModelSelection {
  return pickFirstModelPair(
    {
      provider: task.planningModelProvider,
      modelId: task.planningModelId,
    },
    resolvePlanningSettingsModel(settings),
  );
}
