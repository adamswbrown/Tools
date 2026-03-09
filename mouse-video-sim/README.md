# Mouse Video Simulator

Simulate realistic mouse movements on webpages from plain English instructions and output MP4 video.

## How It Works

1. You provide a URL and describe what you want to happen in plain English
2. Claude interprets your instructions into structured browser actions
3. Playwright opens the page and executes each action with realistic Bézier-curve mouse movements
4. The entire session is recorded and output as an MP4 video

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium

# Install ffmpeg (for MP4 encoding)
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
# Windows: choco install ffmpeg

# Build
npm run build

# Start the server
npm start
```

Then open http://localhost:3456 in your browser.

## Usage

1. Enter your Anthropic API key
2. Enter the target URL
3. Describe the interactions in plain English, for example:

```
Click the "Sign In" button in the top right corner.
Wait for the login page to load.
Click on the email input and type "demo@example.com".
Click on the password field and type "mypassword".
Click the "Log In" button.
Wait for the dashboard to load.
Scroll down to see the recent activity section.
```

4. Click "Generate Video" and wait for the MP4 to be ready for download.

## Features

- **Natural language instructions** — describe what to do in plain English
- **Realistic mouse movements** — Bézier curves with easing, jitter, and Fitts's Law timing
- **Smart element finding** — CSS selectors, text matching, ARIA labels, and vision-based fallback
- **Visual cursor** — custom cursor overlay visible in the recording
- **Click effects** — ripple animation on clicks for visual clarity
- **Human-like typing** — character-by-character with random delays

## Requirements

- Node.js 18+
- Anthropic API key (Claude)
- ffmpeg (for MP4 output; without it, videos are saved as WebM)

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `3456` | Server port |
| `ANTHROPIC_API_KEY` | — | Optional; can also be set in the UI |
