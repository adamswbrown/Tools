export interface OpenFoodFactsResponse {
  code: string;
  status: number;
  product?: OpenFoodFactsProduct;
}

export interface OpenFoodFactsProduct {
  code: string;
  product_name?: string;
  brands?: string;
  image_url?: string;
  serving_size?: string;
  serving_quantity?: number;
  product_quantity?: string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    'energy-kcal_serving'?: number;
    'energy-kcal'?: number;
    proteins_100g?: number;
    fat_100g?: number;
    carbohydrates_100g?: number;
    sugars_100g?: number;
    fiber_100g?: number;
    sodium_100g?: number;
  };
}

export interface Product {
  barcode: string;
  name: string;
  brand: string;
  imageUrl?: string;
  servingSizeLabel: string;
  servingSizeGrams: number;
  packageSizeGrams: number;
  caloriesPer100g: number;
  caloriesPerServing: number;
  caloriesPerPackage: number | null;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  sugarsPer100g: number;
  fiberPer100g: number;
  sodiumPer100g: number;
  scannedAt: string;
}

export interface CustomServing {
  amountGrams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  percentageOfServing: number;
  percentageOfPackage: number | null;
}

export type RootStackParamList = {
  Home: undefined;
  Scanner: undefined;
  Product: { barcode: string };
  History: undefined;
};
