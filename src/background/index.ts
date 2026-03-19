import { getState, setState } from "../shared/storage";
import { extractResponseJsonText, parseEvaluationFromUnknown } from "./openai-parser";
import { applyRetentionCleanup, normalizeRetentionDays } from "./retention";
import type {
  ActivityData,
  EvaluationData,
  ListingData,
  PublicSettings,
  UserSettings
} from "../shared/types";
import type { RuntimeRequest } from "../shared/messages";

const EVALUATION_PROMPT_VERSION = "v3";

function createSnapshotHash(listing: ListingData): string {
  return [
    EVALUATION_PROMPT_VERSION,
    listing.listingId,
    listing.price ?? "na",
    listing.beds ?? "na",
    listing.baths ?? "na",
    listing.sqft ?? "na"
  ].join(":");
}

function nowIso(): string {
  return new Date().toISOString();
}

async function getStateWithRetention(force = false) {
  const state = await getState();
  const changed = applyRetentionCleanup(state, new Date(), force);
  if (changed) {
    await setState(state);
  }
  return state;
}

function getDedupKey(listing: ListingData): string {
  try {
    const parsed = new URL(listing.url, "https://streeteasy.com");
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (path) {
      return `path:${path}`;
    }
  } catch {
    // Fall through to listingId.
  }
  return `id:${listing.listingId}`;
}

async function upsertViewed(listing: ListingData) {
  const state = await getStateWithRetention();
  state.listingsById[listing.listingId] = { ...listing, lastSeenAt: nowIso() };

  const existing: ActivityData =
    state.activityById[listing.listingId] ||
    ({
      listingId: listing.listingId,
      viewedAt: [],
      contactedAt: [],
      status: "viewed"
    } as ActivityData);

  existing.viewedAt.push(nowIso());
  existing.status = existing.contactedAt.length > 0 ? "contacted" : "viewed";
  state.activityById[listing.listingId] = existing;

  await setState(state);
  return { contacted: existing.contactedAt.length > 0, latestEvaluation: findLatestEvaluation(state, listing.listingId) };
}

function findLatestEvaluation(state: Awaited<ReturnType<typeof getState>>, listingId: string): EvaluationData | null {
  const evaluations = Object.values(state.evaluationsBySnapshotKey).filter((entry) => entry.listingId === listingId);
  evaluations.sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  return evaluations[0] || null;
}

async function toggleContacted(listingId: string, contacted: boolean) {
  const state = await getStateWithRetention();
  const existing =
    state.activityById[listingId] ||
    ({
      listingId,
      viewedAt: [],
      contactedAt: [],
      status: "viewed"
    } as ActivityData);

  if (contacted) {
    existing.contactedAt.push(nowIso());
    existing.status = "contacted";
  } else {
    existing.contactedAt = [];
    existing.status = "viewed";
  }

  state.activityById[listingId] = existing;
  await setState(state);
  return { contacted: existing.contactedAt.length > 0, latestEvaluation: findLatestEvaluation(state, listingId) };
}

async function removeListing(listingId: string) {
  const state = await getStateWithRetention();
  await removeListingFromState(state, listingId);
  await setState(state);
}

async function removeListings(listingIds: string[]) {
  const state = await getStateWithRetention();
  for (const listingId of listingIds) {
    await removeListingFromState(state, listingId);
  }
  await setState(state);
}

async function removeListingFromState(state: Awaited<ReturnType<typeof getStateWithRetention>>, listingId: string) {
  delete state.listingsById[listingId];
  delete state.activityById[listingId];

  for (const [snapshotHash, evaluation] of Object.entries(state.evaluationsBySnapshotKey)) {
    if (evaluation.listingId === listingId) {
      delete state.evaluationsBySnapshotKey[snapshotHash];
    }
  }

}

async function runAiEvaluation(listing: ListingData, contextText: string): Promise<EvaluationData> {
  const state = await getStateWithRetention();
  const { openaiApiKey, model, riskPriorities, reportMode } = state.settings;

  if (!openaiApiKey) {
    throw new Error("OpenAI API key is missing. Add it in extension options.");
  }

  const snapshotHash = createSnapshotHash(listing);
  const cached = state.evaluationsBySnapshotKey[snapshotHash];
  if (cached) {
    return cached;
  }

  const prompt = `Evaluate this NYC apartment listing with calibrated scoring. Return strict JSON only.

Scoring rubric:
- Use 0-100 scale with realistic center:
  - 50 = typical/fair for neighborhood and unit type.
  - 70+ = clearly above average.
  - 30 or below = materially problematic.
- Do NOT cluster scores into 0-10 unless truly extreme.
- Price score reflects value-for-money (not absolute rent only).
- Quality score reflects condition, layout, building quality, amenities, and livability.
- If data is limited or ambiguous, keep scores near 40-60 and reduce confidence.

Consistency rules:
- Scores must align with summary text (no contradictions).
- If confidence is high, evidence must be specific and strong.
- Risk flags should be concise human-readable phrases (plain English, no underscores), actionable, and max 6 items.
- Summary should be <= 80 words.

Listing:
${JSON.stringify(
    listing,
    null,
    2
  )}

Page context:
${contextText.slice(0, 6000)}

User settings:
reportMode=${reportMode}; riskPriorities=${riskPriorities.join(",")}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a conservative NYC rental analyst. Output strict JSON with keys: priceScore, qualityScore, riskFlags, summary, confidence, evidence. confidence must be low|medium|high. Keep scoring calibrated around 50 for typical listings and avoid contradictory scoring vs narrative."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "listing_evaluation",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              priceScore: { type: "number" },
              qualityScore: { type: "number" },
              riskFlags: {
                type: "array",
                items: { type: "string" },
                maxItems: 6
              },
              summary: { type: "string", maxLength: 500 },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              evidence: {
                type: "object",
                additionalProperties: false,
                properties: {
                  price: { type: "string" },
                  quality: { type: "string" },
                  risks: { type: "string" }
                },
                required: ["price", "quality", "risks"]
              }
            },
            required: ["priceScore", "qualityScore", "riskFlags", "summary", "confidence", "evidence"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized. Check your OpenAI API key in options.");
    }
    if (response.status === 429) {
      throw new Error("Rate limited by OpenAI. Please retry shortly.");
    }
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  const payload = (await response.json()) as unknown;
  const text = extractResponseJsonText(payload);
  const parsed = parseEvaluationFromUnknown(JSON.parse(text));

  const evaluation: EvaluationData = {
    listingId: listing.listingId,
    snapshotHash,
    priceScore: parsed.priceScore,
    qualityScore: parsed.qualityScore,
    riskFlags: parsed.riskFlags,
    summary: parsed.summary,
    confidence: parsed.confidence,
    evidence: parsed.evidence,
    evaluatedAt: nowIso()
  };

  state.evaluationsBySnapshotKey[snapshotHash] = evaluation;
  await setState(state);

  return evaluation;
}

async function getRecentActivity() {
  const state = await getStateWithRetention();
  const dedupedByPath = new Map<string, ListingData>();
  for (const listing of Object.values(state.listingsById)) {
    const key = getDedupKey(listing);
    const existing = dedupedByPath.get(key);
    if (!existing || existing.lastSeenAt.localeCompare(listing.lastSeenAt) < 0) {
      dedupedByPath.set(key, listing);
    }
  }

  const listings = Array.from(dedupedByPath.values());
  listings.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  return listings.slice(0, 50).map((listing) => {
    const activity = state.activityById[listing.listingId];
    const latestEvaluation = findLatestEvaluation(state, listing.listingId);
    return {
      listing,
      contacted: Boolean(activity?.contactedAt?.length),
      lastViewedAt: activity?.viewedAt?.at(-1) || null,
      latestEvaluation: latestEvaluation
        ? {
            evaluatedAt: latestEvaluation.evaluatedAt,
            priceScore: latestEvaluation.priceScore,
            qualityScore: latestEvaluation.qualityScore,
            confidence: latestEvaluation.confidence
          }
        : null
    };
  });
}

async function getSettings() {
  const state = await getStateWithRetention();
  const safeSettings: PublicSettings = {
    hasApiKey: Boolean(state.settings.openaiApiKey),
    model: state.settings.model,
    reportMode: state.settings.reportMode,
    riskPriorities: state.settings.riskPriorities,
    retentionDays: state.settings.retentionDays
  };
  return safeSettings;
}

async function saveSettings(settings: UserSettings) {
  const state = await getStateWithRetention();
  state.settings = {
    ...settings,
    openaiApiKey: settings.openaiApiKey || state.settings.openaiApiKey,
    retentionDays: normalizeRetentionDays(settings.retentionDays)
  };
  applyRetentionCleanup(state, new Date(), true);
  await setState(state);
}

async function clearApiKey() {
  const state = await getStateWithRetention();
  state.settings.openaiApiKey = "";
  await setState(state);
}

async function clearTrackedData() {
  const state = await getStateWithRetention();
  state.listingsById = {};
  state.activityById = {};
  state.evaluationsBySnapshotKey = {};
  state.lastRetentionCleanupAt = nowIso();
  await setState(state);
}

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  (async () => {
    switch (request.type) {
      case "OPEN_OPTIONS": {
        await chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        break;
      }
      case "UPSERT_VIEWED": {
        const payload = await upsertViewed(request.listing);
        sendResponse({ ok: true, payload });
        break;
      }
      case "TOGGLE_CONTACTED": {
        const payload = await toggleContacted(request.listingId, request.contacted);
        sendResponse({ ok: true, payload });
        break;
      }
      case "RUN_AI_EVALUATION": {
        const payload = await runAiEvaluation(request.listing, request.contextText);
        sendResponse({ ok: true, payload });
        break;
      }
      case "REMOVE_LISTING": {
        await removeListing(request.listingId);
        sendResponse({ ok: true });
        break;
      }
      case "REMOVE_LISTINGS": {
        await removeListings(request.listingIds);
        sendResponse({ ok: true });
        break;
      }
      case "GET_RECENT_ACTIVITY": {
        const payload = await getRecentActivity();
        sendResponse({ ok: true, payload });
        break;
      }
      case "GET_LISTING_STATE": {
        const state = await getStateWithRetention();
        const activity = state.activityById[request.listingId];
        const payload = {
          contacted: Boolean(activity?.contactedAt?.length),
          latestEvaluation: findLatestEvaluation(state, request.listingId)
        };
        sendResponse({ ok: true, payload });
        break;
      }
      case "GET_SETTINGS": {
        const payload = await getSettings();
        sendResponse({ ok: true, payload });
        break;
      }
      case "SAVE_SETTINGS": {
        await saveSettings(request.settings);
        sendResponse({ ok: true });
        break;
      }
      case "CLEAR_API_KEY": {
        await clearApiKey();
        sendResponse({ ok: true });
        break;
      }
      case "CLEAR_TRACKED_DATA": {
        await clearTrackedData();
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendResponse({ ok: false, error: message });
  });

  return true;
});
