# YouTube Watch Time Counter

A Chrome extension that tracks the remaining watch time across all your open YouTube tabs — including Shorts — and displays it on the extension badge in real time.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-brightgreen?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)

<img width="320" height="234" alt="image" src="https://github.com/user-attachments/assets/996aa08d-1143-4e4c-b73d-06be3ed340c9" />


## Features

- **Scans all YouTube tabs** — regular videos and Shorts
- **Live badge** — total remaining time shown on the extension icon (e.g. "2h30m"), counting down as you watch
- **Real-time tracking** — updates every 2 seconds based on your actual playback position
- **Dynamic updates** — automatically refreshes when you open, close, or navigate YouTube tabs
- **Background tab support** — extracts duration from YouTube's page data, no need to visit the tab first
- **Popup breakdown** — click the icon to see per-tab remaining time (e.g. "8:30 left"), updates live while open
- **Toggle badge** — show/hide the badge via the eye icon in the popup
- **Live stream aware** — live streams are shown as "LIVE" and excluded from the total

## Install

### From source

1. Clone the repo:
   ```bash
   git clone https://github.com/zillydev/youtube-watchtime-count-extension.git
   cd youtube-watchtime-count-extension
   ```

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `.output/chrome-mv3/` folder

## Development

```bash
npm run dev
```

This launches a Chrome instance with the extension loaded and hot module replacement enabled.

## How It Works

```
Content Script (per YouTube tab)
  ├── Extracts video duration + current playback position
  ├── Reports to service worker every 2 seconds
  ├── Detects YouTube SPA navigation (yt-navigate-finish)
  └── Handles Shorts scrolling and active reel detection

Service Worker (background)
  ├── Monitors tab lifecycle (created, removed, updated)
  ├── Aggregates remaining time (duration - currentTime) across tabs
  └── Updates the extension badge in real time

Popup (on icon click)
  ├── Shows total remaining time, refreshes every 2 seconds
  ├── Lists all YouTube tabs with per-tab remaining time
  └── Toggle button for badge visibility
```

## Tech Stack

- [WXT](https://wxt.dev/) — Web Extension Toolkit (Vite-based, TypeScript-first)
- [@webext-core/messaging](https://webext-core.aklinker1.io/messaging/) — type-safe extension messaging
- Chrome Extension Manifest V3

## License

MIT
