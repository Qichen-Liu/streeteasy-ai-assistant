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

let allItems: RecentItem[] = [];

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

function renderItems() {
  const filterMode = (filterEl.value || "all") as FilterMode;
  const sortMode = (sortEl.value || "lastViewed") as SortMode;

  const filtered = applyFilter(allItems, filterMode);
  const sorted = applySort(filtered, sortMode);

  if (!sorted.length) {
    const message =
      allItems.length === 0
        ? "No listings tracked yet. Visit a StreetEasy listing page to start tracking."
        : "No listings match this filter.";
    listEl.className = "empty";
    listEl.textContent = message;
    return;
  }

  listEl.className = "";
  listEl.innerHTML = sorted
    .map((item) => {
      const chips = [
        item.contacted
          ? '<span class="chip chip-contacted">Contacted</span>'
          : '<span class="chip chip-viewed">Viewed</span>',
        item.latestEvaluation ? '<span class="chip chip-eval">AI evaluated</span>' : ""
      ].join("");

      const scoreLine = item.latestEvaluation
        ? `<div class="scores">AI Price ${item.latestEvaluation.priceScore}/100 | Quality ${item.latestEvaluation.qualityScore}/100 | ${item.latestEvaluation.confidence}</div>`
        : "";

      return `<div class="item">
        <div class="title">${item.listing.address}</div>
        <div class="meta">${fmtPrice(item.listing.price)} | Last viewed: ${fmtDate(item.lastViewedAt)}</div>
        <div class="chips">${chips}</div>
        ${scoreLine}
        <div><a href="${item.listing.url}" target="_blank" rel="noreferrer">Open listing</a></div>
      </div>`;
    })
    .join("");
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
  renderItems();
}

filterEl.addEventListener("change", renderItems);
sortEl.addEventListener("change", renderItems);

void load();
