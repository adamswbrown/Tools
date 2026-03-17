import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import type { Product } from '../types';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';
import { getCalorieColor } from '../services/nutritionCalculator';

interface Props {
  product: Product;
}

export function NutritionCard({ product }: Props) {
  const calorieColor = getCalorieColor(product.caloriesPer100g);

  return (
    <View style={styles.card}>
      {product.imageUrl && (
        <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="contain" />
      )}

      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.brand}>{product.brand}</Text>

      <View style={styles.calorieRow}>
        <View style={styles.calorieBox}>
          <Text style={styles.calorieLabel}>Per Serving</Text>
          <Text style={[styles.calorieValue, { color: calorieColor }]}>
            {product.caloriesPerServing}
          </Text>
          <Text style={styles.calorieUnit}>kcal</Text>
          <Text style={styles.servingNote}>{product.servingSizeLabel}</Text>
        </View>

        <View style={styles.calorieBox}>
          <Text style={styles.calorieLabel}>Per Package</Text>
          <Text style={[styles.calorieValue, { color: calorieColor }]}>
            {product.caloriesPerPackage !== null ? product.caloriesPerPackage : '—'}
          </Text>
          <Text style={styles.calorieUnit}>
            {product.caloriesPerPackage !== null ? 'kcal' : 'unavailable'}
          </Text>
          {product.packageSizeGrams > 0 && (
            <Text style={styles.servingNote}>{product.packageSizeGrams}g total</Text>
          )}
        </View>
      </View>

      <View style={styles.macroRow}>
        <MacroPill label="Protein" value={product.proteinPer100g} unit="g" color="#2196F3" />
        <MacroPill label="Fat" value={product.fatPer100g} unit="g" color="#FF9800" />
        <MacroPill label="Carbs" value={product.carbsPer100g} unit="g" color="#9C27B0" />
        <MacroPill label="Sugar" value={product.sugarsPer100g} unit="g" color="#F44336" />
      </View>

      <Text style={styles.per100gNote}>Macros shown per 100g</Text>
    </View>
  );
}

function MacroPill({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <View style={[styles.macroPill, { borderColor: color }]}>
      <Text style={[styles.macroValue, { color }]}>
        {Math.round(value * 10) / 10}
        {unit}
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: 150,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  brand: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  calorieRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: spacing.md,
  },
  calorieBox: {
    alignItems: 'center',
    flex: 1,
  },
  calorieLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  calorieValue: {
    fontSize: fontSize.hero,
    fontWeight: '800',
  },
  calorieUnit: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  servingNote: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  macroPill: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    flex: 1,
    marginHorizontal: 2,
  },
  macroValue: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  macroLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  per100gNote: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
