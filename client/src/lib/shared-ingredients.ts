import { calculateScaledAmount } from "@shared/scaling";

type IngredientTotal = {
  amount: number;
  ingredient: any;
  alternativeAmount?: number;
  alternativeUnit?: string;
};

type IngredientTotals = Map<number, IngredientTotal>;

const getIngredientAmountForEntry = (entry: any, ri: any, source: any) => {
  if (typeof ri?.calculatedAmount === "number") return Number(ri.calculatedAmount) || 0;

  const entryServings = Number(entry?.servings) || 1;
  const recipeServings = Number(entry?.recipe?.servings) || 1;

  // Shared meal views sum the final amount for each person's meal.
  // That means FIXED/STEP/FORMULA rules still apply per person before the
  // A+B total is merged, matching the gramatura shown for individual meals.
  return calculateScaledAmount(ri, entryServings, recipeServings);
};

const resolveIngredientSource = (entry: any, ri: any, occurrenceTracker: Map<number, number>) => {
  const ingredientId = Number(ri?.ingredientId);
  const recipeIngredients = (entry?.recipe?.ingredients || []).filter(
    (item: any) => Number(item?.ingredientId) === ingredientId,
  );
  const recipeFrequentAddons = (entry?.recipe?.frequentAddons || []).filter(
    (item: any) => Number(item?.ingredientId) === ingredientId,
  );
  const candidates = [...recipeIngredients, ...recipeFrequentAddons];
  const currentOccurrence = (occurrenceTracker.get(ingredientId) || 0) + 1;
  occurrenceTracker.set(ingredientId, currentOccurrence);

  return candidates[currentOccurrence - 1] || candidates[0] || {};
};

const buildScalingIngredient = (entry: any, ri: any, occurrenceTracker: Map<number, number>) => {
  const source = resolveIngredientSource(entry, ri, occurrenceTracker);

  return {
    __source: source,
    ...source,
    ...ri,
    baseAmount: Number(
      ri?.baseAmount
      ?? ri?.amount
      ?? source?.baseAmount
      ?? source?.amount
      ?? 0,
    ),
    alternativeAmount: ri?.alternativeAmount ?? source?.alternativeAmount,
    alternativeUnit: ri?.alternativeUnit ?? source?.alternativeUnit,
    scalingType: ri?.scalingType ?? source?.scalingType ?? "LINEAR",
    scalingFormula: ri?.scalingFormula ?? source?.scalingFormula,
    stepThresholds: ri?.stepThresholds ?? source?.stepThresholds,
  };
};

const getAlternativeAmountForEntry = (entry: any, ri: any, amount: number, occurrenceTracker: Map<number, number>) => {
  const scalingIngredient = buildScalingIngredient(entry, ri, occurrenceTracker);
  const alternativeAmount = Number(scalingIngredient?.alternativeAmount);
  const alternativeUnit = String(scalingIngredient?.alternativeUnit || "").trim();
  const baseAmount = Number(scalingIngredient?.baseAmount || amount) || amount;

  if (!Number.isFinite(alternativeAmount) || alternativeAmount <= 0 || !alternativeUnit) {
    return null;
  }

  return {
    amount: (alternativeAmount * amount) / (baseAmount || 1),
    unit: alternativeUnit,
  };
};

const mergeEntryIngredientTotals = (entries: any[]) => {
  const totals: IngredientTotals = new Map();

  entries.forEach((entry: any) => {
    const entryIngredients = (entry?.ingredients && entry.ingredients.length > 0)
      ? entry.ingredients
      : (entry?.recipe?.ingredients || []);
    const occurrenceTracker = new Map<number, number>();
    const alternativeOccurrenceTracker = new Map<number, number>();

    entryIngredients.forEach((ri: any) => {
      const ingredientId = Number(ri?.ingredientId);
      if (!Number.isFinite(ingredientId)) return;

      const scalingIngredient = buildScalingIngredient(entry, ri, occurrenceTracker);
      const amount = getIngredientAmountForEntry(entry, scalingIngredient, scalingIngredient.__source);
      if (!Number.isFinite(amount) || amount <= 0) return;

      const alternative = getAlternativeAmountForEntry(entry, ri, amount, alternativeOccurrenceTracker);
      const current = totals.get(ingredientId);
      const next: IngredientTotal = {
        amount: (current?.amount || 0) + amount,
        ingredient: current?.ingredient || ri?.ingredient || null,
        alternativeAmount: current?.alternativeAmount,
        alternativeUnit: current?.alternativeUnit,
      };

      if (alternative && (!next.alternativeUnit || next.alternativeUnit === alternative.unit)) {
        next.alternativeAmount = (next.alternativeAmount || 0) + alternative.amount;
        next.alternativeUnit = alternative.unit;
      }

      totals.set(ingredientId, next);
    });
  });

  return totals;
};

export const buildSharedIngredientsSummary = ({
  entriesA,
  entriesB,
  recipe,
}: {
  entriesA: any[];
  entriesB: any[];
  recipe: any;
}) => {
  const totalsA = mergeEntryIngredientTotals(entriesA || []);
  const totalsB = mergeEntryIngredientTotals(entriesB || []);

  const recipeIngredients = recipe?.ingredients || [];
  const orderedIngredientIds = recipeIngredients.reduce((acc: number[], item: any) => {
    const ingredientId = Number(item?.ingredientId);
    if (!Number.isFinite(ingredientId) || acc.includes(ingredientId)) return acc;
    acc.push(ingredientId);
    return acc;
  }, []);

  const allIngredientIds = Array.from(new Set([
    ...orderedIngredientIds,
    ...Array.from(totalsA.keys()),
    ...Array.from(totalsB.keys()),
  ]));

  return allIngredientIds
    .map((ingredientId) => {
      const totalA = totalsA.get(ingredientId);
      const totalB = totalsB.get(ingredientId);
      const amountA = totalA?.amount || 0;
      const amountB = totalB?.amount || 0;
      const totalAmount = amountA + amountB;
      if (totalAmount <= 0) return null;

      const recipeIngredient = recipeIngredients.find((item: any) => Number(item?.ingredientId) === ingredientId);
      const alternativeUnit = totalA?.alternativeUnit || totalB?.alternativeUnit;
      const alternativeAmount = totalA?.alternativeUnit && totalB?.alternativeUnit && totalA.alternativeUnit !== totalB.alternativeUnit
        ? undefined
        : (totalA?.alternativeAmount || 0) + (totalB?.alternativeAmount || 0);
      const hasAlternativeAmount = Number.isFinite(alternativeAmount) && Number(alternativeAmount) > 0 && !!alternativeUnit;

      return {
        ingredientId,
        amount: totalAmount,
        calculatedAmount: totalAmount,
        ingredient: totalA?.ingredient || totalB?.ingredient || recipeIngredient?.ingredient || null,
        scalingType: recipeIngredient?.scalingType || "FIXED",
        baseAmount: totalAmount,
        alternativeAmount: hasAlternativeAmount ? alternativeAmount : undefined,
        alternativeUnit: hasAlternativeAmount ? alternativeUnit : undefined,
        sharedAddonAmounts: {
          A: amountA,
          B: amountB,
        },
      };
    })
    .filter(Boolean);
};
