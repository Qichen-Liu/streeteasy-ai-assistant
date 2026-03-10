import test from "node:test";
import assert from "node:assert/strict";

import { applyRetentionCleanup, normalizeRetentionDays } from "../src/background/retention";
import type { StoreState } from "../src/shared/types";

function makeState(): StoreState {
  return {
    schemaVersion: 2,
    listingsById: {
      old: {
        listingId: "old",
        url: "https://streeteasy.com/rental/old",
        address: "Old Listing",
        lastSeenAt: "2025-01-01T00:00:00.000Z"
      },
      recent: {
        listingId: "recent",
        url: "https://streeteasy.com/rental/recent",
        address: "Recent Listing",
        lastSeenAt: "2026-03-01T00:00:00.000Z"
      }
    },
    activityById: {
      old: {
        listingId: "old",
        viewedAt: ["2025-01-02T00:00:00.000Z"],
        contactedAt: [],
        status: "viewed"
      },
      recent: {
        listingId: "recent",
        viewedAt: ["2026-03-02T00:00:00.000Z"],
        contactedAt: ["2026-03-03T00:00:00.000Z"],
        status: "contacted"
      }
    },
    evaluationsBySnapshotKey: {
      "old:snap": {
        listingId: "old",
        snapshotHash: "old:snap",
        priceScore: 40,
        qualityScore: 45,
        riskFlags: ["old data"],
        summary: "old",
        confidence: "low",
        evidence: { price: "", quality: "", risks: "" },
        evaluatedAt: "2025-01-03T00:00:00.000Z"
      },
      "recent:snap": {
        listingId: "recent",
        snapshotHash: "recent:snap",
        priceScore: 60,
        qualityScore: 70,
        riskFlags: ["recent data"],
        summary: "recent",
        confidence: "medium",
        evidence: { price: "", quality: "", risks: "" },
        evaluatedAt: "2026-03-02T00:00:00.000Z"
      }
    },
    settings: {
      openaiApiKey: "",
      model: "gpt-4.1-mini",
      reportMode: "fast",
      riskPriorities: ["price"],
      retentionDays: 90
    },
    lastRetentionCleanupAt: null
  };
}

test("normalizeRetentionDays defaults invalid values to 90", () => {
  assert.equal(normalizeRetentionDays(30), 30);
  assert.equal(normalizeRetentionDays(120), 120);
  assert.equal(normalizeRetentionDays(999), 90);
});

test("applyRetentionCleanup prunes data older than retention window", () => {
  const state = makeState();
  const now = new Date("2026-03-10T00:00:00.000Z");
  const changed = applyRetentionCleanup(state, now, true);

  assert.equal(changed, true);
  assert.equal(Boolean(state.listingsById.old), false);
  assert.equal(Boolean(state.activityById.old), false);
  assert.equal(Boolean(state.evaluationsBySnapshotKey["old:snap"]), false);

  assert.equal(Boolean(state.listingsById.recent), true);
  assert.equal(Boolean(state.activityById.recent), true);
  assert.equal(Boolean(state.evaluationsBySnapshotKey["recent:snap"]), true);
  assert.equal(typeof state.lastRetentionCleanupAt, "string");
});
