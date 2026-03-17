import AppleHealthKit, {
  HealthKitPermissions,
  HealthInputOptions,
  HealthValue,
} from 'react-native-health';
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

// Map our data types to Apple HealthKit permissions
const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.Steps,
      AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
      AppleHealthKit.Constants.Permissions.BasalEnergyBurned,
      AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
      AppleHealthKit.Constants.Permissions.FlightsClimbed,
      AppleHealthKit.Constants.Permissions.Workout,
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.RestingHeartRate,
      AppleHealthKit.Constants.Permissions.BloodPressureSystolic,
      AppleHealthKit.Constants.Permissions.BloodPressureDiastolic,
      AppleHealthKit.Constants.Permissions.BloodGlucose,
      AppleHealthKit.Constants.Permissions.OxygenSaturation,
      AppleHealthKit.Constants.Permissions.RespiratoryRate,
      AppleHealthKit.Constants.Permissions.BodyTemperature,
      AppleHealthKit.Constants.Permissions.Weight,
      AppleHealthKit.Constants.Permissions.Height,
      AppleHealthKit.Constants.Permissions.BodyFatPercentage,
      AppleHealthKit.Constants.Permissions.LeanBodyMass,
      AppleHealthKit.Constants.Permissions.BasalMetabolicRate,
      AppleHealthKit.Constants.Permissions.WaistCircumference,
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
      AppleHealthKit.Constants.Permissions.Water,
    ],
    write: [
      AppleHealthKit.Constants.Permissions.Weight,
      AppleHealthKit.Constants.Permissions.Water,
    ],
  },
};

function promisify<T>(
  fn: (options: HealthInputOptions, callback: (err: string, results: T) => void) => void,
  options: HealthInputOptions
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn.call(AppleHealthKit, options, (err: string, results: T) => {
      if (err) reject(new Error(err));
      else resolve(results);
    });
  });
}

function dateStr(d: Date | string): string {
  return typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];
}

function opts(startDate: Date, endDate: Date): HealthInputOptions {
  return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
}

// ── iOS HealthKit Service Implementation ────────────────────────────
export const iosHealthService: HealthService = {
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      AppleHealthKit.isAvailable((err: Object, available: boolean) => {
        resolve(!err && available);
      });
    });
  },

  async requestPermissions(_permissions: HealthPermissions): Promise<HealthPermissionStatus> {
    return new Promise((resolve) => {
      AppleHealthKit.initHealthKit(PERMISSIONS, (err: string) => {
        if (err) resolve('denied');
        else resolve('granted');
      });
    });
  },

  // ── Activity ────────────────────────────────────────────────────
  async getSteps(startDate: Date, endDate: Date): Promise<StepsData[]> {
    const results = await promisify<Array<{ value: number; startDate: string }>>(
      AppleHealthKit.getDailyStepCountSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({ date: dateStr(r.startDate), value: r.value }));
  },

  async getCaloriesBurned(startDate: Date, endDate: Date): Promise<CaloriesBurnedData[]> {
    const [active, basal] = await Promise.all([
      promisify<HealthValue[]>(AppleHealthKit.getActiveEnergyBurned, opts(startDate, endDate)),
      promisify<HealthValue[]>(AppleHealthKit.getBasalEnergyBurned, opts(startDate, endDate)),
    ]);

    // Group by date
    const byDate = new Map<string, { active: number; basal: number }>();

    for (const a of active) {
      const d = dateStr(a.startDate);
      const entry = byDate.get(d) || { active: 0, basal: 0 };
      entry.active += a.value;
      byDate.set(d, entry);
    }

    for (const b of basal) {
      const d = dateStr(b.startDate);
      const entry = byDate.get(d) || { active: 0, basal: 0 };
      entry.basal += b.value;
      byDate.set(d, entry);
    }

    return Array.from(byDate.entries()).map(([date, vals]) => ({
      date,
      activeCalories: Math.round(vals.active),
      basalCalories: Math.round(vals.basal),
      totalCalories: Math.round(vals.active + vals.basal),
    }));
  },

  async getDistance(startDate: Date, endDate: Date): Promise<DistanceData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getDailyDistanceWalkingRunningSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({
      date: dateStr(r.startDate),
      distanceMeters: Math.round(r.value * 1000), // km to m
    }));
  },

  async getExerciseSessions(startDate: Date, endDate: Date): Promise<ExerciseSession[]> {
    const results = await promisify<
      Array<{
        activityName: string;
        start: string;
        end: string;
        calories: number;
        distance: number;
      }>
    >(AppleHealthKit.getSamples, {
      ...opts(startDate, endDate),
      type: 'Workout',
    });

    return results.map((w) => {
      const start = new Date(w.start);
      const end = new Date(w.end);
      return {
        startDate: w.start,
        endDate: w.end,
        type: w.activityName || 'Unknown',
        durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
        caloriesBurned: w.calories ? Math.round(w.calories) : undefined,
        distanceMeters: w.distance ? Math.round(w.distance * 1000) : undefined,
      };
    });
  },

  async getFloorsClimbed(startDate: Date, endDate: Date): Promise<FloorsClimbedData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getFlightsClimbed,
      opts(startDate, endDate)
    );
    return results.map((r) => ({ date: dateStr(r.startDate), floors: r.value }));
  },

  // ── Heart & Vitals ──────────────────────────────────────────────
  async getHeartRate(startDate: Date, endDate: Date): Promise<HeartRateData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getHeartRateSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({ date: r.startDate, bpm: Math.round(r.value) }));
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
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getRestingHeartRate,
      opts(startDate, endDate)
    );
    return results.map((r) => ({ date: r.startDate, bpm: Math.round(r.value) }));
  },

  async getBloodPressure(startDate: Date, endDate: Date): Promise<BloodPressureData[]> {
    const results = await promisify<
      Array<{ bloodPressureSystolicValue: number; bloodPressureDiastolicValue: number; startDate: string }>
    >(AppleHealthKit.getBloodPressureSamples, opts(startDate, endDate));
    return results.map((r) => ({
      date: r.startDate,
      systolic: r.bloodPressureSystolicValue,
      diastolic: r.bloodPressureDiastolicValue,
    }));
  },

  async getBloodGlucose(startDate: Date, endDate: Date): Promise<BloodGlucoseData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getBloodGlucoseSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({ date: r.startDate, mgPerDL: r.value }));
  },

  async getOxygenSaturation(startDate: Date, endDate: Date): Promise<OxygenSaturationData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getOxygenSaturationSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({
      date: r.startDate,
      percentage: r.value * 100, // HealthKit returns 0-1
    }));
  },

  async getRespiratoryRate(startDate: Date, endDate: Date): Promise<RespiratoryRateData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getRespiratoryRateSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({ date: r.startDate, breathsPerMinute: r.value }));
  },

  async getBodyTemperature(startDate: Date, endDate: Date): Promise<BodyTemperatureData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getBodyTemperatureSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({ date: r.startDate, celsius: r.value }));
  },

  // ── Body Measurements ───────────────────────────────────────────
  async getWeight(startDate: Date, endDate: Date): Promise<WeightData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getWeightSamples,
      { ...opts(startDate, endDate), unit: AppleHealthKit.Constants.Units.gram }
    );
    return results.map((r) => ({
      date: dateStr(r.startDate),
      kilograms: Math.round(r.value / 100) / 10, // grams → kg, 1 decimal
    }));
  },

  async getHeight(startDate: Date, endDate: Date): Promise<HeightData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getHeightSamples,
      { ...opts(startDate, endDate), unit: AppleHealthKit.Constants.Units.inch }
    );
    return results.map((r) => ({
      date: dateStr(r.startDate),
      centimeters: Math.round(r.value * 2.54 * 10) / 10,
    }));
  },

  async getBodyFat(startDate: Date, endDate: Date): Promise<BodyFatData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getBodyFatPercentageSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({
      date: dateStr(r.startDate),
      percentage: Math.round(r.value * 1000) / 10,
    }));
  },

  async getLeanBodyMass(startDate: Date, endDate: Date): Promise<LeanBodyMassData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getLeanBodyMassSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({
      date: dateStr(r.startDate),
      kilograms: Math.round(r.value * 10) / 10,
    }));
  },

  async getBodyWaterMass(_startDate: Date, _endDate: Date): Promise<BodyWaterMassData[]> {
    // Not directly available in Apple HealthKit
    return [];
  },

  async getBasalMetabolicRate(startDate: Date, endDate: Date): Promise<BasalMetabolicRateData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getBasalMetabolicRate,
      opts(startDate, endDate)
    );
    return results.map((r) => ({
      date: dateStr(r.startDate),
      kcalPerDay: Math.round(r.value),
    }));
  },

  async getWaistCircumference(startDate: Date, endDate: Date): Promise<WaistCircumferenceData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getWaistCircumferenceSamples,
      opts(startDate, endDate)
    );
    return results.map((r) => ({
      date: dateStr(r.startDate),
      centimeters: Math.round(r.value * 10) / 10,
    }));
  },

  // ── Nutrition ───────────────────────────────────────────────────
  async getNutrition(startDate: Date, endDate: Date): Promise<NutritionEntry[]> {
    // HealthKit stores nutrition as individual nutrient samples.
    // We read calories and combine with available macro data.
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getSamples,
      { ...opts(startDate, endDate), type: 'DietaryEnergyConsumed' }
    );
    return results.map((r) => ({
      date: r.startDate,
      calories: Math.round(r.value),
    }));
  },

  async writeNutrition(entry: NutritionEntry): Promise<void> {
    // Write calorie sample to HealthKit
    return new Promise((resolve, reject) => {
      AppleHealthKit.saveFood(
        {
          foodName: entry.foodName || 'Scanned Food',
          calories: entry.calories,
          protein: entry.protein || 0,
          totalFat: entry.totalFat || 0,
          carbohydrates: entry.carbohydrates || 0,
          satFat: entry.saturatedFat || 0,
          cholesterol: entry.cholesterol || 0,
          fiber: entry.fiber || 0,
          sugar: entry.sugar || 0,
          sodium: entry.sodium || 0,
          vitaminA: entry.vitaminA || 0,
          vitaminC: entry.vitaminC || 0,
          calcium: entry.calcium || 0,
          iron: entry.iron || 0,
          potassium: entry.potassium || 0,
          date: entry.date,
        },
        (err: string, result: boolean) => {
          if (err) reject(new Error(err));
          else resolve();
        }
      );
    });
  },

  async getHydration(startDate: Date, endDate: Date): Promise<HydrationData[]> {
    const results = await promisify<HealthValue[]>(
      AppleHealthKit.getWaterSamples,
      opts(startDate, endDate)
    );

    // Group by date
    const byDate = new Map<string, number>();
    for (const r of results) {
      const d = dateStr(r.startDate);
      byDate.set(d, (byDate.get(d) || 0) + r.value);
    }

    return Array.from(byDate.entries()).map(([date, ml]) => ({
      date,
      liters: Math.round(ml / 100) / 10,
    }));
  },

  async writeHydration(entry: HydrationData): Promise<void> {
    return new Promise((resolve, reject) => {
      AppleHealthKit.saveWater(
        { value: entry.liters * 1000, date: entry.date }, // liters → ml
        (err: string) => {
          if (err) reject(new Error(err));
          else resolve();
        }
      );
    });
  },

  async writeWeight(entry: WeightData): Promise<void> {
    return new Promise((resolve, reject) => {
      AppleHealthKit.saveWeight(
        { value: entry.kilograms * 2.20462, date: entry.date }, // kg → lbs (HealthKit default)
        (err: Object, result: any) => {
          if (err) reject(new Error(String(err)));
          else resolve();
        }
      );
    });
  },

  // ── Sleep ───────────────────────────────────────────────────────
  async getSleep(startDate: Date, endDate: Date): Promise<SleepSession[]> {
    const results = await promisify<
      Array<{ value: string; startDate: string; endDate: string }>
    >(AppleHealthKit.getSleepSamples, opts(startDate, endDate));

    // Group by night (cluster samples within a few hours)
    const sessions: SleepSession[] = [];
    let currentSession: SleepSession | null = null;

    for (const r of results) {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

      const stage = r.value === 'INBED' ? 'awake' as const :
                    r.value === 'ASLEEP' ? 'light' as const :
                    r.value === 'DEEP' ? 'deep' as const :
                    r.value === 'REM' ? 'rem' as const : 'unknown' as const;

      if (
        !currentSession ||
        start.getTime() - new Date(currentSession.endDate).getTime() > 3600000
      ) {
        if (currentSession) sessions.push(currentSession);
        currentSession = {
          startDate: r.startDate,
          endDate: r.endDate,
          totalMinutes: durationMinutes,
          stages: [{ stage, startDate: r.startDate, endDate: r.endDate, durationMinutes }],
        };
      } else {
        currentSession.endDate = r.endDate;
        currentSession.totalMinutes += durationMinutes;
        currentSession.stages?.push({
          stage,
          startDate: r.startDate,
          endDate: r.endDate,
          durationMinutes,
        });
      }
    }

    if (currentSession) sessions.push(currentSession);
    return sessions;
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
