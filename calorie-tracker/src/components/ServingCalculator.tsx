import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { Product } from '../types';
import { calculateCustomServing } from '../services/nutritionCalculator';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

interface Props {
  product: Product;
}

const PRESETS = [25, 50, 100, 150, 200];

export function ServingCalculator({ product }: Props) {
  const [inputValue, setInputValue] = useState('');

  const customGrams = parseFloat(inputValue) || 0;
  const result = useMemo(
    () => (customGrams > 0 ? calculateCustomServing(product, customGrams) : null),
    [product, customGrams]
  );

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Custom Serving Calculator</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Enter grams"
          placeholderTextColor={colors.textSecondary}
          keyboardType="numeric"
          value={inputValue}
          onChangeText={setInputValue}
        />
        <Text style={styles.unitLabel}>g</Text>
      </View>

      <View style={styles.presetRow}>
        {PRESETS.map((amount) => (
          <TouchableOpacity
            key={amount}
            style={[
              styles.presetButton,
              customGrams === amount && styles.presetButtonActive,
            ]}
            onPress={() => setInputValue(String(amount))}
          >
            <Text
              style={[
                styles.presetText,
                customGrams === amount && styles.presetTextActive,
              ]}
            >
              {amount}g
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {result && (
        <View style={styles.resultContainer}>
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Calories</Text>
            <Text style={styles.resultValue}>{result.calories} kcal</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Protein</Text>
            <Text style={styles.resultValue}>{result.protein}g</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Fat</Text>
            <Text style={styles.resultValue}>{result.fat}g</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Carbs</Text>
            <Text style={styles.resultValue}>{result.carbs}g</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>% of Serving</Text>
            <Text style={styles.percentValue}>
              {result.percentageOfServing}%
            </Text>
          </View>

          <Text style={styles.percentNote}>
            ({product.servingSizeLabel} serving)
          </Text>

          {result.percentageOfPackage !== null && (
            <>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>% of Package</Text>
                <Text style={styles.percentValue}>
                  {result.percentageOfPackage}%
                </Text>
              </View>
              <Text style={styles.percentNote}>
                ({product.packageSizeGrams}g package)
              </Text>
            </>
          )}
        </View>
      )}
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
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.xl,
    color: colors.text,
  },
  unitLabel: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    fontWeight: '600',
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  presetButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  presetTextActive: {
    color: colors.textLight,
    fontWeight: '600',
  },
  resultContainer: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  resultLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  resultValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  percentValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
  },
  percentNote: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'right',
    marginBottom: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
});
