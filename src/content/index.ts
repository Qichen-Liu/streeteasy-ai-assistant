import type { EvaluationData, ListingData } from "../shared/types";
import {
  extractListingFromDocument,
  isLikelyListingPath,
  readPageContext
} from "../shared/listing";

type ListingStatePayload = {
  contacted: boolean;
  latestEvaluation: EvaluationData | null;
};

const ROOT_ID = "se-ai-assistant-root";

let currentUrl = "";
let trackedListingId = "";
let currentListing: ListingData | null = null;
let currentState: ListingStatePayload = { contacted: false, latestEvaluation: null };
let isBusy = false;
let currentError = "";

function isLikelyListingPage(): boolean {
  return isLikelyListingPath(window.location.pathname);
}

function createRoot(): HTMLDivElement {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing as HTMLDivElement;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.style.position = "fixed";
  root.style.right = "16px";
  root.style.bottom = "16px";
  root.style.zIndex = "2147483647";
  root.style.maxWidth = "380px";
  root.style.width = "calc(100vw - 32px)";
  root.style.background = "#111827";
  root.style.color = "#f9fafb";
  root.style.borderRadius = "12px";
  root.style.padding = "12px";
  root.style.boxShadow = "0 8px 28px rgba(0,0,0,0.28)";
  root.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  root.style.fontSize = "13px";
  root.style.lineHeight = "1.4";
  document.body.appendChild(root);
  return root;
}

function removeRoot() {
  document.getElementById(ROOT_ID)?.remove();
}

function chip(label: string, active: boolean): string {
  const bg = active ? "#047857" : "#374151";
  return `<span style="background:${bg};padding:2px 8px;border-radius:999px;font-size:12px;">${label}</span>`;
}

function formatEvalTime(iso?: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString();
}

function renderEvaluationSection(evaluation: EvaluationData | null): string {
  if (!evaluation) {
    return "<div style='margin-top:8px;color:#d1d5db;'>No AI evaluation yet.</div>";
  }

  const risks = evaluation.riskFlags.length ? evaluation.riskFlags.slice(0, 4).join("; ") : "None";

  return `<div style="margin-top:8px;border-top:1px solid #374151;padding-top:8px;">
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <div><strong>Price:</strong> ${evaluation.priceScore}/100</div>
      <div><strong>Quality:</strong> ${evaluation.qualityScore}/100</div>
      <div><strong>Confidence:</strong> ${evaluation.confidence}</div>
    </div>
    <div style="margin-top:6px;"><strong>Summary:</strong> ${evaluation.summary || "n/a"}</div>
    <div style="margin-top:6px;"><strong>Risks:</strong> ${risks}</div>
    <div style="margin-top:6px;color:#9ca3af;font-size:12px;">Last evaluated: ${formatEvalTime(evaluation.evaluatedAt)}</div>
  </div>`;
}

function render() {
  if (!currentListing) {
    removeRoot();
    return;
  }

  const root = createRoot();

  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <strong>StreetEasy AI</strong>
      <div style="display:flex;gap:6px;">${chip("Viewed", true)}${chip("Contacted", currentState.contacted)}</div>
    </div>
    <div style="margin-top:6px;color:#d1d5db;">${currentListing.address}</div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button id="se-toggle-contacted" ${isBusy ? "disabled" : ""} style="border:0;border-radius:8px;padding:6px 10px;cursor:pointer;background:#2563eb;color:white;opacity:${isBusy ? "0.6" : "1"};">${currentState.contacted ? "Unmark Contacted" : "Mark Contacted"}</button>
      <button id="se-evaluate" ${isBusy ? "disabled" : ""} style="border:0;border-radius:8px;padding:6px 10px;cursor:pointer;background:#f59e0b;color:#111827;opacity:${isBusy ? "0.6" : "1"};">${isBusy ? "Evaluating..." : "AI Evaluate"}</button>
    </div>
    ${currentError ? `<div style='margin-top:8px;color:#fca5a5;'>${currentError}</div>` : ""}
    ${renderEvaluationSection(currentState.latestEvaluation)}
  `;

  const contactBtn = root.querySelector<HTMLButtonElement>("#se-toggle-contacted");
  const evalBtn = root.querySelector<HTMLButtonElement>("#se-evaluate");

  contactBtn?.addEventListener("click", async () => {
    if (!currentListing || isBusy) return;
    try {
      currentError = "";
      currentState = await sendMessage<ListingStatePayload>({
        type: "TOGGLE_CONTACTED",
        listingId: currentListing.listingId,
        contacted: !currentState.contacted
      });
      render();
    } catch (error) {
      currentError = error instanceof Error ? error.message : "Failed to update contact status.";
      render();
    }
  });

  evalBtn?.addEventListener("click", async () => {
    if (!currentListing || isBusy) return;
    isBusy = true;
    currentError = "";
    render();

    try {
      const evaluation = await sendMessage<EvaluationData>({
        type: "RUN_AI_EVALUATION",
        listing: currentListing,
        contextText: readPageContext(document)
      });
      currentState = { ...currentState, latestEvaluation: evaluation };
    } catch (error) {
      currentError = error instanceof Error ? error.message : "AI evaluation failed.";
    } finally {
      isBusy = false;
      render();
    }
  });
}

async function sendMessage<T>(message: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as
    | { ok: true; payload: T }
    | { ok: false; error: string };
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.payload;
}

async function syncPageState() {
  const href = window.location.href;
  if (href === currentUrl && currentListing) {
    return;
  }

  currentUrl = href;

  if (!isLikelyListingPage()) {
    currentListing = null;
    trackedListingId = "";
    currentError = "";
    render();
    return;
  }

  const listing = extractListingFromDocument(document, href);
  if (!listing) {
    currentListing = null;
    trackedListingId = "";
    currentError = "Could not detect listing metadata on this page.";
    render();
    return;
  }

  currentListing = listing;
  currentError = "";

  if (trackedListingId !== listing.listingId) {
    currentState = await sendMessage<ListingStatePayload>({ type: "UPSERT_VIEWED", listing });
    trackedListingId = listing.listingId;
  } else {
    currentState = await sendMessage<ListingStatePayload>({
      type: "GET_LISTING_STATE",
      listingId: listing.listingId
    });
  }

  render();
}

function startNavigationWatcher() {
  const runSync = () => {
    void syncPageState().catch((error: unknown) => {
      currentError = error instanceof Error ? error.message : "Failed to sync listing state.";
      render();
    });
  };

  const wrapped = () => {
    runSync();
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args: Parameters<History["pushState"]>) {
    originalPushState.apply(history, args);
    wrapped();
  };

  history.replaceState = function (...args: Parameters<History["replaceState"]>) {
    originalReplaceState.apply(history, args);
    wrapped();
  };

  window.addEventListener("popstate", wrapped);
  window.setInterval(() => {
    if (window.location.href !== currentUrl) {
      wrapped();
    }
  }, 800);

  runSync();
}

startNavigationWatcher();
