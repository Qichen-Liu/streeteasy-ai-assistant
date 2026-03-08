import type { PublicSettings, UserSettings } from "../shared/types";

const apiKeyEl = document.getElementById("apiKey") as HTMLInputElement;
const modelEl = document.getElementById("model") as HTMLSelectElement;
const modeEl = document.getElementById("mode") as HTMLSelectElement;
const prioritiesEl = document.getElementById("priorities") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

async function loadSettings() {
  const response = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as
    | { ok: true; payload: PublicSettings }
    | { ok: false; error: string };

  if (!response.ok) {
    statusEl.textContent = response.error;
    return;
  }

  const settings = response.payload;
  apiKeyEl.value = "";
  apiKeyEl.placeholder = settings.hasApiKey ? "Stored (hidden). Enter new key to replace." : "sk-...";
  modelEl.value = settings.model;
  modeEl.value = settings.reportMode;
  prioritiesEl.value = settings.riskPriorities.join(",");
}

async function save() {
  const current = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as
    | { ok: true; payload: PublicSettings }
    | { ok: false; error: string };

  if (!current.ok) {
    statusEl.textContent = current.error;
    return;
  }

  const next: UserSettings = {
    openaiApiKey: apiKeyEl.value.trim(),
    model: modelEl.value,
    reportMode: modeEl.value as "fast" | "detailed",
    riskPriorities: prioritiesEl.value.split(",").map((s) => s.trim()).filter(Boolean)
  };

  const response = (await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings: next
  })) as { ok: boolean; error?: string };

  statusEl.textContent = response.ok ? "Settings saved." : response.error || "Failed to save settings.";
}

async function clearApiKey() {
  const response = (await chrome.runtime.sendMessage({ type: "CLEAR_API_KEY" })) as {
    ok: boolean;
    error?: string;
  };
  statusEl.textContent = response.ok ? "API key cleared." : response.error || "Failed to clear key.";
  if (response.ok) {
    apiKeyEl.value = "";
    apiKeyEl.placeholder = "sk-...";
  }
}

(document.getElementById("saveBtn") as HTMLButtonElement).addEventListener("click", () => {
  void save();
});

(document.getElementById("clearBtn") as HTMLButtonElement).addEventListener("click", () => {
  void clearApiKey();
});

void loadSettings();
