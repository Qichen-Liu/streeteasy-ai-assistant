import type { RetentionDays, StoreState } from "./types";

const STORAGE_KEY = "streeteasyAssistantState";

function normalizeRetentionDays(value: unknown): RetentionDays {
  if (value === 30 || value === 90 || value === 120 || value === 180) {
    return value;
  }
  return 90;
}

const defaultState: StoreState = {
  schemaVersion: 2,
  listingsById: {},
  activityById: {},
  evaluationsBySnapshotKey: {},
  settings: {
    openaiApiKey: "",
    model: "gpt-4.1-mini",
    reportMode: "fast",
    riskPriorities: ["price", "noise", "building_condition", "fees", "commute"],
    retentionDays: 90
  },
  lastRetentionCleanupAt: null
};

export async function getState(): Promise<StoreState> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const raw = (data[STORAGE_KEY] || {}) as Partial<StoreState>;
  const rawSettings = (raw.settings || {}) as Partial<StoreState["settings"]>;

  return {
    ...defaultState,
    ...raw,
    listingsById: raw.listingsById || {},
    activityById: raw.activityById || {},
    evaluationsBySnapshotKey: raw.evaluationsBySnapshotKey || {},
    settings: {
      ...defaultState.settings,
      ...rawSettings,
      retentionDays: normalizeRetentionDays(rawSettings.retentionDays)
    },
    lastRetentionCleanupAt: typeof raw.lastRetentionCleanupAt === "string" ? raw.lastRetentionCleanupAt : null
  };
}

export async function setState(state: StoreState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export function getStorageKey(): string {
  return STORAGE_KEY;
}
