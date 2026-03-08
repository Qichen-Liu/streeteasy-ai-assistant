type RecentItem = {
  listing: { listingId: string; address: string; url: string; price?: number };
  contacted: boolean;
  lastViewedAt: string | null;
};

function fmtPrice(price?: number): string {
  return typeof price === "number" ? `$${price.toLocaleString()}` : "Price n/a";
}

async function load() {
  const listEl = document.getElementById("list");
  if (!listEl) return;

  const response = (await chrome.runtime.sendMessage({ type: "GET_RECENT_ACTIVITY" })) as
    | { ok: true; payload: RecentItem[] }
    | { ok: false; error: string };

  if (!response.ok) {
    listEl.textContent = response.error;
    return;
  }

  const items = response.payload;
  if (!items.length) {
    listEl.textContent = "No listings tracked yet.";
    return;
  }

  listEl.innerHTML = items
    .map((item) => {
      const viewed = item.lastViewedAt ? new Date(item.lastViewedAt).toLocaleString() : "Unknown";
      return `<div class="item">
        <div><strong>${item.listing.address}</strong></div>
        <div class="meta">${fmtPrice(item.listing.price)} | ${item.contacted ? "Contacted" : "Viewed"}</div>
        <div class="meta">Last viewed: ${viewed}</div>
        <div><a href="${item.listing.url}" target="_blank" rel="noreferrer">Open listing</a></div>
      </div>`;
    })
    .join("");
}

void load();
