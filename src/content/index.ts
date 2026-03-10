import type { EvaluationData, ListingData } from "../shared/types";
import {
  extractListingFromDocument,
  fallbackListingKeyFromUrl,
  isLikelyListingPath,
  parseListingIdFromUrl,
  readPageContext,
  stableListingPathKeyFromUrl
} from "../shared/listing";

type ListingStatePayload = {
  contacted: boolean;
  latestEvaluation: EvaluationData | null;
};

type ResultsFilterMode = "show_all" | "hide_viewed_only" | "hide_viewed_and_contacted";

type TrackedSets = {
  viewed: Set<string>;
  contacted: Set<string>;
};

const ROOT_ID = "se-ai-assistant-root";
const COLLAPSED_AI_ID = "se-ai-assistant-collapsed";
const RESULTS_TOGGLE_ID = "se-results-filter-root";
const RESULTS_FILTER_STORAGE_KEY = "streeteasyResultsFilterMode";
const RESULTS_FILTER_POSITION_STORAGE_KEY = "streeteasyResultsFilterPosition";
const STORE_STORAGE_KEY = "streeteasyAssistantState";

let currentUrl = "";
let trackedListingId = "";
let currentListing: ListingData | null = null;
let currentState: ListingStatePayload = { contacted: false, latestEvaluation: null };
let isBusy = false;
let currentError = "";
let resultsFilterMode: ResultsFilterMode = "show_all";
let resultsObserver: MutationObserver | null = null;
let aiPanelCollapsed = false;
let aiPanelPosition: { left: number; top: number } | null = null;

type ResultsFilterPosition = {
  left: number;
  top: number;
};

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
  root.style.maxWidth = "390px";
  root.style.width = "calc(100vw - 32px)";
  root.style.background = "#ffffff";
  root.style.color = "#0f172a";
  root.style.border = "1px solid #cbd5e1";
  root.style.borderRadius = "12px";
  root.style.padding = "12px";
  root.style.boxShadow = "0 12px 24px rgba(15, 23, 42, 0.12)";
  root.style.fontFamily = "Arial, Helvetica, sans-serif";
  root.style.fontSize = "13px";
  root.style.lineHeight = "1.4";
  root.style.userSelect = "none";
  document.body.appendChild(root);
  return root;
}

function removeRoot() {
  document.getElementById(ROOT_ID)?.remove();
}

function createCollapsedAiButton(): HTMLButtonElement {
  const existing = document.getElementById(COLLAPSED_AI_ID);
  if (existing) return existing as HTMLButtonElement;

  const button = document.createElement("button");
  button.id = COLLAPSED_AI_ID;
  button.type = "button";
  button.style.position = "fixed";
  button.style.right = "16px";
  button.style.bottom = "16px";
  button.style.zIndex = "2147483647";
  button.style.width = "44px";
  button.style.height = "44px";
  button.style.border = "1px solid #cbd5e1";
  button.style.borderRadius = "999px";
  button.style.background = "#ffffff";
  button.style.boxShadow = "0 12px 24px rgba(15, 23, 42, 0.12)";
  button.style.cursor = "pointer";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";

  const icon = document.createElement("img");
  icon.src = chrome.runtime.getURL("assets/icons/icon-32.png");
  icon.alt = "StreetEasy AI";
  icon.style.width = "24px";
  icon.style.height = "24px";
  button.appendChild(icon);

  button.addEventListener("click", () => {
    aiPanelCollapsed = false;
    aiPanelPosition = null;
    button.remove();
    renderListingCard();
  });

  document.body.appendChild(button);
  return button;
}

function removeCollapsedAiButton() {
  document.getElementById(COLLAPSED_AI_ID)?.remove();
}

function applyAiPanelPosition(root: HTMLDivElement) {
  if (!aiPanelPosition) {
    root.style.right = "16px";
    root.style.bottom = "16px";
    root.style.left = "auto";
    root.style.top = "auto";
    return;
  }

  root.style.left = `${aiPanelPosition.left}px`;
  root.style.top = `${aiPanelPosition.top}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
}

function makeAiPanelDraggable(root: HTMLDivElement) {
  const handle = root.querySelector<HTMLElement>("#se-ai-drag-handle");
  if (!handle) return;

  let dragState:
    | {
        startX: number;
        startY: number;
        startLeft: number;
        startTop: number;
      }
    | null = null;

  handle.addEventListener("mousedown", (event: MouseEvent) => {
    if (event.button !== 0) return;
    const rect = root.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top
    };
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event: MouseEvent) => {
    if (!dragState) return;
    const rect = root.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const nextLeft = clamp(dragState.startLeft + (event.clientX - dragState.startX), 0, maxLeft);
    const nextTop = clamp(dragState.startTop + (event.clientY - dragState.startY), 0, maxTop);
    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
  });

  window.addEventListener("mouseup", () => {
    if (!dragState) return;
    dragState = null;
    const rect = root.getBoundingClientRect();
    aiPanelPosition = { left: Math.round(rect.left), top: Math.round(rect.top) };
  });
}

function chip(label: string, active: boolean): string {
  const bg = active ? "#dcfce7" : "#e2e8f0";
  const color = active ? "#166534" : "#334155";
  return `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:999px;font-size:12px;">${label}</span>`;
}

function formatEvalTime(iso?: string): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString();
}

function renderEvaluationSection(evaluation: EvaluationData | null): string {
  if (!evaluation) {
    return "<div style='margin-top:8px;color:#64748b;'>No AI evaluation yet.</div>";
  }

  const risks = evaluation.riskFlags.length ? evaluation.riskFlags.slice(0, 4).join("; ") : "None";

  return `<div style="margin-top:8px;border-top:1px solid #e2e8f0;padding-top:8px;">
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <div><strong>Price:</strong> ${evaluation.priceScore}/100</div>
      <div><strong>Quality:</strong> ${evaluation.qualityScore}/100</div>
      <div><strong>Confidence:</strong> ${evaluation.confidence}</div>
    </div>
    <div style="margin-top:6px;"><strong>Summary:</strong> ${evaluation.summary || "n/a"}</div>
    <div style="margin-top:6px;"><strong>Risks:</strong> ${risks}</div>
    <div style="margin-top:6px;color:#64748b;font-size:12px;">Last evaluated: ${formatEvalTime(evaluation.evaluatedAt)}</div>
  </div>`;
}

function renderListingCard() {
  if (!currentListing) {
    removeRoot();
    removeCollapsedAiButton();
    return;
  }

  if (aiPanelCollapsed) {
    removeRoot();
    createCollapsedAiButton();
    return;
  }

  removeCollapsedAiButton();

  const root = createRoot();
  applyAiPanelPosition(root);

  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div id="se-ai-drag-handle" style="display:flex;align-items:center;gap:8px;cursor:move;flex:1;min-width:0;">
        <strong style="font-size:16px;">StreetEasy AI</strong>
      </div>
      <button id="se-collapse-ai" type="button" style="border:1px solid #cbd5e1;border-radius:6px;background:#fff;padding:2px 8px;cursor:pointer;">_</button>
      <div style="display:flex;gap:6px;">${chip("Viewed", true)}${chip("Contacted", currentState.contacted)}</div>
    </div>
    <div style="margin-top:6px;color:#334155;">${currentListing.address}</div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button id="se-toggle-contacted" ${isBusy ? "disabled" : ""} style="border:0;border-radius:8px;padding:6px 10px;cursor:pointer;background:#2563eb;color:white;opacity:${isBusy ? "0.6" : "1"};">${currentState.contacted ? "Unmark Contacted" : "Mark Contacted"}</button>
      <button id="se-evaluate" ${isBusy ? "disabled" : ""} style="border:0;border-radius:8px;padding:6px 10px;cursor:pointer;background:#f59e0b;color:#111827;opacity:${isBusy ? "0.6" : "1"};">${isBusy ? "Evaluating..." : "AI Evaluate"}</button>
    </div>
    ${currentError ? `<div style='margin-top:8px;color:#b91c1c;'>${currentError}</div>` : ""}
    ${renderEvaluationSection(currentState.latestEvaluation)}
  `;

  const contactBtn = root.querySelector<HTMLButtonElement>("#se-toggle-contacted");
  const evalBtn = root.querySelector<HTMLButtonElement>("#se-evaluate");
  const collapseBtn = root.querySelector<HTMLButtonElement>("#se-collapse-ai");
  makeAiPanelDraggable(root);

  contactBtn?.addEventListener("click", async () => {
    if (!currentListing || isBusy) return;
    try {
      currentError = "";
      currentState = await sendMessage<ListingStatePayload>({
        type: "TOGGLE_CONTACTED",
        listingId: currentListing.listingId,
        contacted: !currentState.contacted
      });
      renderListingCard();
    } catch (error) {
      currentError = error instanceof Error ? error.message : "Failed to update contact status.";
      renderListingCard();
    }
  });

  evalBtn?.addEventListener("click", async () => {
    if (!currentListing || isBusy) return;
    isBusy = true;
    currentError = "";
    renderListingCard();

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
      renderListingCard();
    }
  });

  collapseBtn?.addEventListener("click", () => {
    aiPanelCollapsed = true;
    aiPanelPosition = null;
    renderListingCard();
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

function listingKeysFromUrl(href: string): string[] {
  const keys = new Set<string>();
  const byId = parseListingIdFromUrl(href);
  if (byId) keys.add(byId);

  const byFallback = fallbackListingKeyFromUrl(href);
  if (byFallback) keys.add(byFallback);

  const byStablePath = stableListingPathKeyFromUrl(href);
  if (byStablePath) keys.add(byStablePath);

  return Array.from(keys);
}

function collectResultAnchors(): HTMLAnchorElement[] {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
  return anchors.filter((a) => {
    if (!a.href) return false;
    return listingKeysFromUrl(a.href).length > 0 && isLikelyListingPath(new URL(a.href, window.location.origin).pathname);
  });
}

function isLikelyResultsPage(): boolean {
  if (isLikelyListingPage()) return false;
  return collectResultAnchors().length >= 4;
}

function createResultsToggleRoot(): HTMLDivElement {
  const existing = document.getElementById(RESULTS_TOGGLE_ID);
  if (existing) return existing as HTMLDivElement;

  const root = document.createElement("div");
  root.id = RESULTS_TOGGLE_ID;
  root.style.position = "fixed";
  root.style.top = "84px";
  root.style.right = "16px";
  root.style.zIndex = "2147483647";
  root.style.background = "#ffffff";
  root.style.border = "1px solid #cbd5e1";
  root.style.borderRadius = "10px";
  root.style.padding = "8px";
  root.style.boxShadow = "0 10px 22px rgba(15,23,42,0.12)";
  root.style.fontFamily = "Arial, Helvetica, sans-serif";
  root.style.fontSize = "12px";
  root.style.color = "#0f172a";
  root.style.minWidth = "220px";
  root.style.userSelect = "none";
  root.innerHTML = `
    <div id="se-results-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:move;">
      <strong style="font-size:12px;">StreetEasy Filters</strong>
      <span id="se-results-count" style="color:#475569;font-size:11px;"></span>
    </div>
    <select id="se-results-mode" style="margin-top:6px;width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:4px;background:#fff;cursor:pointer;">
      <option value="show_all">Show all</option>
      <option value="hide_viewed_only">Hide viewed only</option>
      <option value="hide_viewed_and_contacted">Hide viewed + contacted</option>
    </select>
    <div id="se-results-empty-note" style="display:none;margin-top:6px;padding:6px;border-radius:6px;background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe;line-height:1.35;">
      No non-viewed listings available on this page. Use the page index to switch pages.
    </div>
  `;
  document.body.appendChild(root);

  const select = root.querySelector<HTMLSelectElement>("#se-results-mode");
  if (select) {
    select.value = resultsFilterMode;
    select.addEventListener("change", () => {
      resultsFilterMode = select.value as ResultsFilterMode;
      void chrome.storage.local.set({ [RESULTS_FILTER_STORAGE_KEY]: resultsFilterMode });
      void applyResultsFilter();
    });
  }

  makeResultsRootDraggable(root);
  void restoreResultsRootPosition(root);
  return root;
}

function removeResultsToggleRoot() {
  document.getElementById(RESULTS_TOGGLE_ID)?.remove();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeResultsRootDraggable(root: HTMLDivElement) {
  const handle = root.querySelector<HTMLElement>("#se-results-header");
  if (!handle) return;

  let dragState:
    | {
        startX: number;
        startY: number;
        startLeft: number;
        startTop: number;
      }
    | null = null;

  handle.addEventListener("mousedown", (event: MouseEvent) => {
    if (event.button !== 0) return;
    const rect = root.getBoundingClientRect();
    dragState = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top
    };
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    root.style.right = "auto";
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event: MouseEvent) => {
    if (!dragState) return;
    const rect = root.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const nextLeft = clamp(dragState.startLeft + (event.clientX - dragState.startX), 0, maxLeft);
    const nextTop = clamp(dragState.startTop + (event.clientY - dragState.startY), 0, maxTop);
    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
  });

  window.addEventListener("mouseup", () => {
    if (!dragState) return;
    dragState = null;
    const rect = root.getBoundingClientRect();
    const position: ResultsFilterPosition = { left: Math.round(rect.left), top: Math.round(rect.top) };
    void chrome.storage.local.set({ [RESULTS_FILTER_POSITION_STORAGE_KEY]: position });
  });
}

async function restoreResultsRootPosition(root: HTMLDivElement) {
  const saved = await chrome.storage.local.get(RESULTS_FILTER_POSITION_STORAGE_KEY);
  const position = saved[RESULTS_FILTER_POSITION_STORAGE_KEY] as ResultsFilterPosition | undefined;
  if (!position || typeof position.left !== "number" || typeof position.top !== "number") {
    return;
  }

  const rect = root.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - rect.width);
  const maxTop = Math.max(0, window.innerHeight - rect.height);
  root.style.left = `${clamp(position.left, 0, maxLeft)}px`;
  root.style.top = `${clamp(position.top, 0, maxTop)}px`;
  root.style.right = "auto";
}

function resetHiddenResultCards() {
  for (const hidden of Array.from(document.querySelectorAll<HTMLElement>("[data-se-hidden='1']"))) {
    hidden.style.removeProperty("display");
    hidden.removeAttribute("data-se-hidden");
  }
}

function getResultCardElement(anchor: HTMLAnchorElement): HTMLElement | null {
  const preferred =
    anchor.closest<HTMLElement>("article") ||
    anchor.closest<HTMLElement>("li") ||
    anchor.closest<HTMLElement>("[role='listitem']") ||
    anchor.closest<HTMLElement>("[data-testid*='listingCard']") ||
    anchor.closest<HTMLElement>("[class*='ListingCard']") ||
    anchor.closest<HTMLElement>("[class*='listingCard']");

  const listingLinkSelector = "a[href*='/rental/'], a[href*='/sale/'], a[href*='/building/']";
  const paginationSelector =
    "a[rel='next'], a[rel='prev'], a[href*='page='], [aria-label*='next' i], [aria-label*='previous' i], [aria-label*='page' i]";

  const isSafeCardContainer = (el: HTMLElement): boolean => {
    const toggleRoot = document.getElementById(RESULTS_TOGGLE_ID);
    if (el.id === RESULTS_TOGGLE_ID || (toggleRoot && el.contains(toggleRoot))) {
      return false;
    }

    const listingLinks = el.querySelectorAll(listingLinkSelector).length;
    if (listingLinks < 1 || listingLinks > 4) {
      return false;
    }

    if (el.querySelector(paginationSelector)) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 80 || rect.height > 1200) {
      return false;
    }

    return true;
  };

  if (preferred && isSafeCardContainer(preferred)) {
    return preferred;
  }

  // Fallback: walk up a few levels and choose the nearest safe container.
  let current: HTMLElement | null = anchor as unknown as HTMLElement;
  for (let i = 0; i < 8 && current; i += 1) {
    const parentEl: HTMLElement | null = current.parentElement;
    if (!parentEl) break;
    if (isSafeCardContainer(parentEl)) {
      return parentEl;
    }
    current = parentEl;
  }

  return null;
}

async function loadTrackedSets(): Promise<TrackedSets> {
  const payload = await chrome.storage.local.get(STORE_STORAGE_KEY);
  const state = (payload[STORE_STORAGE_KEY] || {}) as {
    listingsById?: Record<string, { url?: string }>;
    activityById?: Record<string, { contactedAt?: string[] }>;
  };
  const listingsById = state.listingsById || {};
  const activityById = state.activityById || {};

  const viewed = new Set<string>();
  const contacted = new Set<string>();

  for (const [listingId, listing] of Object.entries<{ url?: string }>(listingsById)) {
    viewed.add(listingId);
    if (listing?.url) {
      for (const key of listingKeysFromUrl(listing.url)) {
        viewed.add(key);
      }
    }

    const activity = activityById[listingId];
    if ((activity?.contactedAt?.length ?? 0) > 0) {
      contacted.add(listingId);
      if (listing?.url) {
        for (const key of listingKeysFromUrl(listing.url)) {
          contacted.add(key);
        }
      }
    }
  }

  return { viewed, contacted };
}

function modeLabel(mode: ResultsFilterMode): string {
  if (mode === "hide_viewed_only") return "Hide viewed only";
  if (mode === "hide_viewed_and_contacted") return "Hide viewed + contacted";
  return "Show all";
}

async function applyResultsFilter() {
  if (!isLikelyResultsPage()) {
    resetHiddenResultCards();
    removeResultsToggleRoot();
    return;
  }

  const tracked = await loadTrackedSets();
  const anchors = collectResultAnchors();

  const root = createResultsToggleRoot();
  const select = root.querySelector<HTMLSelectElement>("#se-results-mode");
  const count = root.querySelector<HTMLSpanElement>("#se-results-count");
  const emptyNote = root.querySelector<HTMLDivElement>("#se-results-empty-note");
  if (select) select.value = resultsFilterMode;

  resetHiddenResultCards();

  const processed = new Set<HTMLElement>();
  let hidden = 0;
  let total = 0;

  for (const anchor of anchors) {
    const card = getResultCardElement(anchor);
    if (!card || processed.has(card)) continue;

    processed.add(card);
    total += 1;

    const cardAnchors = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const keys = new Set<string>();
    for (const link of cardAnchors) {
      for (const key of listingKeysFromUrl(link.href)) {
        keys.add(key);
      }
    }
    for (const key of listingKeysFromUrl(anchor.href)) {
      keys.add(key);
    }

    const isViewed = Array.from(keys).some((key) => tracked.viewed.has(key));
    const isContacted = Array.from(keys).some((key) => tracked.contacted.has(key));

    let shouldHide = false;
    if (resultsFilterMode === "hide_viewed_only") {
      shouldHide = isViewed && !isContacted;
    } else if (resultsFilterMode === "hide_viewed_and_contacted") {
      shouldHide = isViewed;
    }

    if (shouldHide) {
      card.style.setProperty("display", "none", "important");
      card.setAttribute("data-se-hidden", "1");
      hidden += 1;
    }
  }

  if (count) {
    count.textContent = `${modeLabel(resultsFilterMode)}: ${hidden} hidden / ${total}`;
  }

  if (emptyNote) {
    const fullyHidden = resultsFilterMode !== "show_all" && total > 0 && hidden >= total;
    emptyNote.style.display = fullyHidden ? "block" : "none";
  }
}

function stopResultsObserver() {
  if (resultsObserver) {
    resultsObserver.disconnect();
    resultsObserver = null;
  }
}

function ensureResultsObserver() {
  if (resultsObserver) return;

  let timer: number | null = null;
  resultsObserver = new MutationObserver(() => {
    if (timer) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      void applyResultsFilter();
    }, 180);
  });

  resultsObserver.observe(document.body, { childList: true, subtree: true });
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
    renderListingCard();
    removeCollapsedAiButton();
    ensureResultsObserver();
    await applyResultsFilter();
    return;
  }

  stopResultsObserver();
  resetHiddenResultCards();
  removeResultsToggleRoot();

  const listing = extractListingFromDocument(document, href);
  if (!listing) {
    currentListing = null;
    trackedListingId = "";
    currentError = "Could not detect listing metadata on this page.";
    renderListingCard();
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

  renderListingCard();
}

async function loadResultsPreferences() {
  const saved = await chrome.storage.local.get([RESULTS_FILTER_STORAGE_KEY, RESULTS_FILTER_POSITION_STORAGE_KEY]);
  const value = saved[RESULTS_FILTER_STORAGE_KEY];
  if (value === "show_all" || value === "hide_viewed_only" || value === "hide_viewed_and_contacted") {
    resultsFilterMode = value;
  }
}

function startNavigationWatcher() {
  const runSync = () => {
    void syncPageState().catch((error: unknown) => {
      currentError = error instanceof Error ? error.message : "Failed to sync listing state.";
      renderListingCard();
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

  void loadResultsPreferences().then(() => runSync());
}

startNavigationWatcher();
