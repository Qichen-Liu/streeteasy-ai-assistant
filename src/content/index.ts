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

function isLikelyListingPage(): boolean {
  return isLikelyListingPath(window.location.pathname);
}

function createRoot(): HTMLDivElement {
  const existing = document.getElementById("se-ai-assistant-root");
  if (existing) return existing as HTMLDivElement;

  const root = document.createElement("div");
  root.id = "se-ai-assistant-root";
  root.style.position = "fixed";
  root.style.right = "16px";
  root.style.bottom = "16px";
  root.style.zIndex = "2147483647";
  root.style.maxWidth = "360px";
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

function chip(label: string, active: boolean): string {
  const bg = active ? "#047857" : "#374151";
  return `<span style="background:${bg};padding:2px 8px;border-radius:999px;font-size:12px;">${label}</span>`;
}

function render(root: HTMLElement, listing: ListingData, state: ListingStatePayload, busy: boolean, error = "") {
  const evalSection = state.latestEvaluation
    ? `<div style="margin-top:8px;border-top:1px solid #374151;padding-top:8px;">
        <div><strong>Price:</strong> ${state.latestEvaluation.priceScore}/100</div>
        <div><strong>Quality:</strong> ${state.latestEvaluation.qualityScore}/100</div>
        <div><strong>Risks:</strong> ${state.latestEvaluation.riskFlags.slice(0, 3).join("; ") || "None"}</div>
      </div>`
    : "<div style='margin-top:8px;color:#d1d5db;'>No AI evaluation yet.</div>";

  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <strong>StreetEasy AI</strong>
      <div style="display:flex;gap:6px;">${chip("Viewed", true)}${chip("Contacted", state.contacted)}</div>
    </div>
    <div style="margin-top:6px;color:#d1d5db;">${listing.address}</div>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button id="se-toggle-contacted" style="border:0;border-radius:8px;padding:6px 10px;cursor:pointer;background:#2563eb;color:white;">${state.contacted ? "Unmark Contacted" : "Mark Contacted"}</button>
      <button id="se-evaluate" style="border:0;border-radius:8px;padding:6px 10px;cursor:pointer;background:#f59e0b;color:#111827;">${busy ? "Evaluating..." : "AI Evaluate"}</button>
    </div>
    ${error ? `<div style='margin-top:8px;color:#fca5a5;'>${error}</div>` : ""}
    ${evalSection}
  `;
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

async function init() {
  if (!isLikelyListingPage()) return;

  const listing = extractListingFromDocument(document, window.location.href);
  if (!listing) return;

  const root = createRoot();
  let busy = false;
  let state = await sendMessage<ListingStatePayload>({ type: "UPSERT_VIEWED", listing });

  const rerender = (error = "") => {
    render(root, listing, state, busy, error);

    const contactBtn = root.querySelector<HTMLButtonElement>("#se-toggle-contacted");
    const evalBtn = root.querySelector<HTMLButtonElement>("#se-evaluate");

    contactBtn?.addEventListener("click", async () => {
      try {
        state = await sendMessage<ListingStatePayload>({
          type: "TOGGLE_CONTACTED",
          listingId: listing.listingId,
          contacted: !state.contacted
        });
        rerender();
      } catch (error) {
        rerender(error instanceof Error ? error.message : "Failed to update contact status.");
      }
    });

    evalBtn?.addEventListener("click", async () => {
      busy = true;
      rerender();
      try {
        const evaluation = await sendMessage<EvaluationData>({
          type: "RUN_AI_EVALUATION",
          listing,
          contextText: readPageContext(document)
        });
        state = { ...state, latestEvaluation: evaluation };
        busy = false;
        rerender();
      } catch (error) {
        busy = false;
        rerender(error instanceof Error ? error.message : "AI evaluation failed.");
      }
    });
  };

  rerender();
}

void init();
