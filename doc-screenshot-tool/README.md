# Doc Screenshot Tool

Automated web application screenshot tool for documentation. Launches a controlled Chrome browser, lets you authenticate manually, then systematically crawls the application — discovering links, categorizing pages, and capturing full-page screenshots organized into a structured folder hierarchy.

## Features

- **Manual authentication** — browser opens visibly so you can log in; crawl begins when you press Enter
- **Intelligent crawling** — breadth-first discovery of all same-origin links (respects depth/page limits)
- **Full-page screenshots** — Playwright stitches scrollable pages into a single image automatically
- **Lazy-content triggering** — scrolls through each page first to load deferred content before capture
- **Automatic categorization** — pages are classified into categories (dashboard, settings, forms, reports, etc.) based on URL, title, and DOM analysis
- **Section-level capture** — optionally screenshots individual page sections (`main`, `article`, cards, panels)
- **Interactive state capture** — optionally clicks tabs, expands accordions, and screenshots each state
- **Overlay dismissal** — automatically closes cookie banners and modal overlays before capturing
- **Structured output** — screenshots saved in `<category>/<url-path>/screenshot.png` hierarchy
- **JSON manifest** — generates `manifest.json` with metadata on every captured page and screenshot
- **Persistent sessions** — reuse a browser profile directory to skip re-authentication across runs

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
cd doc-screenshot-tool
npm install
npx playwright install chromium
```

## Usage

### Basic

```bash
node src/index.js https://myapp.example.com
```

This will:
1. Open a Chrome window and navigate to the URL
2. Pause so you can log in manually
3. Once you press Enter, crawl the app and screenshot every page
4. Save everything to `./screenshots/`

### Full options

```bash
node src/index.js https://myapp.example.com \
  --output ./my-docs-screenshots \
  --max-depth 4 \
  --max-pages 50 \
  --sections \
  --interactive \
  --viewport 1440x900 \
  --exclude "logout,admin/danger" \
  --delay 1000 \
  --user-data-dir ./browser-profile
```

### Options reference

| Option | Default | Description |
|---|---|---|
| `-o, --output <dir>` | `./screenshots` | Output directory |
| `-d, --max-depth <n>` | `5` | Maximum link depth from start page |
| `-p, --max-pages <n>` | `100` | Maximum pages to visit |
| `--headless` | `false` | Run headless (no visible browser) |
| `--sections` | `false` | Capture individual page sections |
| `--interactive` | `false` | Capture tab/accordion states |
| `--viewport <WxH>` | `1920x1080` | Browser viewport dimensions |
| `--exclude <patterns>` | `logout,signout,...` | Comma-separated URL substrings to skip |
| `--include <patterns>` | (none) | Only crawl URLs containing these substrings |
| `--delay <ms>` | `500` | Extra delay between page navigations |
| `--user-data-dir <dir>` | (none) | Persistent browser profile path |

## Output structure

```
screenshots/
├── manifest.json
├── dashboard/
│   └── _root/
│       └── screenshot.png
├── settings/
│   ├── settings/
│   │   ├── screenshot.png
│   │   └── sections/
│   │       ├── general-settings.png
│   │       └── notification-preferences.png
│   └── settings/users/
│       └── screenshot.png
├── reports-analytics/
│   └── reports/
│       ├── screenshot.png
│       └── screenshot-tab-monthly.png
└── forms/
    └── create/project/
        └── screenshot.png
```

## Manifest

The `manifest.json` file contains metadata about every captured page:

```json
{
  "baseUrl": "https://myapp.example.com",
  "capturedAt": "2026-02-12T10:30:00.000Z",
  "totalPages": 25,
  "categories": {
    "dashboard": { "count": 1, "pages": ["..."] },
    "settings": { "count": 4, "pages": ["..."] }
  },
  "pages": [
    {
      "url": "https://myapp.example.com/settings",
      "title": "Settings — MyApp",
      "category": "settings",
      "depth": 1,
      "pageTypes": ["form", "tabbed-view"],
      "screenshots": { "fullPage": "settings/settings/screenshot.png" },
      "sections": [{ "name": "General", "path": "..." }],
      "interactiveStates": [{ "name": "tab-Security", "type": "tab", "path": "..." }]
    }
  ]
}
```

This manifest is designed to be consumed by documentation generators or AI assistants to write documentation referencing the correct screenshots.
