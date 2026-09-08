import { calculateScaledAmount, type ScalableIngredient } from "./scaling";

/**
 * Meal-portion domain plan (and the boundary used by API/UI calculations):
 *
 * Before this module a meal entry only had `servings`; recipe ingredients were
 * always scaled from it. Shared batches existed, but their allocations were
 * inferred from separate entries, so allocation and preparation could be
 * mixed. The minimal compatible model is: recipe.servings is the base recipe
 * yield, a batch has preparedServings (`totalServings`), and each meal entry
 * records its mode and, for a batch, an allocation percentage. Individual
 * entries keep one recipe reference and can set an override for a single
 * ingredient. The affected persistence points are meal_entries,
 * meal_entry_ingredients and shared_meal_batches; all consumers call this
 * module rather than duplicating the scaling rule.
 */

export const portionModes = ["SCALED", "INDIVIDUAL", "BATCH_ALLOCATION"] as const;
export type PortionMode = typeof portionModes[number];

export type PersonAllocation = { person: string; percentage: number };

export type PlannedIngredient = ScalableIngredient & {
  ingredientId: number;
  overrideAmount?: number | null;
};

export function getPortionMode(value?: string | null): PortionMode {
  return portionModes.includes(value as PortionMode) ? value as PortionMode : "SCALED";
}

/** Uses recipe yield only as the scaling denominator; no display rounding. */
export function calculatePreparedIngredientAmount(
  ingredient: PlannedIngredient,
  preparedServings: number,
  recipeBaseServings: number,
): number {
  const calculated = calculateScaledAmount(ingredient, preparedServings, recipeBaseServings);
  const override = ingredient.overrideAmount;
  return override != null && Number.isFinite(Number(override))
    ? Number(override)
    : calculated;
}

export function calculateIndividualIngredientAmounts(
  ingredients: PlannedIngredient[],
  requestedServings: number,
  recipeBaseServings: number,
) {
  return ingredients.map((ingredient) => ({
    ingredientId: ingredient.ingredientId,
    amount: calculatePreparedIngredientAmount(ingredient, requestedServings, recipeBaseServings),
  }));
}

export function validatePercentageAllocations(allocations: PersonAllocation[], epsilon = 1e-9): boolean {
  if (allocations.length === 0) return false;
  return Math.abs(allocations.reduce((sum, allocation) => sum + Number(allocation.percentage), 0) - 100) <= epsilon
    && allocations.every((allocation) => Number.isFinite(allocation.percentage) && allocation.percentage >= 0);
}

export function calculateAllocatedWeight(totalPreparedWeight: number, percentage: number): number {
  return Number(totalPreparedWeight) * Number(percentage) / 100;
}

/** Shopping uses preparation requirements: batch recipients never add a second recipe. */
export function calculateShoppingRequirements(plans: Array<{
  mode?: PortionMode;
  batchId?: number | null;
  preparedServings: number;
  recipeBaseServings: number;
  ingredients: PlannedIngredient[];
}>): Map<number, number> {
  const totals = new Map<number, number>();
  const countedBatches = new Set<number>();
  for (const plan of plans) {
    const mode = getPortionMode(plan.mode);
    if (mode === "BATCH_ALLOCATION" && plan.batchId != null) {
      if (countedBatches.has(plan.batchId)) continue;
      countedBatches.add(plan.batchId);
    }
    for (const ingredient of plan.ingredients) {
      const amount = calculatePreparedIngredientAmount(ingredient, plan.preparedServings, plan.recipeBaseServings);
      totals.set(ingredient.ingredientId, (totals.get(ingredient.ingredientId) || 0) + amount);
    }
  }
  return totals;
}
