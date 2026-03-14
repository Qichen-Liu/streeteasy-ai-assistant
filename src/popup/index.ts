type EvalSummary = {
  evaluatedAt: string;
  priceScore: number;
  qualityScore: number;
  confidence: "low" | "medium" | "high";
};

type RecentItem = {
  listing: { listingId: string; address: string; url: string; price?: number };
  contacted: boolean;
  lastViewedAt: string | null;
  latestEvaluation: EvalSummary | null;
};

type FilterMode = "all" | "contacted" | "viewed" | "evaluated";
type SortMode = "lastViewed" | "priceAsc" | "priceDesc" | "bestScore";

const filterEl = document.getElementById("filterSelect") as HTMLSelectElement;
const sortEl = document.getElementById("sortSelect") as HTMLSelectElement;
const listEl = document.getElementById("list") as HTMLDivElement;
const selectAllVisibleEl = document.getElementById("selectAllVisible") as HTMLInputElement;
const removeSelectedBtnEl = document.getElementById("removeSelectedBtn") as HTMLButtonElement;

let allItems: RecentItem[] = [];
let selectedListingIds = new Set<string>();
let visibleListingIds: string[] = [];
let suppressSelectAllChange = false;

function fmtPrice(price?: number): string {
  return typeof price === "number" ? `$${price.toLocaleString()}` : "Price n/a";
}

function fmtDate(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown" : parsed.toLocaleString();
}

function scoreForSort(item: RecentItem): number {
  if (!item.latestEvaluation) return -1;
  return (item.latestEvaluation.priceScore + item.latestEvaluation.qualityScore) / 2;
}

function applyFilter(items: RecentItem[], mode: FilterMode): RecentItem[] {
  if (mode === "contacted") {
    return items.filter((item) => item.contacted);
  }
  if (mode === "viewed") {
    return items.filter((item) => !item.contacted);
  }
  if (mode === "evaluated") {
    return items.filter((item) => Boolean(item.latestEvaluation));
  }
  return items;
}

function applySort(items: RecentItem[], mode: SortMode): RecentItem[] {
  const copy = [...items];

  if (mode === "priceAsc") {
    copy.sort((a, b) => (a.listing.price ?? Number.POSITIVE_INFINITY) - (b.listing.price ?? Number.POSITIVE_INFINITY));
    return copy;
  }

  if (mode === "priceDesc") {
    copy.sort((a, b) => (b.listing.price ?? -1) - (a.listing.price ?? -1));
    return copy;
  }

  if (mode === "bestScore") {
    copy.sort((a, b) => scoreForSort(b) - scoreForSort(a));
    return copy;
  }

  copy.sort((a, b) => {
    const aTime = a.lastViewedAt ? new Date(a.lastViewedAt).getTime() : 0;
    const bTime = b.lastViewedAt ? new Date(b.lastViewedAt).getTime() : 0;
    return bTime - aTime;
  });
  return copy;
}

function refreshBulkControls() {
  const selectedVisibleCount = visibleListingIds.filter((id) => selectedListingIds.has(id)).length;
  const hasVisible = visibleListingIds.length > 0;

  selectAllVisibleEl.checked = hasVisible && selectedVisibleCount === visibleListingIds.length;
  const isMixed = selectedVisibleCount > 0 && selectedVisibleCount < visibleListingIds.length;
  selectAllVisibleEl.indeterminate = isMixed;
  selectAllVisibleEl.dataset.mixed = isMixed ? "1" : "0";

  removeSelectedBtnEl.disabled = selectedListingIds.size === 0;
  removeSelectedBtnEl.textContent =
    selectedListingIds.size > 0 ? `Remove selected (${selectedListingIds.size})` : "Remove selected";
}

function renderItems() {
  const filterMode = (filterEl.value || "all") as FilterMode;
  const sortMode = (sortEl.value || "lastViewed") as SortMode;

  const filtered = applyFilter(allItems, filterMode);
  const sorted = applySort(filtered, sortMode);

  visibleListingIds = sorted.map((item) => item.listing.listingId);

  if (!sorted.length) {
    const message =
      allItems.length === 0
        ? "No listings tracked yet. Visit a supported listing page to start tracking."
        : "No listings match this filter.";
    listEl.className = "empty";
    listEl.textContent = message;
    refreshBulkControls();
    return;
  }

  listEl.className = "";
  listEl.innerHTML = sorted
    .map((item) => {
      const isSelected = selectedListingIds.has(item.listing.listingId);
      const chips = [
        item.contacted
          ? '<span class="chip chip-contacted">Contacted</span>'
          : '<span class="chip chip-viewed">Viewed</span>',
        item.latestEvaluation ? '<span class="chip chip-eval">AI evaluated</span>' : ""
      ].join("");

      const scoreLine = item.latestEvaluation
        ? `<div class="scores">AI Price ${item.latestEvaluation.priceScore}/100 | Quality ${item.latestEvaluation.qualityScore}/100 | ${item.latestEvaluation.confidence}</div>`
        : "";

      const checked = isSelected ? "checked" : "";
      const selectedClass = isSelected ? " item-selected" : "";
      const removeDisabled = isSelected ? "disabled" : "";

      return `<div class="item${selectedClass}">
        <div class="item-head">
          <input class="item-checkbox" type="checkbox" data-listing-id="${item.listing.listingId}" ${checked} />
          <div>
            <div class="title">${item.listing.address}</div>
            <div class="meta">${fmtPrice(item.listing.price)} | Last viewed: ${fmtDate(item.lastViewedAt)}</div>
          </div>
        </div>
        <div class="chips">${chips}</div>
        ${scoreLine}
        <div class="actions">
          <a href="${item.listing.url}" target="_blank" rel="noreferrer">Open listing</a>
          <button class="remove-btn" data-listing-id="${item.listing.listingId}" data-address="${item.listing.address}" ${removeDisabled}>Remove</button>
        </div>
      </div>`;
    })
    .join("");

  refreshBulkControls();
}

async function load() {
  listEl.className = "loading";
  listEl.textContent = "Loading...";

  const response = (await chrome.runtime.sendMessage({ type: "GET_RECENT_ACTIVITY" })) as
    | { ok: true; payload: RecentItem[] }
    | { ok: false; error: string };

  if (!response.ok) {
    listEl.className = "error";
    listEl.textContent = response.error;
    return;
  }

  allItems = response.payload;
  selectedListingIds = new Set<string>();
  renderItems();
}

filterEl.addEventListener("change", renderItems);
sortEl.addEventListener("change", renderItems);

selectAllVisibleEl.addEventListener("change", () => {
  if (suppressSelectAllChange) {
    suppressSelectAllChange = false;
    return;
  }

  if (selectAllVisibleEl.checked) {
    for (const id of visibleListingIds) {
      selectedListingIds.add(id);
    }
  } else {
    for (const id of visibleListingIds) {
      selectedListingIds.delete(id);
    }
  }
  renderItems();
});

selectAllVisibleEl.addEventListener("click", (event) => {
  if (selectAllVisibleEl.dataset.mixed !== "1") {
    return;
  }

  // In mixed state, force "clear visible selections" and skip the following change event.
  suppressSelectAllChange = true;
  event.preventDefault();
  for (const id of visibleListingIds) {
    selectedListingIds.delete(id);
  }
  renderItems();
});

removeSelectedBtnEl.addEventListener("click", () => {
  const ids = Array.from(selectedListingIds);
  if (!ids.length) return;

  const ok = window.confirm(`Remove ${ids.length} selected listings from tracked data?`);
  if (!ok) return;

  void (async () => {
    const response = (await chrome.runtime.sendMessage({
      type: "REMOVE_LISTINGS",
      listingIds: ids
    })) as { ok: boolean; error?: string };

    if (!response.ok) {
      listEl.className = "error";
      listEl.textContent = response.error || "Failed to remove selected listings.";
      return;
    }

    const removeSet = new Set(ids);
    allItems = allItems.filter((item) => !removeSet.has(item.listing.listingId));
    selectedListingIds = new Set(Array.from(selectedListingIds).filter((id) => !removeSet.has(id)));
    renderItems();
  })();
});

listEl.addEventListener("change", (event) => {
  const target = event.target as HTMLElement | null;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.classList.contains("item-checkbox")) return;

  const listingId = target.getAttribute("data-listing-id");
  if (!listingId) return;

  if (target.checked) {
    selectedListingIds.add(listingId);
  } else {
    selectedListingIds.delete(listingId);
  }

  renderItems();
});

listEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (!target || !target.classList.contains("remove-btn")) {
    return;
  }

  const listingId = target.getAttribute("data-listing-id");
  const address = target.getAttribute("data-address") || "this listing";
  if (!listingId) {
    return;
  }

  if (selectedListingIds.has(listingId) || (target as HTMLButtonElement).disabled) {
    return;
  }

  const ok = window.confirm(`Remove ${address} from tracked listings?`);
  if (!ok) {
    return;
  }

  void (async () => {
    const response = (await chrome.runtime.sendMessage({
      type: "REMOVE_LISTING",
      listingId
    })) as { ok: boolean; error?: string };

    if (!response.ok) {
      listEl.className = "error";
      listEl.textContent = response.error || "Failed to remove listing.";
      return;
    }

    allItems = allItems.filter((item) => item.listing.listingId !== listingId);
    selectedListingIds.delete(listingId);
    renderItems();
  })();
});

void load();
