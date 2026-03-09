# Mouse Video Simulator

Generate realistic screen recordings of webpage interactions from plain English instructions. Describe what you want in natural language, and the tool produces an MP4 video with human-like mouse movements, clicks, typing, and scrolling.

## How It Works

1. **You describe** what to do in plain English ("Click Sign In, type the email, submit the form")
2. **Claude interprets** your instructions into precise browser actions using your page's actual elements
3. **Playwright executes** each action with realistic Bézier-curve mouse movements, jitter, and Fitts's Law timing
4. **The session is recorded** and output as an MP4 video

No API key needed — the tool uses Claude Code (included with Claude Max) for AI features.

---

## Setup

### Prerequisites

- **Node.js 18+**
- **Claude Code** installed and authenticated (comes with Claude Max subscription)
- **ffmpeg** for MP4 encoding

### Installation

```bash
cd mouse-video-sim

# Install dependencies
npm install

# Install the Playwright browser
npx playwright install chromium

# Install ffmpeg (for MP4 encoding)
# macOS:
brew install ffmpeg
# Ubuntu/Debian:
sudo apt install ffmpeg
# Windows:
choco install ffmpeg
```

### Running

```bash
# Development mode (auto-reloads)
npm run dev

# OR: Production build
npm run build
npm start
```

Then open **http://localhost:3456** in your browser.

---

## Authentication (Login-Protected Sites)

Most real apps require authentication. The tool supports three ways to handle this:

### Option 1: Interactive Login (Recommended)

The tool opens a **visible browser window** where you log in manually. Once authenticated, it captures your session cookies and reuses them for crawling and recording.

1. Expand **"Add Login Session"** in the Authentication section
2. Select the **"Interactive Login"** tab
3. Enter a session name (e.g. "Dr Migrate Portal")
4. Enter the login page URL (e.g. `https://portal.drmigrate.com/login`)
5. Click **"Open Browser & Login"**
6. A browser window opens — log in as you normally would
7. Once the tool detects a successful login (URL change + auth cookies), it captures the session and closes the browser

The session is now saved. Select it from the **auth dropdown** and all subsequent scans, crawls, and recordings will be authenticated.

### Option 2: Stored Credentials

For automated login without manual interaction:

1. Select the **"Stored Credentials"** tab
2. Enter the login URL, username, and password
3. Click **"Save Credentials"**
4. Click **"Login"** next to the saved credentials to generate a session

The tool fills in the login form and submits it automatically. If your login form uses non-standard selectors, expand the **"Advanced: CSS Selectors"** panel to override them.

### Option 3: Cookie Import

If you have cookies from your browser:

1. Open DevTools in your browser (F12 → Application → Cookies)
2. Copy the cookies as JSON
3. Select the **"Cookie Import"** tab
4. Paste the JSON and click **"Import Cookies"**

### Using Auth Sessions

Once you have a session:
- Select it from the **Authentication dropdown** at the top
- It applies to **all operations**: scanning, crawling, and video recording
- Sessions persist between restarts (saved in `data/auth/`)
- If a session expires, just create a new one

---

## Quick Start

1. Open `http://localhost:3456`
2. Enter the target URL
3. Describe the interactions in plain English
4. Click **Generate Video**
5. Download the MP4 when ready

### Example Instructions

```
Click the "Sign In" button in the top right corner.
Wait for the login page to load.
Click on the email input and type "demo@example.com".
Click on the password field and type "mypassword".
Click the "Log In" button.
Wait for the dashboard to load.
Scroll down to see the recent activity section.
```

---

## Pre-Training Your Site (Site Profiles)

For sites you record frequently, you can **pre-scan** them so the tool already knows every button, input, and link before you hit Generate. This makes runs faster and more accurate.

### Auto-Crawl (Recommended)

The crawler starts at one URL and automatically discovers and scans every linked page within a path scope. Perfect for multi-page sections.

1. Open the **"Scan New Site"** panel
2. Switch to the **Auto-Crawl** tab (default)
3. Enter a **Profile Name** (e.g. "Patient Dashboard")
4. Enter the **Starting URL** (e.g. `https://app.example.com/patients`)
5. Optionally set a **Path Scope** to limit crawling (e.g. `/patients/`) — auto-detected from your URL if left blank
6. Set **Max Pages** (default 30)
7. Click **"Crawl & Build Profile"**

The crawler will:
- Load the starting page and extract all interactive elements
- Follow every link that stays within the path scope
- Repeat for each discovered page (breadth-first)
- Save the complete element map as a reusable profile

### Manual URLs

If you want precise control over which pages to scan:

1. Switch to the **Manual URLs** tab
2. Enter one URL per line
3. Click **"Scan Listed URLs"**

### Using a Profile

Select a saved profile from the **dropdown** at the top of the Site Profiles section. When generating a video with a profile selected, the tool skips the live page analysis step and uses the cached element data instead.

---

## Example: Crawling Dr Migrate Portal

Here's a real-world walkthrough using [Dr Migrate](https://portal.drmigrate.com) to demonstrate how you'd pre-train the tool on a multi-page platform.

### Step 0: Authenticate

Since the portal requires login:

1. Expand **"Add Login Session"**
2. Set session name: `Dr Migrate`
3. Set login URL: `https://portal.drmigrate.com/login`
4. Click **"Open Browser & Login"**
5. Log in manually in the browser that opens
6. The session is captured automatically — select it from the auth dropdown

### Step 1: Crawl the Platform

With your auth session selected, open the **"Scan New Site"** panel and fill in:

| Field | Value |
|---|---|
| Profile Name | `Dr Migrate Portal` |
| Starting URL | `https://portal.drmigrate.com` |
| Path Scope | `/` (leave blank to crawl the whole site) |
| Max Pages | `30` |

Click **"Crawl & Build Profile"**. The crawler will:
- Load the portal homepage
- Follow every internal link it finds (login page, dashboard sections, planning pages, etc.)
- Extract all buttons, inputs, links, navigation, and form elements from each page
- Save everything as a reusable profile

Expected output:
```
Crawling https://portal.drmigrate.com under path "/" (max 30 pages)...
[1/30] Scanning: https://portal.drmigrate.com
  Found 35 elements on "Dr Migrate Portal"
  Discovered 8 new link(s) to crawl
[2/30] Scanning: https://portal.drmigrate.com/login
  Found 12 elements on "Login"
  Discovered 2 new link(s) to crawl
[3/30] Scanning: https://portal.drmigrate.com/modernisation/planning
  Found 45 elements on "Modernisation Planning"
  Discovered 6 new link(s) to crawl
...
Profile "Dr Migrate Portal" saved with 18 page(s).
```

### Step 2: Crawl a Specific Section (Narrower Scope)

If you only want to demo the Modernisation Planning section:

| Field | Value |
|---|---|
| Profile Name | `Modernisation - Planning` |
| Starting URL | `https://portal.drmigrate.com/modernisation/planning` |
| Path Scope | `/modernisation/planning/` |
| Max Pages | `30` |

This only crawls pages under `/modernisation/planning/` — overview, phases, timeline, resources — and ignores the rest of the site.

### Step 3: Generate a Demo Video

1. Select **"Dr Migrate Portal"** (or the narrower planning profile) from the dropdown
2. Set the starting URL: `https://portal.drmigrate.com`
3. Write your instructions:

```
Click the "Login" button.
Wait for the login form to load.
Click the email field and type "demo@drmigrate.com".
Click the password field and type "demo123".
Click the "Sign In" button.
Wait for the dashboard to load.
Click "Modernisation" in the navigation sidebar.
Wait for the modernisation section to load.
Click on "Sectional Planning".
Scroll down to see the planning overview.
Click on the first planning item to expand it.
Wait for the details to load.
```

4. Click **Generate Video**

Since you already crawled the site, the tool skips the live page scan and goes straight to generating actions — it already knows every element on every page.

### Step 4: Fine-Tune for a Presentation

For a polished client-facing demo, adjust mouse settings:

| Setting | Value | Why |
|---|---|---|
| Speed | 0.6x | Slower, more deliberate movements |
| Curvature | 0.15 | Gentle curves, professional feel |
| Jitter | 0.1 | Minimal shake |
| Action Delay | 900ms | Give viewers time to read each step |
| Typing Speed | 110ms | Leisurely typing pace |

---

## Prompt Templates

Save reusable page context descriptions so you don't re-type them every time.

1. Write a description in the **"Additional Page Context"** field:
   ```
   This is the modernisation planning dashboard. The sidebar contains
   navigation links: Overview, Phases, Timeline, Resources, Reports.
   The main area shows a data table. Action buttons are in the top-right.
   ```
2. Enter a template name and click **"Save Current Context"**
3. Load it from the template dropdown on future runs

---

## Mouse Movement Settings

All settings have human-like defaults. Adjust them via sliders in the **Mouse Settings** panel.

| Setting | Range | Default | Description |
|---|---|---|---|
| **Speed** | 0.2x — 3.0x | 1.0x | Mouse movement speed (Fitts's Law scaled) |
| **Curvature** | 0 — 1.0 | 0.3 | Bézier curve randomness (0 = straight, 1 = wide arcs) |
| **Jitter** | 0 — 1.0 | 0.3 | Micro-tremor on the path (0 = robotic, 1 = shaky) |
| **Action Delay** | 100ms — 2000ms | 500ms | Pause between each action |
| **Typing Speed** | 20ms — 200ms | 75ms | Delay per keystroke |

---

## Project Structure

```
mouse-video-sim/
├── public/
│   └── index.html          # Web UI
├── src/
│   ├── server.ts           # Express server + API endpoints
│   ├── simulator.ts        # Main orchestrator (browser, recording, actions)
│   ├── instruction-parser.ts  # Claude AI instruction interpretation
│   ├── page-analyzer.ts    # DOM analysis + element extraction
│   ├── element-finder.ts   # Multi-strategy element locator
│   ├── mouse-helper.ts     # Bézier curves, Fitts's Law, jitter
│   ├── claude-client.ts    # Claude Code CLI wrapper
│   ├── site-profile.ts     # Profiles, crawling, templates
│   └── types.ts            # TypeScript interfaces
├── data/                   # (gitignored) saved profiles + templates
│   ├── profiles/
│   └── templates/
├── output/                 # (gitignored) generated videos
├── package.json
└── tsconfig.json
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/simulate` | Generate a video (streams progress as NDJSON) |
| `POST` | `/api/crawl` | Auto-crawl a site section and save profile |
| `POST` | `/api/scan` | Scan specific URLs and save profile |
| `GET` | `/api/profiles` | List all saved profiles |
| `GET` | `/api/profiles/:id` | Get a specific profile |
| `DELETE` | `/api/profiles/:id` | Delete a profile |
| `POST` | `/api/templates` | Save a prompt template |
| `GET` | `/api/templates` | List all templates |
| `GET` | `/api/templates/:id` | Get a specific template |
| `DELETE` | `/api/templates/:id` | Delete a template |

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `3456` | Server port |

## Requirements

- Node.js 18+
- Claude Code CLI (included with Claude Max subscription)
- ffmpeg for MP4 output (without it, videos save as WebM)
