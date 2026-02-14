import { onMessage, sendMessage } from '@/utils/messaging';
import { formatDuration } from '@/utils/time-format';
import type { TabDurationInfo, PopupData } from '@/utils/types';

export default defineBackground(() => {
  const tabDurations = new Map<number, TabDurationInfo>();
  let displayEnabled = true;

  const YOUTUBE_VIDEO_RE = /^https:\/\/www\.youtube\.com\/watch/;
  const YOUTUBE_SHORTS_RE = /^https:\/\/www\.youtube\.com\/shorts\//;

  function isYouTubeVideoUrl(url: string | undefined): boolean {
    if (!url) return false;
    return YOUTUBE_VIDEO_RE.test(url) || YOUTUBE_SHORTS_RE.test(url);
  }

  function calculateTotalRemaining(): number {
    let totalRemaining = 0;
    for (const info of tabDurations.values()) {
      if (!info.isLoading) {
        const remaining = (info.durationSeconds - info.currentTimeSeconds) / (info.playbackRate || 1);
        if (Number.isFinite(remaining) && remaining > 0) totalRemaining += remaining;
      }
    }
    return totalRemaining;
  }

  // Throttled persistence — at most once per 2 seconds
  let persistTimeout: ReturnType<typeof setTimeout> | null = null;
  function schedulePersist(): void {
    if (persistTimeout !== null) return;
    persistTimeout = setTimeout(() => {
      persistTimeout = null;
      const data = Array.from(tabDurations.values());
      browser.storage.local.set({ tabDurationsCache: data });
    }, 2000);
  }

  function updateBadge(): void {
    const totalSeconds = calculateTotalRemaining();

    if (!displayEnabled) {
      browser.action.setBadgeText({ text: '' });
      schedulePersist();
      return;
    }

    const text = totalSeconds > 0 ? formatDuration(totalSeconds) : '';
    browser.action.setBadgeText({ text });
    browser.action.setBadgeBackgroundColor({ color: '#CC0000' });
    schedulePersist();
  }

  async function requestDurationFromTab(tabId: number, retries = 2): Promise<void> {
    try {
      const response = await sendMessage('getDuration', undefined, tabId);
      tabDurations.set(tabId, {
        tabId,
        url: response.url,
        title: response.title,
        durationSeconds: response.durationSeconds,
        currentTimeSeconds: response.currentTimeSeconds,
        playbackRate: response.playbackRate,
        isLoading: response.isLoading,
        videoType: response.videoType,
      });
      updateBadge();

      // If still loading, retry after a delay (background tabs may need time)
      if (response.isLoading && retries > 0) {
        setTimeout(() => requestDurationFromTab(tabId, retries - 1), 3000);
      }
    } catch {
      // Content script not ready or tab closed — will be reported proactively
    }
  }

  async function scanAllYouTubeTabs(): Promise<void> {
    const tabs = await browser.tabs.query({
      url: ['*://www.youtube.com/watch*', '*://www.youtube.com/shorts/*'],
    });

    // Remove entries for tabs that no longer exist
    const activeTabIds = new Set(tabs.map((t) => t.id).filter((id) => id != null));
    for (const tabId of tabDurations.keys()) {
      if (!activeTabIds.has(tabId)) {
        tabDurations.delete(tabId);
      }
    }

    // Only message non-discarded tabs — discarded ones keep their cached data
    await Promise.allSettled(
      tabs
        .filter((tab) => tab.id != null && !tab.discarded)
        .map((tab) => requestDurationFromTab(tab.id!)),
    );

    updateBadge();
  }

  // Re-inject content scripts into tabs that don't have one running.
  // This handles the case where the extension is disabled then re-enabled —
  // existing tabs lose their content scripts.
  async function injectContentScripts(): Promise<void> {
    const tabs = await browser.tabs.query({
      url: ['*://www.youtube.com/*'],
    });

    await Promise.allSettled(
      tabs
        .filter((tab) => tab.id != null && !tab.discarded)
        .map(async (tab) => {
          try {
            // Check if content script is already running
            await sendMessage('getDuration', undefined, tab.id!);
          } catch {
            // Content script not running — inject it
            await browser.scripting.executeScript({
              target: { tabId: tab.id! },
              files: ['content-scripts/content.js'],
            }).catch(() => {});
          }
        }),
    );
  }

  // Restore persisted state, inject content scripts, then scan
  browser.storage.local.get(['displayEnabled', 'tabDurationsCache']).then(async (result) => {
    if (typeof result.displayEnabled === 'boolean') {
      displayEnabled = result.displayEnabled;
    }
    // Restore cached tab data (covers discarded tabs and service worker restarts)
    if (Array.isArray(result.tabDurationsCache)) {
      for (const info of result.tabDurationsCache) {
        if (info && typeof info.tabId === 'number') {
          tabDurations.set(info.tabId, info);
        }
      }
    }
    updateBadge();
    await injectContentScripts();
    scanAllYouTubeTabs();
  });

  // --- Tab event listeners ---

  browser.tabs.onRemoved.addListener((tabId: number) => {
    if (tabDurations.has(tabId)) {
      tabDurations.delete(tabId);
      updateBadge();
    }
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      if (isYouTubeVideoUrl(tab.url)) {
        setTimeout(() => requestDurationFromTab(tabId), 1000);
      } else if (tabDurations.has(tabId)) {
        tabDurations.delete(tabId);
        updateBadge();
      }
    }
  });

  browser.webNavigation.onHistoryStateUpdated.addListener(
    (details) => {
      if (details.frameId !== 0) return;

      if (isYouTubeVideoUrl(details.url)) {
        setTimeout(() => requestDurationFromTab(details.tabId), 1500);
      } else if (tabDurations.has(details.tabId)) {
        tabDurations.delete(details.tabId);
        updateBadge();
      }
    },
    { url: [{ hostEquals: 'www.youtube.com' }] },
  );

  // --- Message handlers ---

  onMessage('reportDuration', (message) => {
    const tabId = message.sender.tab?.id;
    if (tabId === undefined) return;

    // Only track video/shorts pages — ignore playlist, home, etc.
    if (!isYouTubeVideoUrl(message.data.url)) {
      tabDurations.delete(tabId);
      updateBadge();
      return;
    }

    tabDurations.set(tabId, {
      tabId,
      url: message.data.url,
      title: message.data.title,
      durationSeconds: message.data.durationSeconds,
      currentTimeSeconds: message.data.currentTimeSeconds,
      playbackRate: message.data.playbackRate,
      isLoading: message.data.isLoading,
      videoType: message.data.videoType,
    });
    updateBadge();
  });

  onMessage('getPopupData', (): PopupData => {
    const tabs = Array.from(tabDurations.values());
    const totalRemaining = calculateTotalRemaining();
    return {
      tabs,
      totalDurationSeconds: totalRemaining,
      totalFormatted: formatDuration(totalRemaining),
      displayEnabled,
    };
  });

  onMessage('toggleDisplay', (): boolean => {
    displayEnabled = !displayEnabled;
    browser.storage.local.set({ displayEnabled });
    updateBadge();
    return displayEnabled;
  });
});
