# CoachFit

A React Native fitness and nutrition tracking app built with Expo. Scan product barcodes to get instant nutrition info, log meals to Apple Health / Google Health Connect, and monitor your health metrics — all from one place.

## Features

- **Barcode Scanning** — Real-time camera scanning (EAN-13, EAN-8, UPC-A, UPC-E) with debounce to prevent duplicates
- **Nutrition Lookup** — Product data from the [Open Food Facts](https://openfoodfacts.org) API including calories, protein, fat, carbs, sugar, fiber, and sodium
- **Custom Serving Calculator** — Enter any gram amount or tap presets (25g–200g) to get precise macro breakdowns
- **Health Integration** — Read/write to Apple HealthKit (iOS) and Google Health Connect (Android) covering 20+ metric types
- **Health Dashboard** — Today's summary (steps, calories, distance, sleep, weight, body fat, BMR, water), recent workouts, and weekly history
- **Scan History** — SQLite-backed log of every scanned product with date, brand, and calorie info

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.83 + Expo 55 |
| Language | TypeScript 5.9 |
| Navigation | React Navigation 7 (native stack) |
| Camera | expo-camera |
| Database | expo-sqlite |
| Health (iOS) | react-native-health |
| Health (Android) | react-native-health-connect |
| Nutrition API | Open Food Facts |

## Project Structure

```
src/
├── screens/              # HomeScreen, ScannerScreen, ProductScreen,
│                         # HistoryScreen, HealthDashboardScreen
├── components/           # NutritionCard, ServingCalculator,
│                         # ScanOverlay, ProductNotFound
├── services/             # openFoodFacts, nutritionCalculator, database,
│                         # health (platform-agnostic), healthkit.ios/android
├── hooks/                # useBarcodeScan, useProductLookup
├── types/                # Product, health data, navigation params
└── constants/            # theme tokens, API config
```

## Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator / Android Emulator (or a physical device)

### Install & Run

```bash
cd CoachFit
npm install
npm start          # Expo dev server
# then press i for iOS, a for Android, or w for web
```

### Platform-Specific Setup

**iOS** — HealthKit requires a physical device or a simulator with Health capabilities enabled. The necessary entitlements are already configured in `app.json`.

**Android** — Health Connect must be installed on the device. The required permissions are declared in `app.json`.

## Architecture Notes

- **Platform abstraction** — `health.ts` exports a single `getService()` function; Metro resolves `.ios.ts` / `.android.ts` automatically.
- **Caching** — `useProductLookup` checks the local SQLite cache before calling the API, and saves successful lookups for offline access.
- **Resilient data loading** — The health dashboard uses `Promise.allSettled()` so a failure in one metric doesn't break the entire view.

## License

MIT
