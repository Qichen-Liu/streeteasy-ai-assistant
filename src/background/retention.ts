import type { RetentionDays, StoreState } from "../shared/types";

const RETENTION_MS_PER_DAY = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = RETENTION_MS_PER_DAY;

export function normalizeRetentionDays(value: unknown): RetentionDays {
  if (value === 30 || value === 90 || value === 120 || value === 180) {
    return value;
  }
  return 90;
}

function toMs(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldRunCleanup(lastCleanupAt: string | null, nowMs: number): boolean {
  const lastMs = toMs(lastCleanupAt);
  if (lastMs === null) return true;
  return nowMs - lastMs >= CLEANUP_INTERVAL_MS;
}

export function applyRetentionCleanup(state: StoreState, now = new Date(), force = false): boolean {
  const nowMs = now.getTime();
  if (!force && !shouldRunCleanup(state.lastRetentionCleanupAt, nowMs)) {
    return false;
  }

  let changed = false;
  const cutoffMs = nowMs - state.settings.retentionDays * RETENTION_MS_PER_DAY;

  for (const [listingId, activity] of Object.entries(state.activityById)) {
    const originalViewedCount = activity.viewedAt.length;
    const originalContactedCount = activity.contactedAt.length;

    activity.viewedAt = activity.viewedAt.filter((iso) => {
      const ms = toMs(iso);
      return ms !== null && ms >= cutoffMs;
    });

    activity.contactedAt = activity.contactedAt.filter((iso) => {
      const ms = toMs(iso);
      return ms !== null && ms >= cutoffMs;
    });

    if (activity.contactedAt.length > 0) {
      activity.status = "contacted";
    } else {
      activity.status = "viewed";
    }

    if (
      activity.viewedAt.length !== originalViewedCount ||
      activity.contactedAt.length !== originalContactedCount
    ) {
      changed = true;
    }

    if (activity.viewedAt.length === 0 && activity.contactedAt.length === 0 && !activity.notes) {
      delete state.activityById[listingId];
      changed = true;
    }
  }

  for (const [listingId, listing] of Object.entries(state.listingsById)) {
    const lastSeenMs = toMs(listing.lastSeenAt);
    const hasActivity = Boolean(state.activityById[listingId]);
    const isRecent = lastSeenMs !== null && lastSeenMs >= cutoffMs;
    if (!hasActivity && !isRecent) {
      delete state.listingsById[listingId];
      changed = true;
    }
  }

  for (const listingId of Object.keys(state.activityById)) {
    if (!state.listingsById[listingId]) {
      delete state.activityById[listingId];
      changed = true;
    }
  }

  for (const [snapshotHash, evaluation] of Object.entries(state.evaluationsBySnapshotKey)) {
    const evaluatedAtMs = toMs(evaluation.evaluatedAt);
    const keepByDate = evaluatedAtMs !== null && evaluatedAtMs >= cutoffMs;
    const listingExists = Boolean(state.listingsById[evaluation.listingId]);
    if (!keepByDate || !listingExists) {
      delete state.evaluationsBySnapshotKey[snapshotHash];
      changed = true;
    }
  }

  const nowIso = now.toISOString();
  if (state.lastRetentionCleanupAt !== nowIso) {
    state.lastRetentionCleanupAt = nowIso;
    changed = true;
  }

  return changed;
}
