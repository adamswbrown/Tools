import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useProductLookup } from '../hooks/useProductLookup';
import { NutritionCard } from '../components/NutritionCard';
import { ServingCalculator } from '../components/ServingCalculator';
import { ProductNotFound } from '../components/ProductNotFound';
import { colors, spacing, fontSize, borderRadius } from '../constants/theme';

type RouteType = RouteProp<RootStackParamList, 'Product'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'Product'>;

export function ProductScreen() {
  const route = useRoute<RouteType>();
  const navigation = useNavigation<Nav>();
  const { barcode } = route.params;
  const state = useProductLookup(barcode);

  if (state.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Looking up product...</Text>
        <Text style={styles.barcodeText}>{barcode}</Text>
      </View>
    );
  }

  if (state.status === 'not_found') {
    return (
      <ProductNotFound
        barcode={barcode}
        onScanAgain={() => navigation.navigate('Scanner')}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{state.message}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Scanner')}
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <NutritionCard product={state.product} />
      <ServingCalculator product={state.product} />
      <TouchableOpacity
        style={styles.scanAgainButton}
        onPress={() => navigation.navigate('Scanner')}
      >
        <Text style={styles.scanAgainText}>Scan Another</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  barcodeText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontFamily: 'monospace',
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  buttonText: {
    color: colors.textLight,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  scanAgainButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  scanAgainText: {
    color: colors.textLight,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
