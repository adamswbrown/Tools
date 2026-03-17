import {
  initialize,
  requestPermission,
  readRecords,
  insertRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';
import type {
  HealthService,
  HealthPermissions,
  HealthPermissionStatus,
  StepsData,
  CaloriesBurnedData,
  DistanceData,
  ExerciseSession,
  FloorsClimbedData,
  HeartRateData,
  HeartRateSummary,
  BloodPressureData,
  BloodGlucoseData,
  OxygenSaturationData,
  RespiratoryRateData,
  BodyTemperatureData,
  WeightData,
  HeightData,
  BodyFatData,
  LeanBodyMassData,
  BodyWaterMassData,
  BasalMetabolicRateData,
  WaistCircumferenceData,
  NutritionEntry,
  HydrationData,
  SleepSession,
  DailyHealthSummary,
} from '../types/health';

function dateStr(d: Date | string): string {
  return typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];
}

function timeRange(startDate: Date, endDate: Date) {
  return {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    },
  };
}

// ── Android Health Connect Service Implementation ───────────────────
export const androidHealthService: HealthService = {
  async isAvailable(): Promise<boolean> {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  },

  async requestPermissions(_permissions: HealthPermissions): Promise<HealthPermissionStatus> {
    try {
      const isInitialized = await initialize();
      if (!isInitialized) return 'unavailable';

      await requestPermission([
        // Activity
        { accessType: 'read', recordType: 'Steps' },
        { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        { accessType: 'read', recordType: 'BasalMetabolicRate' },
        { accessType: 'read', recordType: 'TotalCaloriesBurned' },
        { accessType: 'read', recordType: 'Distance' },
        { accessType: 'read', recordType: 'FloorsClimbed' },
        { accessType: 'read', recordType: 'ExerciseSession' },
        // Heart & Vitals
        { accessType: 'read', recordType: 'HeartRate' },
        { accessType: 'read', recordType: 'RestingHeartRate' },
        { accessType: 'read', recordType: 'BloodPressure' },
        { accessType: 'read', recordType: 'BloodGlucose' },
        { accessType: 'read', recordType: 'OxygenSaturation' },
        { accessType: 'read', recordType: 'RespiratoryRate' },
        { accessType: 'read', recordType: 'BodyTemperature' },
        // Body
        { accessType: 'read', recordType: 'Weight' },
        { accessType: 'read', recordType: 'Height' },
        { accessType: 'read', recordType: 'BodyFat' },
        { accessType: 'read', recordType: 'LeanBodyMass' },
        { accessType: 'read', recordType: 'BodyWaterMass' },
        // Nutrition
        { accessType: 'read', recordType: 'Nutrition' },
        { accessType: 'read', recordType: 'Hydration' },
        { accessType: 'write', recordType: 'Nutrition' },
        { accessType: 'write', recordType: 'Hydration' },
        { accessType: 'write', recordType: 'Weight' },
        // Sleep
        { accessType: 'read', recordType: 'SleepSession' },
      ]);

      return 'granted';
    } catch {
      return 'denied';
    }
  },

  // ── Activity ────────────────────────────────────────────────────
  async getSteps(startDate: Date, endDate: Date): Promise<StepsData[]> {
    const result = await readRecords('Steps', timeRange(startDate, endDate));
    const byDate = new Map<string, number>();

    for (const r of result.records) {
      const d = dateStr(r.startTime);
      byDate.set(d, (byDate.get(d) || 0) + r.count);
    }

    return Array.from(byDate.entries()).map(([date, value]) => ({ date, value }));
  },

  async getCaloriesBurned(startDate: Date, endDate: Date): Promise<CaloriesBurnedData[]> {
    const [active, total] = await Promise.all([
      readRecords('ActiveCaloriesBurned', timeRange(startDate, endDate)),
      readRecords('TotalCaloriesBurned', timeRange(startDate, endDate)),
    ]);

    const byDate = new Map<string, { active: number; total: number }>();

    for (const r of active.records) {
      const d = dateStr(r.startTime);
      const entry = byDate.get(d) || { active: 0, total: 0 };
      entry.active += r.energy?.inKilocalories || 0;
      byDate.set(d, entry);
    }

    for (const r of total.records) {
      const d = dateStr(r.startTime);
      const entry = byDate.get(d) || { active: 0, total: 0 };
      entry.total += r.energy?.inKilocalories || 0;
      byDate.set(d, entry);
    }

    return Array.from(byDate.entries()).map(([date, vals]) => ({
      date,
      activeCalories: Math.round(vals.active),
      basalCalories: Math.round(vals.total - vals.active),
      totalCalories: Math.round(vals.total),
    }));
  },

  async getDistance(startDate: Date, endDate: Date): Promise<DistanceData[]> {
    const result = await readRecords('Distance', timeRange(startDate, endDate));
    const byDate = new Map<string, number>();

    for (const r of result.records) {
      const d = dateStr(r.startTime);
      byDate.set(d, (byDate.get(d) || 0) + (r.distance?.inMeters || 0));
    }

    return Array.from(byDate.entries()).map(([date, m]) => ({
      date,
      distanceMeters: Math.round(m),
    }));
  },

  async getExerciseSessions(startDate: Date, endDate: Date): Promise<ExerciseSession[]> {
    const result = await readRecords('ExerciseSession', timeRange(startDate, endDate));
    return result.records.map((r: any) => {
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      return {
        startDate: r.startTime,
        endDate: r.endTime,
        type: String(r.exerciseType || 'Unknown'),
        durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
      };
    });
  },

  async getFloorsClimbed(startDate: Date, endDate: Date): Promise<FloorsClimbedData[]> {
    const result = await readRecords('FloorsClimbed', timeRange(startDate, endDate));
    const byDate = new Map<string, number>();

    for (const r of result.records) {
      const d = dateStr(r.startTime);
      byDate.set(d, (byDate.get(d) || 0) + r.floors);
    }

    return Array.from(byDate.entries()).map(([date, floors]) => ({ date, floors }));
  },

  // ── Heart & Vitals ──────────────────────────────────────────────
  async getHeartRate(startDate: Date, endDate: Date): Promise<HeartRateData[]> {
    const result = await readRecords('HeartRate', timeRange(startDate, endDate));
    return result.records.flatMap((r: any) =>
      (r.samples || []).map((s: any) => ({
        date: s.time || r.startTime,
        bpm: s.beatsPerMinute,
      }))
    );
  },

  async getHeartRateSummary(startDate: Date, endDate: Date): Promise<HeartRateSummary[]> {
    const samples = await this.getHeartRate(startDate, endDate);
    const byDate = new Map<string, number[]>();

    for (const s of samples) {
      const d = dateStr(s.date);
      const arr = byDate.get(d) || [];
      arr.push(s.bpm);
      byDate.set(d, arr);
    }

    return Array.from(byDate.entries()).map(([date, bpms]) => ({
      date,
      averageBpm: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length),
      minBpm: Math.min(...bpms),
      maxBpm: Math.max(...bpms),
    }));
  },

  async getRestingHeartRate(startDate: Date, endDate: Date): Promise<HeartRateData[]> {
    const result = await readRecords('RestingHeartRate', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: r.time || r.startTime,
      bpm: r.beatsPerMinute,
    }));
  },

  async getBloodPressure(startDate: Date, endDate: Date): Promise<BloodPressureData[]> {
    const result = await readRecords('BloodPressure', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: r.time || r.startTime,
      systolic: r.systolic?.inMillimetersOfMercury || 0,
      diastolic: r.diastolic?.inMillimetersOfMercury || 0,
    }));
  },

  async getBloodGlucose(startDate: Date, endDate: Date): Promise<BloodGlucoseData[]> {
    const result = await readRecords('BloodGlucose', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: r.time || r.startTime,
      mgPerDL: r.level?.inMilligramsPerDeciliter || 0,
    }));
  },

  async getOxygenSaturation(startDate: Date, endDate: Date): Promise<OxygenSaturationData[]> {
    const result = await readRecords('OxygenSaturation', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: r.time || r.startTime,
      percentage: r.percentage || 0,
    }));
  },

  async getRespiratoryRate(startDate: Date, endDate: Date): Promise<RespiratoryRateData[]> {
    const result = await readRecords('RespiratoryRate', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: r.time || r.startTime,
      breathsPerMinute: r.rate || 0,
    }));
  },

  async getBodyTemperature(startDate: Date, endDate: Date): Promise<BodyTemperatureData[]> {
    const result = await readRecords('BodyTemperature', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: r.time || r.startTime,
      celsius: r.temperature?.inCelsius || 0,
    }));
  },

  // ── Body Measurements ───────────────────────────────────────────
  async getWeight(startDate: Date, endDate: Date): Promise<WeightData[]> {
    const result = await readRecords('Weight', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: dateStr(r.time || r.startTime),
      kilograms: Math.round((r.weight?.inKilograms || 0) * 10) / 10,
    }));
  },

  async getHeight(startDate: Date, endDate: Date): Promise<HeightData[]> {
    const result = await readRecords('Height', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: dateStr(r.time || r.startTime),
      centimeters: Math.round((r.height?.inMeters || 0) * 1000) / 10,
    }));
  },

  async getBodyFat(startDate: Date, endDate: Date): Promise<BodyFatData[]> {
    const result = await readRecords('BodyFat', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: dateStr(r.time || r.startTime),
      percentage: r.percentage || 0,
    }));
  },

  async getLeanBodyMass(startDate: Date, endDate: Date): Promise<LeanBodyMassData[]> {
    const result = await readRecords('LeanBodyMass', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: dateStr(r.time || r.startTime),
      kilograms: Math.round((r.mass?.inKilograms || 0) * 10) / 10,
    }));
  },

  async getBodyWaterMass(startDate: Date, endDate: Date): Promise<BodyWaterMassData[]> {
    const result = await readRecords('BodyWaterMass', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: dateStr(r.time || r.startTime),
      kilograms: Math.round((r.mass?.inKilograms || 0) * 10) / 10,
    }));
  },

  async getBasalMetabolicRate(startDate: Date, endDate: Date): Promise<BasalMetabolicRateData[]> {
    const result = await readRecords('BasalMetabolicRate', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: dateStr(r.time || r.startTime),
      kcalPerDay: Math.round(r.basalMetabolicRate?.inKilocaloriesPerDay || 0),
    }));
  },

  async getWaistCircumference(
    _startDate: Date,
    _endDate: Date
  ): Promise<WaistCircumferenceData[]> {
    // Not available in Health Connect
    return [];
  },

  // ── Nutrition ───────────────────────────────────────────────────
  async getNutrition(startDate: Date, endDate: Date): Promise<NutritionEntry[]> {
    const result = await readRecords('Nutrition', timeRange(startDate, endDate));
    return result.records.map((r: any) => ({
      date: r.startTime,
      foodName: r.name,
      mealType: mapMealType(r.mealType),
      calories: Math.round(r.energy?.inKilocalories || 0),
      protein: r.protein?.inGrams,
      totalFat: r.totalFat?.inGrams,
      saturatedFat: r.saturatedFat?.inGrams,
      carbohydrates: r.totalCarbohydrate?.inGrams,
      fiber: r.dietaryFiber?.inGrams,
      sugar: r.sugar?.inGrams,
      sodium: r.sodium?.inGrams ? r.sodium.inGrams * 1000 : undefined, // g → mg
      potassium: r.potassium?.inGrams ? r.potassium.inGrams * 1000 : undefined,
      calcium: r.calcium?.inGrams ? r.calcium.inGrams * 1000 : undefined,
      iron: r.iron?.inGrams ? r.iron.inGrams * 1000 : undefined,
      vitaminA: r.vitaminA?.inGrams ? r.vitaminA.inGrams * 1000000 : undefined, // g → mcg
      vitaminC: r.vitaminC?.inGrams ? r.vitaminC.inGrams * 1000 : undefined,
      vitaminD: r.vitaminD?.inGrams ? r.vitaminD.inGrams * 1000000 : undefined,
      cholesterol: r.cholesterol?.inGrams ? r.cholesterol.inGrams * 1000 : undefined,
    }));
  },

  async writeNutrition(entry: NutritionEntry): Promise<void> {
    const now = new Date(entry.date);
    const endTime = new Date(now.getTime() + 60000); // 1 minute duration

    await insertRecords([
      {
        recordType: 'Nutrition',
        startTime: now.toISOString(),
        endTime: endTime.toISOString(),
        name: entry.foodName || 'Scanned Food',
        mealType: mapMealTypeReverse(entry.mealType),
        energy: entry.calories ? { unit: 'kilocalories', value: entry.calories } : undefined,
        protein: entry.protein ? { unit: 'grams', value: entry.protein } : undefined,
        totalFat: entry.totalFat ? { unit: 'grams', value: entry.totalFat } : undefined,
        saturatedFat: entry.saturatedFat ? { unit: 'grams', value: entry.saturatedFat } : undefined,
        totalCarbohydrate: entry.carbohydrates
          ? { unit: 'grams', value: entry.carbohydrates }
          : undefined,
        dietaryFiber: entry.fiber ? { unit: 'grams', value: entry.fiber } : undefined,
        sugar: entry.sugar ? { unit: 'grams', value: entry.sugar } : undefined,
        sodium: entry.sodium ? { unit: 'grams', value: entry.sodium / 1000 } : undefined,
        potassium: entry.potassium ? { unit: 'grams', value: entry.potassium / 1000 } : undefined,
        calcium: entry.calcium ? { unit: 'grams', value: entry.calcium / 1000 } : undefined,
        iron: entry.iron ? { unit: 'grams', value: entry.iron / 1000 } : undefined,
        cholesterol: entry.cholesterol
          ? { unit: 'grams', value: entry.cholesterol / 1000 }
          : undefined,
      } as any,
    ]);
  },

  async getHydration(startDate: Date, endDate: Date): Promise<HydrationData[]> {
    const result = await readRecords('Hydration', timeRange(startDate, endDate));
    const byDate = new Map<string, number>();

    for (const r of result.records) {
      const d = dateStr(r.startTime);
      byDate.set(d, (byDate.get(d) || 0) + ((r as any).volume?.inLiters || 0));
    }

    return Array.from(byDate.entries()).map(([date, liters]) => ({
      date,
      liters: Math.round(liters * 10) / 10,
    }));
  },

  async writeHydration(entry: HydrationData): Promise<void> {
    const now = new Date(entry.date);
    const endTime = new Date(now.getTime() + 60000);

    await insertRecords([
      {
        recordType: 'Hydration',
        startTime: now.toISOString(),
        endTime: endTime.toISOString(),
        volume: { unit: 'liters', value: entry.liters },
      } as any,
    ]);
  },

  async writeWeight(entry: WeightData): Promise<void> {
    await insertRecords([
      {
        recordType: 'Weight',
        time: new Date(entry.date).toISOString(),
        weight: { unit: 'kilograms', value: entry.kilograms },
      } as any,
    ]);
  },

  // ── Sleep ───────────────────────────────────────────────────────
  async getSleep(startDate: Date, endDate: Date): Promise<SleepSession[]> {
    const result = await readRecords('SleepSession', timeRange(startDate, endDate));
    return result.records.map((r: any) => {
      const start = new Date(r.startTime);
      const end = new Date(r.endTime);
      const stages = (r.stages || []).map((s: any) => ({
        stage: mapSleepStage(s.stage),
        startDate: s.startTime,
        endDate: s.endTime,
        durationMinutes: Math.round(
          (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000
        ),
      }));
      return {
        startDate: r.startTime,
        endDate: r.endTime,
        totalMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
        stages,
      };
    });
  },

  // ── Aggregated Summary ──────────────────────────────────────────
  async getDailySummary(date: Date): Promise<DailyHealthSummary> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [steps, calories, distance, weight, bodyFat, bmr, sleep, hydration, exercises] =
      await Promise.allSettled([
        this.getSteps(startOfDay, endOfDay),
        this.getCaloriesBurned(startOfDay, endOfDay),
        this.getDistance(startOfDay, endOfDay),
        this.getWeight(startOfDay, endOfDay),
        this.getBodyFat(startOfDay, endOfDay),
        this.getBasalMetabolicRate(startOfDay, endOfDay),
        this.getSleep(startOfDay, endOfDay),
        this.getHydration(startOfDay, endOfDay),
        this.getExerciseSessions(startOfDay, endOfDay),
      ]);

    const stepsVal = steps.status === 'fulfilled' && steps.value[0]?.value;
    const calsVal = calories.status === 'fulfilled' && calories.value[0];
    const distVal = distance.status === 'fulfilled' && distance.value[0]?.distanceMeters;
    const weightVal = weight.status === 'fulfilled' && weight.value[0]?.kilograms;
    const bfVal = bodyFat.status === 'fulfilled' && bodyFat.value[0]?.percentage;
    const bmrVal = bmr.status === 'fulfilled' && bmr.value[0]?.kcalPerDay;
    const sleepVal = sleep.status === 'fulfilled' && sleep.value[0]?.totalMinutes;
    const waterVal = hydration.status === 'fulfilled' && hydration.value[0]?.liters;
    const exerciseMinutes = exercises.status === 'fulfilled'
      ? exercises.value.reduce((sum, e) => sum + e.durationMinutes, 0)
      : undefined;

    return {
      date: dateStr(date),
      steps: stepsVal || undefined,
      activeCalories: calsVal ? calsVal.activeCalories : undefined,
      basalCalories: calsVal ? calsVal.basalCalories : undefined,
      totalCaloriesBurned: calsVal ? calsVal.totalCalories : undefined,
      distanceMeters: distVal || undefined,
      exerciseMinutes: exerciseMinutes || undefined,
      weight: weightVal || undefined,
      bodyFatPercentage: bfVal || undefined,
      basalMetabolicRate: bmrVal || undefined,
      sleepMinutes: sleepVal || undefined,
      waterLiters: waterVal || undefined,
    };
  },
};

// ── Helpers ─────────────────────────────────────────────────────────
function mapMealType(type?: number): NutritionEntry['mealType'] {
  switch (type) {
    case 1: return 'breakfast';
    case 2: return 'lunch';
    case 3: return 'dinner';
    case 4: return 'snack';
    default: return undefined;
  }
}

function mapMealTypeReverse(type?: string): number {
  switch (type) {
    case 'breakfast': return 1;
    case 'lunch': return 2;
    case 'dinner': return 3;
    case 'snack': return 4;
    default: return 0;
  }
}

function mapSleepStage(stage?: number): 'awake' | 'light' | 'deep' | 'rem' | 'unknown' {
  switch (stage) {
    case 1: return 'awake';
    case 4: return 'light';
    case 5: return 'deep';
    case 6: return 'rem';
    default: return 'unknown';
  }
}
