# Measurement Tracker

A Progressive Web App for recording body measurements and saving them directly to a Google Spreadsheet. Built as a lightweight, mobile-first tool with no backend server required.

## What It Does

Enter a person's name and 7 body measurements (in inches), tap save, and the data lands in your Google Sheet. The app works offline too — measurements queue up locally and sync automatically when you're back online.

### Measurements Tracked

| Field | Description |
|-------|-------------|
| Person's Name | Who is being measured |
| Date | Date of measurement (defaults to today) |
| Left Arm | Left arm circumference |
| Right Arm | Right arm circumference |
| Waist | Waist circumference |
| Left Leg | Left leg circumference |
| Right Leg | Right leg circumference |
| Chest | Chest circumference |
| Hips | Hip circumference |

## App Pages

The app has three tabs:

- **Measure** — The main form. Fill in a name, date, and all 7 measurements, then hit Save. The date auto-fills to today.
- **History** — Shows the last 20 measurements you've submitted, stored locally on the device.
- **Settings** — Configure the Google Sheets connection. Includes a connection status indicator, Save/Test/Disconnect buttons, and a full step-by-step setup guide with a copy-to-clipboard button for the required Apps Script code.

## Getting Started

### 1. Host the App

This is a static site — no build step, no dependencies. Host it with any of these:

```bash
# Local development
cd measurement-tracker
python3 -m http.server 8080
```

Or deploy to GitHub Pages, Netlify, Vercel, or any static host. Just upload the folder contents.

### 2. Connect to Google Sheets

The app sends data to Google Sheets through a small Google Apps Script that you deploy on your spreadsheet. Full instructions are also available inside the app on the **Settings** tab.

#### Create the Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. In Row 1, add these column headers (one per cell):

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Name | Date | Left Arm | Right Arm | Waist | Left Leg | Right Leg | Chest | Hips |

#### Add the Apps Script

1. In your spreadsheet, go to **Extensions > Apps Script**
2. Delete any existing code in the editor
3. Paste the following (also available in `google-apps-script.js`):

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);

  sheet.appendRow([
    data.timestamp,
    data.name,
    data.date,
    data.leftArm,
    data.rightArm,
    data.waist,
    data.leftLeg,
    data.rightLeg,
    data.chest,
    data.hips
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

#### Deploy as a Web App

1. In the Apps Script editor, click **Deploy > New deployment**
2. Click the gear icon next to "Select type" and choose **Web app**
3. Set **Execute as** to **Me**
4. Set **Who has access** to **Anyone**
5. Click **Deploy**
6. Authorize the script when prompted (you'll see a Google permissions screen)
7. Copy the **Web App URL** that is displayed

#### Connect the App

1. Open the Measurement Tracker app and go to the **Settings** tab
2. Paste the Web App URL into the input field
3. Click **Save Connection** — the badge should change to "Connected"
4. Optionally click **Test Connection** to verify

## Offline Support

The app works without an internet connection:

- **Service Worker** caches all app files on first load, so the app opens instantly even offline
- **Offline Queue** — if you submit measurements while offline (or if the Google Sheets URL isn't configured), they're saved to localStorage
- **Auto Sync** — when the device comes back online, queued measurements are automatically sent to the spreadsheet
- A banner on the Measure tab shows how many measurements are waiting to sync

## Installing as a PWA

On mobile or desktop, you can install this as a standalone app:

- **iOS Safari**: Tap the share button > "Add to Home Screen"
- **Android Chrome**: Tap the three-dot menu > "Add to Home Screen" or look for the install prompt
- **Desktop Chrome/Edge**: Click the install icon in the address bar

Once installed, it opens in its own window without browser chrome.

## Project Structure

```
measurement-tracker/
├── index.html              # App shell with all three pages (Measure, History, Settings)
├── styles.css              # Mobile-first responsive styles
├── app.js                  # All app logic: navigation, form handling, settings, offline queue
├── sw.js                   # Service worker for offline caching
├── manifest.json           # PWA manifest (name, icons, theme color)
├── google-apps-script.js   # Standalone copy of the Apps Script to paste into Google Sheets
├── icons/
│   ├── icon-192.png        # PWA icon 192x192
│   └── icon-512.png        # PWA icon 512x512
└── README.md
```

## How It Works

1. User fills out the form and taps **Save Measurements**
2. The app packages the data as JSON and POSTs it to the Google Apps Script Web App URL stored in localStorage
3. The Apps Script receives the POST, parses the JSON, and appends a new row to the spreadsheet
4. The app also saves a copy to localStorage for the local History view
5. If offline or the request fails, the data is added to an offline queue that retries when connectivity returns

The request uses `mode: 'no-cors'` because Google Apps Script web app URLs are cross-origin. This means the app can't read the response body, but the data still gets through. The `doGet` handler exists so the Test Connection button has something to hit.

## Data Storage

All configuration and local data is stored in the browser's localStorage:

| Key | Contents |
|-----|----------|
| `measurement-tracker-url` | The Google Apps Script web app URL |
| `measurement-tracker-queue` | Array of measurements waiting to sync |
| `measurement-tracker-history` | Array of the last 50 submitted measurements |

No data is stored on any server other than your own Google Sheet.

## Updating the Apps Script

If you change the Apps Script code after the initial deployment:

1. Open your spreadsheet > **Extensions > Apps Script**
2. Edit the code
3. Click **Deploy > Manage deployments**
4. Click the pencil icon on your existing deployment
5. Set **Version** to **New version**
6. Click **Deploy**

The URL stays the same — no need to update it in the app.
