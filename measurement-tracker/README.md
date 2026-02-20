# Measurement Tracker PWA

A simple Progressive Web App for recording body measurements and saving them to a Google Spreadsheet.

## Features

- **7 measurement fields**: Left Arm, Right Arm, Waist, Left Leg, Right Leg, Chest, Hips
- **Google Sheets integration**: Data is sent directly to your spreadsheet via Google Apps Script
- **Offline support**: Measurements are queued locally and synced when back online
- **Installable PWA**: Add to home screen on any device
- **Local history**: View recent measurements within the app
- **Settings page**: Configure the Google Sheets connection with step-by-step instructions

## Quick Start

1. Host the files on any static web server (GitHub Pages, Netlify, or even `python3 -m http.server`)
2. Open the app in a browser
3. Go to the **Settings** tab and follow the setup instructions to connect your Google Sheet
4. Start recording measurements on the **Measure** tab

## Google Sheets Setup

1. Create a new Google Spreadsheet
2. Add these headers in Row 1: `Timestamp | Name | Date | Left Arm | Right Arm | Waist | Left Leg | Right Leg | Chest | Hips`
3. Go to **Extensions > Apps Script**
4. Paste the contents of `google-apps-script.js`
5. Deploy as a Web App (Execute as: Me, Access: Anyone)
6. Copy the URL and paste it into the app's Settings page

## Files

- `index.html` - Main app structure with form, history, and settings pages
- `styles.css` - Mobile-first responsive styles
- `app.js` - App logic, navigation, form handling, offline queue
- `sw.js` - Service worker for offline caching
- `manifest.json` - PWA manifest
- `google-apps-script.js` - Script to paste into your Google Sheet
- `icons/` - PWA icons (192x192 and 512x512)
