import { Platform } from 'react-native';
import type {
  HealthService,
  HealthPermissions,
  HealthPermissionStatus,
  HealthDataType,
  DailyHealthSummary,
  NutritionEntry,
  HydrationData,
  WeightData,
  ExerciseSession,
} from '../types/health';
import type { Product } from '../types';

// Platform-specific imports resolved by Metro bundler
// .ios.ts and .android.ts extensions are resolved automatically
let platformService: HealthService | null = null;

async function getService(): Promise<HealthService> {
  if (platformService) return platformService;

  if (Platform.OS === 'ios') {
    const { iosHealthService } = await import('./healthkit.ios');
    platformService = iosHealthService;
  } else if (Platform.OS === 'android') {
    const { androidHealthService } = await import('./healthkit.android');
    platformService = androidHealthService;
  } else {
    throw new Error('Health services are only available on iOS and Android');
  }

  return platformService;
}

// ── All read permissions for CoachFit ────────────────────────────────
const ALL_READ_TYPES: HealthDataType[] = [
  'steps',
  'activeCalories',
  'basalCalories',
  'distance',
  'floorsClimbed',
  'exercise',
  'heartRate',
  'restingHeartRate',
  'bloodPressure',
  'bloodGlucose',
  'oxygenSaturation',
  'respiratoryRate',
  'bodyTemperature',
  'weight',
  'height',
  'bodyFat',
  'leanBodyMass',
  'bodyWaterMass',
  'basalMetabolicRate',
  'waistCircumference',
  'nutrition',
  'hydration',
  'sleep',
];

const ALL_WRITE_TYPES: HealthDataType[] = ['nutrition', 'hydration', 'weight'];

const DEFAULT_PERMISSIONS: HealthPermissions = {
  read: ALL_READ_TYPES,
  write: ALL_WRITE_TYPES,
};

// ── Public API ──────────────────────────────────────────────────────

export async function isHealthAvailable(): Promise<boolean> {
  try {
    const service = await getService();
    return service.isAvailable();
  } catch {
    return false;
  }
}

export async function requestAllHealthPermissions(): Promise<HealthPermissionStatus> {
  const service = await getService();
  return service.requestPermissions(DEFAULT_PERMISSIONS);
}

export async function getTodaySummary(): Promise<DailyHealthSummary> {
  const service = await getService();
  return service.getDailySummary(new Date());
}

export async function getDateSummary(date: Date): Promise<DailyHealthSummary> {
  const service = await getService();
  return service.getDailySummary(date);
}

export async function getWeekSummaries(): Promise<DailyHealthSummary[]> {
  const service = await getService();
  const summaries: DailyHealthSummary[] = [];
  const today = new Date();

  const promises = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    return service.getDailySummary(date);
  });

  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled') summaries.push(r.value);
  }

  return summaries;
}

// Write a scanned product to HealthKit/Health Connect as a nutrition entry
export async function writeScannedProduct(
  product: Product,
  servingGrams: number,
  mealType?: NutritionEntry['mealType']
): Promise<void> {
  const service = await getService();
  const ratio = servingGrams / 100;

  const entry: NutritionEntry = {
    date: new Date().toISOString(),
    foodName: `${product.name} (${product.brand})`,
    mealType,
    calories: Math.round(product.caloriesPer100g * ratio),
    protein: Math.round(product.proteinPer100g * ratio * 10) / 10,
    totalFat: Math.round(product.fatPer100g * ratio * 10) / 10,
    carbohydrates: Math.round(product.carbsPer100g * ratio * 10) / 10,
    sugar: Math.round(product.sugarsPer100g * ratio * 10) / 10,
    fiber: Math.round(product.fiberPer100g * ratio * 10) / 10,
    sodium: product.sodiumPer100g > 0
      ? Math.round(product.sodiumPer100g * ratio * 1000) // g → mg
      : undefined,
  };

  await service.writeNutrition(entry);
}

export async function logWater(liters: number): Promise<void> {
  const service = await getService();
  await service.writeHydration({
    date: new Date().toISOString(),
    liters,
  });
}

export async function logWeight(kilograms: number): Promise<void> {
  const service = await getService();
  await service.writeWeight({
    date: new Date().toISOString(),
    kilograms,
  });
}

// Fetch recent workouts/exercise sessions
export async function getRecentWorkouts(days: number = 7): Promise<ExerciseSession[]> {
  const service = await getService();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  return service.getExerciseSessions(startDate, endDate);
}

export async function getWorkoutsForDate(date: Date): Promise<ExerciseSession[]> {
  const service = await getService();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return service.getExerciseSessions(startOfDay, endOfDay);
}

// Re-export types for convenience
export type { DailyHealthSummary, NutritionEntry, HealthPermissionStatus, ExerciseSession };
