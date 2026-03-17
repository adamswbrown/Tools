import { OPEN_FOOD_FACTS_BASE_URL, PRODUCT_FIELDS } from '../constants/api';
import type { OpenFoodFactsResponse, Product } from '../types';

function parseServingSizeGrams(servingSize?: string, servingQuantity?: number): number {
  if (servingQuantity && servingQuantity > 0) {
    return servingQuantity;
  }

  if (!servingSize) return 100;

  // Try to extract grams: "30g", "30 g", "1 serving (30g)", "30 grams"
  const gramsMatch = servingSize.match(/([\d.]+)\s*(?:g|grams?)\b/i);
  if (gramsMatch) return parseFloat(gramsMatch[1]);

  // Try ml (treat 1ml ≈ 1g for calorie purposes)
  const mlMatch = servingSize.match(/([\d.]+)\s*(?:ml|milliliters?)\b/i);
  if (mlMatch) return parseFloat(mlMatch[1]);

  // Try oz (1 oz ≈ 28.35g)
  const ozMatch = servingSize.match(/([\d.]+)\s*(?:oz|ounces?)\b/i);
  if (ozMatch) return parseFloat(ozMatch[1]) * 28.35;

  // Fallback: grab the first number
  const numMatch = servingSize.match(/([\d.]+)/);
  if (numMatch) return parseFloat(numMatch[1]);

  return 100;
}

function parsePackageSizeGrams(productQuantity?: string): number | null {
  if (!productQuantity) return null;

  const gramsMatch = productQuantity.match(/([\d.]+)\s*(?:g|grams?)\b/i);
  if (gramsMatch) return parseFloat(gramsMatch[1]);

  const mlMatch = productQuantity.match(/([\d.]+)\s*(?:ml|milliliters?)\b/i);
  if (mlMatch) return parseFloat(mlMatch[1]);

  const kgMatch = productQuantity.match(/([\d.]+)\s*(?:kg|kilograms?)\b/i);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000;

  const lMatch = productQuantity.match(/([\d.]+)\s*(?:l|liters?|litres?)\b/i);
  if (lMatch) return parseFloat(lMatch[1]) * 1000;

  // Try bare number (assume grams)
  const numMatch = productQuantity.match(/([\d.]+)/);
  if (numMatch) return parseFloat(numMatch[1]);

  return null;
}

function normalizeProduct(code: string, data: OpenFoodFactsResponse): Product | null {
  const p = data.product;
  if (!p || !p.nutriments) return null;

  const caloriesPer100g = p.nutriments['energy-kcal_100g'] ?? 0;
  if (caloriesPer100g === 0 && !p.nutriments['energy-kcal_serving']) return null;

  const servingSizeGrams = parseServingSizeGrams(p.serving_size, p.serving_quantity);
  const packageSizeGrams = parsePackageSizeGrams(p.product_quantity);

  const caloriesPerServing =
    p.nutriments['energy-kcal_serving'] ?? (caloriesPer100g * servingSizeGrams) / 100;

  const caloriesPerPackage =
    packageSizeGrams !== null ? (caloriesPer100g * packageSizeGrams) / 100 : null;

  return {
    barcode: code,
    name: p.product_name || 'Unknown Product',
    brand: p.brands || 'Unknown Brand',
    imageUrl: p.image_url,
    servingSizeLabel: p.serving_size || `${servingSizeGrams}g`,
    servingSizeGrams,
    packageSizeGrams: packageSizeGrams ?? 0,
    caloriesPer100g,
    caloriesPerServing: Math.round(caloriesPerServing),
    caloriesPerPackage: caloriesPerPackage !== null ? Math.round(caloriesPerPackage) : null,
    proteinPer100g: p.nutriments.proteins_100g ?? 0,
    fatPer100g: p.nutriments.fat_100g ?? 0,
    carbsPer100g: p.nutriments.carbohydrates_100g ?? 0,
    sugarsPer100g: p.nutriments.sugars_100g ?? 0,
    fiberPer100g: p.nutriments.fiber_100g ?? 0,
    sodiumPer100g: p.nutriments.sodium_100g ?? 0,
    scannedAt: new Date().toISOString(),
  };
}

export async function lookupBarcode(barcode: string): Promise<Product | null> {
  const url = `${OPEN_FOOD_FACTS_BASE_URL}/${barcode}?fields=${PRODUCT_FIELDS}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'CoachFit/1.0 (contact@coachfit.app)',
    },
  });

  if (!response.ok) return null;

  const data: OpenFoodFactsResponse = await response.json();
  if (data.status !== 1) return null;

  return normalizeProduct(barcode, data);
}
