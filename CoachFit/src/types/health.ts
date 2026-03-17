// All HealthKit / Health Connect data types relevant to a calorie tracking app

// ── Activity & Fitness ──────────────────────────────────────────────
export interface StepsData {
  date: string;
  value: number;
}

export interface CaloriesBurnedData {
  date: string;
  activeCalories: number;
  basalCalories: number;
  totalCalories: number;
}

export interface DistanceData {
  date: string;
  distanceMeters: number;
}

export interface ExerciseSession {
  startDate: string;
  endDate: string;
  type: string;
  durationMinutes: number;
  caloriesBurned?: number;
  distanceMeters?: number;
}

export interface FloorsClimbedData {
  date: string;
  floors: number;
}

// ── Heart & Vitals ──────────────────────────────────────────────────
export interface HeartRateData {
  date: string;
  bpm: number;
}

export interface HeartRateSummary {
  date: string;
  restingBpm?: number;
  averageBpm?: number;
  minBpm?: number;
  maxBpm?: number;
}

export interface BloodPressureData {
  date: string;
  systolic: number;
  diastolic: number;
}

export interface BloodGlucoseData {
  date: string;
  mgPerDL: number;
}

export interface OxygenSaturationData {
  date: string;
  percentage: number;
}

export interface RespiratoryRateData {
  date: string;
  breathsPerMinute: number;
}

export interface BodyTemperatureData {
  date: string;
  celsius: number;
}

// ── Body Measurements ───────────────────────────────────────────────
export interface WeightData {
  date: string;
  kilograms: number;
}

export interface HeightData {
  date: string;
  centimeters: number;
}

export interface BodyFatData {
  date: string;
  percentage: number;
}

export interface LeanBodyMassData {
  date: string;
  kilograms: number;
}

export interface BodyWaterMassData {
  date: string;
  kilograms: number;
}

export interface BasalMetabolicRateData {
  date: string;
  kcalPerDay: number;
}

export interface WaistCircumferenceData {
  date: string;
  centimeters: number;
}

// ── Nutrition ───────────────────────────────────────────────────────
export interface NutritionEntry {
  date: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foodName?: string;
  calories: number;
  protein?: number;
  totalFat?: number;
  saturatedFat?: number;
  transFat?: number;
  cholesterol?: number;
  carbohydrates?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  potassium?: number;
  calcium?: number;
  iron?: number;
  vitaminA?: number;
  vitaminC?: number;
  vitaminD?: number;
}

export interface HydrationData {
  date: string;
  liters: number;
}

// ── Sleep ───────────────────────────────────────────────────────────
export interface SleepSession {
  startDate: string;
  endDate: string;
  totalMinutes: number;
  stages?: SleepStage[];
}

export interface SleepStage {
  stage: 'awake' | 'light' | 'deep' | 'rem' | 'unknown';
  startDate: string;
  endDate: string;
  durationMinutes: number;
}

// ── Aggregated Daily Summary ────────────────────────────────────────
export interface DailyHealthSummary {
  date: string;
  steps?: number;
  activeCalories?: number;
  basalCalories?: number;
  totalCaloriesBurned?: number;
  distanceMeters?: number;
  floorsClimbed?: number;
  exerciseMinutes?: number;
  restingHeartRate?: number;
  weight?: number;
  bodyFatPercentage?: number;
  basalMetabolicRate?: number;
  nutritionCaloriesConsumed?: number;
  waterLiters?: number;
  sleepMinutes?: number;
  netCalories?: number; // consumed - burned
}

// ── Permission & Connection Status ──────────────────────────────────
export type HealthPermissionStatus = 'granted' | 'denied' | 'not_determined' | 'unavailable';

export interface HealthPermissions {
  read: HealthDataType[];
  write: HealthDataType[];
}

export type HealthDataType =
  // Activity
  | 'steps'
  | 'activeCalories'
  | 'basalCalories'
  | 'distance'
  | 'floorsClimbed'
  | 'exercise'
  // Heart & Vitals
  | 'heartRate'
  | 'restingHeartRate'
  | 'bloodPressure'
  | 'bloodGlucose'
  | 'oxygenSaturation'
  | 'respiratoryRate'
  | 'bodyTemperature'
  // Body
  | 'weight'
  | 'height'
  | 'bodyFat'
  | 'leanBodyMass'
  | 'bodyWaterMass'
  | 'basalMetabolicRate'
  | 'waistCircumference'
  // Nutrition
  | 'nutrition'
  | 'hydration'
  // Sleep
  | 'sleep';

// ── Health Service Interface ────────────────────────────────────────
export interface HealthService {
  isAvailable(): Promise<boolean>;
  requestPermissions(permissions: HealthPermissions): Promise<HealthPermissionStatus>;

  // Activity
  getSteps(startDate: Date, endDate: Date): Promise<StepsData[]>;
  getCaloriesBurned(startDate: Date, endDate: Date): Promise<CaloriesBurnedData[]>;
  getDistance(startDate: Date, endDate: Date): Promise<DistanceData[]>;
  getExerciseSessions(startDate: Date, endDate: Date): Promise<ExerciseSession[]>;
  getFloorsClimbed(startDate: Date, endDate: Date): Promise<FloorsClimbedData[]>;

  // Heart & Vitals
  getHeartRate(startDate: Date, endDate: Date): Promise<HeartRateData[]>;
  getHeartRateSummary(startDate: Date, endDate: Date): Promise<HeartRateSummary[]>;
  getRestingHeartRate(startDate: Date, endDate: Date): Promise<HeartRateData[]>;
  getBloodPressure(startDate: Date, endDate: Date): Promise<BloodPressureData[]>;
  getBloodGlucose(startDate: Date, endDate: Date): Promise<BloodGlucoseData[]>;
  getOxygenSaturation(startDate: Date, endDate: Date): Promise<OxygenSaturationData[]>;
  getRespiratoryRate(startDate: Date, endDate: Date): Promise<RespiratoryRateData[]>;
  getBodyTemperature(startDate: Date, endDate: Date): Promise<BodyTemperatureData[]>;

  // Body Measurements
  getWeight(startDate: Date, endDate: Date): Promise<WeightData[]>;
  getHeight(startDate: Date, endDate: Date): Promise<HeightData[]>;
  getBodyFat(startDate: Date, endDate: Date): Promise<BodyFatData[]>;
  getLeanBodyMass(startDate: Date, endDate: Date): Promise<LeanBodyMassData[]>;
  getBodyWaterMass(startDate: Date, endDate: Date): Promise<BodyWaterMassData[]>;
  getBasalMetabolicRate(startDate: Date, endDate: Date): Promise<BasalMetabolicRateData[]>;
  getWaistCircumference(startDate: Date, endDate: Date): Promise<WaistCircumferenceData[]>;

  // Nutrition
  getNutrition(startDate: Date, endDate: Date): Promise<NutritionEntry[]>;
  writeNutrition(entry: NutritionEntry): Promise<void>;
  getHydration(startDate: Date, endDate: Date): Promise<HydrationData[]>;
  writeHydration(entry: HydrationData): Promise<void>;

  // Body Write
  writeWeight(entry: WeightData): Promise<void>;

  // Sleep
  getSleep(startDate: Date, endDate: Date): Promise<SleepSession[]>;

  // Aggregated
  getDailySummary(date: Date): Promise<DailyHealthSummary>;
}
