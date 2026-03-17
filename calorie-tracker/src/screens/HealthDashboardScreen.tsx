import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import {
  isHealthAvailable,
  requestAllHealthPermissions,
  getTodaySummary,
  getWeekSummaries,
} from '../services/health';
import type { DailyHealthSummary, HealthPermissionStatus } from '../services/health';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

type ConnectionState = 'checking' | 'unavailable' | 'needs_permission' | 'connected' | 'error';

export function HealthDashboardScreen() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('checking');
  const [todaySummary, setTodaySummary] = useState<DailyHealthSummary | null>(null);
  const [weekSummaries, setWeekSummaries] = useState<DailyHealthSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkHealth();
  }, []);

  async function checkHealth() {
    try {
      const available = await isHealthAvailable();
      if (!available) {
        setConnectionState('unavailable');
        setLoading(false);
        return;
      }
      setConnectionState('needs_permission');
      setLoading(false);
    } catch {
      setConnectionState('error');
      setLoading(false);
    }
  }

  async function connect() {
    setLoading(true);
    try {
      const status: HealthPermissionStatus = await requestAllHealthPermissions();
      if (status === 'granted') {
        setConnectionState('connected');
        await loadData();
      } else {
        Alert.alert('Permission Denied', 'Health data access was not granted.');
        setConnectionState('needs_permission');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to connect to health services.');
      setConnectionState('error');
    }
    setLoading(false);
  }

  async function loadData() {
    try {
      const [today, week] = await Promise.all([getTodaySummary(), getWeekSummaries()]);
      setTodaySummary(today);
      setWeekSummaries(week);
    } catch {
      // Partial data is fine
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Connecting to Health...</Text>
      </View>
    );
  }

  if (connectionState === 'unavailable') {
    return (
      <View style={styles.centered}>
        <Text style={styles.unavailableTitle}>Health Not Available</Text>
        <Text style={styles.unavailableText}>
          Apple Health (iOS) or Health Connect (Android) is not available on this device.
        </Text>
      </View>
    );
  }

  if (connectionState === 'needs_permission' || connectionState === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.connectTitle}>Connect Health Data</Text>
        <Text style={styles.connectDesc}>
          Sync your activity, nutrition, body metrics, vitals, and sleep data from{' '}
          {'\n'}Apple Health or Google Health Connect.
        </Text>

        <View style={styles.permissionList}>
          <PermissionItem icon="+" label="Activity" desc="Steps, calories burned, distance, exercise, floors" />
          <PermissionItem icon="+" label="Heart & Vitals" desc="Heart rate, blood pressure, SpO2, respiratory rate, temperature" />
          <PermissionItem icon="+" label="Body" desc="Weight, height, body fat, BMR, lean mass, waist" />
          <PermissionItem icon="+" label="Nutrition" desc="Read and write food entries from scanned products" />
          <PermissionItem icon="+" label="Hydration" desc="Water intake tracking" />
          <PermissionItem icon="+" label="Sleep" desc="Sleep sessions and stages" />
        </View>

        <TouchableOpacity style={styles.connectButton} onPress={connect}>
          <Text style={styles.connectButtonText}>Connect</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Connected state - show dashboard
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Today's Summary */}
      <Text style={styles.sectionTitle}>Today</Text>
      {todaySummary ? (
        <View style={styles.summaryGrid}>
          <SummaryTile label="Steps" value={todaySummary.steps} />
          <SummaryTile label="Active Cal" value={todaySummary.activeCalories} unit="kcal" />
          <SummaryTile label="Total Burned" value={todaySummary.totalCaloriesBurned} unit="kcal" />
          <SummaryTile
            label="Distance"
            value={todaySummary.distanceMeters ? Math.round(todaySummary.distanceMeters / 10) / 100 : undefined}
            unit="km"
          />
          <SummaryTile label="Weight" value={todaySummary.weight} unit="kg" />
          <SummaryTile label="Body Fat" value={todaySummary.bodyFatPercentage} unit="%" />
          <SummaryTile label="BMR" value={todaySummary.basalMetabolicRate} unit="kcal" />
          <SummaryTile
            label="Sleep"
            value={todaySummary.sleepMinutes ? Math.round(todaySummary.sleepMinutes / 6) / 10 : undefined}
            unit="hrs"
          />
          <SummaryTile label="Water" value={todaySummary.waterLiters} unit="L" />
          {todaySummary.totalCaloriesBurned && todaySummary.nutritionCaloriesConsumed ? (
            <SummaryTile
              label="Net Cal"
              value={todaySummary.nutritionCaloriesConsumed - todaySummary.totalCaloriesBurned}
              unit="kcal"
              highlight
            />
          ) : null}
        </View>
      ) : (
        <Text style={styles.noData}>No data available for today</Text>
      )}

      {/* Week History */}
      {weekSummaries.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>This Week</Text>
          {weekSummaries.map((day) => (
            <View key={day.date} style={styles.weekRow}>
              <Text style={styles.weekDate}>
                {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
              <View style={styles.weekStats}>
                {day.steps !== undefined && (
                  <Text style={styles.weekStat}>{day.steps.toLocaleString()} steps</Text>
                )}
                {day.totalCaloriesBurned !== undefined && (
                  <Text style={styles.weekStat}>{day.totalCaloriesBurned} kcal burned</Text>
                )}
                {day.sleepMinutes !== undefined && (
                  <Text style={styles.weekStat}>
                    {Math.round(day.sleepMinutes / 6) / 10}h sleep
                  </Text>
                )}
              </View>
            </View>
          ))}
        </>
      )}

      <TouchableOpacity style={styles.refreshButton} onPress={loadData}>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function PermissionItem({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <View style={styles.permItem}>
      <Text style={styles.permIcon}>{icon}</Text>
      <View style={styles.permInfo}>
        <Text style={styles.permLabel}>{label}</Text>
        <Text style={styles.permDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value?: number | null;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.tile, highlight && styles.tileHighlight]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, highlight && styles.tileValueHighlight]}>
        {value !== undefined && value !== null
          ? typeof value === 'number'
            ? value.toLocaleString()
            : value
          : '—'}
      </Text>
      {unit && value !== undefined && value !== null && (
        <Text style={styles.tileUnit}>{unit}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  loadingText: { fontSize: fontSize.lg, color: colors.textSecondary, marginTop: spacing.md },

  // Unavailable
  unavailableTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  unavailableText: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  // Connect
  connectTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  connectDesc: {
    fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg,
  },
  permissionList: { width: '100%', marginBottom: spacing.lg },
  permItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md, paddingHorizontal: spacing.md },
  permIcon: { fontSize: fontSize.xl, color: colors.primary, fontWeight: '700', marginRight: spacing.sm, marginTop: 2 },
  permInfo: { flex: 1 },
  permLabel: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  permDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  connectButton: {
    backgroundColor: colors.primary, paddingVertical: spacing.md, paddingHorizontal: spacing.xl * 2,
    borderRadius: borderRadius.lg,
  },
  connectButtonText: { color: colors.textLight, fontSize: fontSize.xl, fontWeight: '700' },

  // Dashboard
  sectionTitle: {
    fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm,
  },
  summaryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
  },
  tile: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md,
    width: '48%', marginBottom: spacing.sm, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  tileHighlight: { backgroundColor: colors.primary },
  tileLabel: { fontSize: fontSize.sm, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  tileValue: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text, marginTop: 2 },
  tileValueHighlight: { color: colors.textLight },
  tileUnit: { fontSize: fontSize.sm, color: colors.textSecondary },
  noData: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginVertical: spacing.lg },

  // Week
  weekRow: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.xs, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  weekDate: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, minWidth: 100 },
  weekStats: { flex: 1, alignItems: 'flex-end' },
  weekStat: { fontSize: fontSize.sm, color: colors.textSecondary },

  refreshButton: {
    alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.md,
  },
  refreshText: { color: colors.primary, fontSize: fontSize.lg, fontWeight: '600' },
});
