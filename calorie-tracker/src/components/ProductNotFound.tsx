import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

interface Props {
  barcode: string;
  onScanAgain: () => void;
}

export function ProductNotFound({ barcode, onScanAgain }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>?</Text>
      <Text style={styles.title}>Product Not Found</Text>
      <Text style={styles.message}>
        No nutrition data found for barcode:
      </Text>
      <Text style={styles.barcode}>{barcode}</Text>
      <Text style={styles.hint}>
        This product may not be in the Open Food Facts database yet. You can
        contribute by adding it at openfoodfacts.org.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onScanAgain}>
        <Text style={styles.buttonText}>Scan Another</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  icon: {
    fontSize: 64,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  barcode: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginVertical: spacing.sm,
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  buttonText: {
    color: colors.textLight,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
