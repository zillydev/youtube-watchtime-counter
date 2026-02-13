import { sendMessage } from "@/utils/messaging";
import { formatDurationLong, formatTimestamp } from "@/utils/time-format";
import type { PopupData, TabDurationInfo } from "@/utils/types";

function render(data: PopupData): void {
  const totalEl = document.getElementById("total-time")!;
  const listEl = document.getElementById("tabs-list")!;
  const emptyEl = document.getElementById("empty-state")!;

  totalEl.textContent = formatDurationLong(data.totalDurationSeconds);

  if (data.tabs.length === 0) {
    listEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  listEl.classList.remove("hidden");
  listEl.innerHTML = "";

  const sorted = [...data.tabs]
    .filter((tab) => tab.title !== "YouTube" && tab.title !== "")
    .sort(
      (a, b) =>
        b.durationSeconds -
        b.currentTimeSeconds -
        (a.durationSeconds - a.currentTimeSeconds),
    );

  for (const tab of sorted) {
    listEl.appendChild(createTabRow(tab));
  }
}

function createTabRow(tab: TabDurationInfo): HTMLElement {
  const row = document.createElement("div");
  row.className = "tab-row";

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title || "Untitled";
  title.title = tab.url;

  const duration = document.createElement("span");
  duration.className = "tab-duration";

  if (tab.isLiveStream) {
    duration.textContent = "LIVE";
    duration.classList.add("live");
  } else if (tab.isLoading) {
    duration.textContent = "Loading...";
    duration.classList.add("loading");
  } else {
    const remaining = Math.max(0, tab.durationSeconds - tab.currentTimeSeconds);
    duration.textContent = formatTimestamp(remaining) + " left";
  }

  row.appendChild(title);

  if (tab.videoType === "short") {
    const badge = document.createElement("span");
    badge.className = "tab-badge short";
    badge.textContent = "Short";
    row.appendChild(badge);
  }

  row.appendChild(duration);

  return row;
}

function updateToggleIcon(enabled: boolean): void {
  const visibleIcon = document.getElementById("icon-visible")!;
  const hiddenIcon = document.getElementById("icon-hidden")!;
  const btn = document.getElementById("toggle-btn")!;

  if (enabled) {
    visibleIcon.classList.remove("hidden");
    hiddenIcon.classList.add("hidden");
    btn.setAttribute("aria-label", "Hide badge");
  } else {
    visibleIcon.classList.add("hidden");
    hiddenIcon.classList.remove("hidden");
    btn.setAttribute("aria-label", "Show badge");
  }
}

async function init(): Promise<void> {
  const data = await sendMessage("getPopupData", undefined);
  render(data);
  updateToggleIcon(data.displayEnabled);

  // Refresh popup data every 2 seconds while open
  setInterval(async () => {
    const fresh = await sendMessage("getPopupData", undefined);
    render(fresh);
  }, 2000);

  document.getElementById("toggle-btn")!.addEventListener("click", async () => {
    const newState = await sendMessage("toggleDisplay", undefined);
    updateToggleIcon(newState);
  });
}

document.addEventListener("DOMContentLoaded", init);
