import type { Product, CustomServing } from '../types';

export function calculateCustomServing(
  product: Product,
  customGrams: number
): CustomServing {
  const ratio = customGrams / 100;

  const calories = Math.round(product.caloriesPer100g * ratio);
  const protein = Math.round(product.proteinPer100g * ratio * 10) / 10;
  const fat = Math.round(product.fatPer100g * ratio * 10) / 10;
  const carbs = Math.round(product.carbsPer100g * ratio * 10) / 10;

  const percentageOfServing =
    product.servingSizeGrams > 0
      ? Math.round((customGrams / product.servingSizeGrams) * 100)
      : 0;

  const percentageOfPackage =
    product.packageSizeGrams > 0
      ? Math.round((customGrams / product.packageSizeGrams) * 1000) / 10
      : null;

  return {
    amountGrams: customGrams,
    calories,
    protein,
    fat,
    carbs,
    percentageOfServing,
    percentageOfPackage,
  };
}

export function getCalorieColor(caloriesPer100g: number): string {
  if (caloriesPer100g >= 300) return '#F44336';
  if (caloriesPer100g >= 150) return '#FF9800';
  return '#4CAF50';
}
