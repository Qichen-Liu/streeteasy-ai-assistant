import type { EvaluationData, ListingData, UserSettings } from "./types";

export type RuntimeRequest =
  | { type: "UPSERT_VIEWED"; listing: ListingData }
  | { type: "TOGGLE_CONTACTED"; listingId: string; contacted: boolean }
  | { type: "REMOVE_LISTING"; listingId: string }
  | { type: "REMOVE_LISTINGS"; listingIds: string[] }
  | { type: "CLEAR_TRACKED_DATA" }
  | { type: "GET_LISTING_STATE"; listingId: string }
  | { type: "RUN_AI_EVALUATION"; listing: ListingData; contextText: string }
  | { type: "GET_RECENT_ACTIVITY" }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: UserSettings }
  | { type: "CLEAR_API_KEY" };

export type RuntimeResponse =
  | { ok: true; payload?: unknown }
  | { ok: false; error: string }
  | { ok: true; payload: { contacted: boolean; latestEvaluation: EvaluationData | null } };
