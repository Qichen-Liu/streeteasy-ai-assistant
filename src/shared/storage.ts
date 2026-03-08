import type { StoreState } from "./types";

const STORAGE_KEY = "streeteasyAssistantState";

const defaultState: StoreState = {
  schemaVersion: 1,
  listingsById: {},
  activityById: {},
  evaluationsBySnapshotKey: {},
  settings: {
    openaiApiKey: "",
    model: "gpt-4.1-mini",
    reportMode: "fast",
    riskPriorities: ["price", "noise", "building_condition", "fees", "commute"]
  }
};

export async function getState(): Promise<StoreState> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return { ...defaultState, ...(data[STORAGE_KEY] || {}) } as StoreState;
}

export async function setState(state: StoreState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export function getStorageKey(): string {
  return STORAGE_KEY;
}
