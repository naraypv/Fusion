import type { ManualOAuthCodeInfo } from "../api";

const STORAGE_KEY = "fusion:pending-auth-login-ui-state:v1";
const MAX_AGE_MS = 15 * 60 * 1000;

export interface PendingAuthLoginUiState {
  instructions?: string;
  manualCode?: ManualOAuthCodeInfo;
}

interface StoredPendingAuthLoginUiState extends PendingAuthLoginUiState {
  createdAt: number;
}

type StoredPendingAuthLoginUiStateMap = Record<string, StoredPendingAuthLoginUiState>;

function readStoredState(): StoredPendingAuthLoginUiStateMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredPendingAuthLoginUiStateMap;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeStoredState(state: StoredPendingAuthLoginUiStateMap): void {
  try {
    if (Object.keys(state).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best effort only. The login flow still works without this fallback.
  }
}

function pruneExpired(state: StoredPendingAuthLoginUiStateMap, now = Date.now()): StoredPendingAuthLoginUiStateMap {
  const next: StoredPendingAuthLoginUiStateMap = {};
  for (const [providerId, pending] of Object.entries(state)) {
    if (now - pending.createdAt <= MAX_AGE_MS) {
      next[providerId] = pending;
    }
  }
  return next;
}

export function savePendingAuthLoginUiState(providerId: string, state: PendingAuthLoginUiState): void {
  if (!state.instructions?.trim() && !state.manualCode) {
    return;
  }
  const current = pruneExpired(readStoredState());
  current[providerId] = {
    ...state,
    createdAt: Date.now(),
  };
  writeStoredState(current);
}

export function getPendingAuthLoginUiState(providerId: string): PendingAuthLoginUiState | undefined {
  const current = pruneExpired(readStoredState());
  const pending = current[providerId];
  writeStoredState(current);
  if (!pending) return undefined;
  return {
    ...(pending.instructions ? { instructions: pending.instructions } : {}),
    ...(pending.manualCode ? { manualCode: pending.manualCode } : {}),
  };
}

export function clearPendingAuthLoginUiState(providerId: string): void {
  const current = readStoredState();
  if (!(providerId in current)) {
    return;
  }
  delete current[providerId];
  writeStoredState(current);
}
