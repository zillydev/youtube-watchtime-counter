import { onMessage, sendMessage } from "@/utils/messaging";
import type { DurationResponse } from "@/utils/types";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  runAt: "document_idle",

  main() {
    let currentUrl = location.href;
    let domObserver: MutationObserver | null = null;
    let reportInterval: ReturnType<typeof setInterval> | null = null;

    function getMainVideo(): HTMLVideoElement | null {
      const isShort = location.href.includes("/shorts/");

      if (isShort) {
        // Shorts use ytd-reel-video-renderer with multiple video elements.
        // The currently visible/playing Short is the one that isn't paused,
        // or we target the one marked as active.
        const activeRenderer = document.querySelector(
          "ytd-reel-video-renderer[is-active]",
        );
        if (activeRenderer) {
          const video = activeRenderer.querySelector<HTMLVideoElement>("video");
          if (video) return video;
        }
        // Fallback: find the playing video among all Shorts videos
        const videos = document.querySelectorAll<HTMLVideoElement>(
          "ytd-reel-video-renderer video",
        );
        for (const v of videos) {
          if (!v.paused && v.currentTime > 0) return v;
        }
        // Last resort: first video in a reel renderer
        if (videos.length > 0) return videos[0];
      }

      return (
        document.querySelector<HTMLVideoElement>("#movie_player video") ??
        document.querySelector<HTMLVideoElement>("video.html5-main-video") ??
        document.querySelector<HTMLVideoElement>("video")
      );
    }

    /**
     * Extract duration from YouTube's page data. This works even in background
     * tabs where the <video> element hasn't loaded metadata yet.
     * YouTube embeds video details in `ytInitialPlayerResponse` and in the
     * `ytd-watch-flexy` / `ytd-player` component data.
     */
    function getPageDataDuration(): number | null {
      // Method 1: ytd-watch-flexy element (available after SPA navigation too)
      try {
        const watchFlexy = document.querySelector("ytd-watch-flexy") as any;
        const lengthSeconds =
          watchFlexy?.playerData?.videoDetails?.lengthSeconds;
        if (lengthSeconds) {
          const parsed = Number(lengthSeconds);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      } catch {
        /* ignore */
      }

      // Method 2: ytInitialPlayerResponse global (available on full page load)
      try {
        const initialData = (window as any).ytInitialPlayerResponse;
        const lengthSeconds = initialData?.videoDetails?.lengthSeconds;
        if (lengthSeconds) {
          const parsed = Number(lengthSeconds);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      } catch {
        /* ignore */
      }

      // Method 3: Parse from the page's script tags as a last resort
      try {
        const scripts = document.querySelectorAll("script");
        for (const script of scripts) {
          const text = script.textContent;
          if (!text || !text.includes("lengthSeconds")) continue;
          const match = text.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
          if (match) {
            const parsed = Number(match[1]);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
          }
        }
      } catch {
        /* ignore */
      }

      return null;
    }

    function isLiveStream(): boolean {
      try {
        const watchFlexy = document.querySelector("ytd-watch-flexy") as any;
        if (watchFlexy?.playerData?.videoDetails?.isLive) return true;
      } catch {
        /* ignore */
      }
      try {
        if ((window as any).ytInitialPlayerResponse?.videoDetails?.isLive)
          return true;
      } catch {
        /* ignore */
      }
      // Also check the video element — live streams have Infinity duration
      const video = getMainVideo();
      if (video && video.duration === Infinity) return true;
      return false;
    }

    function extractDuration(): DurationResponse {
      const video = getMainVideo();
      const url = location.href;
      let title = document.title.replace(" - YouTube", "").trim();
      // If title is still generic "YouTube", try to get the actual video title
      if (title === "YouTube" || title === "") {
        const videoTitle =
          document
            .querySelector<HTMLElement>(
              "h1.ytd-watch-metadata yt-formatted-string",
            )
            ?.textContent?.trim() ??
          document
            .querySelector<HTMLElement>("#info h1 yt-formatted-string")
            ?.textContent?.trim() ??
          document
            .querySelector<HTMLElement>("ytd-reel-video-renderer[is-active] h2")
            ?.textContent?.trim();
        if (videoTitle) title = videoTitle;
      }
      const isShort = url.includes("/shorts/");
      const live = isLiveStream();

      const currentTime = video?.currentTime ?? 0;

      // Try the <video> element first (most accurate when loaded)
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        return {
          durationSeconds: video.duration,
          currentTimeSeconds: currentTime,
          isLiveStream: live,
          isLoading: false,
          videoType: isShort ? "short" : "video",
          url,
          title,
        };
      }

      // Fall back to YouTube's page data (works in background tabs)
      const pageDataDuration = getPageDataDuration();
      if (pageDataDuration !== null) {
        return {
          durationSeconds: pageDataDuration,
          currentTimeSeconds: currentTime,
          isLiveStream: live,
          isLoading: false,
          videoType: isShort ? "short" : "video",
          url,
          title,
        };
      }

      return {
        durationSeconds: 0,
        currentTimeSeconds: 0,
        isLiveStream: live,
        isLoading: true,
        videoType: isShort ? "short" : "video",
        url,
        title,
      };
    }

    // Respond to pull requests from the service worker
    onMessage("getDuration", () => extractDuration());

    function startPeriodicReporting(): void {
      stopPeriodicReporting();
      reportInterval = setInterval(() => {
        // Detect URL changes from Shorts swiping (no navigation event fired)
        if (location.href !== currentUrl) {
          currentUrl = location.href;
        }
        const data = extractDuration();
        if (!data.isLoading) {
          sendMessage("reportDuration", data).catch(() => {});
        }
      }, 2000);
    }

    function stopPeriodicReporting(): void {
      if (reportInterval !== null) {
        clearInterval(reportInterval);
        reportInterval = null;
      }
    }

    function reportCurrentDuration(): void {
      const data = extractDuration();
      if (!data.isLoading) {
        sendMessage("reportDuration", data).catch(() => {
          // Service worker may not be ready — it will pull later
        });
        startPeriodicReporting();
      }
    }

    function waitForVideoAndReport(): void {
      // Check if we can get duration from page data immediately
      const pageDataDuration = getPageDataDuration();
      if (pageDataDuration !== null) {
        reportCurrentDuration();
        // Still set up video listeners to update with exact duration later
        setupVideoListeners();
        return;
      }

      const video = getMainVideo();

      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        reportCurrentDuration();
        return;
      }

      if (video) {
        setupVideoListeners();
        return;
      }

      // Neither page data nor video element available yet — observe DOM
      observeForData();
    }

    function setupVideoListeners(): void {
      const video = getMainVideo();
      if (!video) return;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        reportCurrentDuration();
        return;
      }
      const onReady = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.removeEventListener("loadedmetadata", onReady);
          video.removeEventListener("durationchange", onReady);
          reportCurrentDuration();
        }
      };
      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("durationchange", onReady);
    }

    function observeForData(): void {
      domObserver?.disconnect();
      domObserver = new MutationObserver((_mutations, obs) => {
        // Check page data first (available before video element loads)
        if (getPageDataDuration() !== null) {
          obs.disconnect();
          domObserver = null;
          reportCurrentDuration();
          setupVideoListeners();
          return;
        }
        if (getMainVideo()) {
          obs.disconnect();
          domObserver = null;
          waitForVideoAndReport();
        }
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
    }

    // YouTube SPA navigation detection
    document.addEventListener("yt-navigate-finish", () => {
      const newUrl = location.href;
      if (newUrl !== currentUrl) {
        currentUrl = newUrl;
        stopPeriodicReporting();
        setTimeout(waitForVideoAndReport, 500);
      }
    });

    window.addEventListener("popstate", () => {
      const newUrl = location.href;
      if (newUrl !== currentUrl) {
        currentUrl = newUrl;
        stopPeriodicReporting();
        setTimeout(waitForVideoAndReport, 500);
      }
    });

    // Initial extraction
    waitForVideoAndReport();
  },
});
